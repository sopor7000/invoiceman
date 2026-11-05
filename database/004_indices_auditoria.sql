create index if not exists audit_tenant_accion_idx on audit_logs (tenant_id, accion, created_at desc);

-- Acciones distintas registradas para una compañía (filtro del visor de auditoría)
create or replace function acciones_auditoria(p_tenant uuid)
returns table (accion text)
language sql stable security definer set search_path = public as $$
  select distinct a.accion from audit_logs a
   where a.tenant_id = p_tenant
     and left(a.accion, 6) <> 'SUPER_'   -- las acciones del superadmin no se muestran a la empresa
   order by 1;
$$;

revoke execute on function acciones_auditoria(uuid) from public, anon, authenticated;
grant  execute on function acciones_auditoria(uuid) to service_role;

notify pgrst, 'reload schema';
