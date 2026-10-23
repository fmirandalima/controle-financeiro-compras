-- Refine SIGCF P2P workflow, attention flags and completion criteria.
alter table public.p2p_atividades
  add column if not exists aguardando_nf boolean not null default false,
  add column if not exists possui_boleto boolean not null default false,
  add column if not exists boleto_vencimento date,
  add column if not exists pagamento_provisionado boolean not null default false;

-- Preserve the meaning of any legacy "Aguardando NF" stage as an independent flag.
update public.p2p_atividades
set aguardando_nf = true,
    status_fluxo = 'EM_FINANCEIRO'
where status_fluxo = 'AGUARDANDO_NF';

-- Keep existing completed records completed while adopting the new provisioning concept.
update public.p2p_atividades
set pagamento_provisionado = true
where status_fluxo = 'CONCLUIDA';

alter table public.p2p_atividades
  drop constraint if exists p2p_atividades_status_fluxo_check;
alter table public.p2p_atividades
  add constraint p2p_atividades_status_fluxo_check
  check (status_fluxo = any (array[
    'ABERTA','EM_COMPRAS','AGUARDANDO_PAGAMENTO','EM_FINANCEIRO',
    'EM_FISCAL','CONCLUIDA','CANCELADA'
  ]::text[]));

alter table public.p2p_atividades
  drop constraint if exists p2p_atividades_oc_required_after_open_check;
alter table public.p2p_atividades
  add constraint p2p_atividades_oc_required_after_open_check
  check (
    status_fluxo in ('ABERTA','CANCELADA')
    or nullif(trim(numero_cotacao), '') is not null
  );

alter table public.p2p_atividades
  drop constraint if exists p2p_atividade_conclusao_validada;
alter table public.p2p_atividades
  add constraint p2p_atividade_conclusao_validada
  check (
    status_fluxo <> 'CONCLUIDA'
    or (
      nullif(trim(numero_nf), '') is not null
      and nullif(trim(anexo_nf_path), '') is not null
      and pagamento_provisionado = true
    )
  );
