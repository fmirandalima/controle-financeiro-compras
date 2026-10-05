# Controle Financeiro v2 — Importação CSV + PDF + OCR

Atualização da cópia de trabalho para leitura de documentos sem gravar no Supabase antes da confirmação.

## O que mudou
- Centro de custo não é solicitado na importação.
- CSV continua com prévia e confirmação.
- PDF faz extração direta de texto no navegador.
- Imagens passam por OCR em português e exibem prévia antes da confirmação.
- Os campos reconhecidos são: data, movimentação, descrição, valor, meio de pagamento, últimos 4 dígitos do cartão, titular, categoria e quantidade de recibos/notas.
- A configuração do Supabase permanece fora do pacote; use seu `.env` local baseado no `.env.example`.

## Observação
Os leitores PDF/OCR são carregados por CDN no navegador. Na primeira utilização é necessária conexão com a internet.

## Módulo Compras
A versão 1.2 inclui a tela Compras para `COMPRAS` e `FATURAMENTO`, consulta com filtros/paginação, novo lançamento e importação manual de CSV/TXT/Excel do Mercado Livre. A integração automática do Mercado Livre e a integração automática da Conta Simples permanecem em stand by.
Consulte `docs/COMPRAS_TESTE.md` e execute `supabase/006_compras_ml.sql` antes do teste.

## Versão 1.3.0 — 23/09/2026

Esta versão acrescenta autorização por **tela + ação** e uma tela de **Administração** para grupos e permissões.

Ações disponíveis: visualizar, criar, editar, excluir e importar.

A autorização é aplicada no front para a experiência do usuário e no banco para as operações protegidas. O módulo Compras possui proteção adicional para diferenciar criação manual de importação.

Consulte:
- `docs/VERSAO_1.3.0_PERMISSOES_2026-09-23.md`
- `docs/TESTE_PERMISSOES_1.3.0.md`
- `supabase/007_permissions_v2_20260923.sql`
