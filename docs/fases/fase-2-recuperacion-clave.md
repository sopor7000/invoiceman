# Fase 2: correo y recuperación de contraseña

## Objetivo

Un usuario que olvidó su contraseña la restablece solo desde el login con un enlace enviado por correo (un solo uso, vence a los 30 minutos). Cuando una contraseña se restablece (por el usuario o por un administrador), las sesiones abiertas con la clave anterior se cierran.

## Decisiones de diseño (no cambiar sin consultar)

- En la base solo se guarda el **hash SHA-256** del enlace, nunca el enlace.
- `POST /api/auth/forgot` responde **siempre lo mismo**, exista o no el correo, y el tiempo de respuesta no debe revelarlo (el correo se envía sin `await`).
- Límites: 5 solicitudes por hora por IP y un correo cada 2 minutos por usuario.
- **No** se actualiza `pwd_changed_at` en `POST /api/auth/change-password`: el onboarding cambia la clave y sigue usando el mismo token. Solo se actualiza al restablecer por enlace y en `POST /api/users/:id/reset-password`.
- Envío por SMTP con `nodemailer`. Sin `SMTP_HOST`: en desarrollo el correo se imprime en la consola del backend (modo simulado); en producción falla con error registrado.
- El correo real de producción necesita dominio propio con SPF y DKIM verificados en el proveedor. Mientras tanto basta el modo simulado y el restablecimiento por el administrador.

## 1. Base de datos

Crea `database/NNN_recuperacion_clave.sql` con exactamente esto (no lo ejecutes):

```sql
alter table users add column if not exists pwd_changed_at timestamptz;

create table password_resets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  ip          text,
  created_at  timestamptz not null default now(),
  constraint pr_hash_uk unique (token_hash)
);
create index pr_user_idx on password_resets (user_id, created_at desc);

alter table password_resets enable row level security;
revoke all on password_resets from anon, authenticated;

-- Consume el enlace y cambia la clave en una sola operación (un enlace solo sirve una vez)
create or replace function consumir_reset(p_hash text, p_password_hash text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r password_resets%rowtype;
  u users%rowtype;
begin
  select * into r from password_resets
   where token_hash = p_hash and used_at is null and expires_at > now()
   for update;
  if not found then return jsonb_build_object('resultado', 'INVALIDO'); end if;

  select * into u from users where id = r.user_id and activo;
  if not found then return jsonb_build_object('resultado', 'INVALIDO'); end if;

  update users
     set password_hash = p_password_hash, must_change_password = false, pwd_changed_at = now()
   where id = u.id;

  -- Invalida este y cualquier otro enlace pendiente del usuario
  update password_resets set used_at = now() where user_id = u.id and used_at is null;

  return jsonb_build_object('resultado', 'OK', 'user_id', u.id, 'tenant_id', u.tenant_id);
end $$;

revoke execute on function consumir_reset(text, text) from public, anon, authenticated;
grant  execute on function consumir_reset(text, text) to service_role;

notify pgrst, 'reload schema';
```

## 2. Backend

1. Instalar `nodemailer` en `backend`.
2. **`src/utils/mailer.js`**: exporta `enviarCorreo({ para, asunto, texto, html })` y `plantillaRecuperacion({ nombre, enlace, minutos })`.
   - Transporte SMTP desde `SMTP_HOST`, `SMTP_PORT` (587 por defecto; `secure` solo si es 465), `SMTP_USER`, `SMTP_PASS`; remitente `MAIL_FROM`.
   - Sin `SMTP_HOST`: si `NODE_ENV` es `production` lanza error; si no, imprime el correo en consola con la etiqueta `[CORREO SIMULADO]` y devuelve `{ simulado: true }`.
   - La plantilla HTML escapa los datos que recibe, usa el encabezado azul marino `#0a3161` con franja roja `#b31942` y un botón rojo "Restablecer contraseña". Incluye texto plano equivalente, la vigencia en minutos y el aviso "si no fuiste tú, ignora este mensaje".
3. **`src/middleware/auth.js`**:
   - Agrega `pwd_changed_at` a `USER_COLUMNS`.
   - Justo después de validar que el usuario existe y está activo: si `pwd_changed_at` existe y `payload.iat < floor(pwd_changed_at en segundos)`, responde 401 con código `SESSION_REVOKED` y el mensaje "Tu sesión se cerró porque la contraseña cambió. Ingresa de nuevo."
4. **`src/routes/users.js`**, ruta `POST /:id/reset-password`: en el `update` agrega `pwd_changed_at: new Date().toISOString()`.
5. **`src/routes/auth.js`**: agrega dos rutas públicas (reutiliza `passwordSchema`, `rateLimit`, `supabase`, `audit`, `parse`, `HttpError`, `asyncHandler`):
   - `POST /forgot` `{ email }` (zod: email en minúsculas):
     - Limitador de 5 por hora por IP.
     - Si falta `APP_URL`, 503.
     - Respuesta fija `{ ok: true, mensaje: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.' }`.
     - Busca el usuario por correo; si no existe o está inactivo, responde lo mismo.
     - Si hay un `password_resets` del usuario con menos de 2 minutos, responde lo mismo sin enviar.
     - Genera 32 bytes aleatorios (hex), guarda `sha256(token)`, vencimiento `RESET_MINUTOS` (30 por defecto) e IP, y envía `${APP_URL}/restablecer?token=<token>` **sin `await`** (con `.catch` que registra el error).
     - Audita `RECUPERACION_SOLICITADA`.
   - `POST /reset` `{ token, nueva }` (zod: token `^[a-f0-9]{64}$`; `nueva` con `passwordSchema`):
     - Limitador de 20 por 15 minutos.
     - Calcula `bcrypt.hash(nueva, 10)` y llama al RPC `consumir_reset(sha256(token), hash)`.
     - Si el resultado no es `OK`, 400 con código `ENLACE_INVALIDO` y el mensaje "El enlace no es válido o ya venció. Solicita uno nuevo."
     - Audita `CLAVE_RESTABLECIDA` con el `tenant_id` y `user_id` devueltos.
6. Variables nuevas (documéntalas en `backend/.env.example` si existe; **no** toques `.env`): `APP_URL`, `RESET_MINUTOS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.

## 3. Frontend

- **`src/pages/Recuperar.jsx`** (ruta pública `/recuperar`): formulario con el correo; al enviar muestra el mensaje genérico del servidor. Mismo estilo del login (`Banner`, `card`, `field`, `btn-primary`). Enlace "Volver a iniciar sesión".
- **`src/pages/Restablecer.jsx`** (ruta pública `/restablecer?token=...`):
  - Si el token no cumple `^[a-f0-9]{64}$`, muestra el error y un enlace a `/recuperar`.
  - Formulario de nueva clave y confirmación, con las **mismas reglas visibles** de `Onboarding.jsx` (10 caracteres, mayúscula, minúscula, número, coincidencia, máximo 72) que se marcan en verde mientras se escribe.
  - Si el servidor responde error, muestra el mensaje y un enlace para pedir un enlace nuevo. En éxito, muestra confirmación y un botón al login.
- **`src/pages/Login.jsx`**: debajo del botón Ingresar, el enlace "¿Olvidaste tu contraseña?" hacia `/recuperar`.
- **`src/App.jsx`**: rutas `/recuperar` y `/restablecer` **fuera** del bloque protegido, junto a `/login`.

## 4. Pruebas

1. Desde el login, pide el enlace con un usuario de desarrollo. La pantalla muestra el mensaje genérico y la consola del backend imprime `[CORREO SIMULADO]` con el enlace.
2. Abre el enlace, crea una clave válida (las reglas se marcan en verde) e inicia sesión con ella.
3. Pide el enlace para un correo inexistente: mismo mensaje y **ningún** correo en consola.
4. Abre el mismo enlace otra vez: debe decir que no es válido.
5. Pide un enlace y, antes de abrirlo, ejecuta `update password_resets set expires_at = now() - interval '1 minute' where used_at is null;`: al abrirlo debe decir que no es válido.
6. Dos solicitudes seguidas para el mismo correo: solo la primera imprime correo.
7. Con un usuario abierto en dos navegadores, restablece su clave desde uno: el otro vuelve al login al recargar.
8. Repite la 7 con **Restablecer clave** del administrador (Configuración, Usuarios).
9. Sexta solicitud en una hora desde la misma red: responde "demasiadas solicitudes".
10. El onboarding (cambio de clave temporal) sigue funcionando sin cerrar la sesión.
11. Auditoría: aparecen `RECUPERACION_SOLICITADA` y `CLAVE_RESTABLECIDA`.

## 5. Entrega

Resumen de archivos, SQL pendiente (`database/NNN_recuperacion_clave.sql`) y variables nuevas. Producción (manual): SQL, variables en el VPS (`APP_URL` con la URL real y, cuando haya proveedor de correo, las `SMTP_*` y `MAIL_FROM`), `git pull` y reconstrucción del contenedor.
