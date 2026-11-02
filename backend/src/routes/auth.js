const crypto = require('crypto');
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
const { enviarCorreo, plantillaRecuperacion } = require('../utils/mailer');

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

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email('Correo inválido'),
});

const resetSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, 'El enlace no es válido'),
  nueva: passwordSchema,
});

const forgotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en una hora.', code: 'RATE_LIMIT' },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.', code: 'RATE_LIMIT' },
});

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

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

// POST /api/auth/forgot  (pública; responde siempre lo mismo, exista o no el correo)
router.post(
  '/forgot',
  forgotLimiter,
  asyncHandler(async (req, res) => {
    const { email } = parse(forgotSchema, req.body);
    if (!process.env.APP_URL) {
      throw new HttpError(503, 'La recuperación de contraseña no está disponible', 'SIN_APP_URL');
    }
    // Se responde antes de consultar nada: el tiempo de respuesta no debe revelar si el correo existe
    res.json({
      ok: true,
      mensaje: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.',
    });

    procesarRecuperacion(req, email).catch((e) =>
      console.error('Error procesando la recuperación de contraseña:', e.code || e.name)
    );
  })
);

// Busca al usuario, guarda el enlace y envía el correo (corre después de responder)
async function procesarRecuperacion(req, email) {
  const { data: u, error } = await supabase
    .from('users')
    .select('id, tenant_id, nombre, email, activo')
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  if (!u || !u.activo) return;

  // Un correo cada 2 minutos por usuario
  const { data: reciente, error: recErr } = await supabase
    .from('password_resets')
    .select('id')
    .eq('user_id', u.id)
    .gt('created_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .limit(1);
  if (recErr) throw recErr;
  if (reciente.length) return;

  const minutos = Number(process.env.RESET_MINUTOS) || 30;
  const token = crypto.randomBytes(32).toString('hex');
  const { error: insErr } = await supabase.from('password_resets').insert({
    user_id: u.id,
    token_hash: sha256(token),
    expires_at: new Date(Date.now() + minutos * 60 * 1000).toISOString(),
    ip: req.ip,
  });
  if (insErr) throw insErr;

  const enlace = `${process.env.APP_URL.replace(/\/+$/, '')}/restablecer?token=${token}`;
  const { asunto, texto, html } = plantillaRecuperacion({ nombre: u.nombre, enlace, minutos });
  enviarCorreo({ para: u.email, asunto, texto, html }).catch((e) =>
    console.error('Error enviando correo de recuperación:', e.code || e.name)
  );

  await audit(req, { tenantId: u.tenant_id, userId: u.id, accion: 'RECUPERACION_SOLICITADA' });
}

// POST /api/auth/reset  (pública; consume el enlace y cambia la clave)
router.post(
  '/reset',
  resetLimiter,
  asyncHandler(async (req, res) => {
    const { token, nueva } = parse(resetSchema, req.body);

    const hash = await bcrypt.hash(nueva, 10);
    const { data, error } = await supabase.rpc('consumir_reset', { p_hash: sha256(token), p_password_hash: hash });
    if (error) throw error;
    if (data?.resultado !== 'OK') {
      throw new HttpError(400, 'El enlace no es válido o ya venció. Solicita uno nuevo.', 'ENLACE_INVALIDO');
    }

    await audit(req, { tenantId: data.tenant_id, userId: data.user_id, accion: 'CLAVE_RESTABLECIDA' });
    res.json({ ok: true });
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