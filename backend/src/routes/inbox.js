const express = require('express');
const { z } = require('zod');

const supabase = require('../utils/supabase');
const audit = require('../utils/audit');
const { parse } = require('../utils/validate');
const { HttpError, asyncHandler } = require('../utils/errors');
const { requireAuth, requireTenant, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth(), requireTenant, requireAdmin);

const TIPOS = ['ELECTRONICA', 'MANUAL', 'EXTRANJERA'];
const uuid = z.string().uuid('Identificador inválido');
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)');

const listSchema = z.object({
  tipo: z.enum(['ELECTRONICA', 'MANUAL', 'EXTRANJERA']).optional(),
  estado: z.enum(['PENDIENTE', 'APROBADA', 'RECHAZADA']).optional(),
  usuarioId: uuid.optional(),
  desde: dia.optional(),
  hasta: dia.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const rechazoSchema = z.object({
  motivo: z.string().trim().min(5, 'Indica el motivo del rechazo (mínimo 5 caracteres)').max(500),
});

const COLS =
  'id, user_id, concept_id, tipo, estado, cufe, nit_comercio, nombre_comercio, valor, valor_original, ' +
  'moneda, trm, pais, fecha_factura, archivo_nombre, aprobacion_automatica, motivo_rechazo, ' +
  'revisado_por, revisado_en, created_at';

const cop = (n) => `$${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 2 })}`;

// ---------- GET /api/inbox ----------
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Los filtros vacíos ("?tipo=") se ignoran
    const limpio = Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== ''));
    const f = parse(listSchema, limpio);
    const tenantId = req.user.tenantId;

    let q = supabase
      .from('legalizations')
      .select(COLS, { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range((f.page - 1) * f.limit, f.page * f.limit - 1);

    if (f.tipo) q = q.eq('tipo', f.tipo);
    if (f.estado) q = q.eq('estado', f.estado);
    if (f.usuarioId) q = q.eq('user_id', f.usuarioId);
    if (f.desde) q = q.gte('created_at', `${f.desde}T00:00:00-05:00`);
    if (f.hasta) q = q.lte('created_at', `${f.hasta}T23:59:59.999-05:00`);

    const { data, count, error } = await q;
    if (error) throw error;

    // Usuarios y conceptos en consultas aparte
    const userIds = [...new Set(data.map((r) => r.user_id))];
    const conceptIds = [...new Set(data.map((r) => r.concept_id))];
    const usuarios = new Map();
    const conceptos = new Map();

    if (userIds.length) {
      const { data: us, error: e1 } = await supabase
        .from('users')
        .select('id, nombre, numero_doc, email')
        .eq('tenant_id', tenantId)
        .in('id', userIds);
      if (e1) throw e1;
      us.forEach((u) => usuarios.set(u.id, u));
    }
    if (conceptIds.length) {
      const { data: cs, error: e2 } = await supabase
        .from('concepts')
        .select('id, nombre')
        .eq('tenant_id', tenantId)
        .in('id', conceptIds);
      if (e2) throw e2;
      cs.forEach((c) => conceptos.set(c.id, c.nombre));
    }

    res.json({
      total: count,
      page: f.page,
      limit: f.limit,
      items: data.map((l) => {
        const u = usuarios.get(l.user_id);
        return {
          id: l.id,
          tipo: l.tipo,
          estado: l.estado,
          revisable: l.tipo !== 'ELECTRONICA' && l.estado === 'PENDIENTE',
          usuario: u ? { id: u.id, nombre: u.nombre, documento: u.numero_doc, email: u.email } : null,
          concepto: conceptos.get(l.concept_id) ?? null,
          cufe: l.cufe,
          nitComercio: l.nit_comercio,
          nombreComercio: l.nombre_comercio,
          valor: Number(l.valor),
          valorOriginal: l.valor_original == null ? null : Number(l.valor_original),
          moneda: l.moneda,
          trm: l.trm == null ? null : Number(l.trm),
          pais: l.pais,
          fechaFactura: l.fecha_factura,
          tieneArchivo: !!l.archivo_nombre,
          archivoNombre: l.archivo_nombre,
          aprobacionAutomatica: l.aprobacion_automatica,
          motivoRechazo: l.motivo_rechazo,
          revisadoEn: l.revisado_en,
          creadaEn: l.created_at,
        };
      }),
    });
  })
);

// ---------- GET /api/inbox/summary ----------
// Pendientes por tipo, para los contadores de las pestañas
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const resultados = await Promise.all(
      TIPOS.map((tipo) =>
        supabase
          .from('legalizations')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', req.user.tenantId)
          .eq('tipo', tipo)
          .eq('estado', 'PENDIENTE')
      )
    );
    const pendientes = {};
    resultados.forEach((r, i) => {
      if (r.error) throw r.error;
      pendientes[TIPOS[i]] = r.count;
    });
    res.json({ pendientes });
  })
);

// ---------- Resolución (aprobar / rechazar) ----------
async function resolver(req, res, estado, motivo = null) {
  const id = parse(uuid, req.params.id);
  const tenantId = req.user.tenantId;

  const { data: l, error } = await supabase
    .from('legalizations')
    .select('id, user_id, tipo, estado, nombre_comercio, valor')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!l) throw new HttpError(404, 'Solicitud no encontrada', 'NO_ENCONTRADA');

  if (l.tipo === 'ELECTRONICA') {
    throw new HttpError(400, 'Las facturas electrónicas se aprueban automáticamente y no se revisan', 'NO_REVISABLE');
  }
  if (l.user_id === req.user.id) {
    throw new HttpError(403, 'No puedes resolver tu propia solicitud. Debe hacerlo otro administrador.', 'AUTOAPROBACION');
  }

  // Actualización atómica: solo si sigue PENDIENTE
  const { data: upd, error: upErr } = await supabase
    .from('legalizations')
    .update({
      estado,
      motivo_rechazo: motivo,
      revisado_por: req.user.id,
      revisado_en: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .eq('estado', 'PENDIENTE')
    .select('id')
    .maybeSingle();
  if (upErr) throw upErr;
  if (!upd) {
    throw new HttpError(409, 'Esta solicitud ya fue resuelta por otro administrador', 'YA_RESUELTA');
  }

  const mensaje =
    estado === 'APROBADA'
      ? `Tu legalización de ${l.nombre_comercio} por ${cop(l.valor)} fue aprobada.`
      : `Tu legalización de ${l.nombre_comercio} por ${cop(l.valor)} fue rechazada. Motivo: ${motivo}`;

  // Un fallo al notificar no debe deshacer la decisión
  const { error: nErr } = await supabase
    .from('notifications')
    .insert({ tenant_id: tenantId, user_id: l.user_id, mensaje });
  if (nErr) console.error('No se pudo crear la notificación:', nErr.message);

  await audit(req, {
    tenantId,
    userId: req.user.id,
    accion: estado === 'APROBADA' ? 'LEGALIZACION_APROBADA' : 'LEGALIZACION_RECHAZADA',
    detalle: { id, tipo: l.tipo, motivo },
  });

  res.json({ ok: true, id, estado });
}

// POST /api/inbox/:id/approve
router.post('/:id/approve', asyncHandler((req, res) => resolver(req, res, 'APROBADA')));

// POST /api/inbox/:id/reject   { "motivo": "..." }
router.post(
  '/:id/reject',
  asyncHandler((req, res) => {
    const { motivo } = parse(rechazoSchema, req.body);
    return resolver(req, res, 'RECHAZADA', motivo);
  })
);

module.exports = router;