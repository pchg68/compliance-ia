# Relatório de Auditoria Técnica — Vexiajuris Guard

**Projeto:** compliance-ia / pchg68  
**Repositório:** https://github.com/pchg68/compliance-ia  
**Data da auditoria:** 06 de julho de 2026  
**Fase auditada:** Fase 1 — MVP Vendável  
**Auditor:** Copilot Coding Agent (auditoria automatizada)  
**Status:** ✅ Correções aplicadas — PR aberto

---

## Resumo Executivo

Foi realizada auditoria técnica profunda no repositório `pchg68/compliance-ia`, com foco na
**Fase 1 (MVP vendável)** do produto Vexiajuris Guard. A auditoria cobriu migrations PostgreSQL,
código TypeScript/PLpgSQL, testes automatizados e alinhamento com os invariantes inegociáveis
definidos em `CLAUDE.md`.

Foram identificados **2 achados P0 (críticos)**, **2 achados P1 (altos)** e **1 achado P2
(médio)**. Todos os achados críticos e altos foram corrigidos neste PR. O sistema está agora mais
seguro e alinhado com os invariantes de trilha imutável, RLS multi-tenant e integridade de dados
exigidos pelo produto.

**Resultado:** 116 testes passando (14 novos), sem erros de tipo; testes DB-dependentes
aguardam banco local (comportamento esperado sem Docker em execução).

---

## 1. Escopo Auditado

| Componente | Arquivos auditados |
|---|---|
| Migrations (Fase 1) | `20260621191141_create_audit_trail.sql` |
| | `20260621193449_create_risk_checklist.sql` |
| | `20260621194147_create_prompt_library.sql` |
| | `20260621194618_create_alerts.sql` |
| | `20260621195018_create_citations_and_proxy.sql` |
| Migrations (pós-Fase 1) | `20260621200439_create_i18n_multi_jurisdiction.sql` |
| | `20260628120000_link_auth_users.sql` |
| | `20260628130000_create_source_audit.sql` |
| | `20260628140000_create_sumula_oficial.sql` |
| TypeScript — bibliotecas | `src/lib/risk-engine.ts`, `src/lib/hash.ts`, `src/lib/merkle.ts` |
| | `src/lib/pii-masker.ts`, `src/lib/alert-rules.ts`, `src/lib/checklist.ts` |
| | `src/lib/db.ts`, `src/lib/citation-validator.ts`, `src/lib/citation-extractor.ts` |
| Testes existentes | Todos os 14 arquivos em `app/tests/` |
| Documentação técnica | `CLAUDE.md`, `desenho-tecnico-*.md` (3 arquivos) |

---

## 2. Sequência de Migrations Fase 1 (1→5)

| # | Timestamp | Arquivo | Objetivo | Status |
|---|---|---|---|---|
| 1 | `20260621191141` | `create_audit_trail.sql` | Trilha imutável: `organization`, `app_user`, `policy`, `ai_interaction`, `token_map`, `audit_anchor` + RLS + `block_mutation()` | ✅ Corrigido |
| 2 | `20260621193449` | `create_risk_checklist.sql` | Motor de risco + checklist ético (OAB 001/2024) | ✅ Corrigido |
| 3 | `20260621194147` | `create_prompt_library.sql` | Biblioteca de prompts (`prompt_template`) | ✅ Corrigido |
| 4 | `20260621194618` | `create_alerts.sql` | Sistema de alertas de compliance | ✅ Corrigido |
| 5 | `20260621195018` | `create_citations_and_proxy.sql` | Validador de citações, proxy inline, views de dashboard | ✅ Corrigido |

**Dependência crítica confirmada:** A função `block_mutation()` é definida na migration 1 e
usada pelas migrations 2, 3, 4 e 5. A ordem cronológica pelos timestamps garante que a função
sempre exista antes de ser referenciada pelos triggers das demais migrations.

---

## 3. Achados

### 3.1 P0 — Crítico

#### P0-01: RLS com `current_setting` sem `missing_ok=true` (migrations 1–5 + 6)

**Descrição:**  
Todas as políticas de Row-Level Security nas migrations 1 a 5 usavam
`current_setting('app.current_org')::uuid` **sem** o parâmetro `missing_ok=true`. No PostgreSQL,
quando a configuração de sessão `app.current_org` não está definida, esta função lança um erro
em vez de retornar `NULL`.

**Impacto:**  
- Qualquer query a tabelas protegidas por RLS em sessões sem o contexto de org configurado
  resulta em erro `ERROR: unrecognized configuration parameter "app.current_org"`.
- Em ambiente Supabase sem middleware configurando o setting (ex.: conexão direta pelo Studio,
  migrations iniciais, scripts de seed), todas as queries falham.
- Risco de disponibilidade: a API ficaria completamente indisponível se o middleware de contexto
  falhasse ao configurar o setting antes das queries.

**Tabelas afetadas:**  
`ai_interaction`, `token_map`, `audit_anchor`, `risk_assessment`, `checklist_response`,
`prompt_template`, `alert`, `citation_check`, `proxy_request`, `jurisdiction_config`

**Correção aplicada:**  
Todos os `current_setting('app.current_org')` foram alterados para
`current_setting('app.current_org', true)`. Com `missing_ok=true`, a função retorna `NULL`
quando o setting não está configurado, resultando em zero linhas visíveis (comportamento
fail-closed seguro) em vez de erro.

```sql
-- Antes (quebrado)
USING (org_id = current_setting('app.current_org')::uuid);

-- Depois (correto — fail-closed)
USING (org_id = current_setting('app.current_org', true)::uuid);
```

---

#### P0-02: View `v_dashboard_summary` com valores de `decision` incorretos

**Descrição:**  
A view `v_dashboard_summary` (migration 5) usava `decision = 'approval'` e
`decision = 'masked'` para agregar contagens. Esses valores **não existem** no esquema do
produto: os valores canônicos definidos no motor de risco (`risk-engine.ts`) e no constraint da
tabela `risk_assessment` são `'require_approval'` e `'allow_with_masking'`, respectivamente.

**Impacto:**  
- As colunas `pending_approval` e `masked` da view sempre retornavam zero, mesmo com dados reais.
- Relatórios de conformidade baseados nesta view apresentavam dados incorretos, comprometendo
  a rastreabilidade exigida pela OAB e ANPD.

**Correção aplicada:**

```sql
-- Antes (incorreto)
COUNT(*) FILTER (WHERE decision = 'approval')::int AS pending_approval,
COUNT(*) FILTER (WHERE decision = 'masked')::int AS masked,

-- Depois (correto)
COUNT(*) FILTER (WHERE decision = 'require_approval')::int AS pending_approval,
COUNT(*) FILTER (WHERE decision = 'allow_with_masking')::int AS masked,
```

---

### 3.2 P1 — Alto

#### P1-01: Tabela `checklist_response` sem proteção append-only contra DELETE

**Descrição:**  
A tabela `checklist_response` é uma tabela de evidência de conformidade que registra o resultado
do checklist ético (OAB 001/2024) para cada interação. A migration 2 não incluía nenhum trigger
de proteção contra DELETE nesta tabela, ao contrário de `risk_assessment`, `ai_interaction` e
demais tabelas de evidência.

**Impacto:**  
- Registros de checklist podiam ser deletados, eliminando evidência de que o checklist foi
  preenchido — violação direta do invariante 1 do `CLAUDE.md` ("trilha append-only de verdade").

**Correção aplicada:**  
Adicionado trigger `no_delete_checklist_response` que bloqueia DELETE mas permite UPDATE
(necessário para o fluxo de aprovação: `approval_status` precisa ser atualizado de
`'pendente'` para `'aprovado'` ou `'bloqueado'`).

```sql
CREATE TRIGGER no_delete_checklist_response
  BEFORE DELETE ON checklist_response
  FOR EACH ROW EXECUTE FUNCTION block_mutation();
```

---

#### P1-02: Tabela `ai_interaction` sem CHECK constraint em `decision`

**Descrição:**  
A coluna `decision` de `ai_interaction` era `text NOT NULL` sem restrição de domínio, enquanto
a tabela `risk_assessment` tinha `CHECK (decision IN ('block','require_approval',
'allow_with_masking','allow'))`. Isso permitia inserir valores arbitrários como `'approval'`
ou `'masked'`, que não correspondem aos valores do motor de risco.

**Impacto:**  
- O teste `compliance-report.test.ts` inseriu dados com `decision = 'approval'` e
  `decision = 'masked'` — valores inválidos que passavam sem erro por falta de constraint.
- A view `v_dashboard_summary` contava esses registros de forma incorreta (P0-02 acima).

**Correção aplicada:**  
Adicionado CHECK constraint e corrigido o teste:

```sql
decision text NOT NULL CHECK (decision IN ('block','require_approval','allow_with_masking','allow')),
```

```typescript
// tests/compliance-report.test.ts — antes (incorreto)
{ seq: 2, risk: "alto", decision: "approval", task: "peca", passed: true },
{ seq: 3, risk: "moderado", decision: "masked", task: "contrato", passed: false },

// depois (correto)
{ seq: 2, risk: "alto", decision: "require_approval", task: "peca", passed: true },
{ seq: 3, risk: "moderado", decision: "allow_with_masking", task: "contrato", passed: false },
```

---

### 3.3 P2 — Médio

#### P2-01: Testes de imutabilidade e isolamento RLS ausentes para tabelas secundárias

**Descrição:**  
Os testes de imutabilidade existentes cobriam apenas `ai_interaction`, `token_map` e
`audit_anchor`. Faltavam testes para `risk_assessment` (com trigger), `checklist_response`
(sem trigger até esta auditoria) e isolamento RLS multi-tenant.

**Impacto:**  
- Sem testes de isolamento, uma regressão no RLS poderia passar despercebida, expondo dados
  cross-tenant.
- A sequência de migrations não estava validada automaticamente.

**Correção aplicada:**  
Criados dois novos arquivos de teste:
- `tests/migration-sequence.test.ts`: 14 testes de validação de filesystem (sem DB)
- `tests/rls-isolation.test.ts`: testes de isolamento multi-tenant (requer DB local)

---

## 4. Correções Aplicadas

| Arquivo | Tipo de correção |
|---|---|
| `migrations/20260621191141_create_audit_trail.sql` | RLS `missing_ok=true` + CHECK `decision` |
| `migrations/20260621193449_create_risk_checklist.sql` | RLS `missing_ok=true` + trigger DELETE `checklist_response` |
| `migrations/20260621194147_create_prompt_library.sql` | RLS `missing_ok=true` |
| `migrations/20260621194618_create_alerts.sql` | RLS `missing_ok=true` |
| `migrations/20260621195018_create_citations_and_proxy.sql` | RLS `missing_ok=true` + view `decision` corretos |
| `migrations/20260621200439_create_i18n_multi_jurisdiction.sql` | RLS `missing_ok=true` |
| `tests/compliance-report.test.ts` | Valores `decision` corrigidos |
| `tests/migration-sequence.test.ts` | **NOVO** — 14 testes de sequência |
| `tests/rls-isolation.test.ts` | **NOVO** — testes de isolamento RLS |
| `docs/relatorio-auditoria-impressao.md` | **NOVO** — este documento |

---

## 5. Evidências (Testes Executados)

### 5.1 Testes sem banco de dados (CI-friendly)

```
$ cd app && npm run test -- --reporter=verbose 2>&1 | grep -E "✓|✗|Tests"

✓ tests/migration-sequence.test.ts (14 tests) 9ms
✓ tests/risk-engine.test.ts (11 tests) 8ms
✓ tests/pii-masker.test.ts (13 tests) 9ms
✓ tests/concurrency.test.ts (11 tests) 329ms
✓ tests/citation-extractor.test.ts (12 tests) 10ms
✓ tests/citation-validator.test.ts (8 tests) 7ms
✓ tests/merkle.test.ts (10 tests) 8ms
✓ tests/sumula-source.test.ts (5 tests) 6ms
✓ tests/lexml-client.test.ts (10 tests) 6ms

Tests  116 passed | 34 skipped (150)
```

### 5.2 Testes dependentes de banco de dados

Os seguintes testes **requerem Supabase local em execução** (`npx supabase start` com Docker
Desktop) e são **esperados falhar** no ambiente CI sem banco:

- `tests/audit-trail-immutability.test.ts`
- `tests/hash-chain.test.ts`
- `tests/compliance-report.test.ts`
- `tests/prompt-library.test.ts`
- `tests/alerts.test.ts` (suite "Alertas — persistência")
- `tests/jurisdiction.test.ts` (suite "Multi-jurisdição — persistência")
- `tests/rls-isolation.test.ts` (novo)

**Para rodar localmente com banco:**

```bash
# Pré-requisito: Docker Desktop em execução
cd app
npx supabase start
npm run test
```

### 5.3 Validação da sequência de migrations (14 testes novos passando)

```
✓ diretório de migrations existe
✓ migration 1 — trilha de auditoria imutável existe
✓ migration 2 — motor de risco e checklist existe
✓ migration 3 — biblioteca de prompts existe
✓ migration 4 — sistema de alertas existe
✓ migration 5 — citações e proxy existe
✓ migrations da Fase 1 estão em ordem cronológica correta
✓ migration 1 define função block_mutation() antes dos triggers
✓ migration 1 define RLS com missing_ok=true para evitar erro por setting ausente
✓ migration 2 usa block_mutation() (definida na migration 1)
✓ migration 2 protege checklist_response contra DELETE
✓ migration 1 tem CHECK constraint em ai_interaction.decision
✓ migration 5 usa nomes corretos de decisão na view (require_approval, allow_with_masking)
✓ todas as migrations da Fase 1 usam missing_ok=true no current_setting de RLS
```

---

## 6. Status da Sequência de Migrations 1→5

| Migration | Arquivo | Função principal | `block_mutation` usada | RLS `missing_ok` | Append-only completo |
|---|---|---|---|---|---|
| 1 | `create_audit_trail` | Trilha base + `block_mutation()` | ✅ Define função | ✅ Corrigido | ✅ `ai_interaction`, `token_map`, `audit_anchor` |
| 2 | `create_risk_checklist` | Risco + checklist | ✅ Usa função | ✅ Corrigido | ✅ `risk_assessment` (UPDATE+DELETE) / `checklist_response` (DELETE) |
| 3 | `create_prompt_library` | Biblioteca de prompts | — | ✅ Corrigido | ℹ️ Intencional: prompts são mutáveis (versionados) |
| 4 | `create_alerts` | Alertas de compliance | ✅ Usa função | ✅ Corrigido | ✅ `alert` (DELETE bloqueado; UPDATE permitido para resolver alertas) |
| 5 | `create_citations_and_proxy` | Citações + proxy + views | ✅ Usa função | ✅ Corrigido | ✅ `citation_check`, `proxy_request` (UPDATE+DELETE) |

---

## 7. Pendências e Próximos Passos para Pré-Produção

### Crítico (antes de qualquer deploy)

- [ ] **REVOKE no papel da aplicação** (`app_role`): O design técnico especifica
  `REVOKE UPDATE, DELETE, TRUNCATE ON ai_interaction, token_map, audit_anchor FROM app_role`
  como primeira camada de defesa. O papel `app_role` não está criado nem configurado nas
  migrations. Criar o papel e aplicar os REVOKEs para implementar defesa em profundidade.

- [ ] **Executar migrations em banco limpo**: Rodar `npx supabase db reset` localmente e
  confirmar que todas as 9 migrations aplicam sem erros em sequência.

- [ ] **Rodar suite completa de testes com banco**: `npx supabase start && npm run test`
  localmente para confirmar que todos os 150 testes passam (116 passando + 34 skipped são
  normais sem banco).

### Alto (pré-produção)

- [ ] **Middleware de contexto de org**: Garantir que o tRPC middleware configura
  `app.current_org` via `SET LOCAL` (não `SET` global) em toda query. O `SET LOCAL` respeita
  transações e é mais seguro para poolers de conexão.

- [ ] **Testes de `risk_assessment` imutabilidade**: Adicionar testes para confirmar que
  `risk_assessment` bloqueia UPDATE e DELETE (trigger `no_mutation_risk_assessment` presente,
  mas sem cobertura de teste específica).

- [ ] **RLS em `app_user` e `policy`**: As tabelas `app_user` e `policy` não têm RLS habilitado.
  O isolamento multi-tenant nelas depende de WHERE na query. Avaliar se RLS deve ser habilitado
  também nessas tabelas.

- [ ] **`source_cache` sem RLS**: `source_cache` é dado público compartilhado (sem RLS
  intencional), mas `prompt_template` com `active=false` pode expor prompts desativados se
  a query da aplicação não filtrar corretamente.

### Médio (antes de primeiro cliente pagante)

- [ ] **Cadeia de hash linear**: Validar que a coluna `prev_hash` de `ai_interaction` é
  preenchida corretamente no fluxo de captura assíncrona (testar end-to-end com banco).

- [ ] **Mascaramento de PII na borda**: Cloudflare Worker (Fase 2) — o núcleo SaaS não deve
  receber PII em texto puro. Atualmente o mascaramento é feito no servidor Next.js, não na borda.

- [ ] **Ancoragem temporal ICP-Brasil**: O `tsa_token` em `audit_anchor` existe no schema mas
  o `tsa-stub.ts` é apenas um stub. Integrar com serviço TSA real para produção.

- [ ] **Observabilidade**: Adicionar logging estruturado de erros críticos (bloqueios de
  segurança, falhas de citação, erros de RLS).

- [ ] **Seed de demonstração**: A migration 7 (`link_auth_users`) insere dados de seed fixos
  (`00000000-...`). Em produção, seed deve ser separado das migrations de schema.

---

## 8. Alinhamento com Invariantes do CLAUDE.md

| Invariante | Status | Observação |
|---|---|---|
| 1. Trilha append-only (sem UPDATE/DELETE) | ✅ Confirmado | `block_mutation()` em 6 tabelas; `checklist_response` DELETE agora bloqueado |
| 2. PII mascarada na borda | ⚠️ Parcial | Mascaramento no servidor (Fase 1 aceitável); borda (Cloudflare Worker) é Fase 2 |
| 3. Validador não inventa | ✅ Confirmado | `citation-validator.ts`: status `nao_verificavel` para não localizados |
| 4. Incerteza eleva o risco | ✅ Confirmado | `risk-engine.ts`: tabela vazia → `alto/require_approval` |
| 5. Política como dado versionado | ✅ Confirmado | Tabela `policy` com `rules jsonb` e `version` |
| 6. Sem fabricação jurídica | ✅ Confirmado | `sumula_oficial` só aceita textos verificados em fonte oficial |
| 7. RBAC | ⚠️ Parcial | `app_user.role` definido; enforcement via middleware a validar em testes |

---

*Documento gerado em 06/07/2026 — Vexiajuris Guard — Auditoria Técnica Fase 1*
