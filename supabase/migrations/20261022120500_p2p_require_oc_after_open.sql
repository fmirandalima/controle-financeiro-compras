-- Enforce the OC requirement at database level after the initial state.
alter table public.p2p_atividades
  drop constraint if exists p2p_atividades_oc_required_after_open_check;

alter table public.p2p_atividades
  add constraint p2p_atividades_oc_required_after_open_check
  check (
    status_fluxo = 'ABERTA'
    or nullif(trim(numero_cotacao), '') is not null
  );
