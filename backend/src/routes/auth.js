const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');

const supabase = require('../utils/supabase');
const audit = require('../utils/audit');
const { signToken } = require('../utils/jwt');
const { parse } = require('../utils/validate');
const { HttpError, asyncHandler } = require('../utils/errors');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.', code: 'RATE_LIMIT' },
});

// Hash falso para que el tiempo de respuesta no revele si el correo existe
const DUMMY_HASH = bcrypt.hashSync('contraseña-inexistente', 10);

const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(72, 'La contraseña no puede superar 72 caracteres')
  .regex(/[a-z]/, 'La contraseña debe incluir una minúscula')
  .regex(/[A-Z]/, 'La contraseña debe incluir una mayúscula')
  .regex(/[0-9]/, 'La contraseña debe incluir un número');

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido'),
  password: z.string().min(1, 'Ingresa la contraseña').max(200),
});

const changeSchema = z.object({
  actual: z.string().min(1, 'Ingresa tu contraseña actual'),
  nueva: passwordSchema,
});

// Datos que se devuelven al frontend (nunca el hash)
function publicUser(u) {
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    tipoDoc: u.tipoDoc,
    numeroDoc: u.numeroDoc,
    isSuperAdmin: u.isSuperAdmin,
    isAdmin: u.isAdmin,
    isApprover: u.isApprover,
    impersonating: u.impersonating,
    tenant: u.tenant ? { id: u.tenant.id, nombre: u.tenant.nombre } : null,
    pendientes: {
      cambiarClave: u.mustChangePassword,
      aceptarDatos: !u.aceptoDatos,
    },
  };
}

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);

    const { data: u, error } = await supabase
      .from('users')
      .select('id, tenant_id, password_hash, activo')
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;

    const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH);
    if (!u || !ok || !u.activo) {
      await audit(req, { tenantId: u?.tenant_id ?? null, userId: u?.id ?? null, accion: 'LOGIN_FALLIDO', detalle: { email } });
      throw new HttpError(401, 'Correo o contraseña incorrectos', 'CREDENCIALES');
    }

    await audit(req, { tenantId: u.tenant_id, userId: u.id, accion: 'LOGIN' });

    // Armamos el perfil completo reutilizando el middleware
    req.headers.authorization = `Bearer ${signToken(u.id)}`;
    const token = req.headers.authorization.split(' ')[1];
    await new Promise((resolve, reject) =>
      requireAuth({ allowPending: true })(req, res, (e) => (e ? reject(e) : resolve()))
    );

    res.json({ token, user: publicUser(req.user) });
  })
);

// GET /api/auth/me
router.get('/me', requireAuth({ allowPending: true }), (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// POST /api/auth/change-password
router.post(
  '/change-password',
  requireAuth({ allowPending: true }),
  asyncHandler(async (req, res) => {
    const { actual, nueva } = parse(changeSchema, req.body);

    const { data: u, error } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', req.user.id)
      .single();
    if (error) throw error;

    if (!(await bcrypt.compare(actual, u.password_hash))) {
      throw new HttpError(400, 'La contraseña actual es incorrecta', 'CLAVE_ACTUAL');
    }
    if (actual === nueva) {
      throw new HttpError(400, 'La nueva contraseña debe ser distinta a la actual', 'CLAVE_IGUAL');
    }

    const hash = await bcrypt.hash(nueva, 10);
    const { error: upErr } = await supabase
      .from('users')
      .update({ password_hash: hash, must_change_password: false })
      .eq('id', req.user.id);
    if (upErr) throw upErr;

    await audit(req, { tenantId: req.user.tenantId, userId: req.user.id, accion: 'CAMBIO_CLAVE' });
    res.json({ ok: true });
  })
);

// POST /api/auth/accept-terms  (Ley 1581 de 2012)
router.post(
  '/accept-terms',
  requireAuth({ allowPending: true }),
  asyncHandler(async (req, res) => {
    const { error } = await supabase
      .from('users')
      .update({ acepto_datos_en: new Date().toISOString() })
      .eq('id', req.user.id);
    if (error) throw error;

    await audit(req, { tenantId: req.user.tenantId, userId: req.user.id, accion: 'ACEPTA_DATOS' });
    res.json({ ok: true });
  })
);

module.exports = router;