# Spec — GitHub Timeline (back-end)

> Preenchido pelo Hermes (fase DISCUSSÃO → SPEC), a partir das decisões confirmadas pelo usuário. Este arquivo é a fonte da verdade sobre O QUÊ será construído. Nenhum agente de código implementa nada que não esteja aqui.

## 1. Objetivo

Disponibilizar uma API local que transforme os repositórios públicos de uma conta pessoal do GitHub em dados cronológicos para uma futura timeline de portfólio.

## 2. Contexto e motivação

O futuro front-end precisará mostrar a um potencial empregador os projetos públicos de um usuário, com nome, data de criação e descrição, além de uma contagem por ano. Nesta etapa haverá somente o back-end; os dados serão consultados diretamente na API pública do GitHub em cada requisição, sem persistência.

## 3. User stories

- **US-1:** Como pessoa que consulta um portfólio, quero informar um nome de usuário pessoal do GitHub e obter todos os seus repositórios públicos em ordem cronológica, para conhecer sua trajetória.
- **US-2:** Como pessoa que consulta um portfólio, quero ver a quantidade de repositórios públicos criados por ano, para entender a evolução da atividade.
- **US-3:** Como consumidor da API, quero respostas distintas para nomes malformados, contas inexistentes e organizações, para exibir avisos corretos no futuro front-end.
- **US-4:** Como desenvolvedor do futuro front-end local, quero configurar explicitamente sua origem autorizada, para chamar a API sem liberar CORS indiscriminadamente.

## 4. Critérios de aceite (VERIFICÁVEIS)

> Cada critério deve ser verificável por teste automatizado ou chamada HTTP. A verificação de cenários da API do GitHub usa respostas de teste controladas; um teste manual com a API real pode complementar, mas não substitui, os testes.

- **CA-1** (US-1): `GET /api/timeline/:username` para uma conta pessoal existente retorna HTTP 200 com JSON contendo `username`, `total`, `repositories` e `summaryByYear`. Cada repositório contém `name`, `description` (`string` ou `null`), `createdAt` (timestamp ISO 8601), `url` e `isFork` (booleano).
- **CA-2** (US-1): Quando a API do GitHub retorna mais de uma página, a resposta reúne repositórios de todas as páginas; `total` é o número de repositórios efetivamente devolvidos, sem truncar na primeira página.
- **CA-3** (US-1): Apenas repositórios públicos são devolvidos, incluindo repositórios próprios e forks. Um repositório público com descrição ausente permanece na lista com `description: null`.
- **CA-4** (US-1): `repositories` é ordenado por `createdAt` crescente (mais antigo primeiro); para timestamps iguais, a ordem é estável e determinística pelo nome do repositório.
- **CA-5** (US-1, US-2): Uma conta pessoal válida sem repositórios públicos retorna HTTP 200, `total: 0`, `repositories: []` e `summaryByYear: []`.
- **CA-6** (US-2): `summaryByYear` contém pares `{ year, count }` em ordem crescente de ano; cada repositório retornado contribui uma vez para o ano UTC de `createdAt`, e a soma dos `count` é igual a `total`.
- **CA-7** (US-3): Um nome com caracteres incompatíveis com um login GitHub, como espaço ou `@`, ou que exceda o limite de comprimento de login, retorna HTTP 400 com JSON `{ "error": { "code": "INVALID_USERNAME", "message": "..." } }`, sem consulta ao GitHub.
- **CA-8** (US-3): Uma conta inexistente retorna HTTP 404 com código `USER_NOT_FOUND`; uma conta cujo tipo é organização retorna HTTP 422 com código `ORGANIZATION_NOT_SUPPORTED`.
- **CA-9** (US-3): Quando o GitHub sinaliza limite de requisições, a API retorna HTTP 429 com código `GITHUB_RATE_LIMITED`; outras falhas do GitHub ou de rede retornam HTTP 502 com código `GITHUB_UNAVAILABLE`, sem classificá-las como nome inválido.
- **CA-10** (US-4): A variável de ambiente de origens permitidas autoriza CORS somente para as origens listadas. Sem configuração, ou para uma origem não listada, a resposta não inclui `Access-Control-Allow-Origin` para essa origem.
- **CA-11** (US-1): Duas chamadas seguidas para um usuário efetuam novas consultas à API do GitHub; não há cache ou leitura de banco entre elas.

## 5. Edge cases e regras de negócio

- Nomes de contas de organizações não são aceitos mesmo quando possuem repositórios públicos; a distinção é feita a partir do tipo de conta informado pelo GitHub.
- O back-end consulta a API pública do GitHub sem token. O limite de chamadas da origem do servidor pode interromper consultas; o erro deve ser explícito conforme CA-9.
- O back-end não mostra nem consulta repositórios privados. Forks públicos contam como repositórios e entram no resumo anual.
- O ano é extraído do timestamp de criação em UTC, não do fuso horário da máquina.
- O endpoint é somente leitura; não requer cadastro, sessão ou autenticação do visitante.
- Os códigos de erro têm formato JSON consistente conforme os exemplos acima. Repositórios sem descrição não são descartados.

## 6. FORA DO ESCOPO (não implementar)

- Front-end, formulário, botão “Generate”, desenho gráfico da timeline, cores e tipografia.
- Banco de dados, Docker, cache, snapshots, sincronização e chamadas autenticadas ao GitHub.
- Suporte a organizações, repositórios privados, métricas de commits/estrelas/contribuições ou filtros adicionais.
- Deploy e adaptação ao Cloudflare Workers nesta versão; TypeScript/Hono foram escolhidos visando uma possível migração posterior, sem promessa de compatibilidade imediata.
- Refatorações ou recursos não previstos no `plan.md` aprovado.

## 7. Restrições técnicas

- Projeto local: back-end em TypeScript com Hono, iniciado pelo terminal; sem banco ou serviços pagos.
- Acesso à API REST pública do GitHub a cada requisição; tratar paginação e erros sem depender de um token.
- CORS configurável por variável de ambiente, negado por padrão para origens cross-origin.
- Testes automatizados devem demonstrar o ciclo TDD (falha esperada antes da implementação, sucesso após e suíte completa verde).
- O plano definirá versões de bibliotecas, scripts, arquivos e comandos exatos; nenhum exemplo de outros projetos é uma dependência aprovada aqui.

## 8. Perguntas resolvidas na discussão

- **P:** Quais repositórios entram? → **R:** Todos os públicos da conta pessoal, próprios e forks, inclusive sem descrição; nunca os privados.
- **P:** Organizações são aceitas? → **R:** Não; retornar 422, distinto de 400 para nome malformado e 404 para conta inexistente.
- **P:** O resumo por ano é bônus futuro? → **R:** Não; entra na primeira versão.
- **P:** Onde roda e qual stack? → **R:** Localmente, TypeScript com Hono; Cloudflare Workers é uma possibilidade futura, não alvo desta versão.
- **P:** Banco, cache e Docker? → **R:** Não haverá nenhum deles. A decisão inicial de usar banco Docker para cache foi cancelada pelo usuário; cada chamada consulta o GitHub.
- **P:** Token GitHub? → **R:** Não; aceitar o limite menor de requisições não autenticadas.
- **P:** Ordem da timeline? → **R:** Mais antigos primeiro.
- **P:** CORS? → **R:** Origens autorizadas por variável de ambiente, nenhuma por padrão.
- **P:** Contrato da resposta, erros e conta vazia? → **R:** Contrato da seção 4 aprovado; conta vazia responde 200 com listas vazias; sem campos adicionais de perfil por enquanto.

---
**Status:** [] Rascunho — [x] Aprovada pelo usuário em [data]
**Versão:** 1.0
