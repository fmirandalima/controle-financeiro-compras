-- Compras importadas do Mercado Livre devem participar da conciliação de cartão.
update public.compras_ml
set cartao = true,
    updated_at = now()
where ml_order_id is not null
  and observacao = 'ML IMPORTADO'
  and cartao = false;
