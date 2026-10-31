# Erros do app

Quando algo quebra no navegador de alguém (tela que não abre, erro que ninguém tratou), o app avisa a
função `report_client_error` e o erro cai na tabela `client_errors`. Erros iguais viram uma linha com
contador. Nada é enviado a serviços de fora. A tabela não é lida pelo app: consulte no painel do
Supabase (*SQL Editor*):

```sql
-- os mais recentes
select last_seen, count, message, path, app_version, left(user_agent, 60) as navegador
from public.client_errors order by last_seen desc limit 50;

-- os que mais acontecem
select count, message, path, last_seen from public.client_errors order by count desc limit 20;

-- a ficha completa de um erro: tipo, tela, versão, aparelho e o rastro do que veio antes
select kind, message, path, app_version, count, cardinality(user_ids) as pessoas, workspace_id,
       context, breadcrumbs, stack
from public.client_errors where id = 123;

-- erros que afetam mais gente
select cardinality(user_ids) as pessoas, count, kind, message, path from public.client_errors
order by pessoas desc, count desc limit 20;

-- só os de uma versão publicada (o código é o início do commit)
select last_seen, kind, message, path from public.client_errors where app_version = 'abc1234' order by last_seen desc;
```

Tipos (`kind`): `tela` (a tela quebrou ao desenhar), `janela` (erro solto), `promessa` (promessa rejeitada),
`rede` (o servidor respondeu 5xx), `consulta` e `acao` (falhas ao carregar ou gravar dados).

O que se guarda: mensagem e pilha (cortadas), tipo, caminho sem parâmetros, versão publicada, workspace,
navegador, tamanho da tela, idioma, fuso, se estava offline ou como app instalado, a pilha de componentes
(erros de tela), quantas pessoas diferentes foram afetadas (só os ids) e um rastro das últimas ~20 ações:
telas visitadas, chamadas de rede (método, endereço sem parâmetros e com ids trocados por `:id`, status e tempo)
e toques em botões identificados só por id ou rótulo de acessibilidade. Nunca vão texto digitado, conteúdo de
telas, corpo de requisições, nome ou e-mail. Erros com mais de 90 dias são apagados sozinhos. Para limpar à mão:
`delete from public.client_errors;`.

## Painel do Krono (super admin)

Os erros também aparecem na tela **Painel do Krono** (menu lateral, só para administradores), aba Erros.
Quem é administrador fica na tabela `platform_admins`, que o app não lê nem grava. Para incluir ou remover
alguém, rode no SQL Editor do Supabase:

```sql
insert into public.platform_admins (user_id, note)
select id, 'dono' from auth.users where email = 'EMAIL-DA-PESSOA';

-- para remover
delete from public.platform_admins where user_id = (select id from auth.users where email = 'EMAIL-DA-PESSOA');
```

O painel exige a verificação em duas etapas ativa e o código confirmado na sessão.
