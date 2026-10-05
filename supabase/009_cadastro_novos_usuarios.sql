-- 009_cadastro_novos_usuarios.sql
alter table public.perfis add column if not exists email text;
update public.perfis p set email = u.email from auth.users u where u.id = p.id and (p.email is null or trim(p.email) = '');
create unique index if not exists ux_perfis_username_normalizado on public.perfis (lower(trim(username)));

create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_username text; v_nome text; v_role public.app_role;
begin
  v_username := lower(trim(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))));
  v_nome := trim(coalesce(new.raw_user_meta_data->>'nome', v_username));
  if v_username = '' then raise exception 'Login obrigatório.'; end if;
  if exists (select 1 from public.perfis where lower(trim(username)) = v_username) then raise exception 'usuario com nome não disponivel'; end if;
  if coalesce(new.raw_user_meta_data->>'role','') not in ('COMPRAS','FINANCEIRO') then raise exception 'Setor inválido para cadastro.'; end if;
  v_role := (new.raw_user_meta_data->>'role')::public.app_role;
  insert into public.perfis(id,nome,username,role,is_admin,email) values(new.id,v_nome,v_username,v_role,false,lower(trim(new.email)));
  return new;
end; $$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute function public.handle_new_user_profile();
