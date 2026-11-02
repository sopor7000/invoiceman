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
