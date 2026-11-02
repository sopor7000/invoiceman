# Fase 5: seguridad y trazabilidad

Cuatro entregas independientes. Pueden hacerse en sesiones distintas, en este orden: 5.1, 5.3, 5.2, 5.4.

## 5.1 Visor de auditoría para el administrador

Objetivo: que cada administrador consulte el registro de acciones de **su** empresa.

Base de datos: crea `database/NNN_indices_auditoria.sql` (sin ejecutar):

```sql
create index if not exists audit_tenant_accion_idx on audit_logs (tenant_id, accion, created_at desc);
```

Backend (`src/routes/audit.js`, nuevo; `requireAuth(), requireTenant, requireAdmin`):

- `GET /api/audit?page=1&limit=25&accion=&usuarioId=&desde=&hasta=`: solo registros con `tenant_id = req.user.tenantId`, orden descendente, `limit` máximo 100; fechas en hora de Colombia (inclusive hasta el final del día). Responde `{ total, page, limit, items }`.
- Cada item: `fecha`, `usuario` (nombre; consulta separada a `users`, sin embebidos), `accion`, `etiqueta` (texto legible en español de una tabla de equivalencias que cubra **todas** las acciones existentes en el código: busca todos los `audit(` del backend), `detalle` y `ip`.
- Quita del `detalle` cualquier clave que contenga `password`, `token` o `secret` antes de responder.
- `GET /api/audit/acciones`: lista de acciones distintas de la empresa con su etiqueta, para el filtro.
- Registra la ruta en `server.js` (`/api/audit`).

Frontend:

- `src/pages/Auditoria.jsx` (ruta `/auditoria`, solo administradores, enlace "Auditoría" en el menú): filtros (acción, usuario con el selector de `/api/users/options` si ya existe, desde, hasta), tabla paginada con fecha, usuario, acción, detalle en formato clave: valor y IP.

Pruebas: un administrador solo ve registros de su empresa; las acciones recientes (login, creación de usuarios, aprobaciones) aparecen con su etiqueta; los filtros y la paginación funcionan; un usuario estándar recibe 403; el detalle nunca muestra contraseñas, tokens ni secretos.

## 5.3 Pruebas automáticas de aislamiento entre empresas

Objetivo: demostrar con pruebas repetibles que una empresa no puede ver ni modificar datos de otra.

- Usa el ejecutor integrado de Node (`node --test`), sin librerías nuevas. Archivo `backend/tests/aislamiento.test.js` y script `npm run test:aislamiento`.
- **Protección de seguridad (obligatoria):** la prueba aborta antes de hacer nada si no existe `ALLOW_TESTS=1` o si `SUPABASE_URL` no contiene el valor de la variable `DEV_PROJECT_REF`. Documenta ambas en `backend/.env.example`.
- Las pruebas llaman a un backend en ejecución (`TEST_API_URL`, por defecto `http://localhost:4000`).
- Preparación: con el cliente de servicio crea **dos empresas** con el RPC `crear_compania`, deja a los dos administradores listos (`must_change_password = false`, `acepto_datos_en` con fecha), crea un usuario estándar en cada una, un concepto, una legalización manual con soporte, una solicitud de viáticos, contenido de ayuda y una cotización. Los datos de prueba llevan un prefijo reconocible.
- Aserciones (cada una con el token de la empresa A contra datos de la B, esperando 404 o 403 y **nunca** datos de B):
  1. Listados: usuarios, conceptos, legalizaciones (`/mine`), bandeja, viáticos (`/mine` y `/review`), ayuda, base DIAN, estadísticas, auditoría y plan solo contienen datos de A.
  2. Acceso por identificador: `GET /legalizations/:id/file`, `PATCH /users/:id`, `POST /users/:id/reset-password`, `PATCH /concepts/:id`, `PATCH /help/:id`, `DELETE /help/:id`, `POST /inbox/:id/approve|reject` y `POST /viaticos/:id/approve|reject` sobre ids de B.
  3. Un `tenantId` enviado en el cuerpo o en la consulta se ignora.
  4. Un administrador de empresa recibe 403 en cualquier `/api/super/...`.
  5. Un usuario estándar recibe 403 en rutas de administrador.
  6. Con la empresa desactivada, sus usuarios reciben 403.
  7. A nivel de base de datos, con el cliente de servicio: insertar una legalización con un usuario de A y un concepto de B falla por la llave foránea compuesta.
  8. El superadmin fuera de una empresa recibe `SELECCIONE_COMPANIA` en rutas de empresa.
- Limpieza al terminar (también si falla): borra los datos de prueba en orden inverso a las dependencias (tablas con `on delete restrict`, `audit_logs` incluida).
- Entrega la lista de aserciones y su resultado en el resumen.

## 5.2 Verificación en dos pasos (TOTP) para administradores

Alcance: administradores y superadmin. Los usuarios estándar no la usan.

Base de datos (`database/NNN_2fa.sql`, sin ejecutar):

```sql
alter table users
  add column if not exists totp_secret_enc text,
  add column if not exists totp_enabled boolean not null default false,
  add column if not exists totp_last_step bigint,
  add column if not exists totp_recovery_hashes text[];

alter table tenants add column if not exists exigir_2fa_admins boolean not null default false;
```

Dependencias: `otplib` (autenticador TOTP) y `qrcode` (imagen del código). Variable nueva `TOTP_ENC_KEY` (32 bytes en base64, generable con `openssl rand -base64 32`); el secreto TOTP se guarda **cifrado con AES-256-GCM** con esa clave. Sin la variable, las rutas de 2FA responden 503.

Flujo:

1. **Activar** (usuario con sesión):
   - `POST /api/auth/2fa/setup`: genera el secreto, lo guarda cifrado **sin activar** y devuelve la URL `otpauth://` y el código QR como imagen en data URL.
   - `POST /api/auth/2fa/enable` `{ codigo }`: verifica el código (ventana de ±1 paso), activa `totp_enabled`, genera **10 códigos de recuperación** de un solo uso (se devuelven una única vez, se guardan solo sus hashes) y audita `DOS_PASOS_ACTIVADO`.
2. **Inicio de sesión** con 2FA activo: `POST /api/auth/login` con credenciales correctas **no** devuelve la sesión, sino `{ requiere2fa: true, ticket }`, un JWT de **5 minutos** con `purpose: '2fa'`. Luego `POST /api/auth/2fa/verify` `{ ticket, codigo }` (código TOTP o de recuperación) devuelve el token y el perfil.
   - **Crítico:** `requireAuth` debe **rechazar** cualquier token que tenga `purpose`, para que un ticket nunca sirva como sesión. Agrega una prueba de esto.
   - Protección contra reutilización: guarda `totp_last_step` y rechaza un código de un paso ya usado.
   - Un código de recuperación se consume al usarse.
   - Limitador: 10 intentos por 15 minutos por IP en `verify`.
3. **Exigir** (configuración por empresa): el superadmin puede marcar `exigir_2fa_admins` para una empresa (casilla en la tabla de empresas de `Superadmin.jsx`, endpoint en `super.js` con auditoría). Si está activo y un administrador no tiene 2FA, `publicUser` incluye `pendientes.configurar2fa = true` y `Protected.jsx` lo envía a `/seguridad` hasta activarlo. El superadmin siempre debe tenerlo activado.
4. **Desactivar o perder el dispositivo:** `POST /api/users/:id/reset-2fa` (administrador de la empresa sobre usuarios de su empresa, con auditoría `DOS_PASOS_REINICIADO`). Para el superadmin, documenta el SQL manual (`update users set totp_enabled = false, totp_secret_enc = null, totp_recovery_hashes = null where email = '...'`).

Frontend:

- `src/pages/Seguridad.jsx` (ruta `/seguridad`): mostrar el QR, pedir el código de confirmación y mostrar los 10 códigos de recuperación **una sola vez** con opción de copiarlos o descargarlos.
- `Login.jsx`: si el servidor responde `requiere2fa`, muestra el segundo paso (campo de código con opción "usar un código de recuperación").
- Enlace "Seguridad" para administradores y superadmin.

Pruebas: activar con una app autenticadora (Google Authenticator, Microsoft Authenticator u otra); iniciar sesión con y sin código; código incorrecto; código repetido en el mismo paso; ticket usado como sesión (debe fallar); ticket vencido; código de recuperación (una sola vez); exigir 2FA a una empresa; reinicio por el administrador; el secreto en la base **no** es legible.

## 5.4 Revisión de endurecimiento

- Ejecuta `npm audit --omit=dev` en `backend` y `frontend`; resuelve lo resoluble sin cambios de versión mayor y lista el resto.
- Confirma que `server.js` usa `trust proxy` y que `req.ip` y los limitadores ven la IP real detrás del proxy del VPS (describe cómo comprobarlo; no accedas al servidor).
- Revisa que las rutas `/api/health*` no revelen información sensible y que los mensajes de error en producción no expongan detalles internos.
- Revisa que no haya `console.log` de datos personales o secretos en el backend.
- Entrega un informe breve con lo encontrado y lo corregido.

## Entrega

Cumple la definición de terminado de `LEEME.md`. Producción (manual): SQL, variable `TOTP_ENC_KEY` en el VPS (si se activa 2FA), `git pull` y reconstrucción. **Antes** de activar la exigencia de 2FA en una empresa real, activa y prueba el 2FA del superadmin y guarda sus códigos de recuperación.
