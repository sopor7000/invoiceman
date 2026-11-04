// Crea el superadministrador de la base de DESARROLLO (invoiceman-dev).
//
// Uso (PowerShell, desde backend/):
//   $env:ALLOW_SEED = '1'
//   $env:SUPERADMIN_EMAIL = 'tu-correo@dominio.com'
//   $env:SUPERADMIN_PASSWORD = '...'
//   node scripts/crear-superadmin-dev.js
//   Remove-Item Env:ALLOW_SEED, Env:SUPERADMIN_PASSWORD
//
// DEV_PROJECT_REF (el ref de invoiceman-dev) va en backend/.env. Nunca pongas ALLOW_SEED en el VPS.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');

function abortar(mensaje) {
  console.error(`No se creó el superadmin: ${mensaje}`);
  process.exit(1);
}

// ---------- Protecciones: antes de conectarse a nada ----------
if (process.env.ALLOW_SEED !== '1') abortar('falta ALLOW_SEED=1.');
if (process.env.NODE_ENV === 'production') abortar('NODE_ENV es production.');
const devRef = (process.env.DEV_PROJECT_REF || '').trim();
if (!devRef) abortar('falta DEV_PROJECT_REF en backend/.env.');
if (!(process.env.SUPABASE_URL || '').includes(devRef)) {
  abortar('SUPABASE_URL no apunta al proyecto de desarrollo (no contiene DEV_PROJECT_REF).');
}

// ---------- Datos del superadmin ----------
const email = (process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.SUPERADMIN_PASSWORD || '';

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) abortar('SUPERADMIN_EMAIL falta o no es un correo válido.');
// Misma política que passwordSchema en src/routes/auth.js
if (password.length < 10 || password.length > 72) abortar('SUPERADMIN_PASSWORD debe tener entre 10 y 72 caracteres.');
if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
  abortar('SUPERADMIN_PASSWORD debe incluir una mayúscula, una minúscula y un número.');
}

// El cliente se carga solo después de pasar las protecciones
const supabase = require('../src/utils/supabase');

(async () => {
  const { data: existe, error: qErr } = await supabase
    .from('users')
    .select('id, is_super_admin')
    .eq('email', email)
    .maybeSingle();
  if (qErr) abortar(`error consultando usuarios (${qErr.code || qErr.message}).`);
  if (existe) {
    abortar(
      existe.is_super_admin
        ? `ya existe un superadmin con el correo ${email}; no se modificó.`
        : `el correo ${email} ya está en uso por otro usuario; no se modificó.`
    );
  }

  // Mismo formato que el superadmin de docs/fases/fase-1-infra-manual.md (1.5, paso 4)
  const { data, error } = await supabase
    .from('users')
    .insert({
      tenant_id: null,
      tipo_doc: 'CC',
      numero_doc: '1000000000',
      nombre: 'Super Administrador (dev)',
      email,
      password_hash: await bcrypt.hash(password, 10),
      is_super_admin: true,
      is_admin: false,
      is_approver: false,
      activo: true,
      must_change_password: false,
    })
    .select('id, email')
    .single();
  if (error) abortar(`error creando el usuario (${error.code || error.message}).`);

  console.log(`Superadmin creado: ${data.email} (id ${data.id}).`);
  console.log('Al ingresar por primera vez deberás aceptar el tratamiento de datos.');
})();
