create table plan_payments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete restrict,
  tier_codigo      text not null references plan_tiers(codigo),
  meses            int  not null check (meses between 1 and 36),
  valor_base       numeric(18,2) not null check (valor_base > 0),
  valor_iva        numeric(18,2) not null default 0 check (valor_iva >= 0),
  metodo           text not null check (metodo in ('TRANSFERENCIA','WOMPI','EFECTIVO','OTRO')),
  referencia_pago  text,
  factura_numero   text,
  factura_fecha    date,
  periodo_desde    timestamptz not null,
  periodo_hasta    timestamptz not null,
  notas            text,
  registrado_por   uuid references users(id),
  created_at       timestamptz not null default now()
);
create index plan_payments_tenant_idx on plan_payments (tenant_id, created_at desc);
create index plan_payments_sinfactura_idx on plan_payments (created_at) where factura_numero is null;
create unique index plan_payments_factura_uk on plan_payments (lower(factura_numero)) where factura_numero is not null;

alter table plan_payments enable row level security;
revoke all on plan_payments from anon, authenticated;

-- Registra el pago y extiende la vigencia en una sola operación
create or replace function registrar_pago_plan(
  p_tenant uuid, p_meses int, p_valor_base numeric, p_valor_iva numeric, p_metodo text,
  p_referencia text, p_factura text, p_factura_fecha date, p_notas text, p_user uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tier text; v_desde timestamptz; v_hasta timestamptz; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_tenant::text));

  select tier_codigo into v_tier from tenant_plan where tenant_id = p_tenant;
  if v_tier is null then return jsonb_build_object('resultado', 'SIN_PLAN'); end if;

  select greatest(coalesce(plan_vence_en, now()), now()) into v_desde
    from tenants where id = p_tenant for update;
  v_hasta := v_desde + make_interval(months => p_meses);

  insert into plan_payments (tenant_id, tier_codigo, meses, valor_base, valor_iva, metodo, referencia_pago,
                             factura_numero, factura_fecha, periodo_desde, periodo_hasta, notas, registrado_por)
  values (p_tenant, v_tier, p_meses, p_valor_base, coalesce(p_valor_iva, 0), p_metodo, nullif(p_referencia, ''),
          nullif(p_factura, ''), p_factura_fecha, v_desde, v_hasta, nullif(p_notas, ''), p_user)
  returning id into v_id;

  update tenants set plan_vence_en = v_hasta where id = p_tenant;
  return jsonb_build_object('resultado', 'OK', 'id', v_id, 'venceEn', v_hasta);
exception when unique_violation then
  return jsonb_build_object('resultado', 'FACTURA_DUPLICADA');
end $$;

revoke execute on function registrar_pago_plan(uuid,int,numeric,numeric,text,text,text,date,text,uuid) from public, anon, authenticated;
grant  execute on function registrar_pago_plan(uuid,int,numeric,numeric,text,text,text,date,text,uuid) to service_role;

notify pgrst, 'reload schema';
