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
