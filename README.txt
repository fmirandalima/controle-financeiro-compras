Ajuste de usuários e permissões — Controle Financeiro

Incluído:
- COMPRAS pode consultar, criar e editar lançamentos.
- FATURAMENTO pode consultar, criar, editar e alterar NF Lançada?.
- FINANCEIRO permanece somente consulta/auditoria.
- Cadastro de novos usuários para COMPRAS ou FINANCEIRO.
- Login normalizado em minúsculas e validação de username case-insensitive.
- Mensagem de duplicidade: "usuario com nome não disponivel".
- Perfil novo é criado automaticamente a partir do Auth; nunca expõe service-role no frontend.

Arquivos principais:
- src/components/Login.tsx
- src/components/PurchasesPage.tsx
- src/lib/auth.ts
- supabase/009_cadastro_novos_usuarios.sql
- supabase/010_funcoes_validacao_login.sql

Observação sobre senha: a tela mantém a regra solicitada de até 5 caracteres, com sugestão inicial 12345. A política de senha configurada no Supabase Auth continua prevalecendo; se o projeto exigir mínimo maior, o cadastro será recusado pelo Auth.
