# Plan — GitHub Timeline (back-end)

> Preenchido pelo Hermes (fase PLANO), baseado na `spec.md` aprovada. Este arquivo é a fonte da verdade sobre COMO será construído. Claude Code e Kimi Code executam UMA tarefa por vez, na ordem, somente após aprovação deste plano. Os exemplos de dados nos testes não são respostas reais da API.

## 1. Arquitetura

`GET /api/timeline/:username` (Hono) → validação do login → cliente REST GitHub (consulta `/users/:username`, rejeita organizações; busca todas as páginas de `/users/:username/repos`) → transformação de dados (filtra `private`, ordena por `created_at`, soma por ano UTC) → JSON. Erros do cliente GitHub viram respostas JSON estáveis na camada HTTP. `src/server.ts` usa o adaptador Node para execução local; `src/app.ts` exporta uma fábrica de app para testes HTTP sem porta. Sem persistência, cache, token ou Docker. A mesma instância de cliente aceita `fetch` injetado nos testes; em produção usa `globalThis.fetch`.

Contratos planejados: `username: string`, `total: number`, `repositories: Array<{ name: string; description: string | null; createdAt: string; url: string; isFork: boolean }>`, `summaryByYear: Array<{ year: number; count: number }>`. Erros: `{ error: { code: string; message: string } }`. Consultar o perfil antes dos repositórios distingue usuário pessoal de organização e de inexistência. Empates de data: nome crescente, com desempate por id do GitHub se necessário. Não expor respostas brutas ou token do GitHub.

## 2. Arquivos/módulos afetados

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `package.json`, `package-lock.json` | criar | scripts, dependências aprovadas e versões reproduzíveis |
| `tsconfig.json`, `tsconfig.build.json`, `.gitignore` | criar | tipagem/build Node ESM e exclusão de artefatos locais |
| `tests/setup.test.mjs` | criar | verificação RED/GREEN da configuração inicial antes de haver runner TypeScript |
| `src/username.ts`, `tests/username.test.ts` | criar | validação local do login (CA-7) |
| `src/github.ts`, `tests/github.test.ts` | criar | cliente GitHub, tipo de conta, paginação, falhas e filtro público (CA-2, CA-3, CA-8, CA-9) |
| `src/timeline.ts`, `tests/timeline.test.ts` | criar | projeção da timeline, ordenação e resumo (CA-1, CA-4, CA-5, CA-6) |
| `src/app.ts`, `tests/app.test.ts` | criar | rota Hono, erros JSON, CORS e garantia de consulta nova (CA-1, CA-7 a CA-11) |
| `src/server.ts`, `tests/server.test.ts` | criar | servidor local Node e teste HTTP de inicialização |
| `.env.example`, `README.md` | criar | configuração e instruções verificáveis de uso/teste |
| `plan.md` | modificar após cada tarefa concluída | atualizar exclusivamente **Última tarefa concluída** após verificação |

## 3. Modelo de dados

Não existe banco de dados. Os tipos de entrada mínimos do cliente GitHub são `type` do perfil (`User`/`Organization`) e, por repositório, `id`, `name`, `description`, `created_at`, `html_url`, `fork`, `private`. `summaryByYear` deriva somente dos repositórios devolvidos. Usar `Date`/UTC para extrair o ano; não armazenar snapshots. Não incluir campos extras na resposta pública.

## 4. Bibliotecas e dependências

| Biblioteca | Versão planejada | Por quê |
|---|---|---|
| `hono` | `4.13.9` | roteamento, respostas JSON, middleware CORS |
| `@hono/node-server` | `2.1.1` | servir o app Hono localmente no Node.js |
| `typescript` | `5.9.3` (desenvolvimento) | tipagem e compilação sem adotar uma versão principal nova sem necessidade |
| `tsx` | `4.23.15` (desenvolvimento) | executar TypeScript e testes `node:test` localmente |
| `@types/node` | `22.20.4` (desenvolvimento) | tipos compatíveis com Node.js 22 local |
| APIs nativas (`fetch`, `node:test`, `assert`) | Node.js 22 | evitar cliente HTTP e framework de testes adicionais |

Versões consultadas no registro npm durante o planejamento; gravar versões exatas no `package.json` e lockfile. `engines.node >=22`; npm 10+ para os comandos documentados. Scripts previstos: `npm test` → `tsx --test tests/*.test.*`; `npm run typecheck` → `tsc --noEmit`; `npm run build` → `tsc -p tsconfig.build.json`; `npm run dev` → `tsx watch src/server.ts`; `npm start` → `node dist/src/server.js`. Em `tsconfig.build.json`, usar `rootDir: "."`, `outDir: "dist"` e incluir `src/**/*.ts`, para o caminho de saída declarado ser verificável na Tarefa 8.

> Qualquer dependência que não esteja na tabela (inclusive versão adicional) exige parar e consultar o usuário antes. Não instalar Docker, banco, cache, SDK de GitHub ou middleware de rate limit próprio.

## 5. Decisões técnicas (e alternativas rejeitadas)

- **Hono + adaptador Node local:** respeita a stack escolhida; **não** prometer deploy Worker nesta fase. Rejeitado: adaptar o runtime Cloudflare agora.
- **REST pública via `fetch` nativo:** duas classes de chamadas (perfil e páginas de repositórios), sem token. Rejeitado: Octokit/GraphQL e persistência.
- **Paginação por `Link: rel="next"`:** seguir páginas da API GitHub, restringindo URLs ao host/caminho esperado e detectando links repetidos; não limitar artificialmente a primeira página. Não usar `public_repos` como contagem da resposta, pois a lista é a fonte efetiva.
- **Falhas:** HTTP 429 do GitHub e HTTP 403 identificável como limite de chamadas → 429; outro 403/5xx, rede e payload inválido → 502. Conta inexistente → 404; organização → 422. Nunca mascarar falha upstream como login inexistente.
- **CORS:** variável `CORS_ORIGINS` com origens explícitas separadas por vírgula, sem wildcard ou cabeçalho permissivo por padrão. Rejeitado: `*` no MVP.
- **Teste:** `node:test` executado com `tsx`; injetar somente `fetch` na borda HTTP, testar ordenação/agrupamento com dados determinísticos e usar `app.request()` para a rota. Evitar depender da rede GitHub na suíte.

## 6. Tarefas (executar na ordem, UMA por vez)

> Cada tarefa inclui arquivos de teste, mudança, critério e comando. Fluxo obrigatório: escrever um teste que falhe pelo motivo esperado (RED), registrar a saída; implementação mínima (GREEN), registrar a saída do teste e de `npm test`; rodar `npm run typecheck` quando houver fontes `.ts`. Não alterar assertions para obter GREEN. A exceção de escopo é atualizar somente o campo **Última tarefa concluída** em `plan.md` depois de validar a tarefa. Commits lógicos individuais, sem assinatura de IA, após revisão/validação.

### Tarefa 1 — Preparar ferramentas e verificação de fundação
- **Arquivo(s):** `tests/setup.test.mjs`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.build.json`, `.gitignore`.
- **Mudança:** primeiro escrever teste `node:test` que verifica scripts e dependências do manifesto, tsconfig e exclusões locais; depois criar a configuração mínima e instalar somente as dependências aprovadas. Não criar rotas nem código de produção nesta tarefa.
- **RED:** `node --test tests/setup.test.mjs` falha por assertion de configuração ausente (não por erro de sintaxe ou dependência indisponível).
- **Teste/verificação GREEN:** `node --test tests/setup.test.mjs` e `npm test` passam; conferir `npm ls --depth=0`. `npm run typecheck` passa a ser obrigatório a partir da Tarefa 2, quando houver arquivos `.ts`.
- **Critérios de aceite cobertos:** nenhum (fundação verificável).

### Tarefa 2 — Validar nome antes da rede
- **Arquivo(s):** `src/username.ts`, `tests/username.test.ts`.
- **Mudança:** validar login GitHub na camada independente da rota: aceitar letras, números e hífen dentro do limite de comprimento; rejeitar espaço, `@`, comprimento excessivo e hífen nas extremidades. Não rejeitar sem confirmação formatos históricos potencialmente aceitos pelo GitHub: deixar a existência ser decidida pelo perfil remoto.
- **RED:** `npx tsx --test tests/username.test.ts` falha no teste da validação ausente.
- **Teste/verificação GREEN:** `npx tsx --test tests/username.test.ts`, `npm test` e `npm run typecheck` passam.
- **Critérios de aceite cobertos:** CA-7 (validação local; resposta HTTP na Tarefa 7).

### Tarefa 3 — Buscar perfil e classificar erros do GitHub
- **Arquivo(s):** `src/github.ts`, `tests/github.test.ts`.
- **Mudança:** buscar `/users/:username` via `fetch` injetável, reconhecer `User`, `Organization` e 404; traduzir 429/403 de limite e demais falhas de rede/upstream em erros tipados, sem retornar o corpo bruto. Montar cabeçalhos GitHub sem autenticação. Usar fixtures de resposta controladas.
- **RED:** `npx tsx --test tests/github.test.ts` falha pela funcionalidade ausente.
- **Teste/verificação GREEN:** comando focado, `npm test` e `npm run typecheck` passam.
- **Critérios de aceite cobertos:** CA-8, CA-9 (classificação; HTTP na Tarefa 7).

### Tarefa 4 — Reunir todas as páginas de repositórios
- **Arquivo(s):** `src/github.ts`, `tests/github.test.ts`.
- **Mudança:** buscar `/users/:username/repos?per_page=100&type=all`, seguir `Link` da próxima página sem laço infinito ou URL externa, reunir mais de 100 repositórios quando necessário; não usar o primeiro lote como total definitivo.
- **RED:** `npx tsx --test tests/github.test.ts` falha no novo teste de duas páginas (os testes anteriores podem estar verdes).
- **Teste/verificação GREEN:** comando focado, `npm test` e `npm run typecheck` passam.
- **Critérios de aceite cobertos:** CA-2.

### Tarefa 5 — Restringir a repositórios públicos sem perder forks
- **Arquivo(s):** `src/github.ts`, `tests/github.test.ts`.
- **Mudança:** filtrar registros privados, preservar próprios e forks públicos e descrição nula; conferir também falha GitHub na página seguinte sem resposta parcial 200.
- **RED:** `npx tsx --test tests/github.test.ts` falha no novo teste de filtro/resultado esperado.
- **Teste/verificação GREEN:** comando focado, `npm test` e `npm run typecheck` passam.
- **Critérios de aceite cobertos:** CA-3, CA-9 (falha durante paginação).

### Tarefa 6 — Projetar timeline e resumo anual
- **Arquivo(s):** `src/timeline.ts`, `tests/timeline.test.ts`.
- **Mudança:** mapear campos aprovados, ordenar por criação crescente/desempatar pelo nome, somar por ano UTC, ordenar anos, calcular total e tratar lista vazia.
- **RED:** `npx tsx --test tests/timeline.test.ts` falha para fixture com anos misturados, empate de data, fuso horário e lista vazia.
- **Teste/verificação GREEN:** comando focado, `npm test` e `npm run typecheck` passam.
- **Critérios de aceite cobertos:** CA-1 (estrutura dos dados), CA-4, CA-5, CA-6.

### Tarefa 7 — Expor contrato HTTP e CORS
- **Arquivo(s):** `src/app.ts`, `tests/app.test.ts`, `.env.example`.
- **Mudança:** montar `GET /api/timeline/:username`, validar antes de chamar GitHub, rejeitar organizações, devolver JSON de sucesso/erro e restringir CORS às origens de `CORS_ORIGINS`. Testar que duas requisições provocam duas novas consultas, inclusive quando o resultado é igual.
- **RED:** `npx tsx --test tests/app.test.ts` falha ao chamar `app.request()` para sucesso, 400, 404, 422, 429, 502, conta vazia e CORS permitido/negado.
- **Teste/verificação GREEN:** comando focado, `npm test` e `npm run typecheck` passam.
- **Critérios de aceite cobertos:** CA-1, CA-2, CA-3, CA-4, CA-5, CA-6, CA-7, CA-8, CA-9, CA-10 e CA-11 no contrato HTTP (reuso das tarefas anteriores).

### Tarefa 8 — Inicialização local e documentação de teste
- **Arquivo(s):** `src/server.ts`, `tests/server.test.ts`, `README.md`.
- **Mudança:** iniciar Hono no Node pela porta configurável (`PORT`, padrão 3000) e documentar instalação, execução, `curl` para sucesso/erros, limite sem token e execução dos testes. O processo de teste deve usar porta efêmera e ser encerrado ao final; não deixar servidor rodando.
- **RED:** `npx tsx --test tests/server.test.ts` falha no teste de startup HTTP antes de criar `src/server.ts`.
- **Teste/verificação GREEN:** comando focado, `npm test`, `npm run typecheck` e `npm run build` passam; executar smoke local com `npm start` e `curl -i http://127.0.0.1:3000/api/timeline/%40` → 400. Fazer leitura real com usuário público conhecido se a API GitHub estiver disponível; aceitar 429 explícito se limite esgotado, sem fingir 200. Encerrar servidor e conferir status do Git.
- **Critérios de aceite cobertos:** CA-1, CA-7 e validação operacional do conjunto.

## 7. Riscos e pontos de atenção

- Sem token nem cache, uma consulta usa ao menos chamada de perfil + uma por página; rate limit e falhas de rede são esperados e devem ficar visíveis como 429/502.
- O nome malformado codificado no URL (`%40`) deve chegar à validação do Hono como `@`. Uma rota sem segmento de usuário não satisfaz necessariamente CA-7; não afirmar 400 para `GET /api/timeline/` sem regra na spec.
- Exigência de somente repositórios públicos: endpoint público já restringe acesso; filtro `private` defensivo e testes evitam vazamento se respostas de teste/cliente variarem.
- Garantir que `type=all` no endpoint de usuário não introduza comportamento incompatível: se GitHub rejeitar esse parâmetro no smoke real, parar e pedir ajuste de plano, sem improvisar outra API.
- A `spec.md` foi marcada aprovada pelo usuário no arquivo; o campo de data ainda está como placeholder `[data]`. Não reabrir escopo por isso.
- No ambiente inicial este repositório tinha só `spec.md`; comandos e arquivos de app deste plano são **propostos**, não executados. Antes da Tarefa 1, copiar/adaptar o modelo `AGENTS.md` com os comandos deste plano após aprovação.

---
**Status:** [] Rascunho — [x] Aprovado pelo usuário em [data]
**Última tarefa concluída:** 7 — Expor rota HTTP, erros e CORS
> Atualizar apenas após cada tarefa verificada e integrada; isso orienta o handoff entre Claude Code → Kimi Code → Hermes.
