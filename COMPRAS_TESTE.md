# Módulo Compras — teste

## 1. Banco
No Supabase SQL Editor, execute `supabase/006_compras_ml.sql` depois das migrations já existentes.

A migration adiciona o perfil `COMPRAS`, as tabelas do acompanhamento de compras, a view e as RPCs de lançamento.

## 2. Usuário COMPRAS
Crie o usuário no Supabase Auth (não armazene senha em tabela). O login do aplicativo usa o padrão `compras@controle.local` para o nome de usuário `compras`.

Depois, no SQL Editor, ajuste o perfil para o usuário criado. Exemplo:

```sql
update public.perfis p
set role = 'COMPRAS'::public.app_role,
    ativo = true,
    nome = coalesce(nullif(p.nome,''),'Compras')
where p.id = (
  select id from auth.users where email = 'compras@controle.local' limit 1
);
```

Se o perfil ainda não existir:

```sql
insert into public.perfis(id,nome,username,role,ativo,is_admin)
select id,'Compras','compras','COMPRAS'::public.app_role,true,false
from auth.users
where email = 'compras@controle.local'
  and not exists (select 1 from public.perfis p where p.id = auth.users.id);
```

## 3. Frontend
Na pasta do projeto:

```bash
npm install
npm run dev
```

O módulo **Compras** aparece para `COMPRAS` e `FATURAMENTO`.

## 4. O que testar
- Aba **Compras**.
- Consulta com filtro por empresa, Nº Requisição, pedido Mercado Livre e status.
- Seleção de 20 ou 50 registros por página.
- **Novo lançamento**.
- Nº Requisição: até 7 dígitos.
- Nº OC: opcional e até 7 dígitos.
- Salvar sem OC: deve salvar e avisar que a OC poderá ser preenchida depois.
- Reabrir o registro e editar os campos permitidos.
- Importar CSV/TXT/Excel do Mercado Livre com prévia.
- Botão de integração automática permanece desabilitado enquanto a integração estiver em stand by.

## Observação
A importação automática do Mercado Livre e a integração automática da Conta Simples não fazem parte deste teste. O código do botão automático fica apenas como indicação de funcionalidade futura.
