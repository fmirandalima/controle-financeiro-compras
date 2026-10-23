-- Record reference and attention-field changes in the activity history.
create or replace function public.p2p_atividade_registrar_historico()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_evento jsonb;
  v_historico jsonb;
begin
  if tg_op = 'INSERT' then
    new.atualizado_em := now();
    v_evento := jsonb_build_object(
      'evento', 'CRIADA',
      'status', new.status_fluxo,
      'em', now(),
      'usuario_id', auth.uid()
    );
    new.historico_fluxo := jsonb_build_array(v_evento);
    return new;
  end if;

  new.atualizado_em := now();
  v_historico := coalesce(old.historico_fluxo, '[]'::jsonb);

  if new.status_fluxo is distinct from old.status_fluxo then
    v_historico := v_historico || jsonb_build_array(jsonb_build_object(
      'evento', 'ALTERACAO_STATUS',
      'status_anterior', old.status_fluxo,
      'status_novo', new.status_fluxo,
      'em', now(),
      'usuario_id', auth.uid()
    ));
  end if;

  if new.numero_requisicao is distinct from old.numero_requisicao
     or new.numero_cotacao is distinct from old.numero_cotacao then
    v_historico := v_historico || jsonb_build_array(jsonb_build_object(
      'evento', 'REFERENCIAS',
      'detalhe', 'Requisição: ' || coalesce(old.numero_requisicao, '—') || ' → ' || coalesce(new.numero_requisicao, '—')
        || '; OC: ' || coalesce(old.numero_cotacao, 'não informada') || ' → ' || coalesce(new.numero_cotacao, 'não informada'),
      'em', now(),
      'usuario_id', auth.uid()
    ));
  end if;

  if new.aguardando_nf is distinct from old.aguardando_nf then
    v_historico := v_historico || jsonb_build_array(jsonb_build_object(
      'evento', 'AGUARDANDO_NF',
      'status_anterior', old.aguardando_nf::text,
      'status_novo', new.aguardando_nf::text,
      'em', now(),
      'usuario_id', auth.uid()
    ));
  end if;

  if new.possui_boleto is distinct from old.possui_boleto
     or new.boleto_vencimento is distinct from old.boleto_vencimento then
    v_historico := v_historico || jsonb_build_array(jsonb_build_object(
      'evento', 'BOLETO',
      'detalhe', case when new.possui_boleto
        then 'Boleto ativo; vencimento ' || coalesce(new.boleto_vencimento::text, 'não informado')
        else 'Boleto desativado' end,
      'em', now(),
      'usuario_id', auth.uid()
    ));
  end if;

  if new.pagamento_provisionado is distinct from old.pagamento_provisionado then
    v_historico := v_historico || jsonb_build_array(jsonb_build_object(
      'evento', 'PAGAMENTO_PROVISIONADO',
      'status_anterior', old.pagamento_provisionado::text,
      'status_novo', new.pagamento_provisionado::text,
      'em', now(),
      'usuario_id', auth.uid()
    ));
  end if;

  if new.formalizacao_cliente_status is distinct from old.formalizacao_cliente_status then
    v_historico := v_historico || jsonb_build_array(jsonb_build_object(
      'evento', 'FORMALIZACAO_CLIENTE',
      'status_anterior', old.formalizacao_cliente_status,
      'status_novo', new.formalizacao_cliente_status,
      'em', now(),
      'usuario_id', auth.uid()
    ));
    if new.formalizacao_cliente_status in ('ENVIADA','CONFIRMADA')
       and new.formalizacao_cliente_em is null then
      new.formalizacao_cliente_em := now();
    end if;
  end if;

  if new.sankhya_status is distinct from old.sankhya_status then
    v_historico := v_historico || jsonb_build_array(jsonb_build_object(
      'evento', 'SANKHYA',
      'status_anterior', old.sankhya_status,
      'status_novo', new.sankhya_status,
      'em', now(),
      'usuario_id', auth.uid()
    ));
    if new.sankhya_status = 'LANCADO' and new.sankhya_lancado_em is null then
      new.sankhya_lancado_em := now();
    end if;
  end if;

  new.historico_fluxo := v_historico;
  return new;
end;
$function$;
