# Backup do banco de produção

O workflow **Backup** (`.github/workflows/backup.yml`) roda todo dia às 03:17 (Salvador) e também pelo
botão "Run workflow". Ele guarda, por 30 dias, um arquivo `krono-backup-AAAA-MM-DD.tar.gz.gpg` na aba
**Actions → execução → Artifacts**. O arquivo é criptografado (AES-256) com a frase-senha
`BACKUP_PASSPHRASE`: o repositório é público e o backup tem dados de clientes e senhas (em hash).

## Configuração (uma vez)

Em *Settings → Environments → New environment*, crie `backup`, restrito à branch `main`
(*Deployment branches → Selected branches*), sem aprovação obrigatória, com:

| O quê | Nome | Valor |
|---|---|---|
| Variável | `SUPABASE_PROJECT_REF` | id do projeto de produção |
| Segredo | `SUPABASE_DB_PASSWORD` | senha do banco de produção |
| Segredo | `BACKUP_PASSPHRASE` | frase longa (20+ caracteres). **Guarde no gerenciador de senhas**: sem ela o backup não abre |

O segredo do repositório `SUPABASE_ACCESS_TOKEN` (o mesmo da publicação) também é usado.

## O que entra

- `schema.sql`: tabelas, funções, políticas de acesso (RLS) e gatilhos do app.
- `data.sql`: os dados das tabelas do app.
- `auth-data.sql`: os usuários e fatores do Supabase Auth.
- `roles.sql`: papéis do banco.

**Não entra:** os arquivos do Storage (comprovantes, assinaturas e notas enviados pelos usuários) e as
configurações do painel do Supabase (provedores de login, URLs, segredos das funções). Anote-as à parte.

## Abrir um backup

```bash
gpg --decrypt krono-backup-AAAA-MM-DD.tar.gz.gpg > backup.tar.gz   # pede a frase-senha
tar -xzf backup.tar.gz                                              # cria a pasta dump/
```

## Restaurar

Em um projeto Supabase **novo** (nunca por cima da produção sem antes conferir):

```bash
psql "$DATABASE_URL" -f dump/roles.sql
psql "$DATABASE_URL" -f dump/schema.sql
psql "$DATABASE_URL" -f dump/auth-data.sql
psql "$DATABASE_URL" -f dump/data.sql
```

Depois, publique as Edge Functions (`supabase functions deploy`), recrie os segredos delas e confira o
login. Teste a restauração em um projeto de teste de vez em quando: backup que nunca foi restaurado
não é garantia.
