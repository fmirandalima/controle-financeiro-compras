-- 007_usuarios_compras_cadastro.sql
-- Cadastro público controlado somente para os grupos COMPRAS e FINANCEIRO.
-- Não altera os usuários existentes.

create unique index if not exists ux_perfis_username_lower
  on public.perfis (lower(username));

create or replace function public.verificar_username_disponivel(p_username text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select not exists (
    select 1
    from public.perfis
    where lower(username) = lower(trim(p_username))
  );
$$;

grant execute on function public.verificar_username_disponivel(text) to anon, authenticated;
revoke execute on function public.verificar_username_disponivel(text) from public;

create or replace function public.obter_email_por_username(p_username text)
returns text
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select u.email::text
  from public.perfis p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(p_username))
  limit 1;
$$;

grant execute on function public.obter_email_por_username(text) to anon, authenticated;
revoke execute on function public.obter_email_por_username(text) from public;

create or replace function public.handle_novo_usuario_compras_financeiro()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_nome text;
  v_username text;
  v_role text;
begin
  v_nome := nullif(trim(coalesce(new.raw_user_meta_data->>'nome', '')), '');
  v_username := lower(nullif(trim(coalesce(new.raw_user_meta_data->>'username', '')), ''));
  v_role := upper(nullif(trim(coalesce(new.raw_user_meta_data->>'role', '')), ''));

  if v_nome is null then
    raise exception 'Nome é obrigatório';
  end if;

  if v_username is null then
    raise exception 'Login é obrigatório';
  end if;

  if v_role not in ('COMPRAS', 'FINANCEIRO') then
    raise exception 'Setor inválido para cadastro';
  end if;

  if exists (select 1 from public.perfis where lower(username) = v_username) then
    raise exception 'Usuário com nome não disponível';
  end if;

  insert into public.perfis (id, nome, username, role, is_admin)
  values (new.id, v_nome, v_username, v_role, false);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_compras_financeiro on auth.users;

create trigger on_auth_user_created_compras_financeiro
after insert on auth.users
for each row
execute function public.handle_novo_usuario_compras_financeiro();
