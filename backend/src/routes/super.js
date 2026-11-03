const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');

const supabase = require('../utils/supabase');
const audit = require('../utils/audit');
const { signToken, verifyToken } = require('../utils/jwt');
const { parse } = require('../utils/validate');
const { HttpError, asyncHandler } = require('../utils/errors');
const { generarClaveTemporal } = require('../utils/password');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { estadoPlan, resumenPlan } = require('../utils/plan');

const router = express.Router();

// ---------- Esquemas ----------
const nitSchema = z
  .string()
  .trim()
  .transform((s) => s.split('-')[0].replace(/\D/g, '')) // quita puntos y dígito de verificación
  .refine((s) => /^[0-9]{5,15}$/.test(s), 'NIT inválido: use solo dígitos, sin dígito de verificación');

const createSchema = z.object({
  nombre: z.string().trim().min(2, 'Nombre de compañía muy corto').max(120),
  nit: nitSchema,
  admin: z.object({
    tipoDoc: z.enum(['CC', 'CE', 'PA', 'PEP', 'PPT', 'TI', 'NIT']).default('CC'),
    numeroDoc: z.string().trim().regex(/^[A-Za-z0-9]{4,20}$/, 'Documento del admin inválido (4 a 20 caracteres)'),
    nombre: z.string().trim().min(2, 'Nombre del admin muy corto').max(120),
    email: z.string().trim().toLowerCase().email('Correo del admin inválido'),
  }),
});

const patchSchema = z
  .object({
    nombre: z.string().trim().min(2).max(120).optional(),
    activo: z.boolean().optional(),
    validarNitReceptor: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'No hay cambios para aplicar');

const idSchema = z.string().uuid('Identificador inválido');

// ---------- Salir de una compañía ----------
// Va ANTES de requireAuth: debe funcionar aunque la compañía se haya desactivado.
router.post(
  '/exit',
  asyncHandler(async (req, res) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'No autenticado', 'NO_TOKEN');

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw new HttpError(401, 'Sesión inválida o expirada', 'BAD_TOKEN');
    }

    const { data: u, error } = await supabase
      .from('users')
      .select('id, is_super_admin, activo')
      .eq('id', payload.sub)
      .maybeSingle();
    if (error) throw error;
    if (!u || !u.activo || !u.is_super_admin) throw new HttpError(403, 'No permitido', 'FORBIDDEN');

    await audit(req, { tenantId: payload.ten ?? null, userId: u.id, accion: 'SUPER_SALE_COMPANIA' });
    res.json({ token: signToken(u.id) });
  })
);

// Todo lo que sigue exige sesión válida y rol de superadministrador
router.use(requireAuth(), requireSuperAdmin);

// ---------- GET /api/super/tenants ----------
router.get(
  '/tenants',
  asyncHandler(async (_req, res) => {
    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('id, nombre, nit, activo, validar_nit_receptor, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const { data: users, error: uErr } = await supabase
      .from('users')
      .select('tenant_id')
      .not('tenant_id', 'is', null)
      .eq('activo', true);
    if (uErr) throw uErr;

    const conteo = {};
    for (const u of users) conteo[u.tenant_id] = (conteo[u.tenant_id] || 0) + 1;

    res.json({
      tenants: tenants.map((t) => ({
        id: t.id,
        nombre: t.nombre,
        nit: t.nit,
        activo: t.activo,
        validarNitReceptor: t.validar_nit_receptor,
        usuarios: conteo[t.id] || 0,
        creadaEn: t.created_at,
      })),
    });
  })
);

// ---------- POST /api/super/tenants ----------
router.post(
  '/tenants',
  asyncHandler(async (req, res) => {
    const d = parse(createSchema, req.body);

    const passwordTemporal = generarClaveTemporal();
    const passwordHash = await bcrypt.hash(passwordTemporal, 10);

    const { data, error } = await supabase.rpc('crear_compania', {
      p_nombre: d.nombre,
      p_nit: d.nit,
      p_admin: {
        tipo_doc: d.admin.tipoDoc,
        numero_doc: d.admin.numeroDoc,
        nombre: d.admin.nombre,
        email: d.admin.email,
        password_hash: passwordHash,
      },
    });
    if (error) throw error;

    if (data.resultado === 'DUPLICADO') {
      const r = data.restriccion || '';
      if (r.includes('tenants_nit')) throw new HttpError(409, 'Ya existe una compañía con ese NIT', 'NIT_DUPLICADO');
      if (r.includes('users_email')) throw new HttpError(409, 'Ese correo ya está registrado en otra cuenta', 'EMAIL_DUPLICADO');
      throw new HttpError(409, 'Registro duplicado', 'DUPLICADO');
    }

    await audit(req, {
      tenantId: data.tenant_id,
      userId: req.user.id,
      accion: 'SUPER_CREA_COMPANIA',
      detalle: { nombre: d.nombre, nit: d.nit, adminEmail: d.admin.email },
    });

    // La clave temporal se muestra UNA sola vez; no se guarda en ningún lado
    res.status(201).json({
      tenantId: data.tenant_id,
      admin: { id: data.admin_id, email: d.admin.email, passwordTemporal },
    });
  })
);

// ---------- PATCH /api/super/tenants/:id ----------
router.patch(
  '/tenants/:id',
  asyncHandler(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const c = parse(patchSchema, req.body);

    const cambios = {};
    if (c.nombre !== undefined) cambios.nombre = c.nombre;
    if (c.activo !== undefined) cambios.activo = c.activo;
    if (c.validarNitReceptor !== undefined) cambios.validar_nit_receptor = c.validarNitReceptor;

    const { data, error } = await supabase
      .from('tenants')
      .update(cambios)
      .eq('id', id)
      .select('id, nombre, nit, activo, validar_nit_receptor')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'Compañía no encontrada', 'NO_ENCONTRADA');

    await audit(req, { tenantId: id, userId: req.user.id, accion: 'SUPER_EDITA_COMPANIA', detalle: cambios });
    res.json({ tenant: data });
  })
);

// ---------- POST /api/super/tenants/:id/enter ----------
router.post(
  '/tenants/:id/enter',
  asyncHandler(async (req, res) => {
    const id = parse(idSchema, req.params.id);

    const { data: t, error } = await supabase
      .from('tenants')
      .select('id, nombre, activo')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!t) throw new HttpError(404, 'Compañía no encontrada', 'NO_ENCONTRADA');
    if (!t.activo) throw new HttpError(409, 'La compañía está inactiva. Actívala para poder entrar.', 'COMPANIA_INACTIVA');

    await audit(req, { tenantId: t.id, userId: req.user.id, accion: 'SUPER_ENTRA_COMPANIA' });

    res.json({ token: signToken(req.user.id, t.id), tenant: { id: t.id, nombre: t.nombre } });
  })
);

// ============================================================
//   Planes, precios y uso
// ============================================================

const TRAMOS = ['T1', 'T2', 'T3', 'T4', 'T5'];
const precioSchema = z.number().positive('El precio debe ser mayor que 0').nullable();

const planSchema = z.object({
  tramo: z.enum(TRAMOS, { errorMap: () => ({ message: 'Tramo inválido' }) }),
  limiteUsuarios: z.number().int().min(501, 'El límite pactado debe ser de al menos 501 usuarios').nullable().optional(),
  descuentoAnualPct: z.number().min(0, 'El descuento va de 0 a 100').max(100, 'El descuento va de 0 a 100'),
  venceEn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de vigencia inválida (AAAA-MM-DD)')
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Fecha de vigencia inválida')
    .nullable()
    .optional(),
  precios: z.object(Object.fromEntries(TRAMOS.map((t) => [t, precioSchema]))),
});

async function buscarTenant(id) {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, nombre, nit, plan_vence_en')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'Compañía no encontrada', 'NO_ENCONTRADA');
  return data;
}

const planDeTenant = async (t) => ({
  tenant: { id: t.id, nombre: t.nombre, nit: t.nit },
  venceEn: t.plan_vence_en,
  vigencia: estadoPlan(t.plan_vence_en),
  ...(await resumenPlan(t.id)),
});

// ---------- GET /api/super/uso ----------
router.get(
  '/uso',
  asyncHandler(async (_req, res) => {
    const { data, error } = await supabase.rpc('uso_empresas');
    if (error) throw error;
    res.json({ empresas: (data || []).map((e) => ({ ...e, estadoPlan: estadoPlan(e.venceEn).estado })) });
  })
);

// ---------- GET /api/super/tenants/:id/plan ----------
router.get(
  '/tenants/:id/plan',
  asyncHandler(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    res.json(await planDeTenant(await buscarTenant(id)));
  })
);

// ---------- PUT /api/super/tenants/:id/plan ----------
router.put(
  '/tenants/:id/plan',
  asyncHandler(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const d = parse(planSchema, req.body);
    await buscarTenant(id);

    // 1. Tramo (el superadmin puede asignar T5 y tramos sin precio)
    const { data: r, error } = await supabase.rpc('cambiar_tramo', {
      p_tenant: id,
      p_tier: d.tramo,
      p_limite: d.tramo === 'T5' ? d.limiteUsuarios ?? null : null,
      p_superadmin: true,
    });
    if (error) throw error;
    if (r?.resultado === 'USUARIOS_EXCEDEN') {
      throw new HttpError(
        409,
        `La compañía tiene ${r.activos} usuarios activos y ese tramo permite ${r.limite}. Elige un tramo mayor.`,
        'USUARIOS_EXCEDEN'
      );
    }
    if (r?.resultado === 'LIMITE_INVALIDO') {
      throw new HttpError(400, `Para el tramo T5 indica un límite pactado de al menos ${r.minimo} usuarios.`, 'LIMITE_INVALIDO');
    }
    if (r?.resultado !== 'OK') throw new HttpError(400, 'No se pudo cambiar el tramo', r?.resultado || 'TRAMO_INVALIDO');

    // 2. Precios: null = no se ofrece ese tramo
    const borrar = TRAMOS.filter((t) => d.precios[t] === null);
    const fijar = TRAMOS.filter((t) => d.precios[t] !== null).map((t) => ({
      tenant_id: id,
      tier_codigo: t,
      precio_mes: d.precios[t],
    }));
    if (borrar.length) {
      const { error: dErr } = await supabase.from('tenant_tier_prices').delete().eq('tenant_id', id).in('tier_codigo', borrar);
      if (dErr) throw dErr;
    }
    if (fijar.length) {
      const { error: uErr } = await supabase.from('tenant_tier_prices').upsert(fijar, { onConflict: 'tenant_id,tier_codigo' });
      if (uErr) throw uErr;
    }

    // 3. Descuento anual y vigencia (fin del día en hora de Colombia)
    const { error: pErr } = await supabase
      .from('tenant_plan')
      .update({ descuento_anual_pct: d.descuentoAnualPct })
      .eq('tenant_id', id);
    if (pErr) throw pErr;
    if (d.venceEn) {
      const { error: tErr } = await supabase
        .from('tenants')
        .update({ plan_vence_en: `${d.venceEn}T23:59:59-05:00` })
        .eq('id', id);
      if (tErr) throw tErr;
    }

    await audit(req, {
      tenantId: id,
      userId: req.user.id,
      accion: 'SUPER_EDITA_PLAN',
      detalle: {
        tramo: d.tramo,
        limite: r.limite,
        descuentoAnualPct: d.descuentoAnualPct,
        venceEn: d.venceEn ?? null,
        precios: d.precios,
      },
    });
    res.json(await planDeTenant(await buscarTenant(id)));
  })
);

// ---------- GET /api/super/cotizaciones ----------
router.get(
  '/cotizaciones',
  asyncHandler(async (_req, res) => {
    const { data: reqs, error } = await supabase
      .from('plan_requests')
      .select('id, tenant_id, user_id, mensaje, estado, created_at, atendida_en')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;

    const tenantIds = [...new Set(reqs.map((r) => r.tenant_id))];
    const userIds = [...new Set(reqs.map((r) => r.user_id).filter(Boolean))];
    const [tenants, users] = await Promise.all([
      tenantIds.length ? supabase.from('tenants').select('id, nombre').in('id', tenantIds) : { data: [] },
      userIds.length ? supabase.from('users').select('id, nombre, email').in('id', userIds) : { data: [] },
    ]);
    if (tenants.error) throw tenants.error;
    if (users.error) throw users.error;

    const tenantDe = new Map(tenants.data.map((t) => [t.id, t]));
    const userDe = new Map(users.data.map((u) => [u.id, u]));

    res.json({
      cotizaciones: reqs.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        empresa: tenantDe.get(r.tenant_id)?.nombre ?? null,
        solicitante: userDe.get(r.user_id)?.nombre ?? null,
        correo: userDe.get(r.user_id)?.email ?? null,
        mensaje: r.mensaje,
        estado: r.estado,
        creadaEn: r.created_at,
        atendidaEn: r.atendida_en,
      })),
    });
  })
);

// ---------- PATCH /api/super/cotizaciones/:id ----------
router.patch(
  '/cotizaciones/:id',
  asyncHandler(async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const { data, error } = await supabase
      .from('plan_requests')
      .update({ estado: 'ATENDIDA', atendida_en: new Date().toISOString() })
      .eq('id', id)
      .select('id, estado, atendida_en')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'Solicitud no encontrada', 'NO_ENCONTRADA');
    res.json({ cotizacion: { id: data.id, estado: data.estado, atendidaEn: data.atendida_en } });
  })
);

module.exports = router;