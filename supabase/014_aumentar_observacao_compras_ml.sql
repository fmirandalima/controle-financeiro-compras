-- Aumenta o campo de observação usado pelo executor do Mercado Livre.
-- A view vw_acompanhamento_compras depende diretamente da coluna, portanto
-- ela é recriada nesta migration sem alterar sua lógica.

begin;

drop view public.vw_acompanhamento_compras;

alter table public.compras_ml
  alter column observacao type varchar(50);

create view public.vw_acompanhamento_compras as
select
  c.id,
  c.empresa_id,
  c.nro_requisicao,
  c.nro_oc,
  c.data_compra,
  c.data_cartao,
  c.data_estorno,
  c.ml_order_id,
  c.ml_pack_id,
  c.valor_operacao_cartao,
  c.valor_nf_total,
  c.valor_frete,
  c.valor_desconto,
  c.valor_outras_despesas,
  c.valor_ipi,
  c.valor_nf_total - c.valor_operacao_cartao as diferenca_cartao_nf,
  (c.valor_nf_total - c.valor_operacao_cartao) > 0.01 as tem_divergencia,
  c.mercado_entregue,
  c.palavra_chave,
  c.ultimos_digitos_cartao,
  c.conta_simples_transaction_id,
  c.conta_simples_attachment_count,
  c.conta_simples_comprovante,
  c.status_conferencia,
  c.observacao_divergencia,
  count(distinct n.id) as quantidade_notas,
  count(distinct i.id) as quantidade_itens,
  c.created_at,
  c.updated_at,
  c.status_erp,
  c.observacao,
  c.cartao,
  c.status_entrega,
  c.oc_cancelada,
  c.cidade_uf_destino,
  e.apelido as empresa_apelido,
  e.nome as empresa_nome,
  e.cnpj as empresa_cnpj,
  e.cidade_uf as empresa_cidade_uf,
  string_agg(
    distinct nullif(trim(both from n.numero_nf), ''::text),
    ', '::text
    order by nullif(trim(both from n.numero_nf), ''::text)
  ) as numeros_nf
from compras_ml c
left join compras_ml_notas n on n.compra_id = c.id
left join compras_ml_nf_itens i on i.nota_fiscal_id = n.id
left join empresas e on e.id = c.empresa_id
group by c.id, e.apelido, e.nome, e.cnpj, e.cidade_uf;

grant all on table public.vw_acompanhamento_compras to anon;
grant all on table public.vw_acompanhamento_compras to authenticated;
grant all on table public.vw_acompanhamento_compras to service_role;

commit;
