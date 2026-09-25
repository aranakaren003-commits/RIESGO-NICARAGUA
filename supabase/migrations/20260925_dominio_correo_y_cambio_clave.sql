-- Solo correos @instacredit.com pueden existir como usuarios; cambio de clave obligatorio en el primer ingreso

create or replace function public.validar_dominio_correo()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.email is null or lower(btrim(new.email)) !~ '^[^@\s]+@instacredit\.com$' then
    raise exception 'Solo se permiten correos con dominio @instacredit.com';
  end if;
  return new;
end $$;

create trigger trg_auth_users_validar_dominio
  before insert on auth.users
  for each row execute function public.validar_dominio_correo();

alter table public.perfiles_usuario add column debe_cambiar_clave boolean not null default false;

create or replace function public.clave_cambiada()
returns void language sql security definer set search_path = public as $$
  update public.perfiles_usuario set debe_cambiar_clave = false where user_id = auth.uid()
$$;

revoke execute on function public.clave_cambiada() from public, anon;
revoke execute on function public.validar_dominio_correo() from public, anon, authenticated;
grant execute on function public.clave_cambiada() to authenticated;
