-- Layout 2.0: ampliar observações e preparar retorno financeiro do Mercado Livre.
-- A aplicação desta migration foi validada no Supabase SIGCF (kornjrboaxlatrtodtkf).

begin;

drop view if exists public.vw_acompanhamento_compras;
drop view if exists public.vw_conciliacao_transacoes;

alter table public.transacoes
  alter column conferencia_obs type text;

alter table public.compras_ml
  alter column observacao type varchar(120);

alter table public.compras_ml
  add column if not exists ml_coupon_amount numeric not null default 0,
  add column if not exists ml_discount_amount numeric not null default 0,
  add column if not exists ml_coupon_id varchar(100);

create view public.vw_conciliacao_transacoes as
select
  t.id,e.id as empresa_id,e.nome as empresa,t.data,t.movimentacao,t.descricao,t.valor,
  t.meio_pagamento,t.ultimos_digitos_cartao,t.titular_cartao,t.categoria,
  t.qtd_recibos_notas,t.valor_nota_fiscal,t.valor_pago_cartao,t.comprovante_conta_simples,
  t.lancado_sankhya,t.sankhya_ok,t.conferencia_obs,t.created_at,t.updated_at
from public.transacoes t
join public.empresas e on e.id=t.empresa_id;

create view public.vw_acompanhamento_compras as
select
  c.id,c.empresa_id,c.nro_requisicao,c.nro_oc,c.data_compra,c.data_cartao,c.data_estorno,
  c.ml_order_id,c.ml_pack_id,c.valor_operacao_cartao,c.valor_nf_total,c.valor_frete,
  c.valor_desconto,c.valor_outras_despesas,c.valor_ipi,c.diferenca_cartao_nf,c.tem_divergencia,
  c.mercado_entregue,c.palavra_chave,c.ultimos_digitos_cartao,c.conta_simples_transaction_id,
  c.conta_simples_attachment_count,c.conta_simples_comprovante,c.status_conferencia,
  c.observacao_divergencia,
  case
    when c.valor_nf_total < c.valor_operacao_cartao - 0.01 then
      'Soma das notas/itens é menor que o valor pago no cartão em ' ||
      to_char(c.valor_operacao_cartao-c.valor_nf_total,'FM999999990D00')
    when c.valor_nf_total > c.valor_operacao_cartao + 0.01 then
      'Soma das notas é maior que o valor pago no cartão em ' ||
      to_char(c.valor_nf_total-c.valor_operacao_cartao,'FM999999990D00')
    when c.valor_nf_total > 0 and c.valor_operacao_cartao > 0 then
      'Notas conciliadas com o valor pago no cartão'
    else null
  end as resumo_conferencia,
  count(distinct n.id) as quantidade_notas,
  count(distinct i.id) as quantidade_itens,
  c.created_at,c.updated_at,c.status_erp,c.observacao,c.cartao,c.status_entrega,
  c.oc_cancelada,c.cidade_uf_destino,c.ml_status,c.ml_status_detail,c.ml_buying_mode,
  c.ml_currency_id,c.ml_buyer_id,c.ml_seller_id,c.ml_shipping_id,c.ml_tags,c.ml_paid_amount,
  c.ml_date_closed,c.ml_last_updated,c.ml_resumo_financeiro,c.ml_coupon_amount,
  c.ml_discount_amount,c.ml_coupon_id,e.apelido as empresa_apelido,e.nome as empresa_nome,
  e.cnpj as empresa_cnpj,e.cidade_uf as empresa_cidade_uf,
  string_agg(distinct nullif(trim(n.numero_nf),''),', ' order by nullif(trim(n.numero_nf),'')) as numeros_nf
from public.compras_ml c
left join public.compras_ml_notas n on n.compra_id=c.id
left join public.compras_ml_nf_itens i on i.nota_fiscal_id=n.id
left join public.empresas e on e.id=c.empresa_id
group by c.id,e.apelido,e.nome,e.cnpj,e.cidade_uf;

grant all on table public.vw_acompanhamento_compras to anon;
grant all on table public.vw_acompanhamento_compras to authenticated;
grant all on table public.vw_acompanhamento_compras to service_role;
grant all on table public.vw_conciliacao_transacoes to anon;
grant all on table public.vw_conciliacao_transacoes to authenticated;
grant all on table public.vw_conciliacao_transacoes to service_role;

commit;
