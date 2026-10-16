const express = require('express');
const { z } = require('zod');

const supabase = require('../utils/supabase');
const audit = require('../utils/audit');
const { parse } = require('../utils/validate');
const { HttpError, asyncHandler } = require('../utils/errors');
const { requireAuth, requireTenant, requireApprover } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth(), requireTenant);

const uuid = z.string().uuid('Identificador inválido');

const crearSchema = z.object({
  observacion: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        conceptId: uuid,
        valor: z.coerce
          .number({ invalid_type_error: 'Valor inválido' })
          .positive('Cada valor debe ser mayor que cero')
          .max(1e9, 'Valor demasiado grande')
          .transform((n) => Math.round(n * 100) / 100),
      })
    )
    .min(1, 'Agrega al menos un concepto')
    .max(20, 'Máximo 20 conceptos por solicitud')
    .refine((a) => new Set(a.map((i) => i.conceptId)).size === a.length, 'Hay conceptos repetidos'),
});

const listSchema = z.object({
  estado: z.enum(['PENDIENTE', 'APROBADA', 'RECHAZADA']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const rechazoSchema = z.object({
  motivo: z.string().trim().min(5, 'Indica el motivo del rechazo (mínimo 5 caracteres)').max(500),
});

const COLS =
  'id, user_id, total, observacion, estado, motivo_rechazo, revisado_por, revisado_en, created_at';

const cop = (n) => `$${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 2 })}`;

// El superadmin entra a administrar: no pertenece a la compañía y no puede crear solicitudes
const noSuperadmin = (req, _res, next) =>
  req.user.isSuperAdmin
    ? next(
        new HttpError(
          403,
          'El superadministrador no puede crear solicitudes. Ingresa con un usuario de la compañía.',
          'SUPER_NO_SOLICITA'
        )
      )
    : next();

// Agrega detalle por concepto y nombre de solicitante a una lista de solicitudes
async function enriquecer(tenantId, rows, { conSolicitante = false } = {}) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);

  const { data: items, error } = await supabase
    .from('viatico_items')
    .select('request_id, concept_id, valor')
    .eq('tenant_id', tenantId)
    .in('request_id', ids);
  if (error) throw error;

  const conceptIds = [...new Set(items.map((i) => i.concept_id))];
  const conceptos = new Map();
  if (conceptIds.length) {
    const { data: cs, error: e2 } = await supabase
      .from('concepts')
      .select('id, nombre')
      .eq('tenant_id', tenantId)
      .in('id', conceptIds);
    if (e2) throw e2;
    cs.forEach((c) => conceptos.set(c.id, c.nombre));
  }

  const usuarios = new Map();
  if (conSolicitante) {
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: us, error: e3 } = await supabase
      .from('users')
      .select('id, nombre, numero_doc, email')
      .eq('tenant_id', tenantId)
      .in('id', userIds);
    if (e3) throw e3;
    us.forEach((u) => usuarios.set(u.id, u));
  }

  const porSolicitud = new Map();
  items.forEach((i) => {
    if (!porSolicitud.has(i.request_id)) porSolicitud.set(i.request_id, []);
    porSolicitud.get(i.request_id).push({
      conceptId: i.concept_id,
      concepto: conceptos.get(i.concept_id) ?? null,
      valor: Number(i.valor),
    });
  });

  return rows.map((r) => {
    const u = usuarios.get(r.user_id);
    return {
      id: r.id,
      estado: r.estado,
      total: Number(r.total),
      observacion: r.observacion,
      motivoRechazo: r.motivo_rechazo,
      revisadoEn: r.revisado_en,
      creadaEn: r.created_at,
      items: porSolicitud.get(r.id) ?? [],
      ...(conSolicitante && {
        usuario: u ? { id: u.id, nombre: u.nombre, documento: u.numero_doc, email: u.email } : null,
      }),
    };
  });
}

// ---------- POST /api/viaticos ----------
router.post(
  '/',
  noSuperadmin,
  asyncHandler(async (req, res) => {
    const d = parse(crearSchema, req.body);

    const { data, error } = await supabase.rpc('crear_viatico', {
      p_tenant: req.user.tenantId,
      p_user: req.user.id,
      p_items: d.items.map((i) => ({ concept_id: i.conceptId, valor: i.valor })),
      p_observacion: d.observacion || null,
    });

    if (error) {
      const m = error.message || '';
      const tope = m.match(/TOPE_EXCEDIDO:([0-9.]+)/);
      if (tope) {
        throw new HttpError(
          422,
          `El total supera el tope permitido por solicitud (${cop(tope[1])})`,
          'TOPE_EXCEDIDO'
        );
      }
      const topeConcepto = m.match(/TOPE_CONCEPTO:(.+)\|([0-9.]+)/);
      if (topeConcepto) {
        throw new HttpError(
          422,
          `El valor de "${topeConcepto[1]}" supera el tope permitido (${cop(topeConcepto[2])})`,
          'TOPE_CONCEPTO'
        );
      }
      if (m.includes('CONCEPTO_INVALIDO')) {
        throw new HttpError(400, 'Algún concepto no existe o está inactivo', 'CONCEPTO_INVALIDO');
      }
      if (m.includes('VALOR_INVALIDO')) throw new HttpError(400, 'Valor inválido', 'VALOR_INVALIDO');
      if (m.includes('ITEMS_VACIOS')) throw new HttpError(400, 'Agrega al menos un concepto', 'ITEMS_VACIOS');
      throw error;
    }

    await audit(req, {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      accion: 'VIATICO_CREADO',
      detalle: { id: data.id, total: data.total },
    });

    const { data: fila, error: e2 } = await supabase
      .from('viatico_requests')
      .select(COLS)
      .eq('id', data.id)
      .single();
    if (e2) throw e2;
    const [solicitud] = await enriquecer(req.user.tenantId, [fila]);
    res.status(201).json({ solicitud });
  })
);

// ---------- GET /api/viaticos/mine ----------
router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const f = parse(listSchema, Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== '')));
    let q = supabase
      .from('viatico_requests')
      .select(COLS, { count: 'exact' })
      .eq('tenant_id', req.user.tenantId)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range((f.page - 1) * f.limit, f.page * f.limit - 1);
    if (f.estado) q = q.eq('estado', f.estado);

    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ total: count, page: f.page, limit: f.limit, items: await enriquecer(req.user.tenantId, data) });
  })
);

// ---------- GET /api/viaticos/review ----------  (aprobador)
router.get(
  '/review',
  requireApprover,
  asyncHandler(async (req, res) => {
    const f = parse(listSchema, Object.fromEntries(Object.entries(req.query).filter(([, v]) => v !== '')));
    let q = supabase
      .from('viatico_requests')
      .select(COLS, { count: 'exact' })
      .eq('tenant_id', req.user.tenantId)
      .order('created_at', { ascending: false })
      .range((f.page - 1) * f.limit, f.page * f.limit - 1);
    q = q.eq('estado', f.estado || 'PENDIENTE');

    const { data, count, error } = await q;
    if (error) throw error;
    res.json({
      total: count,
      page: f.page,
      limit: f.limit,
      items: await enriquecer(req.user.tenantId, data, { conSolicitante: true }),
    });
  })
);

// ---------- Resolución ----------
async function resolver(req, res, estado, motivo = null) {
  const id = parse(uuid, req.params.id);
  const tenantId = req.user.tenantId;

  const { data: v, error } = await supabase
    .from('viatico_requests')
    .select('id, user_id, total, estado')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  if (!v) throw new HttpError(404, 'Solicitud no encontrada', 'NO_ENCONTRADA');
  if (v.user_id === req.user.id) {
    throw new HttpError(403, 'No puedes resolver tu propia solicitud. Debe hacerlo otro aprobador.', 'AUTOAPROBACION');
  }

  const { data: upd, error: upErr } = await supabase
    .from('viatico_requests')
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
  if (!upd) throw new HttpError(409, 'Esta solicitud ya fue resuelta', 'YA_RESUELTA');

  const mensaje =
    estado === 'APROBADA'
      ? `Tu solicitud de viáticos por ${cop(v.total)} fue aprobada.`
      : `Tu solicitud de viáticos por ${cop(v.total)} fue rechazada. Motivo: ${motivo}`;
  const { error: nErr } = await supabase
    .from('notifications')
    .insert({ tenant_id: tenantId, user_id: v.user_id, mensaje });
  if (nErr) console.error('No se pudo crear la notificación:', nErr.message);

  await audit(req, {
    tenantId,
    userId: req.user.id,
    accion: estado === 'APROBADA' ? 'VIATICO_APROBADO' : 'VIATICO_RECHAZADO',
    detalle: { id, motivo },
  });
  res.json({ ok: true, id, estado });
}

router.post('/:id/approve', requireApprover, asyncHandler((req, res) => resolver(req, res, 'APROBADA')));

router.post(
  '/:id/reject',
  requireApprover,
  asyncHandler((req, res) => {
    const { motivo } = parse(rechazoSchema, req.body);
    return resolver(req, res, 'RECHAZADA', motivo);
  })
);

module.exports = router;