# AGENTS.md — GitHub Timeline (back-end)

> Claude Code, Kimi Code ou outro agente de código: leia este arquivo, `spec.md` e `plan.md` antes de codar. Este arquivo adapta o modelo de `/root/projects/spec-driven-templates/templates/AGENTS.md` ao projeto. Se uma instrução posterior do usuário contradisser estes documentos, pare e peça alinhamento; não presuma que este arquivo prevalece.

## Fluxo obrigatório

1. Leia `spec.md` (o QUÊ) e `plan.md` (o COMO) na raiz.
2. Implemente somente a tarefa numerada explicitamente pelo usuário/agente coordenador, na ordem do plano. Nenhuma tarefa foi concluída ainda.
3. Se não houver número da tarefa, ou se a spec/plano estiverem ausentes, ambíguos ou contraditórios, pare e reporte a dúvida. Em execução autônoma sem resposta disponível, encerre relatando o bloqueio; não decida sozinho.
4. Não implemente o front-end, Docker, banco, cache, token GitHub ou deploy Cloudflare nesta versão.

## TDD estrito (não negociável)

1. Escreva primeiro o teste da tarefa, baseado nos critérios de aceite da `spec.md`; para a Tarefa 1, siga a verificação de fundação definida no `plan.md`.
2. Rode o teste e mostre a saída **falhando pelo motivo esperado** antes de implementar. Erros de sintaxe/ambiente não comprovam RED: corrija-os e rode de novo.
3. Implemente somente o mínimo necessário para passar (GREEN).
4. Rode o teste focado e a suíte completa; mostre as saídas reais. A partir da Tarefa 2, rode também a checagem de tipos.
5. Refatore apenas dentro do escopo da tarefa e mantenha os testes verdes.

## Linhas vermelhas

- **NÃO** modifique nem delete assertions existentes para fazê-las passar.
- **NÃO** adicione dependências fora das versões explicitadas no `plan.md`; se for inevitável, pare e peça aprovação.
- **NÃO** toque em arquivos fora da tarefa atual. Exceção: depois de testes e revisão, atualizar somente **Última tarefa concluída** em `plan.md`.
- **NÃO** refatore código de outra tarefa nem inicie a próxima automaticamente.
- **NÃO** declare uma tarefa pronta com teste falhando ou sem a saída RED/GREEN.

## Comandos do projeto

> Estes são os comandos do plano aprovado. Na Tarefa 1, antes da instalação das dependências, use somente o comando de RED/GREEN de fundação; não chame falta de dependência de RED válido.

- Setup: `npm install` (somente na Tarefa 1, para as versões exatas aprovadas no `plan.md`); após existir lockfile: `npm ci`.
- Testes (tudo): `npm test`.
- Teste de fundação (Tarefa 1): `node --test tests/setup.test.mjs`.
- Teste focado (Tarefas 2–8): `npx tsx --test tests/<arquivo>.test.ts`, substituindo `<arquivo>` pelo arquivo citado na tarefa.
- Tipagem (a partir da Tarefa 2): `npm run typecheck`.
- Build (Tarefa 8): `npm run build`.
- Rodar local (a partir da Tarefa 8): `npm run dev` ou `npm start` depois do build; `PORT` tem padrão 3000.
- Smoke HTTP (Tarefa 8): `curl -i http://127.0.0.1:3000/api/timeline/%40` deve retornar 400 com erro JSON.

## Convenções

- Código e identificadores em inglês; comentários e documentação em português.
- Node.js 22+, TypeScript/Hono, API REST GitHub pública sem autenticação; variáveis previstas: `PORT` e `CORS_ORIGINS` (origens separadas por vírgula).
- Commits curtos em inglês, um commit lógico por tarefa; sem assinatura/Co-Authored-By de IA. O coordenador revisa as mudanças antes da integração.
- Não inventar campos de resposta, endpoints ou dependências não previstos na spec/plano.

## Ao terminar qualquer tarefa

1. Resuma os arquivos alterados e o motivo.
2. Cole a saída real do teste falhando (RED), a saída do teste focado passando e da suíte completa; inclua tipagem/build quando aplicável.
3. Atualize **Última tarefa concluída** em `plan.md` somente depois de verificar e integrar a tarefa.

## Handoff (se está assumindo no meio do projeto)

Antes do prompt de continuação, o coordenador deve obter o estado já feito, a última saída de testes e o erro atual. Leia `spec.md`, `plan.md` e os arquivos atuais, rode a suíte de testes para localizar o ponto real e mostre a saída. Diga em três linhas o que falta na tarefa corrente; só então retome o TDD sem refazer o que está verde nem alterar o plano sem perguntar.
