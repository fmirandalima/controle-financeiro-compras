-- 010_funcoes_validacao_login.sql
create or replace function public.verificar_username_disponivel(p_username text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_username text; begin v_username := lower(trim(coalesce(p_username,''))); if v_username = '' then return false; end if; return not exists (select 1 from public.perfis where lower(trim(username)) = v_username); end; $$;
grant execute on function public.verificar_username_disponivel(text) to anon, authenticated;

create or replace function public.obter_email_por_username(p_username text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text; begin select u.email into v_email from public.perfis p join auth.users u on u.id=p.id where lower(trim(p.username))=lower(trim(p_username)) and u.deleted_at is null limit 1; return v_email; end; $$;
grant execute on function public.obter_email_por_username(text) to anon, authenticated;
