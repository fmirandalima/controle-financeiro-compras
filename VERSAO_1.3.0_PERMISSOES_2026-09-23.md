# SIGCF — versão 1.3.0 — permissões por tela e ação

**Data:** 23/09/2026  
**Status:** preparada para commit; migration ainda precisa ser executada no Supabase antes do teste integrado.

## 1. Alterações de layout e menus

O menu principal agora é controlado por permissões de tela:

- **Consulta** — ação `visualizar`.
- **Importação** — ação `visualizar`; a operação de gravação exige `importar`.
- **Auditoria** — ação `visualizar`.
- **Compras** — ação `visualizar`.
- **Administração** — disponível para administradores.

A tela **Administração** foi acrescentada para permitir a manutenção da matriz de permissões.

## 2. Novo modelo de autorização

Cada usuário pode pertencer a um ou mais grupos. Cada grupo recebe ações independentes por tela:

- Visualizar
- Criar
- Editar
- Excluir
- Importar

Estrutura:

```text
USUÁRIO
  ↓
GRUPO
  ↓
TELA
  ├─ visualizar
  ├─ criar
  ├─ editar
  ├─ excluir
  └─ importar
```

A matriz inicial é conservadora e pode ser alterada pelo administrador.

## 3. Correção do ADMIN

Foi corrigida a função de autorização de atualização de `transacoes` para que `ADMIN` não caia no erro:

`Usuário sem permissão para alterar transações`

Isso corrige o cenário confirmado em que a edição de uma compra com cartão falhava para administrador.

## 4. Proteção no banco

A migration `supabase/007_permissions_v2_20260923.sql` cria:

- `app_grupos`
- `app_grupo_membros`
- `app_telas`
- `app_permissoes_grupo`
- `tem_permissao_tela(tela, acao)`

Também adiciona:

- RLS nas tabelas de autorização.
- Acesso administrativo às permissões.
- Proteção de INSERT/UPDATE/DELETE em `compras_ml`.
- Wrapper `importar_lancamento_compra(...)` para distinguir a ação **Importar** da ação **Criar**.
- Permissão administrativa para leitura dos perfis necessários à tela de Administração.

## 5. Regras de negócio preservadas

A matriz de permissões não substitui as regras específicas dos papéis.

Exemplo: conceder `editar` em Compras não significa liberar qualquer coluna da tabela `transacoes`. As restrições de FATURAMENTO, FINANCEIRO, COMPRAS e GESTOR continuam sendo aplicadas pelo banco.

## 6. Matriz inicial

| Grupo | Consulta | Compras | Importação | Auditoria | Cartão | Excluir |
|---|---|---|---|---|---|---|
| ADMIN | tudo | tudo | tudo | tudo | tudo | permitido |
| FATURAMENTO | visualizar | visualizar/criar/editar | visualizar/importar | visualizar | — | não |
| COMPRAS | visualizar | visualizar/criar/editar | visualizar/importar | visualizar | — | não |
| FINANCEIRO | visualizar | visualizar | sem acesso | visualizar | visualizar/editar | não |
| GESTOR | visualizar | visualizar | sem acesso | visualizar | visualizar | não |

A tela **Cartão** já fica cadastrada na matriz de permissões para uso futuro/expansão do módulo. Ela não foi inventada como uma nova tela operacional no front onde ela ainda não existe.

## 7. Ordem de aplicação

1. Manter as migrations atuais já aplicadas.
2. Garantir que o módulo Compras (`006_compras_ml.sql` ou equivalente atual do banco) esteja aplicado.
3. Executar `007_permissions_v2_20260923.sql`.
4. Confirmar que a migration terminou com `COMMIT` sem erro.
5. Publicar o front.
6. Testar com ADMIN e depois com cada grupo.

## 8. Testes obrigatórios

### ADMIN
- Abrir Administração.
- Alterar uma permissão de grupo.
- Editar compra com cartão.
- Confirmar que não ocorre P0001 de permissão.

### Grupo sem Editar
- Deve visualizar a tela.
- Não deve aparecer o botão/controle de edição.
- Tentativa direta no banco deve ser recusada.

### Grupo sem Importar
- Pode visualizar Importação se `visualizar=true`.
- Deve receber mensagem informando que não possui a ação `importar`.
- O wrapper de importação deve recusar a operação.

### Grupo somente consulta
- Visualização liberada.
- Criar, editar, excluir e importar bloqueados.

### Regressão
- GESTOR continua consulta.
- FINANCEIRO continua limitado às alterações financeiras previstas.
- FATURAMENTO e COMPRAS continuam sujeitos às regras específicas do banco.

## 9. Limitação conhecida

A sessão atual não possui acesso de escrita ao GitHub nem ao projeto Supabase. Portanto, esta entrega é uma **versão final preparada para commit**, mas o commit/push e a execução da migration ainda dependem da ação no repositório/Supabase.

Não considerar a aplicação em produção como atualizada até que o commit, deploy e migration tenham sido efetivamente executados.

## Revisão da migration — 23/09/2026 21:07

A migration `007_permissions_v2_20260923.sql` foi revisada antes da execução. Foi removido o wrapper que tentava recriar `criar_lancamento_compra` com assinatura incompatível com a estrutura histórica do projeto. A proteção de INSERT/UPDATE/DELETE permanece no trigger de `compras_ml`, e a rotina de importação usa a assinatura de 9 parâmetros consumida atualmente pelo front.

A migration também não tenta alterar o enum `app_role` durante a transação; o perfil `ADMIN` já está presente na estrutura em uso.

**Status:** arquivo revisado e preparado; execução no Supabase ainda depende de acesso de escrita ao banco.
