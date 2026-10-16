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

module.exports = router;