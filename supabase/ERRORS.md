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

-- a pilha de um erro
select stack from public.client_errors where id = 123;
```

O que se guarda: mensagem e pilha (cortadas), caminho sem parâmetros, navegador, versão e o id de quem
estava logado (sem nome nem e-mail). Erros com mais de 90 dias são apagados sozinhos. Para limpar à mão:
`delete from public.client_errors;`.
