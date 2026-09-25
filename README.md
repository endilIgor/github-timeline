# GitHub Timeline

API local em TypeScript/Hono que transforma os repositórios públicos de uma conta pessoal do GitHub em uma timeline de portfólio, com interface web servida pelo mesmo servidor. Sem banco de dados, sem cache e sem Docker — cada consulta vai à API pública do GitHub, sem token (sem autenticação).

## Início rápido (interface)

```bash
npm ci
npm run build
npm start
```

1. Abra http://127.0.0.1:3000/ (ou a porta definida em `PORT`).
2. Digite um login pessoal do GitHub (ex.: `octocat`) e clique em **Gerar timeline**.
3. A página chama somente `GET /api/timeline/:username` na mesma origem — não há chamada direta a `api.github.com` pelo navegador, nem CORS a configurar.

Encerre o servidor com `Ctrl+C`.

### O que a interface mostra

- Resumo: total de repositórios públicos, originais, forks e anos ativos.
- Gráfico anual (`summaryByYear`): clicar em um ano salta até o grupo correspondente.
- Timeline agrupada por ano UTC, na ordem da API (mais antigos primeiro), com links que abrem o repositório em outra aba.
- Registro das últimas requisições feitas à API local.

### Erros visíveis (sem token)

Como o servidor consulta o GitHub sem token, erros reais aparecem na página com o código da API — nunca são trocados por dados de demonstração:

| Situação | Aviso na página |
|---|---|
| Login malformado (validado antes de consultar) | `INVALID_USERNAME` |
| Conta inexistente | `404 · USER_NOT_FOUND` |
| Organização | `422 · ORGANIZATION_NOT_SUPPORTED` |
| Limite de requisições não autenticadas | `429 · GITHUB_RATE_LIMITED` — aguarde alguns minutos |
| GitHub indisponível | `502 · GITHUB_UNAVAILABLE` |
| Servidor local fora do ar ou resposta fora do contrato | Falha de conexão / resposta inesperada |

Uma nova consulta remove o aviso anterior; respostas atrasadas de consultas antigas são descartadas.

### Movimento e acessibilidade

- O visual do topo é um canvas com partículas triangulares que formam a marca do GitHub. Ele é decorativo (`aria-hidden`) e só substitui o SVG estático quando o canvas 2D funciona; sem canvas, o SVG permanece.
- Com `prefers-reduced-motion: reduce` nenhum loop de animação é iniciado, o SVG estático é mantido, as barras aparecem já na altura final e o salto por ano não usa rolagem suave. Mudar a preferência com a página aberta é respeitado.
- A animação pausa com a aba oculta ou ao navegar para outra página e usa menos partículas e resolução em telas estreitas.
- Uma barra no topo indica o progresso de leitura da timeline, atualizada no scroll e no resize.
- As barras do gráfico crescem ao entrar na tela quando há `IntersectionObserver`; sem ele, aparecem imediatamente.

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

`npm run build` compila `src/**/*.ts` para `dist/`; `npm start` executa `dist/src/server.js`. Rode os comandos na raiz do projeto: os arquivos de `public/` são servidos diretamente desse diretório e devem acompanhar `dist/` ao distribuir a aplicação.

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
npm test                               # suíte completa (API e interface)
node --test tests/frontend.test.mjs    # somente a interface (DOM falso, sem navegador)
npm run typecheck
npm run build
```

Os testes não acessam a rede: o GitHub e o `fetch` do navegador são simulados. A interface é testada com um DOM falso, sem navegador real; a revisão visual em browser não faz parte da suíte.

### Smoke HTTP após o build

```bash
PORT=3000 npm start
curl -i http://127.0.0.1:3000/                  # 200, HTML da interface
curl -i http://127.0.0.1:3000/styles.css        # 200, text/css
curl -i http://127.0.0.1:3000/app.js            # 200, JavaScript
curl -i http://127.0.0.1:3000/api/timeline/%40  # 400, INVALID_USERNAME
curl -i http://127.0.0.1:3000/api/timeline/octocat  # 200 ou erro explícito (429/502) conforme o GitHub
```

## Limites e fora do escopo

- Sem token: sujeito ao limite de requisições não autenticadas do GitHub por IP do servidor (`GITHUB_RATE_LIMITED`).
- Sem cache: cada consulta repete as chamadas ao GitHub (perfil + uma por página de 100 repositórios); contas com muitos repositórios demoram mais e consomem mais do limite.
- Somente contas pessoais e repositórios públicos; sem métricas de commits, estrelas ou contribuições.
- Fora do escopo: Docker, banco de dados, cache/snapshots, token do GitHub (autenticação) e deploy Cloudflare Workers.
