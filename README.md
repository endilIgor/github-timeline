# GitHub Timeline (back-end)

API local em TypeScript/Hono que transforma os repositórios públicos de uma conta pessoal do GitHub em dados cronológicos para uma futura timeline de portfólio. Sem front-end, sem banco de dados, sem cache e sem Docker nesta versão — cada requisição consulta a API pública do GitHub diretamente, sem autenticação.

## Instalação

```bash
npm ci
```

## Rodar em desenvolvimento

```bash
npm run dev
```

Sobe o servidor com recarga automática (`tsx watch`) na porta definida por `PORT` (padrão `3000`).

## Build e execução em produção

```bash
npm run build
npm start
```

`npm run build` compila `src/**/*.ts` para `dist/`; `npm start` executa `dist/src/server.js`.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP do servidor local. |
| `CORS_ORIGINS` | (nenhuma) | Origens autorizadas para CORS, separadas por vírgula. Sem configuração, nenhuma origem cross-origin é liberada. |

Veja `.env.example` para um modelo.

## Endpoint

`GET /api/timeline/:username`

Consulta o perfil e todos os repositórios públicos (próprios e forks) de uma conta pessoal do GitHub, sem persistência: cada chamada faz novas consultas à API do GitHub.

### Sucesso — usuário público conhecido

```bash
curl -i http://127.0.0.1:3000/api/timeline/octocat
```

Retorna HTTP 200 com JSON contendo `username`, `total`, `repositories` (cada um com `name`, `description`, `createdAt`, `url` e `isFork`) e `summaryByYear` (pares `{ year, count }` em ordem crescente).

### Username malformado

```bash
curl -i http://127.0.0.1:3000/api/timeline/%40
```

Retorna HTTP 400 com `{ "error": { "code": "INVALID_USERNAME", "message": "..." } }`, sem consultar o GitHub.

## Erros

| HTTP | Código | Quando ocorre |
|---|---|---|
| 400 | `INVALID_USERNAME` | Nome incompatível com um login GitHub (espaço, `@`, comprimento excessivo etc.). |
| 404 | `USER_NOT_FOUND` | Conta inexistente. |
| 422 | `ORGANIZATION_NOT_SUPPORTED` | Conta existe, mas é uma organização (não suportado). |
| 429 | `GITHUB_RATE_LIMITED` | O GitHub sinalizou limite de requisições. |
| 502 | `GITHUB_UNAVAILABLE` | Outra falha do GitHub ou de rede. |

## Limite de requisições do GitHub

O back-end consulta a API pública do GitHub sem token de autenticação, portanto está sujeito ao limite de requisições não autenticadas do GitHub (por IP de origem do servidor). Ao esgotar o limite, o endpoint responde HTTP 429 com `GITHUB_RATE_LIMITED`, conforme a tabela de erros acima.

## Testes, tipagem e build

```bash
npm test
npm run typecheck
npm run build
```

## Fora do escopo desta versão

Front-end, Docker, banco de dados, cache/snapshots, token do GitHub (autenticação) e deploy Cloudflare Workers.
