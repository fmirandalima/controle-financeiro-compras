-- Opcional: visão resumida para futuro dashboard.
-- A tela V1 atual calcula as métricas no frontend a partir da consulta.
create or replace view public.resumo_consulta_publica as
select
  count(*)::int as total,
  count(*) filter (where comprovante_conta_simples)::int as comprovantes,
  count(*) filter (where lancado_sankhya)::int as lancados_sankhya,
  count(*) filter (where sankhya_ok)::int as financeiro_ok
from public.transacoes;

revoke all on public.resumo_consulta_publica from public;
grant select on public.resumo_consulta_publica to anon, authenticated;
