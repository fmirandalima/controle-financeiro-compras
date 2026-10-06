-- NF x cartão: candidatos em janela de 10 dias e vínculo manual/automático.
-- Aplicada no projeto Supabase SIGCF: kornjrboaxlatrtodtkf.
create or replace function public.buscar_candidatos_cartao_nf(
  p_compra_id uuid, p_data_nf date
) returns table (
  id uuid, data timestamp with time zone, descricao text, valor numeric,
  valor_pago_cartao numeric, ultimos_digitos_cartao varchar, meio_pagamento text,
  empresa_id uuid, compra_id uuid, exato boolean, diferenca_valor numeric,
  diferenca_dias integer
) language plpgsql security definer set search_path = public, pg_temp as $$
declare v_empresa_id uuid; v_cartao varchar; v_valor numeric; v_role text;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  v_role := public.current_app_role()::text;
  if not public.current_user_is_admin() and v_role not in ('FATURAMENTO','COMPRAS') then
    raise exception 'Usuário sem permissão para conciliar cartão.';
  end if;
  select c.empresa_id, c.ultimos_digitos_cartao, c.valor_operacao_cartao
    into v_empresa_id, v_cartao, v_valor
  from public.compras_ml c where c.id = p_compra_id;
  if not found then raise exception 'Compra não encontrada.'; end if;
  if p_data_nf is null then raise exception 'Data da NF é obrigatória.'; end if;
  return query
  select t.id, t.data, t.descricao, t.valor, t.valor_pago_cartao,
    t.ultimos_digitos_cartao, t.meio_pagamento, t.empresa_id, t.compra_id,
    (t.data::date = p_data_nf
      and abs(coalesce(t.valor_pago_cartao,t.valor) - v_valor) < 0.01
      and v_cartao is not null and t.ultimos_digitos_cartao = v_cartao) as exato,
    round(abs(coalesce(t.valor_pago_cartao,t.valor) - v_valor), 2) as diferenca_valor,
    abs(t.data::date - p_data_nf) as diferenca_dias
  from public.transacoes t
  where t.empresa_id = v_empresa_id and t.compra_id is null
    and t.data::date between (p_data_nf - 10) and p_data_nf
    and (v_cartao is null or t.ultimos_digitos_cartao = v_cartao)
    and (t.meio_pagamento is null or t.meio_pagamento ilike '%cart%')
  order by (t.data::date = p_data_nf
      and abs(coalesce(t.valor_pago_cartao,t.valor) - v_valor) < 0.01
      and v_cartao is not null and t.ultimos_digitos_cartao = v_cartao) desc,
    abs(coalesce(t.valor_pago_cartao,t.valor) - v_valor) asc,
    abs(t.data::date - p_data_nf) asc, t.created_at asc;
end; $$;

create or replace function public.vincular_transacao_compra(
  p_compra_id uuid, p_transacao_id uuid
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text; v_empresa_compra uuid; v_empresa_transacao uuid;
  v_data_nf date; v_data_transacao date;
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  v_role := public.current_app_role()::text;
  if not public.current_user_is_admin() and v_role not in ('FATURAMENTO','COMPRAS') then
    raise exception 'Usuário sem permissão para conciliar cartão.';
  end if;
  select empresa_id into v_empresa_compra from public.compras_ml where id=p_compra_id;
  select empresa_id,data::date into v_empresa_transacao,v_data_transacao
    from public.transacoes where id=p_transacao_id and compra_id is null;
  if v_empresa_compra is null then raise exception 'Compra não encontrada.'; end if;
  if v_empresa_transacao is null then raise exception 'Transação de cartão não encontrada ou já vinculada.'; end if;
  if v_empresa_transacao <> v_empresa_compra then raise exception 'A transação pertence a outra empresa.'; end if;
  select min(data_emissao)::date into v_data_nf from public.compras_ml_notas where compra_id=p_compra_id;
  if v_data_nf is null then raise exception 'A compra ainda não possui NF.'; end if;
  if v_data_transacao < v_data_nf - 10 or v_data_transacao > v_data_nf then
    raise exception 'A transação está fora da janela de 10 dias da NF.';
  end if;
  update public.transacoes set compra_id=p_compra_id,updated_at=now()
    where id=p_transacao_id and compra_id is null;
  if not found then raise exception 'A transação já foi vinculada por outro processo.'; end if;
  perform public.recalcular_conferencia_compra(p_compra_id);
end; $$;

grant execute on function public.buscar_candidatos_cartao_nf(uuid,date) to authenticated;
grant execute on function public.vincular_transacao_compra(uuid,uuid) to authenticated;
