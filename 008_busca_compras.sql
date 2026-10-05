-- BUSCA AMPLIADA DE COMPRAS
-- Requisição + OC + pedido Mercado Livre + Nº NF.
-- Aplicar depois das alterações estruturais atuais do módulo Compras.

CREATE INDEX IF NOT EXISTS idx_compras_ml_nro_oc
  ON public.compras_ml(nro_oc);

CREATE INDEX IF NOT EXISTS idx_compras_ml_notas_numero
  ON public.compras_ml_notas(numero_nf);

CREATE OR REPLACE VIEW public.vw_acompanhamento_compras
WITH (security_invoker = true) AS
SELECT
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
  c.diferenca_cartao_nf,
  c.tem_divergencia,
  c.mercado_entregue,
  c.palavra_chave,
  c.ultimos_digitos_cartao,
  c.conta_simples_transaction_id,
  c.conta_simples_attachment_count,
  c.conta_simples_comprovante,
  c.status_conferencia,
  c.observacao_divergencia,
  count(DISTINCT n.id)::integer AS quantidade_notas,
  count(DISTINCT i.id)::integer AS quantidade_itens,
  c.created_at,
  c.updated_at,
  c.status_erp,
  c.observacao,
  c.cartao,
  c.status_entrega,
  c.oc_cancelada,
  c.cidade_uf_destino,
  e.apelido AS empresa_apelido,
  e.nome AS empresa_nome,
  e.cnpj AS empresa_cnpj,
  e.cidade_uf AS empresa_cidade_uf,
  string_agg(
    DISTINCT nullif(trim(n.numero_nf), ''),
    ', ' ORDER BY nullif(trim(n.numero_nf), '')
  ) AS numeros_nf
FROM public.compras_ml c
LEFT JOIN public.compras_ml_notas n ON n.compra_id = c.id
LEFT JOIN public.compras_ml_nf_itens i ON i.nota_fiscal_id = n.id
LEFT JOIN public.empresas e ON e.id = c.empresa_id
GROUP BY c.id, e.apelido, e.nome, e.cnpj, e.cidade_uf;

GRANT SELECT ON public.vw_acompanhamento_compras TO authenticated;
NOTIFY pgrst, 'reload schema';
