# InvoiceMan: guía maestra, de hoy hasta la venta a 20 clientes

Decisiones vigentes: prueba de **15 días**, gracia de **7 días**, precios **con IVA incluido (19 %)**, facturación manual, dominio gratuito `.io` ya publicado en el VPS, repositorio `sopor7000/invoiceman`, VPS en `/opt/apps/invoiceman`.

**Dónde se ejecuta cada comando** (se indica en cada paso):
- 🖥️ **PC**: PowerShell en `C:\Users\oscar\legalizacion-app`.
- 🌐 **VPS**: terminal SSH, en `/opt/apps/invoiceman`.
- 🗄️ **Supabase**: SQL Editor del proyecto indicado (dev o producción). Antes de pegar SQL, mira el nombre del proyecto en la esquina superior.
- 🤖 **Agente**: panel de Claude Code en VS Code.

Regla de oro: **el SQL siempre se ejecuta primero en `invoiceman-dev`, y en producción solo después de que las pruebas pasaron.**

---

## BLOQUE A. Preparación (una sola vez)

### A1. Copiar los archivos del paquete (🖥️ PC)
1. Descomprime `invoiceman-agente.zip` en la raíz de `legalizacion-app`, junto a `CLAUDE.md`.
2. Debes tener: `docs\fases\` (con `GUIA-MAESTRA.md`, `LEEME.md` y las guías), `.claude\settings.json` y `.claude\commands\implementar-fase.md`.
3. Si ya existía `.claude\settings.json`, no lo sobrescribas: copia las reglas dentro del existente.
4. Comprueba que `.env` y `login.ps1` siguen fuera de Git: `git check-ignore backend/.env` debe imprimir la ruta.
5. Guarda este cambio: `git add docs .claude` y `git commit -m "docs: guias de fase y permisos del agente"`. Haz `git push` solo si tu rama principal se llama `main` y quieres respaldarlo ya.

### A2. Límites en el VPS y reinicio automático (🌐 VPS) — Fase 1.2
```bash
cd /opt/apps/invoiceman
cp docker-compose.yml docker-compose.yml.bak
nano docker-compose.yml
```
Agrega bajo `app`, junto a `mem_limit`, estas líneas (sangría de 4 espacios, sin tabuladores):
```yaml
    cpus: 0.75
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```
Guarda (`Ctrl+O`, Enter, `Ctrl+X`) y aplica:
```bash
docker compose config        # si hay error, corrige la sangría
docker compose up -d app     # solo reinicia InvoiceMan; talento y JobLoc no se tocan
docker compose ps            # estado "healthy" (puede tardar 30 s)
docker stats --no-stream
free -h
```
Verifica que quede ≥ 25 % de memoria libre en `free -h`. Si falla algo: `cp docker-compose.yml.bak docker-compose.yml && docker compose up -d app`.

### A3. Monitoreo (navegador) — Fase 1.3
1. Crea cuenta en UptimeRobot.
2. Monitor HTTP(s) a `https://TU-DOMINIO-GRATUITO/api/health` cada 5 min.
3. Segundo monitor a `https://TU-DOMINIO-GRATUITO/api/health/db`.
4. Alertas a tu correo. Prueba apagando un momento el contenedor (`docker compose stop app`, esperar el aviso, `docker compose start app`).

### A4. Respaldos (🌐 VPS y navegador) — Fase 1.4
1. Supabase → Database → Backups: anota qué copias da tu plan (para clientes reales necesitas copias diarias).
2. Soportes: sigue la sección 1.4 de `fase-1-infra-manual.md` (rclone + cron de las 3:00). Comprueba al día siguiente `ls /opt/backups/invoiceman/soportes` y `tail /opt/backups/invoiceman/rclone.log`.

### A5. Base de desarrollo separada (🖥️ PC y 🗄️ Supabase) — Fase 1.5, OBLIGATORIA
Sigue la sección 1.5 de `fase-1-infra-manual.md` completa. Resultado esperado:
1. Existe el proyecto Supabase `invoiceman-dev` con esquema, buckets y un superadmin de desarrollo.
2. `backend\.env` de tu PC apunta a `invoiceman-dev` (solo `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`).
3. Reinicia el backend y ejecuta:
```powershell
Invoke-RestMethod http://localhost:4000/api/health/db
```
Debe mostrar `companias: 0`. Si muestra empresas reales, **detente**: el `.env` sigue apuntando a producción.
4. Entra a la app local con el superadmin de desarrollo y crea una empresa de prueba con un administrador y dos usuarios, para tener con qué probar.

> Nota: el `.env` del VPS **no** se toca; sigue apuntando a producción.

### A6. Rotar secretos y limpiar (🌐 VPS y 🗄️ Supabase producción) — Fase 1.6 y 1.7
Sigue las secciones 1.6 y 1.7. Después de rotar `JWT_SECRET` y recrear el contenedor, todos los usuarios deben volver a iniciar sesión (es lo esperado). Suspende Render.

### A7. Verificar el agente (🤖 Agente)
1. Abre VS Code en la carpeta del proyecto y el panel de Claude Code.
2. Escribe `/permissions`: deben aparecer los bloqueos de `.env`, `ssh`, `curl`, `supabase`.
3. Escribe `/` y confirma que aparece `implementar-fase`.
4. 🖥️ `git status` debe decir "working tree clean" y estar en `main`.

**Checklist del bloque A:** compose con límites y `healthy` · UptimeRobot probado · rclone programado · `invoiceman-dev` listo con `companias: 0` · secretos rotados · Render suspendido · permisos verificados.

---

## BLOQUE B. Ciclo estándar para cada fase de código

Se repite igual para las fases 2, 3, 3B, 4 y 5. Aquí está una sola vez; en cada fase solo cambian el nombre y las pruebas.

### B1. Desarrollo (🖥️ PC y 🤖 Agente)
1. `git checkout main` y `git pull`.
2. `git checkout -b <nombre-de-la-rama>` (se indica en cada fase).
3. En el panel del agente activa el **modo plan** y ejecuta `/implementar-fase <archivo>.md`.
4. Lee el plan completo. Apruébalo solo si cubre lo que dice la guía (SQL en `database/`, rutas, pantallas). Si falta o sobra algo, pídele que lo corrija antes de aprobar.
5. Deja que implemente. Cuando termine debe haber compilado el frontend y arrancado el backend; pídele el resumen si no lo dio.
6. Si el agente se detiene con una pregunta, respóndela leyendo la guía; ante duda, pregúntame en el chat con el mensaje exacto.

### B2. Pruebas en desarrollo (🗄️ dev y 🖥️ PC)
1. Abre el SQL nuevo de `database\` (el último número) y revísalo: debe coincidir con el de la guía.
2. Pégalo en el SQL Editor de **`invoiceman-dev`** y ejecútalo. Debe terminar con "Success".
3. Reinicia el backend local y haz **todas** las pruebas de la sección "Pruebas" de la guía, una por una, marcándolas.
4. Si una falla, copia el mensaje de error (sin claves) y llévalo al chat.

### B3. Revisión y fusión (🖥️ PC)
1. `git diff main --stat` para ver los archivos tocados; revisa con lupa `auth.js`, el middleware, el SQL, `super.js` y todo lo de pagos.
2. `git add -A` y `git commit -m "<mensaje>"`.
3. `git checkout main`, `git merge <rama>`, `git push`.

### B4. Producción (🗄️ producción y 🌐 VPS) — orden obligatorio
1. **Copia de seguridad previa**: en Supabase producción, Database → Backups, confirma que hay una copia reciente (o crea una).
2. **Variables nuevas**: si la fase las pide, agrégalas al `backend/.env` del VPS **antes** de reconstruir: `nano /opt/apps/invoiceman/backend/.env`.
3. **SQL en producción primero**: abre el SQL Editor del proyecto de **producción**, pega el mismo archivo y ejecútalo. *El orden importa: el código nuevo consulta columnas y funciones que el SQL crea; si despliegas el código antes, la app falla.*
4. **Código**:
```bash
cd /opt/apps/invoiceman
git pull
docker compose up -d --build app
docker compose ps
docker compose logs --tail 60 app
```
5. **Verificación** (🖥️ PC): `Invoke-RestMethod https://TU-DOMINIO-GRATUITO/api/health` debe responder `ok`; inicia sesión y prueba lo principal de la fase.
6. **Si algo sale mal**: no ejecutes SQL de reversa por tu cuenta. En el VPS vuelve al commit anterior (`git log --oneline`, `git checkout <commit-anterior>`, `docker compose up -d --build app`) y avísame: el SQL de estas fases solo agrega cosas, así que el código viejo sigue funcionando con la base nueva.

---

## BLOQUE C. Fase 2: recuperación de contraseña

- Rama: `fase-2-recuperacion-clave` · Archivo: `fase-2-recuperacion-clave.md` · Ejecuta el ciclo B1 → B4.
- **Variables nuevas en el VPS (paso B4.2):**
```
APP_URL=https://TU-DOMINIO-GRATUITO
RESET_MINUTOS=30
```
  (sin barra final; usa exactamente la dirección con la que entras a la app).
- **Correo en producción:** sin dominio propio no puedes verificar SPF/DKIM, y sin `SMTP_HOST` el servidor en producción **no envía** correos (queda error en el log, y el usuario ve el mensaje genérico). Mientras tanto la recuperación funciona **por el administrador** (Configuración → Usuarios → Restablecer clave). Cuando tengas dominio propio, configura `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM` (Fase 6.1). Es válido dejar esta parte para después.
- **Importante en producción:** como el middleware lee la columna `pwd_changed_at`, el SQL debe estar aplicado **antes** de `docker compose up -d --build`. Si lo haces al revés, nadie podrá iniciar sesión.
- Pruebas de producción (mínimas): iniciar sesión con tu superadmin y el "Restablecer clave" de un usuario de prueba, que cierra su sesión abierta.

## BLOQUE D. Fase 3: planes, límites y panel de uso

- Rama: `fase-3-planes-y-limites` · Archivo: `fase-3-planes-y-limites.md` · Ciclo B1 → B4.
- **Parámetros ya aplicados en la guía:** prueba de **15 días**, gracia de **7** (por defecto; `PLAN_GRACIA_DIAS` solo se agrega si quisieras cambiarla), precios **con IVA incluido**.
- **En producción (importante):**
  - El SQL asigna **15 días desde hoy** a todas las empresas existentes. Justo después, en el panel de superadmin → "Plan y precios", abre **cada empresa** y fija su tramo real, sus precios y su vigencia real. Si no, tus empresas de prueba o demostración vencerán en 15 días.
  - Si una empresa existente tiene más de 50 usuarios activos, asígnale el tramo correcto en ese momento.
  - Fija los precios de cada tramo (con IVA incluido) para cada empresa que vaya a contratar.
- Pruebas: la lista de la guía (13 pruebas). La 10 (vigencia) se hace en dev cambiando `plan_vence_en` con SQL; **nunca** manipules esa columna en producción salvo desde el panel.

## BLOQUE E. Fase 3B: pagos y facturación manual

- Rama: `fase-3b-pagos-manuales` · Archivo: `fase-3b-pagos-manuales.md` · Requiere el bloque D ya en producción. Ciclo B1 → B4.
- **IVA:** el formulario pide el **total pagado con IVA incluido** y calcula `base = total / 1.19` e IVA por diferencia. Revisa con tu contador que ese cálculo coincide con cómo factura. Prueba con un pago de 119.000: base 100.000, IVA 19.000.
- **Proceso de cobro mientras no hay facturación electrónica:**
  1. El cliente transfiere. 2. Registras el pago en el panel (extiende la vigencia). 3. Tu contador o facturador expide la factura. 4. Registras su número en el historial (el pago sale de "pendientes de factura"). 5. A fin de mes descargas el Excel para el contador.
- Pruebas: las 8 de la guía.

## BLOQUE F. Fase 4: rendimiento

- Rama: `fase-4-rendimiento` · Archivo: `fase-4-rendimiento.md` · Ciclo B1 → B4.
- Antes de que el agente empiece, anota la línea base (tiempo de `GET /api/users`, del Excel de estadísticas y de subir una foto de 4 MB).
- El script de siembra (`sembrar-usuarios.js`) solo corre con `ALLOW_SEED=1`; **nunca** pongas esa variable en el VPS.
- En producción, el SQL (índices) puede no existir en esta fase; si el agente lo crea, sigue B4. Prueba subiendo una foto desde el celular en la app instalada.

## BLOQUE G. Fase 5: seguridad y auditoría

Cuatro entregas, en este orden: 5.1 visor de auditoría → 5.3 pruebas de aislamiento → 5.2 doble factor → 5.4 revisión. Cada una con su rama y el ciclo B1 → B4.

- **Variables para las pruebas de aislamiento (solo en tu PC, no en el VPS):** `ALLOW_TESTS=1` y `DEV_PROJECT_REF=<ref de invoiceman-dev>` en `backend\.env`. Esos nombres los pone el agente en `.env.example`; las pones tú a mano en tu `.env`.
- **Doble factor:** en el VPS agrega `TOTP_ENC_KEY` (genera 32 bytes con `openssl rand -base64 32` en el VPS y pégalo en `.env` con `nano`; **guarda una copia en tu gestor de contraseñas**: si se pierde, nadie podrá entrar con 2FA).
- **Orden seguro con 2FA:** activa el 2FA en tu superadmin, guarda sus 10 códigos de recuperación fuera del PC y comprueba iniciar sesión con y sin código **antes** de exigirlo a ninguna empresa.
- Antes de cerrar la 5.4 revisa tú el informe de `npm audit` y decide qué versiones mayores aceptas.

---

## BLOQUE H. Salida comercial (manual) — Fase 6

Trabaja `fase-6-salida-comercial.md`. Con el dominio gratuito actual puedes empezar las pruebas piloto, pero antes de cobrar:
1. **Dominio propio** (recomendado) con HTTPS: cambia `APP_URL`, UptimeRobot, y genera un **APK nuevo** con la misma llave de firma.
2. **Correo transaccional** con SPF y DKIM para activar la recuperación por correo.
3. Documentos legales, contratos de transmisión de datos y facturación con tu contador.
4. Guion de demostración y empresa de demo.
5. Lista final 6.7 completa.

## BLOQUE I (opcional). Cobros con Wompi — Fase 7

Solo después de que los bloques D y E estén en producción y tengas cuenta de comercio en Wompi. Archivo `fase-7-opcional-wompi.md`. Ya incluye la separación de IVA al registrar pagos aprobados. Requiere una URL pública estable para el webhook (con el dominio gratuito sirve si es HTTPS estable).

---

## Calendario sugerido (ajústalo a tu ritmo)

| Semana | Trabajo |
|---|---|
| 1 | Bloque A completo; Fase 2 (C) |
| 2 | Fase 3 (D) y Fase 3B (E) en dev; producción al cierre |
| 3 | Fase 4 (F) |
| 4 | Fase 5 (G) |
| 5 | Bloque H; primeras empresas piloto |

## Reglas que no se rompen
1. Nunca pegues claves, el `.env` ni el `JWT_SECRET` en el chat ni en el agente.
2. SQL: primero dev, luego producción, con copia de seguridad previa y **antes** del código.
3. Una fase por rama; no mezcles fases.
4. Después de cada despliegue: `docker compose ps`, `docker compose logs --tail 60 app` y una prueba real de inicio de sesión.
5. Cualquier error: copia el mensaje completo (sin claves) y el nombre de la fase al chat.
