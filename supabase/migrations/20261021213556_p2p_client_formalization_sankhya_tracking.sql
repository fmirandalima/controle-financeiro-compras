alter table public.p2p_atividades
  add column if not exists formalizacao_cliente_status text not null default 'PENDENTE',
  add column if not exists formalizacao_cliente_contato text,
  add column if not exists formalizacao_cliente_referencia text,
  add column if not exists formalizacao_cliente_observacao text,
  add column if not exists formalizacao_cliente_em timestamptz,
  add column if not exists sankhya_status text not null default 'PENDENTE',
  add column if not exists sankhya_numero_documento text,
  add column if not exists sankhya_observacao text,
  add column if not exists sankhya_lancado_em timestamptz;

alter table public.p2p_atividades
  drop constraint if exists p2p_atividades_formalizacao_cliente_status_check,
  add constraint p2p_atividades_formalizacao_cliente_status_check
    check (formalizacao_cliente_status = any (array['PENDENTE','ENVIADA','CONFIRMADA','NAO_APLICAVEL'])),
  drop constraint if exists p2p_atividades_sankhya_status_check,
  add constraint p2p_atividades_sankhya_status_check
    check (sankhya_status = any (array['PENDENTE','LANCADO','NAO_APLICAVEL']));

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
    v_evento := jsonb_build_object('evento', 'CRIADA', 'status', new.status_fluxo, 'em', now(), 'usuario_id', auth.uid());
    new.historico_fluxo := jsonb_build_array(v_evento);
    return new;
  end if;

  new.atualizado_em := now();
  v_historico := coalesce(old.historico_fluxo, '[]'::jsonb);

  if new.status_fluxo is distinct from old.status_fluxo then
    v_historico := v_historico || jsonb_build_array(jsonb_build_object(
      'evento', 'ALTERACAO_STATUS', 'status_anterior', old.status_fluxo, 'status_novo', new.status_fluxo,
      'em', now(), 'usuario_id', auth.uid()
    ));
  end if;

  if new.formalizacao_cliente_status is distinct from old.formalizacao_cliente_status then
    v_historico := v_historico || jsonb_build_array(jsonb_build_object(
      'evento', 'FORMALIZACAO_CLIENTE', 'status_anterior', old.formalizacao_cliente_status,
      'status_novo', new.formalizacao_cliente_status, 'em', now(), 'usuario_id', auth.uid()
    ));
    if new.formalizacao_cliente_status in ('ENVIADA','CONFIRMADA') and new.formalizacao_cliente_em is null then
      new.formalizacao_cliente_em := now();
    end if;
  end if;

  if new.sankhya_status is distinct from old.sankhya_status then
    v_historico := v_historico || jsonb_build_array(jsonb_build_object(
      'evento', 'SANKHYA', 'status_anterior', old.sankhya_status,
      'status_novo', new.sankhya_status, 'em', now(), 'usuario_id', auth.uid()
    ));
    if new.sankhya_status = 'LANCADO' and new.sankhya_lancado_em is null then
      new.sankhya_lancado_em := now();
    end if;
  end if;

  new.historico_fluxo := v_historico;
  return new;
end;
$function$;