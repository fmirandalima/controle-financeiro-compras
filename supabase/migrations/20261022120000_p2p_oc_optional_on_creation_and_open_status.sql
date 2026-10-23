-- Allow activity creation before an OC exists; require it before leaving the initial state.
alter table public.p2p_atividades
  alter column numero_cotacao drop not null;

alter table public.p2p_atividades
  drop constraint if exists p2p_atividades_numero_cotacao_check;

alter table public.p2p_atividades
  add constraint p2p_atividades_numero_cotacao_check
  check (numero_cotacao is null or length(trim(numero_cotacao)) > 0);

alter table public.p2p_atividades
  drop constraint if exists p2p_atividades_status_fluxo_check;

alter table public.p2p_atividades
  add constraint p2p_atividades_status_fluxo_check
  check (status_fluxo = any (array[
    'ABERTA', 'EM_COMPRAS', 'EM_FISCAL', 'EM_FINANCEIRO',
    'AGUARDANDO_NF', 'AGUARDANDO_PAGAMENTO', 'CONCLUIDA', 'CANCELADA'
  ]::text[]));

alter table public.p2p_atividades
  alter column status_fluxo set default 'ABERTA';
