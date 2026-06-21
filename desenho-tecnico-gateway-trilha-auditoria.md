# Desenho técnico — Gateway de interceptação + Trilha de auditoria imutável

Plataforma de governança e auditoria de IA para escritórios. Documento de arquitetura
(camada de controle, *system of record* do uso de IA). Stack-base: TypeScript + tRPC,
PostgreSQL, KMS, integração ICP-Brasil para carimbo de tempo.

---

## 1. Visão geral em uma frase

Todo uso de IA do escritório passa por (ou é registrado em) uma camada que **mascara**
dados pessoais na borda, **classifica** o risco, **decide** se permite/bloqueia, **valida**
citações e **registra** tudo numa trilha append-only ancorada no tempo, da qual se extrai
prova de diligência.

---

## 2. Topologias de implantação

| Modo | Como funciona | Pode bloquear? | Uso |
|------|---------------|----------------|-----|
| **Proxy inline** | App do escritório → gateway → provedor (OpenAI/Anthropic/Google). `base_url` apontado para o gateway. | Sim | Integrações próprias, automações |
| **Captura assíncrona** | Extensão de navegador / SDK / webhook registra a interação após o fato. | Não (só registra) | Uso de ferramentas web de terceiros |

**Onde roda o mascaramento (decisão crítica):** componente de borda (*edge masker*) no
ambiente do escritório ou no browser. O núcleo SaaS **nunca** vê PII em texto puro — recebe
prompt/resposta já mascarados e o mapa de tokens cifrado com chave do tenant (envelope
encryption). Para clientes corporativos exigentes, oferecer *customer-managed keys* (CMK).

---

## 3. Pipeline de uma interação (estágios)

```
[1] Ingress + auth        → resolve tenant + identidade do usuário
[2] Resolução de política  → qual Policy se aplica (user × client × matter × task)
[3] Pré-voo (na borda)     → detecção/mascaramento de PII
                            → classificação de risco (taxonomia PL 2338 / AI Act)
                            → varredura de prompt injection (detector de 10 categorias)
                            → gate do checklist ético (Rec. OAB 001/2024)
[4] Decisão                → allow | allow-with-masking | require-approval | block
[5] Forward                → envia prompt MASCARADO ao provedor (chave do provedor no vault)
[6] Pós-voo                → extração + validação de citações (fontes oficiais)
                            → varredura de PII na resposta
                            → de-tokenização para o usuário (mapa local)
[7] Registro               → append na trilha imutável (cadeia de hash)
[8] Assíncrono             → ancoragem temporal (Merkle root + TSA ICP-Brasil)
                            → alertas, agregação de relatórios
```

**Streaming (SSE):** em modo bloqueio, é preciso *bufferizar* a resposta antes de liberar —
trade-off de latência percebida. Em modo permissivo, libera-se o stream e a validação de
citações é feita ao final, anexando anotações ao registro (não ao texto já entregue).

---

## 4. O gateway de interceptação

- Implementa o **wire format de cada provedor** (rotas espelhando `/v1/messages`,
  `/v1/chat/completions` etc.), incluindo SSE. O escritório só troca o `base_url`.
- **Chaves do provedor** vivem em vault/KMS, nunca nas ferramentas do escritório. O gateway
  emite chaves próprias por usuário/tenant e faz a troca.
- **Idempotência:** cada requisição recebe um `interaction_id` (ULID) propagado ponta a ponta.
- **Fail mode (decisão de política):** padrão *fail-closed* para PII (se não conseguiu
  mascarar, não envia e registra a falha); configurável para *fail-open* em tarefas de baixo
  risco. Registrar sempre o modo aplicado.

---

## 5. Modelo de dados (PostgreSQL)

### 5.1 Entidades centrais

```sql
-- Tenancy + identidade
CREATE TABLE organization (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organization(id),
  email         citext NOT NULL,
  role          text  NOT NULL CHECK (role IN ('member','admin','compliance','developer')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);

CREATE TABLE client (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organization(id),
  name          text NOT NULL
);

CREATE TABLE matter (            -- caso/processo
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organization(id),
  client_id     uuid NOT NULL REFERENCES client(id),
  reference     text,            -- ex.: nº CNJ
  title         text
);

-- Política versionada (modelada como DADOS, não código → habilita multi-jurisdição)
CREATE TABLE policy (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organization(id),
  version       int  NOT NULL,
  jurisdiction  text NOT NULL DEFAULT 'BR',   -- BR | EU | US ...
  rules         jsonb NOT NULL,               -- escopo, gates, fail-mode por task/risk
  active        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, version)
);
```

### 5.2 A trilha de auditoria (append-only, com cadeia de hash)

```sql
CREATE TABLE ai_interaction (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organization(id),
  seq               bigint NOT NULL,            -- sequência POR TENANT (ordem da cadeia)
  user_id           uuid NOT NULL REFERENCES app_user(id),
  client_id         uuid REFERENCES client(id),
  matter_id         uuid REFERENCES matter(id),

  provider          text NOT NULL,              -- anthropic | openai | google
  model             text NOT NULL,
  task_type         text NOT NULL,              -- peça | contrato | parecer | pesquisa ...
  risk_class        text NOT NULL,              -- excessivo | alto | moderado | baixo

  -- Conteúdo: somente MASCARADO no núcleo
  prompt_masked     text NOT NULL,
  response_masked   text,
  -- Compromisso criptográfico do ORIGINAL (prova sem armazenar o original em claro)
  prompt_orig_hash  bytea NOT NULL,             -- H(prompt original + salt do tenant)
  response_orig_hash bytea,

  -- Resultados do pipeline
  policy_id         uuid NOT NULL REFERENCES policy(id),
  decision          text NOT NULL,             -- allow | masked | approval | block
  pii_technique     jsonb,                     -- por campo: anonimização | pseudonimização
  injection_flags   jsonb,
  checklist_passed  boolean NOT NULL,
  citations         jsonb,                     -- [{cite, status: confirmada|nao_localizada|divergente, source}]

  -- Cadeia de integridade
  prev_hash         bytea,                     -- hash do registro anterior (mesmo tenant)
  row_hash          bytea NOT NULL,            -- H(serialização canônica || prev_hash)

  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, seq)
);

-- Mapa de tokens cifrado (de-tokenização), separado e com chave do tenant
CREATE TABLE token_map (
  interaction_id    uuid PRIMARY KEY REFERENCES ai_interaction(id),
  org_id            uuid NOT NULL REFERENCES organization(id),
  ciphertext        bytea NOT NULL,            -- mapa {[PESSOA_1]: "João..."} cifrado
  wrapped_data_key  bytea NOT NULL             -- data key envelopada pela CMK no KMS
);

-- Âncoras temporais (raiz Merkle de uma época + carimbo de tempo)
CREATE TABLE audit_anchor (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organization(id),
  epoch_from_seq    bigint NOT NULL,
  epoch_to_seq      bigint NOT NULL,
  merkle_root       bytea NOT NULL,
  tsa_token         bytea NOT NULL,            -- RFC 3161 (ICP-Brasil)
  anchored_at       timestamptz NOT NULL DEFAULT now()
);
```

### 5.3 Append-only de verdade

Não basta "não dar UPDATE no código". Reforçar no banco:

```sql
-- O papel da aplicação só pode inserir e ler
REVOKE UPDATE, DELETE, TRUNCATE ON ai_interaction, token_map, audit_anchor FROM app_role;

-- Gatilho de defesa em profundidade
CREATE OR REPLACE FUNCTION block_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'registro imutável: UPDATE/DELETE proibido'; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_ai_interaction
  BEFORE UPDATE OR DELETE ON ai_interaction
  FOR EACH ROW EXECUTE FUNCTION block_mutation();
```

Para nível máximo, replicar a trilha em armazenamento WORM (S3 Object Lock em modo
compliance) — nem o root da conta consegue apagar antes da retenção.

### 5.4 Isolamento multi-tenant (RLS)

```sql
ALTER TABLE ai_interaction ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_interaction
  USING (org_id = current_setting('app.current_org')::uuid);
```

---

## 6. Cadeia de hash — detalhes e armadilhas

**Serialização canônica.** O `row_hash` só é reproduzível se a serialização for
determinística (JSON canônico com chaves ordenadas, ou protobuf). Defina o conjunto exato de
campos cobertos pelo hash e **versione** esse esquema (`hash_schema_version`), senão uma
mudança futura quebra a verificação histórica.

```
row_hash = SHA-256( canonical({
  org_id, seq, user_id, provider, model, task_type, risk_class,
  prompt_masked, response_masked, prompt_orig_hash, response_orig_hash,
  decision, checklist_passed, citations, created_at
}) || prev_hash )
```

**Concorrência (o gargalo).** Cadeia linear por tenant exige escrita serializada:
- Opção A: `advisory lock` por `org_id` + `seq` via sequência dedicada. Simples, mas serializa.
- Opção B (recomendada em escala): **árvore de Merkle por época**. Escritas paralelas dentro
  da época; ao fechar a época (a cada N registros ou T segundos), computa-se a raiz e
  carimba-se. Perde-se o encadeamento estritamente linear, mas ganha-se throughput e ainda há
  prova de inclusão (caminho de Merkle) + prova de tempo (TSA).

**Verificação.** Job periódico re-percorre os registros, recomputa hashes e confere contra as
âncoras. Qualquer divergência = adulteração detectada. Expor isso como relatório assinado é,
por si só, um produto vendável ("certidão de integridade da trilha").

---

## 7. PII: tokenização reversível na borda

- **Identificadores estruturados** (CPF, CNPJ, nº CNJ, OAB): regex + validação de dígito
  verificador → mascaramento de alta confiança.
- **Entidades livres** (nomes, endereços): NER ajustado para PT-BR jurídico.
- **Tokenização com placeholder preservando formato:** `João da Silva → [PESSOA_1]`. O mapa
  inverso é cifrado e fica do lado do tenant; a resposta do modelo é de-tokenizada localmente.
- **Registrar a técnica por campo** (anonimização vs. pseudonimização): exigência da ANPD,
  não detalhe — vai em `pii_technique`.

---

## 8. Modelo de ameaças

| Ameaça | Mitigação |
|--------|-----------|
| Insider edita logs para esconder uso indevido | Append-only no banco + WORM + âncora externa (não dá para forjar TSA passado) |
| Operador do SaaS comprometido vê PII | Mascaramento na borda + CMK; núcleo nunca tem PII em claro |
| Vazamento pelo provedor de LLM | Só conteúdo mascarado trafega |
| Prompt injection embutido em documento | Varredura de injeção pré-voo (detector de 10 categorias) |
| Negação de ter usado IA / repúdio | Compromisso de hash do original + carimbo de tempo = não-repúdio |
| Replay de requisição | `interaction_id` (ULID) idempotente |

---

## 9. Orçamento de latência (modo inline)

O custo dominante é o NER de PII, não o hashing. Orçar:

```
auth + policy      ~  2–5 ms
PII masking (NER)  ~ 30–120 ms   ← gargalo
risk + injection   ~ 10–40 ms
forward (provedor) ~ depende do modelo
post + hash + insert ~ 5–15 ms
```

Para tarefas de baixo risco, permitir *bypass* do NER pesado (só regex estruturado) via
política. Hashing/insert são desprezíveis frente à chamada do modelo.

---

## 10. Superfície de API (tRPC + rotas proxy)

```
# Proxy (compatível com provedores — o escritório aponta o base_url aqui)
POST  /proxy/:provider/v1/messages           # streaming e não-streaming

# Controle (tRPC)
policy.list / policy.activate / policy.simulate
interaction.list / interaction.get / interaction.verifyChain
report.compliance(orgId, period) → PDF/DOCX
anchor.latest / anchor.verify(interactionId)
checklist.template.get / checklist.submit
```

---

## 11. Ordem de construção (com checkpoints)

> Regra: salvar commit/checkpoint do estado antes de cada bloco.

1. **Esquema + RLS + append-only** (banco) → migração + testes de imutabilidade.
2. **Registro de interação + cadeia de hash linear** → job de verificação.
3. **Captura assíncrona (extensão/SDK)** — menor atrito, valida adesão antes do proxy.
4. **Mascaramento na borda (regex estruturado)** → depois NER PT-BR.
5. **Motor de política + decisão** (allow/mask/approval/block).
6. **Proxy inline + streaming** com fail-closed configurável.
7. **Ancoragem Merkle + TSA ICP-Brasil**.
8. **Validação de citações** (DATAJUD/CNJ + fontes oficiais) e relatório de conformidade.

---

## 12. Fontes regulatórias que o desenho atende

- **ANPD** — Agenda Regulatória 2025–2026 (Res. 23/2024, atualizada pela Res. CD/ANPD
  31/2025) e Mapa de Temas Prioritários 2026–2027 (Res. 30/2025); Nota Técnica 12/2025
  (IA e revisão de decisões automatizadas, art. 20 LGPD): exigência de comprovação,
  transparência e explicabilidade → trilha + relatórios.
- **PL 2338/2023** (Marco Legal da IA) — aprovado no Senado em 10/12/2024, em tramitação na
  Câmara, voto previsto para 2026: classificação por risco e governança → taxonomia de risco
  e gates.
- **OAB — Recomendação nº 001/2024** — supervisão humana, sigilo, verificação de citações,
  comunicação do uso de IA → checklist ético e validador de citações.
- **CNJ — Resolução nº 615/2025** — referência de boas práticas (avaliação de impacto,
  classificação de risco) para o ecossistema judicial.

> Princípio inegociável do validador de citações: **proibido inventar**. Citação só é
> "confirmada" contra fonte oficial; o que não for localizado é marcado "não verificado",
> nunca "falso" e jamais "corrigido" por inferência.
