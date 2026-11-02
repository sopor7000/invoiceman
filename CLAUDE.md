# InvoiceMan

App web multitenant para legalizar facturas y viáticos (Colombia). Responde siempre en español; los textos de la interfaz van en español de Colombia.

## Estructura
- `backend/` Node 22 + Express (CommonJS). Supabase con clave de servicio. Rutas en `src/routes`, utilidades en `src/utils`, middleware en `src/middleware`.
- `frontend/` React + Vite + Tailwind v4. Páginas en `src/pages`, componentes en `src/components`.
- `database/` SQL numerado (`NNN_nombre.sql`). Se ejecuta a mano en Supabase.
- Producción corre en Docker Compose en un VPS (despliegue manual).

## Reglas obligatorias
- Nunca leas, muestres ni copies archivos `.env` ni claves. Trabaja solo contra la base de DESARROLLO.
- No hagas `git push`, no uses SSH y no ejecutes SQL contra producción. Entrega el SQL en un archivo de `database/` y avísame.
- Multitenant: toda consulta filtra por `req.user.tenantId` (sale del token), nunca de lo que envía el cliente. Los roles se leen de la base en cada petición.
- En Supabase no uses selects embebidos (da error PGRST200): consulta las tablas por separado.
- Rutas Express: `asyncHandler`, validación con zod vía `parse()`, errores con `HttpError`, y `audit()` para acciones sensibles.
- Frontend: clases propias con `@utility` en `index.css` (Tailwind v4). Paleta azul marino, rojo y grises; reutiliza `btn-primary`, `card`, `field`, `alert-*`.
- Los valores de dinero se guardan en COP. Las fechas se muestran en hora de Colombia.

## Antes de dar algo por terminado
- `npm run build` en `frontend` debe pasar sin errores.
- El backend debe arrancar sin errores (`npm run dev`).
- Resume qué archivos cambiaste y qué debo ejecutar a mano (SQL, variables de entorno).

## Entorno
Windows 11 con PowerShell. Node 22 o superior.