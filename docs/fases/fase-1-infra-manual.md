# Fase 1 (manual): cimientos operativos

Esta fase la haces tú. El agente no debe ejecutar nada de esto. Debe quedar completa **antes** de usar el agente en las demás fases (sobre todo la sección 1.5).

## 1.1 Revisar los recursos del VPS

```bash
free -h
nproc
df -h /
docker stats --no-stream
```

Debe quedar al menos un 25 % de memoria libre con todas las aplicaciones corriendo (talento, su base de datos, InvoiceMan y JobLoc). Si queda menos, hay que ampliar el plan antes de vender.

## 1.2 Límites de recursos y reinicio automático

En `/opt/apps/invoiceman`:

```bash
cp docker-compose.yml docker-compose.yml.bak
```

Tu archivo ya tiene `restart: unless-stopped`, `mem_limit: 768m` y un `healthcheck`. Solo faltan el límite de CPU y la rotación de logs. Archivo final completo:

```yaml
name: invoiceman
services:
  app:
    build: .
    env_file: ./backend/.env
    environment:
      NODE_ENV: production
      PORT: 4001
    ports:
      - "127.0.0.1:4001:4001"
    restart: unless-stopped
    mem_limit: 768m
    cpus: 0.75
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:4001/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

Aplica con:

```bash
nano docker-compose.yml     # agrega "cpus" y "logging"; usa espacios, nunca tabuladores
docker compose config       # valida el archivo
docker compose up -d app    # recrea solo InvoiceMan
docker compose ps           # debe mostrar "healthy"
docker stats --no-stream    # revisa memoria y CPU
```

Si `docker compose ps` muestra `unhealthy`, es posible que la imagen no traiga `wget`; avísalo en el chat de diseño. Baja `mem_limit` a 512m solo si `docker stats` muestra un uso estable menor de 300 MB.

## 1.3 Monitoreo

1. Cuenta gratuita en UptimeRobot (o similar).
2. Monitor HTTP(s) hacia `https://TU-DOMINIO-GRATUITO/api/health`, cada 5 minutos.
3. Segundo monitor hacia `/api/health/db` (comprueba también la conexión a Supabase).
4. Alertas a tu correo.

## 1.4 Respaldos

**Base de datos:** en Supabase, Database, Backups: revisa qué copias da tu plan. Para datos de clientes necesitas un plan con copias diarias automáticas. Prueba una restauración al menos una vez antes del primer cliente.

**Soportes (Storage):** las copias de la base no incluyen los archivos. En el VPS:

```bash
sudo apt-get install -y rclone
mkdir -p ~/.config/rclone /opt/backups/invoiceman/soportes
```

Crea `~/.config/rclone/rclone.conf` con la clave S3 que genera Supabase (Storage, Settings, S3 Connection):

```ini
[supabase]
type = s3
provider = Other
access_key_id = TU_ACCESS_KEY
secret_access_key = TU_SECRET
endpoint = ENDPOINT_QUE_MUESTRA_SUPABASE
region = REGION_QUE_MUESTRA_SUPABASE
```

```bash
chmod 600 ~/.config/rclone/rclone.conf
rclone copy supabase:soportes /opt/backups/invoiceman/soportes --progress
crontab -e
```

Línea del cron (3:00 a. m. del servidor), con `copy` y no `sync` para que un borrado accidental no se propague:

```
0 3 * * * rclone copy supabase:soportes /opt/backups/invoiceman/soportes >> /opt/backups/invoiceman/rclone.log 2>&1
```

Más adelante envía esa copia a un almacenamiento externo, porque no protege ante la pérdida del VPS.

## 1.5 Entorno de desarrollo separado (obligatorio antes de usar el agente)

1. En Supabase crea el proyecto **`invoiceman-dev`**, con su propia contraseña de base de datos.
2. Copia el esquema de producción (requiere Docker Desktop en tu PC):

```powershell
cd C:\Users\oscar\legalizacion-app
npx supabase login
npx supabase link --project-ref REF_DEL_PROYECTO_PROD
npx supabase db dump -f database\000_esquema_base.sql
```

Ese comando solo lee. **Nunca** ejecutes `db push` ni `db reset` contra producción. Si no tienes Docker Desktop, pide en el chat de diseño un script SQL consolidado.

3. En el SQL Editor de `invoiceman-dev` pega y ejecuta `000_esquema_base.sql`. Si falla por la extensión, ejecuta antes:

```sql
create extension if not exists pgcrypto with schema extensions;
```

4. Buckets y superadmin de desarrollo (cambia el correo):

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('soportes', 'soportes', false, 10485760,
    array['application/pdf','image/jpeg','image/png','image/webp']),
  ('ayuda', 'ayuda', false, 52428800,
    array['video/mp4','video/webm','application/pdf',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do nothing;

insert into users (tipo_doc, numero_doc, nombre, email, password_hash, is_super_admin, must_change_password)
values ('CC', '1000000000', 'Super Administrador (dev)', 'TU_CORREO_DEV@dominio.com',
        extensions.crypt('Temporal-Dev-2026a', extensions.gen_salt('bf', 10)), true, true);
```

5. En `backend\.env` cambia **solo** `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` por los de `invoiceman-dev`. Reinicia el backend y comprueba:

```powershell
Invoke-RestMethod http://localhost:4000/api/health/db
```

Debe mostrar `companias: 0`. Si muestra las de producción, el `.env` no cambió.

6. Desde ahora, **todo SQL va en un archivo numerado** dentro de `database\`, y se ejecuta primero en desarrollo y después en producción.

## 1.6 Rotar secretos

En el VPS, ubica dónde están las variables sin imprimirlas:

```bash
grep -rl JWT_SECRET /opt/apps/invoiceman --include=".env*" --include="docker-compose.yml" 2>/dev/null
```

Genera uno nuevo (`openssl rand -hex 48`), edítalo con `nano` y recrea el contenedor (`docker compose up -d app`). Esto cierra las sesiones abiertas. Si alguna clave de Supabase pudo exponerse, rótala en Project Settings, API Keys.

Contraseñas de cuentas de prueba, en el SQL Editor de **producción**:

```sql
update users
set password_hash = extensions.crypt('Temporal-Cambiar-2026b', extensions.gen_salt('bf', 10)),
    must_change_password = true
where email in ('oscar.agudelo@live.com', 'sopor7000@hotmail.com', 'oscar.agudelo+user1@live.com');
```

## 1.7 Retirar Render

Cuando el VPS funcione bien, **suspende** el servicio de Render (no lo borres de inmediato) para no tener dos servidores contra la misma base.

## Lista de verificación

- [ ] `docker stats` y `free -h` muestran memoria suficiente
- [ ] Contenedor con límites y reinicio automático
- [ ] Alertas de UptimeRobot probadas
- [ ] Copias diarias de la base y copia nocturna de los soportes
- [ ] Restauración probada
- [ ] Tu PC usa `invoiceman-dev` y `/api/health/db` muestra 0 compañías
- [ ] `JWT_SECRET` nuevo en producción y contraseñas de prueba cambiadas
- [ ] Render suspendido
