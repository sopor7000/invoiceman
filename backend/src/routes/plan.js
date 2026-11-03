const express = require('express');
const { z } = require('zod');

const supabase = require('../utils/supabase');
const audit = require('../utils/audit');
const { parse } = require('../utils/validate');
const { HttpError, asyncHandler } = require('../utils/errors');
const { resumenPlan } = require('../utils/plan');
const { requireAuth, requireTenant, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth(), requireTenant, requireAdmin);

// El superadmin gestiona los planes desde su panel, no desde aquí
const noSuper = (req, _res, next) =>
  req.user.isSuperAdmin
    ? next(new HttpError(403, 'El superadministrador cambia los planes desde su panel', 'SUPER_NO_PLAN'))
    : next();

const tramoSchema = z.object({
  tramo: z.enum(['T1', 'T2', 'T3', 'T4', 'T5'], { errorMap: () => ({ message: 'Tramo inválido' }) }),
});

const cotizacionSchema = z.object({
  mensaje: z
    .string()
    .trim()
    .min(10, 'Cuéntanos un poco más (mínimo 10 caracteres)')
    .max(1000, 'El mensaje no puede superar 1000 caracteres'),
});

const estado = async (req) => ({ vigencia: req.user.plan, ...(await resumenPlan(req.user.tenantId)) });

// ---------- GET /api/plan ----------
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await estado(req));
  })
);

// ---------- POST /api/plan/tramo ----------
router.post(
  '/tramo',
  noSuper,
  asyncHandler(async (req, res) => {
    const { tramo } = parse(tramoSchema, req.body);

    const { data: antes, error: pErr } = await supabase
      .from('tenant_plan')
      .select('tier_codigo')
      .eq('tenant_id', req.user.tenantId)
      .maybeSingle();
    if (pErr) throw pErr;

    const { data: r, error } = await supabase.rpc('cambiar_tramo', {
      p_tenant: req.user.tenantId,
      p_tier: tramo,
      p_limite: null,
      p_superadmin: false,
    });
    if (error) throw error;

    switch (r?.resultado) {
      case 'OK':
        break;
      case 'REQUIERE_COTIZACION':
        throw new HttpError(
          409,
          'Para más de 500 usuarios el plan se cotiza a la medida. Envía una solicitud de cotización desde esta misma sección.',
          'REQUIERE_COTIZACION'
        );
      case 'USUARIOS_EXCEDEN':
        throw new HttpError(
          409,
          `Tienes ${r.activos} usuarios activos y ese tramo permite ${r.limite}. Desactiva usuarios o elige un tramo mayor.`,
          'USUARIOS_EXCEDEN'
        );
      case 'SIN_PRECIO':
        throw new HttpError(409, 'Ese tramo aún no tiene precio configurado', 'SIN_PRECIO');
      default:
        throw new HttpError(400, 'No se pudo cambiar el tramo', r?.resultado || 'TRAMO_INVALIDO');
    }

    await audit(req, {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      accion: 'PLAN_TRAMO_CAMBIADO',
      detalle: { de: antes?.tier_codigo ?? null, a: tramo },
    });
    res.json(await estado(req));
  })
);

// ---------- POST /api/plan/cotizacion  (más de 500 usuarios) ----------
router.post(
  '/cotizacion',
  noSuper,
  asyncHandler(async (req, res) => {
    const { mensaje } = parse(cotizacionSchema, req.body);

    const { data: pendiente, error: qErr } = await supabase
      .from('plan_requests')
      .select('id')
      .eq('tenant_id', req.user.tenantId)
      .eq('estado', 'PENDIENTE')
      .limit(1);
    if (qErr) throw qErr;
    if (pendiente.length) {
      throw new HttpError(409, 'Ya tienes una solicitud de cotización en curso. Te contactaremos pronto.', 'COTIZACION_EN_CURSO');
    }

    const { data, error } = await supabase
      .from('plan_requests')
      .insert({ tenant_id: req.user.tenantId, user_id: req.user.id, mensaje })
      .select('id, estado, created_at')
      .single();
    if (error) throw error;

    await audit(req, {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      accion: 'PLAN_COTIZACION_SOLICITADA',
      detalle: { solicitud: data.id },
    });
    res.status(201).json({ solicitud: { id: data.id, estado: data.estado, creadaEn: data.created_at } });
  })
);

module.exports = router;
