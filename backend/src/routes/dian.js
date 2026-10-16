const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');

const supabase = require('../utils/supabase');
const audit = require('../utils/audit');
const { HttpError, asyncHandler } = require('../utils/errors');
const { requireAuth, requireTenant, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth(), requireTenant, requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const MAX_FILAS = 20000;
const LOTE = 1000;

// Encabezados aceptados para cada campo (ya normalizados: minúsculas, sin tildes, con _)
const ALIAS = {
  cufe: ['cufe', 'cufe_cude', 'cude'],
  nit_emisor: ['nit_emisor', 'nit_del_emisor', 'nit'],
  nombre_emisor: ['nombre_emisor', 'nombre_del_emisor', 'razon_social_emisor', 'emisor'],
  nit_receptor: ['nit_receptor', 'nit_del_receptor', 'nit_adquiriente'],
  fecha_emision: ['fecha_emision', 'fecha_de_emision', 'fecha'],
  valor_total: ['valor_total', 'total', 'valor'],
};
const REQUERIDOS = ['cufe', 'nit_emisor', 'nombre_emisor', 'valor_total'];

// ---------- Utilidades de lectura ----------
function celda(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('').trim();
    return String(v.text ?? v.result ?? '').trim();
  }
  return String(v).trim();
}

const claveHeader = (v) =>
  celda(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

function normNit(valor, base = null) {
  const s = celda(valor);
  if (s.includes('-')) return s.split('-')[0].replace(/\D/g, '');
  let d = s.replace(/\D/g, '');
  if (base && d.length === base.length + 1 && d.startsWith(base)) d = base; // DV pegado
  return d;
}

function fechaUTC(y, m, d) {
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCFullYear() === y && f.getUTCMonth() === m - 1 && f.getUTCDate() === d ? f : null;
}

function parseFecha(v) {
  if (v == null || v === '') return { ok: true, value: null };
  let d = null;
  if (v instanceof Date) d = v;
  else if (typeof v === 'number') d = new Date(Math.round((v - 25569) * 86400000)); // serial de Excel
  else {
    const s = celda(v);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) d = fechaUTC(+m[1], +m[2], +m[3]);
    else {
      m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // DD/MM/AAAA
      if (m) d = fechaUTC(+m[3], +m[2], +m[1]);
    }
  }
  if (!d || isNaN(d)) return { ok: false };
  const y = d.getUTCFullYear();
  if (y < 2000 || y > 2100) return { ok: false };
  return { ok: true, value: d.toISOString().slice(0, 10) };
}

function parseValor(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null;
  let s = celda(v).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const lp = s.lastIndexOf('.');
  const lc = s.lastIndexOf(',');
  if (lp > -1 && lc > -1) {
    const dec = lp > lc ? '.' : ',';
    const mil = dec === '.' ? ',' : '.';
    s = s.split(mil).join('').replace(dec, '.');
  } else if (lp > -1 || lc > -1) {
    const sep = lp > -1 ? '.' : ',';
    const partes = s.split(sep);
    // varios separadores o 3 dígitos tras el único separador = miles (COP)
    s = partes.length > 2 || partes[1].length === 3 ? partes.join('') : partes.join('.');
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// ---------- GET /api/dian/template ----------
router.get(
  '/template',
  asyncHandler(async (_req, res) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('DIAN');
    ws.columns = [
      { header: 'cufe', key: 'cufe', width: 100 },
      { header: 'nit_emisor', key: 'ne', width: 16 },
      { header: 'nombre_emisor', key: 'nom', width: 36 },
      { header: 'nit_receptor', key: 'nr', width: 16 },
      { header: 'fecha_emision', key: 'f', width: 16 },
      { header: 'valor_total', key: 'v', width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    ['cufe', 'ne', 'nr'].forEach((k) => (ws.getColumn(k).numFmt = '@')); // texto

    const ayuda = wb.addWorksheet('Instrucciones');
    ayuda.getColumn(1).width = 100;
    [
      'Pega los datos extraídos de la DIAN en la hoja "DIAN", desde la fila 2.',
      'cufe: 96 caracteres hexadecimales (0-9, a-f). Obligatorio.',
      'nit_emisor y nombre_emisor: datos del comercio. Obligatorios.',
      'nit_receptor: NIT de tu compañía en la factura (sin o con dígito de verificación).',
      'fecha_emision: AAAA-MM-DD o DD/MM/AAAA.',
      'valor_total: valor de la factura en COP, mayor que cero.',
      'Máximo 20.000 filas por archivo. Los CUFE ya cargados se omiten automáticamente.',
    ].forEach((t) => ayuda.addRow([t]));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla_base_dian.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  })
);

// ---------- POST /api/dian/upload ----------
router.post(
  '/upload',
  upload.single('archivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'Adjunta el archivo Excel en el campo "archivo"', 'SIN_ARCHIVO');

    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(req.file.buffer);
    } catch {
      throw new HttpError(400, 'El archivo no es un Excel (.xlsx) válido', 'ARCHIVO_INVALIDO');
    }
    const ws = wb.getWorksheet('DIAN') || wb.worksheets[0];
    if (!ws) throw new HttpError(400, 'El archivo no tiene hojas', 'ARCHIVO_INVALIDO');

    // Mapa campo -> número de columna, según los encabezados de la fila 1
    const col = {};
    ws.getRow(1).eachCell((c, n) => {
      const k = claveHeader(c.value);
      for (const [campo, alias] of Object.entries(ALIAS)) {
        if (alias.includes(k) && !col[campo]) col[campo] = n;
      }
    });
    const faltan = REQUERIDOS.filter((c) => !col[c]);
    if (faltan.length) {
      throw new HttpError(400, `Faltan columnas obligatorias: ${faltan.join(', ')}`, 'COLUMNAS_FALTANTES');
    }

    const nitCompania = req.user.tenant.nit;
    const errores = [];
    const porCufe = new Map();
    let leidas = 0;

    ws.eachRow((row, n) => {
      if (n === 1) return;
      const get = (campo) => (col[campo] ? row.getCell(col[campo]).value : null);
      const crudo = {
        cufe: celda(get('cufe')),
        ne: celda(get('nit_emisor')),
        nom: celda(get('nombre_emisor')),
        v: celda(get('valor_total')),
      };
      if (!crudo.cufe && !crudo.ne && !crudo.nom && !crudo.v) return; // fila vacía
      leidas++;
      if (leidas > MAX_FILAS) return;

      const cufe = crudo.cufe.toLowerCase();
      const nitEmisor = normNit(get('nit_emisor'));
      const nombre = crudo.nom;
      const valor = parseValor(get('valor_total'));
      const fecha = parseFecha(get('fecha_emision'));
      const nitReceptor = col.nit_receptor ? normNit(get('nit_receptor'), nitCompania) : '';

      let motivo = null;
      if (!/^[0-9a-f]{96}$/.test(cufe)) motivo = 'CUFE inválido (deben ser 96 caracteres hexadecimales)';
      else if (!/^[0-9]{5,15}$/.test(nitEmisor)) motivo = 'NIT del emisor inválido';
      else if (nombre.length < 2) motivo = 'Falta el nombre del emisor';
      else if (valor === null) motivo = 'Valor total inválido (debe ser mayor que cero)';
      else if (!fecha.ok) motivo = 'Fecha inválida (use AAAA-MM-DD o DD/MM/AAAA)';
      else if (nitReceptor && !/^[0-9]{5,15}$/.test(nitReceptor)) motivo = 'NIT del receptor inválido';
      else if (porCufe.has(cufe)) motivo = 'CUFE repetido dentro del archivo';

      if (motivo) {
        errores.push({ fila: n, motivo });
        return;
      }
      porCufe.set(cufe, {
        tenant_id: req.user.tenantId,
        cufe,
        nit_emisor: nitEmisor,
        nombre_emisor: nombre.slice(0, 200),
        nit_receptor: nitReceptor || null,
        fecha_emision: fecha.value,
        valor_total: valor,
      });
    });

    if (leidas === 0) throw new HttpError(400, 'El archivo no tiene filas de datos', 'SIN_FILAS');
    if (leidas > MAX_FILAS) {
      throw new HttpError(400, `Máximo ${MAX_FILAS} filas por archivo. Divide el archivo en partes.`, 'DEMASIADAS_FILAS');
    }

    // Registro de la carga
    const { data: carga, error: cErr } = await supabase
      .from('dian_uploads')
      .insert({
        tenant_id: req.user.tenantId,
        archivo_nombre: (req.file.originalname || 'archivo.xlsx').slice(0, 200),
        registros_leidos: leidas,
        subido_por: req.user.id,
      })
      .select('id')
      .single();
    if (cErr) throw cErr;

    const filas = [...porCufe.values()].map((r) => ({ ...r, upload_id: carga.id }));
    let nuevos = 0;
    try {
      for (let i = 0; i < filas.length; i += LOTE) {
        const { data, error } = await supabase
          .from('dian_invoices')
          .upsert(filas.slice(i, i + LOTE), { onConflict: 'tenant_id,cufe', ignoreDuplicates: true })
          .select('id'); // con ignoreDuplicates solo devuelve las filas realmente insertadas
        if (error) throw error;
        nuevos += data.length;
      }
    } finally {
      await supabase.from('dian_uploads').update({ registros_nuevos: nuevos }).eq('id', carga.id);
    }

    await audit(req, {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      accion: 'DIAN_CARGA',
      detalle: { cargaId: carga.id, leidas, validas: filas.length, nuevos, rechazadas: errores.length },
    });

    errores.sort((a, b) => a.fila - b.fila);
    res.status(nuevos > 0 ? 201 : 200).json({
      cargaId: carga.id,
      resumen: {
        leidas,
        validas: filas.length,
        nuevos,
        yaExistian: filas.length - nuevos,
        rechazadas: errores.length,
      },
      errores: errores.slice(0, 200),
      erroresOmitidos: Math.max(0, errores.length - 200),
    });
  })
);

// ---------- GET /api/dian/uploads ----------
router.get(
  '/uploads',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('dian_uploads')
      .select('id, archivo_nombre, registros_leidos, registros_nuevos, created_at, subido:users!subido_por(nombre)')
      .eq('tenant_id', req.user.tenantId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;

    const { count, error: cErr } = await supabase
      .from('dian_invoices')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', req.user.tenantId);
    if (cErr) throw cErr;

    res.json({
      totalFacturas: count,
      cargas: data.map((c) => ({
        id: c.id,
        archivo: c.archivo_nombre,
        leidas: c.registros_leidos,
        nuevos: c.registros_nuevos,
        subidoPor: c.subido?.nombre ?? null,
        fecha: c.created_at,
      })),
    });
  })
);

// ---------- GET /api/dian/attempts ----------
// CUFE que los usuarios intentaron legalizar y no estaban en la base cargada
router.get(
  '/attempts',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('cufe_attempts')
      .select('id, cufe, motivo, created_at, usuario:users!user_id(nombre, numero_doc)')
      .eq('tenant_id', req.user.tenantId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    res.json({
      intentos: data.map((a) => ({
        id: a.id,
        cufe: a.cufe,
        motivo: a.motivo,
        usuario: a.usuario?.nombre ?? null,
        documento: a.usuario?.numero_doc ?? null,
        fecha: a.created_at,
      })),
    });
  })
);

module.exports = router;