# CLAUDE.md — Vexiajuris Guard (camada de governança e auditoria de IA)

Instruções de projeto para o Claude Code. Leia este arquivo antes de qualquer tarefa.

---

## O que estamos construindo

Uma **camada de controle e *system of record* do uso de IA** por escritórios e departamentos
jurídicos. **Não** é um copiloto jurídico — é o compliance layer do copiloto. Toda interação com
IA passa por (ou é registrada em) esta plataforma, que intercepta, classifica, registra e prova
o uso, gerando evidência de diligência perante OAB, ANPD e o futuro Marco Legal da IA (PL 2338).

Posicionamento de venda: *"Proteja seu escritório, seus clientes e sua reputação no uso de IA."*

### As três frentes (especificações na raiz do projeto)

1. `desenho-tecnico-gateway-trilha-auditoria.md` — gateway de interceptação + trilha de auditoria
   imutável (cadeia de hash, ancoragem temporal ICP-Brasil, mascaramento de PII na borda).
2. `desenho-tecnico-validador-de-citacoes.md` — validação de citações contra fontes oficiais
   (DATAJUD, STF, STJ, LexML, Planalto), em três eixos: existência, conteúdo, vigência.
3. `desenho-tecnico-motor-de-risco-checklist.md` — motor de classificação de risco + checklist
   ético (gate allow/mask/approval/block), mapeando a Recomendação OAB 001/2024 e o PL 2338.

Sempre tratar esses três `.md` como a fonte da verdade do produto. Se uma tarefa conflitar com
eles, parar e perguntar.

---

## Invariantes inegociáveis (NUNCA violar)

1. **Trilha append-only de verdade.** As tabelas de auditoria não aceitam `UPDATE`/`DELETE`:
   `REVOKE` no papel da aplicação + trigger que bloqueia mutação. Todo registro entra na cadeia
   de hash. Nenhuma feature pode editar o passado.
2. **Mascaramento de PII na borda.** O núcleo SaaS NUNCA recebe dado pessoal em texto puro.
   Mascaramento roda no componente de borda (Cloudflare Worker / SDK); o núcleo recebe conteúdo
   mascarado + mapa de tokens cifrado com chave do tenant.
3. **Validador de citações: proibido inventar.** Só afirma o que confirmou em fonte oficial. O
   que não localizar é `nao_verificavel`, jamais "falso", jamais "corrigido" por inferência. O
   juiz semântico recebe SÓ o texto oficial recuperado e responde em esquema fechado.
4. **Risco: incerteza eleva o risco.** Na dúvida entre níveis, resolver para o mais alto. Falha
   de classificação = tratar como alto. Nunca rebaixar por inferência.
5. **Política como dado.** Regras de política, taxonomia de risco e tabela de decisão vivem em
   `policy.rules` (jsonb) versionado — nunca hardcoded. É o que habilita multi-jurisdição.
6. **Não fabricar informação jurídica.** Doutrina, jurisprudência e legislação só de fontes
   oficiais (sites dos tribunais, Planalto, LexML). Referência incerta → omitir, nunca inventar.
7. **RBAC.** Funcionalidades novas e de administração visíveis apenas a perfis `admin`,
   `compliance` e `developer`. Usuário comum (`member`) não vê features em desenvolvimento.

---

## Stack e convenções

- **App + API:** Next.js + tRPC (TypeScript). Deploy na Vercel.
- **Banco:** PostgreSQL no Supabase. **Row-Level Security** por `org_id` em todas as tabelas
  multi-tenant. Migrations versionadas e idempotentes.
- **Borda / mascaramento:** Cloudflare Worker.
- **Identificadores:** `ULID` para `interaction_id`; `uuid` (gen_random_uuid) para PKs.
- **Segredos:** variáveis de ambiente no início; migrar para KMS ao ter cliente pagante. NUNCA
  commitar chave de API, token ou segredo. Conferir antes de cada commit.
- **Hash:** SHA-256 sobre serialização canônica (JSON com chaves ordenadas). Versionar o esquema
  de hash (`hash_schema_version`).
- **Estilo:** seções auxiliares/densas colapsáveis ou ocultas por padrão na UI.

---

## Regra de trabalho (fluxo obrigatório)

1. **Checkpoint antes de mudar.** Antes de aplicar qualquer alteração de código ou configuração,
   garantir commit/branch do estado atual. Trabalhar em branch por tarefa.
2. **Migration primeiro, com teste.** Toda mudança de esquema vem com migration + teste. Para a
   trilha, o teste DEVE provar que `UPDATE`/`DELETE` falham.
3. **Rodar testes antes do commit.** Não commitar com teste quebrado.
4. **Commit pequeno e descritivo.** Mensagens em português, no imperativo.
5. **Ao receber autorização para implementar sugestões, prosseguir com todas as autorizadas sem
   pedir confirmação item a item.**

---

## Ordem de construção (fase atual: 1 concluída de ponta a ponta em dev)

- [x] **Fase 1 (MVP vendável):** esquema + RLS + append-only (trigger) → captura de interações
      (página `/registrar`: gate de risco → checklist ético → trilha imutável → validação de
      citações) → trilha imutável (cadeia de hash linear) → biblioteca de prompts → checklist
      ético (eixos OAB 001/2024) → relatório de conformidade exportável. Validado E2E em
      2026-07-14: 2 interações reais registradas via UI, cadeia íntegra, checklist de risco alto
      pendente de aprovação, 3 citações confirmadas contra fontes oficiais (LexML real + base
      local de súmulas).
- [ ] **Fase 2:** mascaramento de PII na borda (regex estruturado → NER PT-BR) + classificação de
      risco + alertas.
- [ ] **Fase 3:** validador de citações (DATAJUD/STF/STJ/LexML/Planalto) + proxy inline +
      ancoragem Merkle + carimbo de tempo ICP-Brasil + dashboards para sócios.
- [ ] **Fase 4:** internacionalização (módulo EU/GDPR/AI Act por troca de política).

**Primeiro passo concreto:** criar a migration da trilha (`ai_interaction`, `token_map`,
`audit_anchor`) com RLS e trigger append-only, e um teste que confirme a imutabilidade. Esse é o
coração jurídico do produto — nada avança antes dele passar.

---

## Ambiente local (DECISÃO: banco local via Docker)

O banco roda **localmente** com o Supabase CLI sobre **Docker Desktop** (Windows). Não usar
projeto na nuvem em desenvolvimento. Pré-requisito: Docker Desktop em execução antes de
`supabase start`.

Endereços padrão ao subir:
- App (Next.js, frontend + API/tRPC): `http://localhost:3000`
- Supabase Studio (painel do banco): `http://localhost:54323`
- Supabase API REST: `http://localhost:54321`
- Postgres (conexão direta): `localhost:54322`
- Cloudflare Worker (masker de borda, Fase 2+): `http://localhost:8787`

```
# subir o banco local (exige Docker Desktop rodando)
npx supabase start

# dev (app)
npm run dev

# testes
npm run test

# migrations
npx supabase migration up

# derrubar o banco local
npx supabase stop
```

> Após o scaffolding, atualizar esta seção com os comandos reais gerados pelo projeto.

---

## Débito técnico conhecido (auditoria 2026-07-06)

Auditoria completa contra os 7 invariantes + os 3 desenhos técnicos, validada com Supabase local
rodando (todas as migrations aplicam limpo, 153/153 testes passam) e com teste manual no navegador
(signup, criação de escritório, dashboard, RBAC em `/equipe` e `/relatorios`, papel restrito
`vexiajuris_app` ativo de ponta a ponta). Corrigido nesta sessão:
RBAC ausente em quase todos os routers tRPC (org_id vinha do cliente, sem checar sessão),
escalação de privilégio em `onboarding`/`jurisdiction`, mascaramento de PII não verificado no
servidor em `interaction.capture`, chave DATAJUD hardcoded, heurística errada de `revoked` no
conector DATAJUD, checklist ético não seguindo a jurisdição ativa, canonicalização de hash não
determinística para `citations` (jsonb aninhado), `hash_schema_version` não usado no hash, RLS
faltando em `organization`/`app_user`/`policy`.

**Também integrado nesta sessão:** um audit paralelo (GitHub Copilot coding agent, PRs #6/#7) já
tinha corrigido em `origin/main` a divergência de taxonomia `decision`/`risk_class` entre
`interaction.ts` e `risk-engine.ts` (constraint + `v_dashboard_summary`), adicionado
`current_setting('app.current_org', true)` (missing_ok) nas policies antigas, um trigger de DELETE
em `checklist_response`, e os testes `migration-sequence.test.ts`/`rls-isolation.test.ts`. Mesclado
sem conflitos. `rls-isolation.test.ts` tinha dois bugs corrigidos aqui: `SET app.current_org = $1`
não é sintaxe válida com bind parameter (trocado por `SELECT set_config(...)`), e os testes
conectavam como `postgres` (superuser, ignora RLS) — agora usam o papel `vexiajuris_app` da
migration `20260706163639`, o que **valida de fato** que esse papel restrito funciona (RLS isola
corretamente `ai_interaction`/`policy`/`app_user` por org; sem contexto, falha fechado com erro de
cast em vez de vazar dados).

**Papel restrito ATIVADO nesta sessão** (o que a seção acima tratava como pendente):
- `src/lib/db.ts` agora exporta dois pools: `pool` (papel `vexiajuris_app`, sem BYPASSRLS, sem
  UPDATE/DELETE/TRUNCATE na trilha — usado por tudo) e `bootstrapPool` (superuser `postgres` —
  usado SÓ por `onboarding.createOrg`, a única operação que precisa enxergar todas as orgs para
  checar unicidade de e-mail e criar uma organização que ainda não existe).
- `withOrgContext(orgId, fn)` abre uma transação, roda `SELECT set_config('app.current_org', $1,
  true)` (escopo da transação, seguro com pool) e executa `fn` — é isso que faz a RLS filtrar de
  verdade. `protectedProcedure`/`adminProcedure` (em `init.ts`) chamam isso automaticamente e
  injetam `ctx.db` (o client da transação); todos os routers foram migrados de `pool.query` para
  `ctx.db.query`.
- Achado durante a ativação: `resolve_app_user()` (chamada em TODO request autenticado, em
  `route.ts`, para descobrir a org do usuário a partir do e-mail) tinha o mesmo problema de
  "ovo e galinha" — precisa buscar por e-mail entre todas as orgs antes de saber qual é a org
  atual. Resolvido tornando a função `SECURITY DEFINER` (migration `20260706171500`), um furo
  estreito e intencional na RLS: só essa função, só leitura, só os 4 campos necessários.
  Sem esse ajuste, TODA resolução de contexto falhava silenciosamente (RLS devolvia zero linhas).
- Validado com Supabase local (`DATABASE_URL` apontando para `vexiajuris_app`, `.env.local`) e
  teste manual completo no navegador: signup, criação de escritório (via bootstrapPool), convite
  de membro, dashboard, trilha de auditoria, relatório (6 queries em paralelo no mesmo `ctx.db`),
  e confirmação de que `/relatorios` e o convite de membro continuam bloqueados de verdade para
  um usuário `member` — tudo com RLS realmente ativa, não só a camada de aplicação.
- Senha do papel: a migration cria `vexiajuris_app` com `change_me_before_activating` — só serve
  para o Supabase local efêmero. Antes de apontar para qualquer banco real/compartilhado, rodar
  `ALTER ROLE vexiajuris_app WITH PASSWORD '<segredo forte>'` manualmente e usar esse valor em
  `DATABASE_URL` (nunca a senha do arquivo de migration, que fica no histórico do git).
- `source-registry.ts`: `lookupSource`/`lookupMany` agora aceitam um `db` opcional (default: pool
  global). `citation.validate` (autenticado) passa `ctx.db`, então o log em `source_lookup_log`
  (que tem RLS) grava corretamente com org_id real. `citation.extract`/`validateText` (públicos)
  continuam sem org, usando o pool global — sem problema, pois `org_id IS NULL` sempre passa na
  policy.
- **Bug real encontrado escrevendo o teste de falha de rede** (`tests/source-registry.test.ts`):
  `searchDatajud` (datajud-client.ts) engolia timeout/erro de rede de TODOS os tribunais e
  devolvia `{found:false}` — indistinguível de "processo realmente não existe" — violando o
  invariante 3 (rede fora do ar virava `nao_localizada` com 90% de confiança em vez de
  `nao_verificavel`). Corrigido: só retorna `found:false` se pelo menos um tribunal respondeu de
  verdade (200, mesmo com zero resultados); se todos falharem, lança erro, que o chamador já
  tratava corretamente como `nao_verificavel`.
- LexML: heurística de "página curta = não encontrada" dependia só de tamanho, sem o marcador
  textual — podia marcar `nao_localizada` uma norma real e curta. Separado em `isNotFoundPage`
  (marcador textual, sinal forte) e `isAmbiguousPage` (só tamanho, sinal fraco); o caso ambíguo
  agora devolve `null` (`nao_verificavel`), nunca uma afirmação de ausência.

**Removido nesta sessão** (achado testando no navegador, não só lendo código):
- `src/middleware.ts`: checava um cookie `sb-*-auth-token` que o `@supabase/supabase-js` nunca cria
  (a sessão fica em `localStorage` por padrão) — na prática, o middleware redirecionava QUALQUER
  rota além de `/` de volta para `/`, quebrando a navegação para usuários logados. O gate real de
  autenticação já é o `AuthGuard` (client) + `protectedProcedure`/`adminProcedure` (servidor). Se
  no futuro quiser um gate de middleware de verdade, migrar para `@supabase/ssr` com sessão em
  cookie httpOnly — aí sim o middleware consegue validar antes de renderizar.

**Operações da Fase 1/2 completadas em 2026-07-14** (validado E2E no navegador):
- `/aprovacoes`: fila de aprovação de sócio (checklists pendentes com contexto, decisão
  aprovar/ressalva/bloquear). Nav filtrado por perfil (Aprovações/Relatórios ocultos para member),
  com gate real no backend (adminProcedure, 403 confirmado como member).
- Alertas com resolução (reconhecer/descartar/resolver) restrita a perfis administrativos.
- Biblioteca de prompts com criação por admins (detecção automática de variáveis `{{nome}}`).
- Caminho de bloqueio testado: cliente proíbe IA → vedado → 2 alertas critical → resolvido na UI.

**Sync automatizado de súmulas — avaliado e adiado (2026-07-14):** o SCON do STJ responde 403
para clientes não-navegador, a busca do LexML tem verificação anti-bot (apenas o resolvedor de
URN direto funciona — já usado pelo conector), e o portal de dados abertos do STJ (CKAN) NÃO
publica dataset de súmulas (só espelhos de acórdãos e DATAJUD). O único caminho seria parsear o
PDF oficial `SumulasSTJ.pdf`, frágil demais para fonte de verdade do invariante 6 sem revisão
humana. Decisão: a base `sumula_oficial` cresce por cargas revisadas manualmente (como o
comentário da migration já previa), até existir uma fonte estruturada oficial.

**Juiz semântico IMPLEMENTADO (2026-07-14)** — eixo 2 (conteúdo) do validador de citações:
- `src/lib/semantic-judge.ts`: chamada à API da Anthropic (SDK oficial, structured outputs com
  schema JSON fechado `consistente|divergente|insuficiente`). O juiz recebe SÓ o texto oficial
  recuperado + a tese alegada (janela de ±300 chars ao redor da citação, via `start`/`end` do
  extractor) — nunca conhecimento próprio do modelo. Fail-closed: sem chave, sem créditos, erro
  de rede, refusal ou resposta fora do schema → `insuficiente`, que mantém a confirmação por
  existência (nunca rebaixa nem eleva por inferência). `divergente` = "número certo, tese errada"
  (a classe de alucinação mais perigosa da spec). Modelo padrão `claude-opus-4-8`, configurável
  via `CITATION_JUDGE_MODEL`. Sem `ANTHROPIC_API_KEY`, o eixo é pulado (comportamento anterior).
- Testado com juiz injetado (integração no validador) e SDK mockado (wrapper fail-closed) —
  `tests/semantic-judge.test.ts`. **E2E com a API real pendente: a conta está sem créditos**
  (Plans & Billing no console.anthropic.com); quando houver créditos, validar na página
  /citacoes com uma tese deliberadamente contrária a uma súmula da base local.

**NER de PII IMPLEMENTADO (2026-07-14)** — nomes e endereços em texto livre (Fase 2):
- `src/lib/pii-ner.ts`: `nerDetect` (Anthropic SDK, schema fechado NOME|ENDERECO, com guarda
  anti-invenção — só entidades literalmente presentes no texto) + `maskPiiWithNer` (regex
  estruturado primeiro, NER sobre o texto já mascarado depois; entidades maiores têm precedência;
  todas as ocorrências são substituídas e entram no tokenMap). Fail-closed: NER indisponível
  (sem chave/créditos/erro) → só regex, com flag `ner_applied: false` — o fluxo NUNCA é
  bloqueado pela indisponibilidade do LLM. Integrado em `masker.mask` e `proxy.forward`;
  a checagem server-side de `interaction.capture` permanece deliberadamente regex-only
  (determinística — indisponibilidade de LLM não pode rejeitar captura legítima).
  Modelo via `PII_NER_MODEL` (padrão `claude-opus-4-8`).
- Testes em `tests/pii-ner.test.ts` (composição, precedência, todas as ocorrências,
  fail-closed, anti-invenção). **E2E real pendente de créditos na conta Anthropic.**

**Ainda pendente:**
- Validar juiz semântico + NER de PII contra a API real assim que a conta Anthropic tiver
  créditos (Plans & Billing) — a chave já está configurada e autentica; o bloqueio é só saldo.
- Cifragem real do `token_map` (envelope encryption via KMS) ainda não existe — o campo
  `ciphertext` é aceito como o chamador mandar. Fase 2+/KMS, conforme já previsto no CLAUDE.md.
- `token_map`/`ai_interaction.capture` ainda não tem nenhum chamador real (edge/gateway); ao
  construir esse componente, decidir o modelo de autenticação serviço-a-serviço (hoje usa sessão
  de usuário via `protectedProcedure`, o que pode não caber num gateway).

## Contexto regulatório (por que cada coisa existe)

- **OAB — Recomendação nº 001/2024:** supervisão humana, sigilo, verificação de jurisprudência,
  comunicação do uso de IA → checklist ético e validador de citações.
- **OAB/SP (2026):** sócios devem garantir supervisão → fluxo de aprovação no gate.
- **ANPD — Agenda Regulatória 2025–2026 (Res. 23/2024, atualizada pela Res. 31/2025):** exige
  comprovação efetiva de conformidade e governança de risco → trilha + relatórios.
- **PL 2338/2023 (Marco Legal da IA):** modelo baseado em risco (excessivo/alto/residual),
  avaliação de impacto para alto risco → motor de classificação de risco.
- **CNJ — Resolução nº 615/2025:** referência de boas práticas (classificação de risco, AIA).

Escopo honesto: o escritório é **usuário** de IA, não operador estatutário de IA de alto risco.
O produto entrega **evidência de diligência**, não enquadramento estatutário. Não exagerar nas
promessas de conformidade.
