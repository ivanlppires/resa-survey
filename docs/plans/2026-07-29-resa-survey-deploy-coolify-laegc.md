# RESA Survey — Deploy em produção (Coolify / servidor LAEGC)

**Vigente desde 2026-07-29.** Substitui o runbook PM2 + Nginx do VPS Contabo
(`2026-03-07-resa-survey-plan-deploy.md`, agora obsoleto).

---

## Infraestrutura

| Item | Valor |
|---|---|
| Servidor | `root@179.197.236.155` — LAEGC (Laboratório de Análise Econômica, Gestão e Controle) |
| SO / recursos | Ubuntu 24.04, 4 vCPU, 15 GB RAM, 193 GB disco |
| Orquestração | Coolify 4.x (Docker + Traefik), UI em `http://179.197.236.155:8000` |
| Domínio | `https://resa-survey.laegc.com.br` |
| Domínio de transição | `https://resa-survey.ivanpires.dev` (mesmo app) |
| Origin legado | `https://resa.ivanpires.dev` — proxy reverso no Contabo, ver "Transição" |
| Banco | PostgreSQL 16 como serviço `db` do compose, volume `resa-db-data` |

O servidor Fastify serve o PWA estático em produção (`STATIC_DIR=/app/apps/web/dist`,
`@fastify/static` + fallback de SPA). Não existe Nginx próprio: o Traefik do Coolify
faz TLS e roteamento por `Host`.

## Recursos no Coolify

| Recurso | UUID |
|---|---|
| Projeto `resa-survey` | `btq4s5lriu91ja1j12zijwhr` |
| Aplicação (build pack `dockercompose`) | `bs8x9x7vbjwvqpwnxwhvyiu1` |

Fonte: GitHub público `ivanlppires/resa-survey`, branch `master`, compose em `/docker-compose.yml`.

Variáveis de ambiente da aplicação (definidas na UI/API do Coolify, consumidas pelo compose):
`POSTGRES_PASSWORD`, `JWT_SECRET`.

Os domínios de um build `dockercompose` **não** ficam no campo `fqdn` — ficam em
`docker_compose_domains`, por serviço:

```json
{"app": {"domain": "https://resa-survey.laegc.com.br,https://resa-survey.ivanpires.dev"}}
```

## Deploy

Push no `master` e depois:

```bash
curl -X POST -H "Authorization: Bearer <TOKEN_COOLIFY>" \
  "http://179.197.236.155:8000/api/v1/deploy?uuid=bs8x9x7vbjwvqpwnxwhvyiu1"
```

(ou o botão *Deploy* na UI). Acompanhar:

```bash
curl -H "Authorization: Bearer <TOKEN_COOLIFY>" \
  "http://179.197.236.155:8000/api/v1/deployments/<deployment_uuid>"
```

No boot do container, `docker-entrypoint.sh` executa, nesta ordem:

1. migrações Drizzle (`apps/server/drizzle/`);
2. seed **somente se o banco estiver vazio** (`SEED_ONLY_IF_EMPTY=1`);
3. start do Fastify.

## Alterar domínios

```bash
curl -X PATCH -H "Authorization: Bearer <TOKEN_COOLIFY>" -H "Content-Type: application/json" \
  -d '{"docker_compose_domains":[{"name":"app","domain":"https://dominio-a,https://dominio-b"}]}' \
  http://179.197.236.155:8000/api/v1/applications/bs8x9x7vbjwvqpwnxwhvyiu1
```

O formato aceito é um **array de `{name, domain}`** — passar o JSON aninhado como string
retorna erro de validação. Depois é obrigatório **redeploy**: as labels do Traefik só são
regravadas quando os containers são recriados. O certificado Let's Encrypt é emitido
automaticamente pelo Traefik (`certresolver=letsencrypt`) assim que o DNS do domínio
apontar para `179.197.236.155`.

## Banco de dados

O Postgres é serviço do compose (não é um recurso gerenciado pelo Coolify), então
não aparece na tela de backups da UI. O backup é um cron no host:

```
20 3 * * * /usr/local/bin/resa-backup.sh >> /var/log/resa-backup.log 2>&1
```

`/usr/local/bin/resa-backup.sh` faz `pg_dump` do container `db-bs8x9x7vbjwvqpwnxwhvyiu1-*`
para `/root/backups/resa/resa_survey_<STAMP>.sql.gz` e mantém 30 dias.

Acesso manual:

```bash
ssh root@179.197.236.155
docker exec -it $(docker ps -qf name=db-bs8x9x7vbjwvqpwnxwhvyiu1) psql -U resa -d resa_survey
```

Restaurar um dump por cima do banco:

```bash
DB=$(docker ps -qf name=db-bs8x9x7vbjwvqpwnxwhvyiu1)
docker stop $(docker ps -qf name=app-bs8x9x7vbjwvqpwnxwhvyiu1)
docker exec $DB psql -U resa -d resa_survey -c "DROP SCHEMA public CASCADE;"
docker cp dump.sql $DB:/tmp/dump.sql
docker exec $DB psql -U resa -d resa_survey -v ON_ERROR_STOP=1 -f /tmp/dump.sql
docker start $(docker ps -aqf name=app-bs8x9x7vbjwvqpwnxwhvyiu1)
```

> Restaure apenas o schema `public` (`pg_dump -n public`). O schema `drizzle` guarda o
> controle de migrações; sobrescrevê-lo com hashes de outra instalação faz o migrator
> tentar reaplicar tudo no boot seguinte.

## Transição a partir do Contabo (histórico)

Em 2026-07-29 a produção saiu do VPS Contabo (`209.126.77.36`, PM2 + Nginx + PG14).
Foi migrado o banco inteiro (6 usuários, 70 questões, 1 assentamento, 3 surveys,
171 respostas, 3 sync_log, 5 vínculos), com checksum MD5 idêntico nas 7 tabelas.

No Contabo foram removidos: processo PM2 `resa-server`, diretório
`/home/webmaster/apps/resa`, database `resa_survey` e role `resa`. Restou apenas o
dump final em `/home/webmaster/backups/resa-final/`.

O vhost `resa.ivanpires.dev` **não** foi desligado: virou proxy reverso para o servidor
novo. O motivo é o PWA offline — os dados de campo ainda não sincronizados vivem no
IndexedDB do *origin* `https://resa.ivanpires.dev`. Um redirect trocaria o origin e
tornaria esses dados inalcançáveis; o proxy preserva o origin e mantém o `POST /api/sync`
funcionando.

**Como encerrar a ponte** (depois que todos os entrevistadores abrirem o app no domínio
novo e sincronizarem):

```bash
ssh root@209.126.77.36
rm /etc/nginx/sites-enabled/resa.ivanpires.dev
nginx -t && systemctl reload nginx
certbot delete --cert-name resa.ivanpires.dev
```

## Verificação pós-deploy

```bash
curl https://resa-survey.laegc.com.br/api/health          # {"status":"ok","db":"connected"}
curl -s https://resa-survey.laegc.com.br/api/questions | head -c 200
curl -o /dev/null -w "%{http_code}\n" https://resa-survey.laegc.com.br/   # 200, PWA
ssh root@179.197.236.155 'docker ps --format "{{.Names}}\t{{.Status}}" | grep bs8x9x7'
```
