# Desenho técnico — Motor de classificação de risco + Checklist ético (o *gate*)

Frente (c) da plataforma de governança de IA. É o ponto de decisão (estágio 4 do gateway) que,
dada uma tarefa, resolve entre **allow | allow-with-masking | require-approval | block**, e
materializa a Recomendação OAB nº 001/2024 e a lógica de risco do PL 2338/2023.

> **Ressalva de escopo:** o PL 2338 classifica *sistemas/aplicações de IA* e impõe a Avaliação
> de Impacto Algorítmico ao desenvolvedor/aplicador. O escritório, como **usuário**, não se
> torna automaticamente "operador de IA de alto risco". O motor adapta a *lógica* regulatória
> (calibrar controles pelo risco) para uma taxonomia **interna de risco por tarefa** — é
> governança proporcional, não enquadramento estatutário.

---

## 1. O que é o gate

Dois componentes acoplados:

- **Classificador de risco:** mapeia cada uso de IA para um nível de risco a partir de sinais.
- **Checklist ético:** workflow de aprovação que se interpõe antes de saídas de alto impacto
  (peça, contrato, parecer), espelhando os quatro eixos da Recomendação OAB nº 001/2024.

Princípio de design (o mesmo da frente a/b): **sinais → política mapeia sinais em nível → nível
mapeia em controles**. Os três ficam como **dados** (`policy.rules` em jsonb), versionados e
auditáveis, o que habilita multi-jurisdição (BR/PL 2338 hoje, EU/AI Act depois) por troca de
tabela, não de código.

---

## 2. Risco como função, não rótulo

```
nivel_risco = f(
  task_type,            -- pesquisa | minuta de peça | contrato | parecer | comunicação a cliente | análise de doc de terceiro
  data_sensitivity,     -- PII | dados sensíveis LGPD | sigilo profissional | segredo de justiça
  legal_effect,         -- produz efeito jurídico? vai a juízo / a cliente?
  autonomy,             -- há revisão humana antes do uso? envio automático?
  provider_posture,     -- modelo aprovado? retém input? treina com o dado?
  client_constraints,   -- cláusula contratual de não-uso de IA? processo sob segredo?
  injection_flags       -- vindo do detector de prompt injection
)
```

Calibragem espelhando o PL 2338 (excessivo / alto / residual) e a proporcionalidade do AI Act.

---

## 3. Níveis e o que cada um exige

| Nível | Gatilhos típicos | Decisão e controles |
|-------|------------------|---------------------|
| **Vedado (excessivo)** | Dado sob segredo de justiça em modelo externo não aprovado; uso barrado por contrato do cliente; tentativa de fabricar prova | **block** + alerta a compliance + registro |
| **Alto** | Saída com efeito jurídico (peça/contrato/parecer) **ou** dado sensível **ou** baixa supervisão humana | **require-approval**: checklist completo + mascaramento + validação de citações + supervisão de sócio + registro tipo-AIA |
| **Moderado** | Minuta interna / pesquisa com algum PII | **allow-with-masking**: mascaramento + checklist reduzido |
| **Residual (baixo)** | Pesquisa genérica, sem PII, sem efeito jurídico | **allow**: apenas registro silencioso |

Resolução de conflito entre regras: **a mais restritiva vence**; `block` sempre prevalece.

---

## 4. Tabela de decisão (orientada a política)

A política carrega uma *decision table* avaliada de cima para baixo; a primeira regra que casa
define os controles, mas `block` em qualquer regra encerra.

```jsonc
// trecho de policy.rules
{
  "decision_table": [
    { "when": { "data_sensitivity": ["segredo_justica"], "provider_posture": "nao_aprovado" },
      "tier": "vedado", "decision": "block", "reason": "segredo de justiça em modelo não aprovado" },

    { "when": { "client_constraints": ["proibe_ia"] },
      "tier": "vedado", "decision": "block", "reason": "cláusula contratual do cliente" },

    { "when": { "legal_effect": true, "task_type": ["peca","contrato","parecer"] },
      "tier": "alto", "decision": "require_approval",
      "controls": ["mascarar_pii","validar_citacoes","checklist_completo","supervisao_socio","registro_aia"] },

    { "when": { "data_sensitivity": ["pii","sensivel_lgpd"] },
      "tier": "moderado", "decision": "allow_with_masking",
      "controls": ["mascarar_pii","checklist_reduzido"] },

    { "when": {}, "tier": "residual", "decision": "allow", "controls": ["registrar"] }
  ]
}
```

---

## 5. Checklist ético — mapeando a Recomendação OAB nº 001/2024

Os quatro eixos da Recomendação viram itens concretos do gate:

| Eixo OAB | Item do checklist (alto risco) | Como o sistema preenche |
|----------|-------------------------------|--------------------------|
| **Legislação aplicável / verificação** | Citações conferidas em fonte oficial? | Automático: liga-se ao resultado da frente (b) |
| **Confidencialidade e privacidade** | PII mascarado? Sigilo preservado? Modelo aprovado e sem treino com o dado? | Semi-automático: mascaramento + atributos do provedor |
| **Prática ética (supervisão e responsabilidade)** | Houve revisão humana? O advogado assume responsabilidade pela peça? | Atestação explícita do usuário/sócio |
| **Comunicação sobre uso de IA** | O cliente precisa ser informado neste caso? Houve registro? | Conforme política do escritório e o caso |

Nuance importante: a Recomendação OAB é **orientação**, não norma sancionadora (a própria OAB
registrou que sanção depende de reserva legal). Logo, o item de "comunicação ao cliente" é
configurável por política, com **default conservador** (registrar a necessidade de informar),
sem afirmar consentimento como obrigação legal rígida.

**Checklist adaptativo (anti-atrito — resolve o "risco" do documento original):** os itens
exibidos dependem do nível. Residual = nenhum item, registro silencioso. Alto = checklist
completo + assinatura do supervisor. Não se onera tarefa de baixo risco.

---

## 6. Fluxo de aprovação (caminho require-approval)

Responde diretamente ao precedente da OAB/SP (2026) sobre supervisão por sócio:

```
gate marca 'alto' → cria pedido de aprovação →
  aprovador (sócio/compliance) vê: prompt MASCARADO, justificativa do risco,
  resultado das citações, respostas do checklist →
  aprova | bloqueia | devolve com ressalva →
  decisão entra na trilha imutável (frente a)
```

A aprovação (ou bloqueio) vira prova de supervisão — exatamente o que o sócio precisa demonstrar.

---

## 7. Como o nível é computado (engine)

Ordem: **determinístico primeiro, LLM só como apoio restrito.**

1. **Regras determinísticas** sobre sinais estruturados (segredo de justiça, cláusula do cliente,
   presença de PII, provedor aprovado) — rápidas e auditáveis.
2. **Inferência de `task_type` assistida por LLM** apenas quando o tipo não é declarado: o modelo
   classifica **dentro da taxonomia fixa**, nunca cria nível novo.
3. **Regra de ouro de segurança:** *incerteza eleva o risco*. Dúvida entre moderado e alto →
   resolve para alto. Nunca rebaixa por inferência. Falha de classificação → trata como alto.

---

## 8. Modelo de dados (adições)

```sql
CREATE TABLE risk_assessment (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id    uuid NOT NULL REFERENCES ai_interaction(id),
  signals           jsonb NOT NULL,         -- valores dos sinais avaliados
  tier              text NOT NULL,          -- vedado|alto|moderado|residual
  matched_rule      text,                   -- id da regra da decision_table
  decision          text NOT NULL,          -- block|require_approval|allow_with_masking|allow
  controls_applied  jsonb NOT NULL,
  computed_by       text NOT NULL,          -- deterministico | llm_assistido
  assessed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE checklist_response (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id    uuid NOT NULL REFERENCES ai_interaction(id),
  items             jsonb NOT NULL,         -- {eixo, pergunta, resposta, automatico?}
  attested_by       uuid REFERENCES app_user(id),
  approver_id       uuid REFERENCES app_user(id),
  approval_status   text,                   -- pendente|aprovado|bloqueado|ressalva
  decided_at        timestamptz
);
```

`tier`, `decision` e o checklist são serializados em `ai_interaction` e entram na cadeia de hash,
de modo que a classificação e a supervisão integram a prova de diligência.

---

## 9. Registro tipo-AIA para alto risco

Para tarefas de alto risco, gerar um **registro leve de avaliação** (inspirado na AIA, mas
proporcional ao papel de usuário): finalidade, dados envolvidos e técnica de tratamento, modelo
usado, riscos identificados e mitigação aplicada, revisão humana. Não é a AIA estatutária do
desenvolvedor — é evidência de boa-fé e devida diligência, alinhada à exigência da ANPD de
**comprovação efetiva de conformidade**.

---

## 10. Integração com o gateway

- **Estágio 2 (resolução de política):** carrega a `decision_table` aplicável (usuário × cliente
  × caso × jurisdição).
- **Estágio 4 (decisão):** computa o nível e decide; dispara mascaramento, validação de citações,
  checklist e/ou aprovação conforme os `controls`.
- Tarefas oriundas da **biblioteca de prompts aprovados (PromptJur)** já carregam um nível
  conhecido → pulam reclassificação, reduzindo atrito.

---

## 11. Fontes oficiais

- **PL 2338/2023 (Senado)** — abordagem baseada em risco; avaliação preliminar; aplicações
  vedadas (risco excessivo) e de alto risco; governança específica e supervisão humana para alto
  risco; Avaliação de Impacto Algorítmico obrigatória para alto risco; direitos dos afetados
  (informação, contestação, intervenção humana). Aprovado no Senado em 10/12/2024; em tramitação
  na Câmara.
- **AI Act (UE)** — quatro níveis (inaceitável/alto/limitado/mínimo); proporcionalidade;
  supervisão humana e manutenção de registros para alto risco (referência de convergência).
- **Recomendação OAB nº 001/2024** — quatro eixos: legislação aplicável, confidencialidade e
  privacidade, prática jurídica ética, comunicação sobre o uso de IA; supervisão humana;
  responsabilidade integral do advogado; verificação de doutrina e jurisprudência.
- **OAB/SP (2026)** — exigência de supervisão por advogados sócios no uso de IA.
- **ANPD — Agenda Regulatória 2025–2026** — exigência de comprovação efetiva de conformidade e
  estruturas de governança e gestão de riscos.
- **CNJ — Resolução nº 615/2025** — classificação estruturada de riscos e avaliação de impacto
  algorítmico (referência de boas práticas).
