const express = require('express');
const ExcelJS = require('exceljs');
const { z } = require('zod');

const supabase = require('../utils/supabase');
const audit = require('../utils/audit');
const { parse } = require('../utils/validate');
const { HttpError, asyncHandler } = require('../utils/errors');
const { requireAuth, requireTenant, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth(), requireTenant, requireAdmin);

const TIPOS = ['ELECTRONICA', 'MANUAL', 'EXTRANJERA'];
const ETIQUETA_TIPO = {
  ELECTRONICA: 'Factura electrónica',
  MANUAL: 'Factura manual',
  EXTRANJERA: 'Factura del extranjero',
};
const MAX_FILAS = 50000;
const PAGINA = 1000;

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)');

const filtroSchema = z
  .object({
    desde: dia.optional(),
    hasta: dia.optional(),
  })
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, 'La fecha inicial no puede ser posterior a la final');

const summarySchema = z
  .object({
    desde: dia.optional(),
    hasta: dia.optional(),
    meses: z.coerce.number().int().min(1).max(24).default(12),
  })
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, 'La fecha inicial no puede ser posterior a la final');

const exportSchema = z
  .object({
    desde: dia.optional(),
    hasta: dia.optional(),
    estado: z.enum(['APROBADA', 'RECHAZADA', 'PENDIENTE', 'TODAS']).default('APROBADA'),
  })
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, 'La fecha inicial no puede ser posterior a la final');

// Ignora filtros vacíos ("?desde=")
const limpiar = (q) => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== ''));

// Lista de los últimos N meses (AAAA-MM) en hora de Colombia, del más antiguo al más reciente
function ultimosMeses(n) {
  const ahora = new Date(Date.now() - 5 * 3600 * 1000);
  const y = ahora.getUTCFullYear();
  const m = ahora.getUTCMonth();
  const lista = [];
  for (let i = n - 1; i >= 0; i--) {
    lista.push(new Date(Date.UTC(y, m - i, 1)).toISOString().slice(0, 7));
  }
  return lista;
}

// Trae todas las filas de una consulta paginando de a 1.000
async function traerTodo(fabrica) {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await fabrica().range(desde, desde + PAGINA - 1);
    if (error) throw error;
    filas.push(...data);
    if (filas.length > MAX_FILAS) {
      throw new HttpError(413, `Hay más de ${MAX_FILAS} registros. Acota el rango de fechas.`, 'DEMASIADOS_REGISTROS');
    }
    if (data.length < PAGINA) break;
  }
  return filas;
}

// ---------- GET /api/stats/summary ----------
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const f = parse(summarySchema, limpiar(req.query));

    const { data, error } = await supabase.rpc('estadisticas', {
      p_tenant: req.user.tenantId,
      p_desde: f.desde ?? null,
      p_hasta: f.hasta ?? null,
      p_meses: f.meses,
    });
    if (error) throw error;

    // Siempre salen los tres tipos, aunque estén en cero
    const porTipo = TIPOS.map((tipo) => {
      const r = data.porTipo.find((x) => x.tipo === tipo);
      return {
        tipo,
        total: r?.total ?? 0,
        aprobadas: r?.aprobadas ?? 0,
        rechazadas: r?.rechazadas ?? 0,
        pendientes: r?.pendientes ?? 0,
      };
    });

    // Tendencia lista para graficar: una serie por concepto, un valor por mes
    const meses = ultimosMeses(f.meses);
    const idx = new Map(meses.map((m, i) => [m, i]));
    const series = new Map();
    for (const t of data.tendencia) {
      const i = idx.get(t.mes);
      if (i === undefined) continue;
      if (!series.has(t.concepto)) {
        series.set(t.concepto, {
          concepto: t.concepto,
          cantidades: new Array(meses.length).fill(0),
          valores: new Array(meses.length).fill(0),
        });
      }
      const s = series.get(t.concepto);
      s.cantidades[i] = Number(t.total);
      s.valores[i] = Number(t.valor);
    }
    const listaSeries = [...series.values()].sort(
      (a, b) =>
        b.cantidades.reduce((x, y) => x + y, 0) - a.cantidades.reduce((x, y) => x + y, 0) ||
        a.concepto.localeCompare(b.concepto)
    );

    res.json({
      filtro: { desde: f.desde ?? null, hasta: f.hasta ?? null, meses: f.meses },
      totales: data.totales,
      porTipo,
      porConcepto: data.porConcepto,
      tendencia: { meses, series: listaSeries },
    });
  })
);

// ---------- GET /api/stats/export ----------
router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const f = parse(exportSchema, limpiar(req.query));
    const tenantId = req.user.tenantId;

    const legalizaciones = await traerTodo(() => {
      let q = supabase
        .from('legalizations')
        .select('id, user_id, concept_id, tipo, nit_comercio, nombre_comercio, valor, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (f.estado !== 'TODAS') q = q.eq('estado', f.estado);
      if (f.desde) q = q.gte('created_at', `${f.desde}T00:00:00-05:00`);
      if (f.hasta) q = q.lte('created_at', `${f.hasta}T23:59:59.999-05:00`);
      return q;
    });

    const usuarios = new Map();
    const conceptos = new Map();
    const [us, cs] = await Promise.all([
      traerTodo(() =>
        supabase.from('users').select('id, numero_doc, nombre').eq('tenant_id', tenantId).order('id', { ascending: true })
      ),
      traerTodo(() =>
        supabase.from('concepts').select('id, nombre').eq('tenant_id', tenantId).order('id', { ascending: true })
      ),
    ]);
    us.forEach((u) => usuarios.set(u.id, u));
    cs.forEach((c) => conceptos.set(c.id, c.nombre));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Legalizaciones');
    ws.columns = [
      { header: 'Identificación del usuario', key: 'doc', width: 26 },
      { header: 'Nombre del usuario', key: 'usuario', width: 32 },
      { header: 'Concepto de la factura', key: 'concepto', width: 26 },
      { header: 'NIT del comercio', key: 'nit', width: 20 },
      { header: 'Nombre del comercio', key: 'comercio', width: 36 },
      { header: 'Valor (COP)', key: 'valor', width: 18 },
      { header: 'Tipo de legalización', key: 'tipo', width: 26 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.getColumn('doc').numFmt = '@'; // texto: conserva ceros a la izquierda
    ws.getColumn('nit').numFmt = '@';
    ws.getColumn('valor').numFmt = '#,##0.00';

    for (const l of legalizaciones) {
      const u = usuarios.get(l.user_id);
      ws.addRow({
        doc: u?.numero_doc ?? '',
        usuario: u?.nombre ?? '',
        concepto: conceptos.get(l.concept_id) ?? '',
        nit: l.nit_comercio,
        comercio: l.nombre_comercio,
        valor: Number(l.valor),
        tipo: ETIQUETA_TIPO[l.tipo] ?? l.tipo,
      });
    }
    ws.autoFilter = { from: 'A1', to: 'G1' };

    await audit(req, {
      tenantId,
      userId: req.user.id,
      accion: 'ESTADISTICAS_EXPORT',
      detalle: { filas: legalizaciones.length, estado: f.estado, desde: f.desde ?? null, hasta: f.hasta ?? null },
    });

    const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="legalizaciones_${hoy}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  })
);

module.exports = router;