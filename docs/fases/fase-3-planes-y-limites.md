# Fase 3: planes por tramo, límites y panel de uso

## Objetivo

Vender InvoiceMan por tramos de usuarios, con precio parametrizable por empresa, límite de usuarios aplicado en la base de datos, vigencia con periodo de gracia y un panel de uso para el superadministrador.

## Reglas de negocio (no cambiar sin consultar)

| Tema | Regla |
|---|---|
| Tramos | T1: 1 a 50 · T2: 51 a 100 · T3: 101 a 200 · T4: 201 a 500 · T5: más de 500 |
| Precio | Lo fija el **superadmin por empresa y por tramo** (valor mensual en COP). También un descuento por pago anual por empresa |
| Elección | El **administrador de la empresa** elige entre T1 y T4, siempre que ese tramo tenga precio y le quepan sus usuarios activos |
| Límite | Al llegar al máximo del tramo no se pueden crear ni reactivar usuarios (aplicado por triggers en la base; cubre alta individual, carga masiva y reactivación) |
| Más de 500 | **Cotización manual**: la empresa envía una solicitud; el superadmin asigna T5 con límite y precio pactados |
| Prueba | Cada empresa nueva arranca con **15 días** de prueba |
| Vencimiento | 7 días de gracia con acceso completo (`PLAN_GRACIA_DIAS`); después, **solo consulta y descarga** (se bloquea todo método distinto de GET) |
| Superadmin | No se bloquea por vencimiento y no puede cambiar tramos desde `/api/plan` |

Limitación conocida: el cambio de tramo es inmediato y no hay prorrateo; cada cambio queda auditado.

## 1. Base de datos

Crea `database/NNN_planes.sql` con exactamente esto (no lo ejecutes):

```sql
-- Catálogo de tramos
create table plan_tiers (
  codigo             text primary key,
  nombre             text not null,
  min_usuarios       int  not null,
  max_usuarios       int,                        -- null = sin tope (cotización manual)
  orden              int  not null,
  cotizacion_manual  boolean not null default false
);
insert into plan_tiers values
  ('T1', '1 a 50 usuarios',     1,   50,   1, false),
  ('T2', '51 a 100 usuarios',   51,  100,  2, false),
  ('T3', '101 a 200 usuarios',  101, 200,  3, false),
  ('T4', '201 a 500 usuarios',  201, 500,  4, false),
  ('T5', 'Más de 500 usuarios', 501, null, 5, true);

-- Plan de cada empresa
create table tenant_plan (
  tenant_id            uuid primary key references tenants(id) on delete restrict,
  tier_codigo          text not null references plan_tiers(codigo),
  limite_usuarios      int  not null check (limite_usuarios > 0),
  descuento_anual_pct  numeric(5,2) not null default 0 check (descuento_anual_pct between 0 and 100),
  updated_at           timestamptz not null default now()
);

-- Precio mensual de cada tramo, por empresa
create table tenant_tier_prices (
  tenant_id    uuid not null references tenants(id) on delete restrict,
  tier_codigo  text not null references plan_tiers(codigo),
  precio_mes   numeric(18,2) not null check (precio_mes > 0),
  updated_at   timestamptz not null default now(),
  primary key (tenant_id, tier_codigo)
);

-- Solicitudes de cotización (más de 500 usuarios)
create table plan_requests (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete restrict,
  user_id      uuid references users(id),
  mensaje      text not null,
  estado       text not null default 'PENDIENTE' check (estado in ('PENDIENTE','ATENDIDA')),
  created_at   timestamptz not null default now(),
  atendida_en  timestamptz
);
create index plan_requests_idx on plan_requests (estado, created_at desc);

alter table tenants add column if not exists plan_vence_en timestamptz;

create trigger trg_tplan_upd  before update on tenant_plan        for each row execute function set_updated_at();
create trigger trg_tprice_upd before update on tenant_tier_prices for each row execute function set_updated_at();

alter table plan_tiers          enable row level security;
alter table tenant_plan         enable row level security;
alter table tenant_tier_prices  enable row level security;
alter table plan_requests       enable row level security;
revoke all on plan_tiers, tenant_plan, tenant_tier_prices, plan_requests from anon, authenticated;

-- Empresas nuevas: tramo T1 y 15 días de prueba
create or replace function crear_plan_inicial() returns trigger language plpgsql as $$
begin
  insert into tenant_plan (tenant_id, tier_codigo, limite_usuarios)
  values (new.id, 'T1', 50) on conflict do nothing;
  update tenants set plan_vence_en = coalesce(plan_vence_en, now() + interval '15 days') where id = new.id;
  return null;
end $$;
create trigger trg_tenant_plan after insert on tenants for each row execute function crear_plan_inicial();

-- Empresas que ya existen
insert into tenant_plan (tenant_id, tier_codigo, limite_usuarios)
select id, 'T1', 50 from tenants on conflict do nothing;
-- Empresas ya existentes: 15 días desde hoy (ajústalas luego una por una en el panel)
update tenants set plan_vence_en = now() + interval '15 days' where plan_vence_en is null;

-- Límite de usuarios activos, validado al terminar cada operación (cubre la carga masiva)
create or replace function chk_limite_ins() returns trigger language plpgsql as $$
declare t uuid; v_limite int; v_activos int;
begin
  for t in select distinct tenant_id from nuevos where tenant_id is not null and activo loop
    perform pg_advisory_xact_lock(hashtext(t::text));       -- evita carreras entre administradores
    select limite_usuarios into v_limite from tenant_plan where tenant_id = t;
    if v_limite is null then continue; end if;
    select count(*) into v_activos from users where tenant_id = t and activo;
    if v_activos > v_limite then raise exception 'LIMITE_USUARIOS:%|%', v_limite, v_activos; end if;
  end loop;
  return null;
end $$;

create or replace function chk_limite_upd() returns trigger language plpgsql as $$
declare t uuid; v_limite int; v_activos int;
begin
  -- solo importan las reactivaciones; editar a un usuario no se bloquea
  for t in select distinct n.tenant_id from nuevos n join viejos v on v.id = n.id
           where n.tenant_id is not null and n.activo and not v.activo loop
    perform pg_advisory_xact_lock(hashtext(t::text));
    select limite_usuarios into v_limite from tenant_plan where tenant_id = t;
    if v_limite is null then continue; end if;
    select count(*) into v_activos from users where tenant_id = t and activo;
    if v_activos > v_limite then raise exception 'LIMITE_USUARIOS:%|%', v_limite, v_activos; end if;
  end loop;
  return null;
end $$;

create trigger trg_users_limite_ins after insert on users
  referencing new table as nuevos for each statement execute function chk_limite_ins();
create trigger trg_users_limite_upd after update on users
  referencing old table as viejos new table as nuevos for each statement execute function chk_limite_upd();

-- Cambio de tramo (lo usa la empresa y el superadmin)
create or replace function cambiar_tramo(
  p_tenant uuid, p_tier text, p_limite int default null, p_superadmin boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ti plan_tiers%rowtype; v_limite int; v_activos int;
begin
  perform pg_advisory_xact_lock(hashtext(p_tenant::text));
  select * into ti from plan_tiers where codigo = p_tier;
  if not found then return jsonb_build_object('resultado', 'TRAMO_INVALIDO'); end if;

  if ti.cotizacion_manual and not p_superadmin then
    return jsonb_build_object('resultado', 'REQUIERE_COTIZACION');
  end if;

  if ti.cotizacion_manual then
    if p_limite is null or p_limite < ti.min_usuarios then
      return jsonb_build_object('resultado', 'LIMITE_INVALIDO', 'minimo', ti.min_usuarios);
    end if;
    v_limite := p_limite;
  else
    v_limite := ti.max_usuarios;
  end if;

  if not p_superadmin and not exists (
    select 1 from tenant_tier_prices where tenant_id = p_tenant and tier_codigo = p_tier) then
    return jsonb_build_object('resultado', 'SIN_PRECIO');
  end if;

  select count(*) into v_activos from users where tenant_id = p_tenant and activo;
  if v_activos > v_limite then
    return jsonb_build_object('resultado', 'USUARIOS_EXCEDEN', 'activos', v_activos, 'limite', v_limite);
  end if;

  update tenant_plan set tier_codigo = p_tier, limite_usuarios = v_limite where tenant_id = p_tenant;
  return jsonb_build_object('resultado', 'OK', 'tramo', p_tier, 'limite', v_limite);
end $$;

-- Panel de uso del superadmin
create or replace function uso_empresas() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'nombre'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', t.id, 'nombre', t.nombre, 'nit', t.nit, 'activo', t.activo,
      'tramo', p.tier_codigo, 'limite', p.limite_usuarios, 'venceEn', t.plan_vence_en,
      'usuariosActivos', (select count(*) from users u where u.tenant_id = t.id and u.activo),
      'legalizacionesMes', (select count(*) from legalizations l where l.tenant_id = t.id
         and l.created_at >= (date_trunc('month', now() at time zone 'America/Bogota') at time zone 'America/Bogota')),
      'viaticosMes', (select count(*) from viatico_requests v where v.tenant_id = t.id
         and v.created_at >= (date_trunc('month', now() at time zone 'America/Bogota') at time zone 'America/Bogota')),
      'almacenamientoBytes', coalesce((select sum((o.metadata->>'size')::bigint) from storage.objects o
         where o.bucket_id in ('soportes', 'ayuda') and o.name like t.id::text || '/%'), 0),
      'ultimaActividad', (select max(a.created_at) from audit_logs a where a.tenant_id = t.id)
    ) as x
    from tenants t left join tenant_plan p on p.tenant_id = t.id
  ) s;
$$;

revoke execute on function cambiar_tramo(uuid, text, int, boolean) from public, anon, authenticated;
revoke execute on function uso_empresas() from public, anon, authenticated;
grant  execute on function cambiar_tramo(uuid, text, int, boolean) to service_role;
grant  execute on function uso_empresas() to service_role;

notify pgrst, 'reload schema';
```

Nota para el usuario: si alguna empresa existente ya tiene más de 50 usuarios activos, hay que cambiarle el tramo desde el panel del superadmin tras aplicar el SQL.

## 2. Backend

### 2.1 `src/utils/plan.js` (nuevo)

- `estadoPlan(venceEn)` devuelve `{ estado, venceEn, diasRestantes, graciaDias }` con estados `VIGENTE`, `POR_VENCER` (7 días o menos), `GRACIA` (vencido hace menos de `PLAN_GRACIA_DIAS`, 7 por defecto), `VENCIDO` y `SIN_VIGENCIA` (sin fecha).
- `errorLimite(error)`: si el mensaje coincide con `LIMITE_USUARIOS:(\d+)\|(\d+)`, devuelve un `HttpError(409, 'Tu plan permite hasta X usuarios activos y esta operación llevaría a Y. Sube de tramo en la sección Plan para agregar más. No se realizó ningún cambio.', 'LIMITE_USUARIOS')`; si no coincide, `null`.

### 2.2 `src/middleware/auth.js`

- Define `TENANT_COLS = 'id, nombre, nit, activo, validar_nit_receptor, plan_vence_en'` y úsalo en las dos consultas de `tenants`.
- En `req.user` agrega `plan: tenant ? estadoPlan(tenant.plan_vence_en) : null`.
- Antes del bloque `if (!options.allowPending)`: si `req.user.plan?.estado === 'VENCIDO'`, el usuario **no** es superadmin y el método **no** es GET/HEAD/OPTIONS, responde 402 con código `PLAN_VENCIDO` y el mensaje "El plan de tu compañía está vencido. Solo puedes consultar y descargar información hasta que se renueve.", **excepto** si `req.originalUrl` empieza por `/api/auth`, `/api/plan`, `/api/billing` o `/api/notifications`.

### 2.3 `src/routes/auth.js`

En `publicUser` agrega `plan: u.plan`.

### 2.4 `src/routes/users.js`

Importa `errorLimite` y, en las tres rutas que escriben usuarios, dentro del manejo de error y **antes** del chequeo de código `23505`, haz `const le = errorLimite(error); if (le) throw le;`:
- `POST /` (alta individual),
- `POST /bulk` (insert masivo),
- `PATCH /:id` (reactivación).

### 2.5 `src/routes/plan.js` (nuevo; solo administradores de empresa)

`router.use(requireAuth(), requireTenant, requireAdmin)`. Un middleware `noSuper` responde 403 `SUPER_NO_PLAN` a los superadmins en las rutas que escriben.

- `GET /api/plan` devuelve: `vigencia` (de `estadoPlan`), `tramoActual`, `limiteUsuarios`, `usuariosActivos`, `descuentoAnualPct` y `tramos[]` (`codigo`, `nombre`, `min`, `max`, `cotizacionManual`, `precioMes` o `null`, `actual`, `cabe`: si los usuarios activos caben en ese tramo).
- `POST /api/plan/tramo` `{ tramo: 'T1'..'T5' }`: llama al RPC `cambiar_tramo(..., p_superadmin=false)`. Respuestas: `OK` → estado actualizado y auditoría `PLAN_TRAMO_CAMBIADO` `{ de, a }`; `REQUIERE_COTIZACION` → 409 con mensaje de cotización manual; `USUARIOS_EXCEDEN` → 409 con "Tienes X usuarios activos y ese tramo permite Y…"; `SIN_PRECIO` → 409 "Ese tramo aún no tiene precio configurado"; otro → 400.
- `POST /api/plan/cotizacion` `{ mensaje (10 a 1000 caracteres) }`: crea una fila en `plan_requests`; si ya hay una `PENDIENTE` de esa empresa, 409 `COTIZACION_EN_CURSO`. Audita `PLAN_COTIZACION_SOLICITADA`.

Registra la ruta en `server.js`: `app.use('/api/plan', require('./routes/plan'))`.

### 2.6 `src/routes/super.js` (superadmin)

Agrega, **después** de `router.use(requireAuth(), requireSuperAdmin)`:

- `GET /uso`: RPC `uso_empresas`; agrega a cada empresa `estadoPlan` calculado con `estadoPlan(venceEn).estado`.
- `GET /tenants/:id/plan`: empresa, `venceEn`, tramo actual, límite, descuento anual, usuarios activos y `tramos[]` con `precioMes`.
- `PUT /tenants/:id/plan` `{ tramo, limiteUsuarios? (solo T5, mínimo 501), descuentoAnualPct (0 a 100), venceEn? ('AAAA-MM-DD'), precios: { T1..T5: número > 0 o null } }`:
  1. RPC `cambiar_tramo(..., p_superadmin=true)` (errores `USUARIOS_EXCEDEN` y `LIMITE_INVALIDO` → 409/400 con mensaje claro).
  2. Por cada tramo: precio `null` borra la fila de `tenant_tier_prices`; un número hace `upsert` por `(tenant_id, tier_codigo)`.
  3. Actualiza `descuento_anual_pct` y, si viene `venceEn`, `tenants.plan_vence_en = '<fecha>T23:59:59-05:00'`.
  4. Audita `SUPER_EDITA_PLAN` con el detalle.
- `GET /cotizaciones` (últimas 100, con nombre de empresa, solicitante y correo; **consultas separadas**, sin embebidos) y `PATCH /cotizaciones/:id` (marca `ATENDIDA` con `atendida_en`).

## 3. Frontend

- **`src/pages/Plan.jsx`** (ruta `/plan`, solo administradores): tarjeta de usuarios activos con barra de progreso (roja desde el 90 %), tarjeta de vigencia con etiqueta de estado, tarjetas de tramos T1 a T4 (precio mensual con la etiqueta "IVA incluido", "Pagando 12 meses: X % de descuento" si aplica, "Tu tramo" en el actual, botón "Elegir este tramo" deshabilitado si es el actual, no cabe o no tiene precio, con confirmación antes de cambiar) y una sección "Más de 500 usuarios" con formulario de cotización (o el texto del límite pactado si ya está en T5).
- **`src/components/Layout.jsx`**: enlace "Plan" para administradores y, debajo del contenedor `sticky` y encima del `<main>`, un aviso cuando `user.plan.estado` sea `POR_VENCER`, `GRACIA` o `VENCIDO` (rojo si es `VENCIDO`), con el texto "Renueva desde la sección Plan." para administradores o "Avisa a tu administrador para renovarlo." para los demás.
- **`src/pages/SuperEmpresa.jsx`** (ruta `/super/empresa/:id`, solo superadmin): selector de tramo, límite pactado si es T5, descuento anual, un campo de precio mensual **con IVA incluido** por tramo (vacío = no ofrecer ese tramo), fecha de vigencia con botones "+1 mes" y "+12 meses", y botón Guardar.
- **`src/components/UsoEmpresas.jsx`**: tabla con empresa y NIT, tramo, usuarios `X / límite` (etiqueta roja desde el 90 %), vigencia con su estado, solicitudes del mes, almacenamiento en KB/MB/GB, última actividad y enlace "Plan y precios".
- **`src/components/Cotizaciones.jsx`**: tarjetas de cotizaciones pendientes con enlace "Asignar plan" y botón "Marcar atendida".
- **`src/pages/Superadmin.jsx`**: debajo de la tabla de compañías, `<UsoEmpresas />` y `<Cotizaciones />`.
- **`src/App.jsx`**: rutas `/plan` (rol admin) y `/super/empresa/:id` (rol super).

## 4. Pruebas

1. El home del superadmin muestra la tabla de uso.
2. En "Plan y precios" fija T1 100.000, T2 180.000, T3 300.000, T4 sin precio, y guarda.
3. Como administrador de esa empresa, **Plan** muestra T1 a T3 con precio y T4 como "Precio por definir" con el botón deshabilitado.
4. Con `update tenant_plan set limite_usuarios = 3 where tenant_id = '...'` (solo en desarrollo), crea usuarios hasta superar el límite: mensaje claro y nada se crea.
5. Carga masiva con 5 usuarios y 2 cupos: se rechaza **toda** la carga.
6. Desactiva un usuario, llena el cupo y trata de reactivarlo: se bloquea.
7. El administrador elige T2: el límite sube y puede crear usuarios.
8. Con 60 usuarios activos, intentar T1 responde que no caben.
9. Solicita cotización; aparece en el panel del superadmin; asigna T5 con límite 600 y márcala atendida.
10. Vigencia: con fecha en 3 días, aviso amarillo; con `plan_vence_en = now() - interval '3 days'`, periodo de gracia con acceso normal; con `interval '10 days'`, queda solo consulta/descarga y crear una solicitud responde `PLAN_VENCIDO`.
11. "+1 mes" desde el panel del superadmin reactiva la empresa.
12. Un administrador de empresa recibe 403 en `/api/super/...`; el superadmin dentro de una empresa recibe 403 en `POST /api/plan/tramo`.
13. Auditoría: `PLAN_TRAMO_CAMBIADO`, `PLAN_COTIZACION_SOLICITADA`, `SUPER_EDITA_PLAN`.

Al terminar, restaura el límite de la empresa de prueba a su valor real.

## 5. Entrega

Resumen de archivos, SQL pendiente, variable opcional `PLAN_GRACIA_DIAS`. Producción (manual): SQL, `git pull`, reconstrucción, y revisar **cada empresa existente** en el panel (tramo real, precios y vigencia).
