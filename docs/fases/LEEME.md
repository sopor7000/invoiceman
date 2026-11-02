# Cómo trabajar las fases con el agente de Claude Code

> Para la secuencia completa y ordenada (incluida la subida al VPS) sigue **`GUIA-MAESTRA.md`**. Este archivo es el resumen que lee el agente.

Este paquete contiene la guía de cada fase de InvoiceMan escrita para que el agente de Claude Code la ejecute dentro del proyecto. El agente no ve el chat donde se diseñaron: **todo lo que necesita está en estos archivos, en `CLAUDE.md` y en el código del proyecto**.

## Orden de trabajo

| Orden | Archivo | Quién lo hace |
|---|---|---|
| 1 | `fase-1-infra-manual.md` | Tú (manual): respaldos, monitoreo, base de desarrollo, secretos |
| 2 | `fase-2-recuperacion-clave.md` | Agente |
| 3 | `fase-3-planes-y-limites.md` | Agente |
| 4 | `fase-3b-pagos-manuales.md` | Agente (depende de la fase 3) |
| 5 | `fase-4-rendimiento.md` | Agente |
| 6 | `fase-5-seguridad-y-auditoria.md` | Agente |
| 7 | `fase-6-salida-comercial.md` | Tú (manual): dominio, APK, documentos legales, demostración |
| 8 | `fase-7-opcional-wompi.md` | Agente (opcional; depende de las fases 3 y 3B) |

## Antes de la primera fase (obligatorio)

1. **Base de desarrollo lista.** Debe existir el proyecto de Supabase `invoiceman-dev` con el esquema cargado, y `backend/.env` debe apuntar a él (fase 1, sección 1.5). **Si no está hecho, el agente no debe trabajar**: probaría contra datos reales.
2. **Git limpio** y la rama principal sincronizada con GitHub.
3. **`CLAUDE.md`** en la raíz y **`.claude/settings.json`** cargado. Dentro del agente, ejecuta `/permissions` y confirma que las reglas de bloqueo aparecen.
4. `docs/fases/` con estos archivos.

## Flujo para cada fase

1. Crea una rama: `git checkout -b fase-2-recuperacion-clave`.
2. En el panel del agente activa el **modo plan** y ejecuta:
   `/implementar-fase fase-2-recuperacion-clave.md`
   (si el comando no existe en tu versión, usa el prompt manual de más abajo).
3. **Lee el plan** y apruébalo solo si coincide con el archivo de la fase.
4. El agente implementa, compila el frontend y arranca el backend. Al final te dice qué debes ejecutar a mano.
5. **Tú ejecutas el SQL** que el agente dejó en `database/`, primero en `invoiceman-dev`.
6. Haz las **pruebas de la sección "Pruebas"** del archivo, una por una.
7. **Revisa el diff completo** antes de confirmar. Mira con lupa: `auth.js`, el middleware, el SQL, `super.js` y todo lo de pagos.
8. Haz `commit` y fusiona la rama a `main`.
9. **Producción** (manual): SQL en el proyecto de producción, `git push`, y en el VPS `git pull` y `docker compose up -d --build app`.

## Qué NO debe hacer el agente

- Leer, mostrar o editar archivos `.env` ni `backend/scripts/login.ps1`.
- Conectarse al VPS (SSH) ni ejecutar `docker` en el servidor.
- Ejecutar SQL contra producción ni usar la CLI de Supabase (`db push`, `db reset`).
- Hacer `git push` sin que tú lo apruebes.
- Cambiar el diseño visual (paleta, componentes `btn-*`, `card`, `field`) más allá de lo que pida la fase.
- Instalar dependencias que la fase no mencione, sin avisarte.

## Definición de terminado (para toda fase)

- `npm run build` en `frontend` termina sin errores.
- El backend arranca sin errores (`npm run dev`).
- El SQL está en `database/NNN_nombre.sql` (el número siguiente al último existente) y **no** se ejecutó contra producción.
- Las pruebas de la fase pasan en desarrollo.
- El agente entrega un resumen: archivos creados y modificados, SQL pendiente, variables de entorno nuevas y qué hacer en producción.

## Prompt manual (si no usas el comando)

```
Lee CLAUDE.md y docs/fases/LEEME.md. Luego lee docs/fases/<ARCHIVO> e impleméntala.
Reglas: sigue la fase al pie de la letra; si algo no encaja con el código actual, detente y pregúntame
antes de improvisar. El SQL va en database/ sin ejecutarse. No toques .env ni producción.
Muéstrame el plan antes de editar. Al final compila el frontend, arranca el backend
y resume qué debo ejecutar a mano.
```

## Si algo falla

Copia el mensaje de error completo (sin claves) y el nombre del archivo de la fase, y llévalos al chat de diseño. Si el agente propone una solución distinta a la de la guía, pídele que explique la diferencia antes de aceptarla.

## Convenciones del proyecto (resumen)

- Español en toda la interfaz y en los mensajes de error.
- Rutas Express con `asyncHandler`, validación con zod vía `parse()`, errores con `HttpError` y auditoría con `audit()` para acciones sensibles.
- Toda consulta de empresa filtra por `req.user.tenantId` (sale del token, nunca del cuerpo de la petición).
- En Supabase no se usan selects embebidos (error PGRST200): se consultan las tablas por separado.
- Los valores de dinero se guardan en COP (los precios de los tramos incluyen IVA del 19 %); las fechas se muestran en hora de Colombia.
