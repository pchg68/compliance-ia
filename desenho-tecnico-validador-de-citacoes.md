# Desenho técnico — Pipeline de validação de citações

Frente (b) da plataforma de governança de IA. Verifica, contra **fontes oficiais**, as
citações jurídicas (legislação, súmulas, precedentes, temas repetitivos) presentes nas
respostas de IA, sem nunca inventar ou "corrigir" por inferência.

> **Princípio inegociável:** o validador só afirma o que conseguiu confirmar em fonte oficial.
> O que não localizar é marcado como *não verificável*, jamais como "falso", e jamais é
> substituído por uma citação inventada.

---

## 1. A decisão central: validação em três dimensões

Uma citação pode ser real e ainda assim estar errada. Por isso a verificação se separa em três
eixos independentes, cada um com sua fonte:

| Dimensão | Pergunta | Fonte primária |
|----------|----------|----------------|
| **Existência** | Esse processo/precedente/lei existe mesmo? | DATAJUD (processos); LexML/portais dos tribunais (acórdãos); Planalto/LexML (leis) |
| **Conteúdo** | A tese citada corresponde ao que o documento realmente diz? | Ementa/espelho do acórdão (STF/STJ); texto do artigo (Planalto) |
| **Vigência** | A lei está em vigor? O precedente foi superado/distinguido? | Planalto (revogações); STF/STJ (superação, modulação, temas) |

**A classe de alucinação mais perigosa é "número real, tese errada"** — passa na existência e
só é pega no eixo de conteúdo. Um validador que só checa existência (só DATAJUD) dá falsa
segurança e é pior que não ter validador.

---

## 2. O que cada fonte oficial efetivamente entrega

| Fonte | Entrega | Não entrega | Acesso |
|-------|---------|-------------|--------|
| **DATAJUD / API Pública (CNJ)** | Metadados de capa, classe (TPU), órgão julgador, movimentos | Ementa, inteiro teor, holding | API REST Elasticsearch, chave pública, defasagem de horas a dias |
| **STF — Jurisprudência** | Espelho do acórdão: ementa, decisão, legislação/doutrina/jurisprudência citada, tese de repercussão geral; súmulas | Texto integral por padrão na busca (espelho é o índice) | Portal de pesquisa; datasets |
| **STJ — SCON / Dados Abertos / LexML** | Ementa, resumo estruturado, súmulas, temas repetitivos | API REST limpa e estável de busca ad hoc (historicamente ausente) | SCON (portal), Portal de Dados Abertos (datasets), LexML |
| **LexML (Senado)** | Resolução de URN de legislação e jurisprudência; integra base do STJ | Atualização em tempo real | Interface de busca / URN |
| **Planalto** | Texto consolidado de leis federais, com marcas de revogação/alteração | Jurisprudência | Páginas oficiais por norma |
| **TJPR e demais TJs** | Jurisprudência estadual (ementas, acórdãos) | Padrão único entre tribunais | Portais próprios |

> Nota de conformidade: priorizar **API oficial e datasets abertos**. Scraping de portal só
> como último recurso e respeitando os termos de uso de cada tribunal.

---

## 3. Pipeline (estágios)

```
[1] Extração        → identifica spans de citação na resposta da IA
[2] Normalização    → converte cada citação para forma canônica / URN
[3] Roteamento      → decide a(s) fonte(s) por tipo de citação
[4] Recuperação     → consulta a fonte oficial (com cache)
[5] Verificação     → existência → conteúdo (fit semântico) → vigência
[6] Status + score  → atribui status e confiança a cada citação
[7] Anotação        → registra no audit log; devolve marcação ao usuário
```

### 3.1 Extração

Detectar e tipar cada citação:

- **Legislação:** "art. 489 do CPC", "Lei 11.101/2005, art. 83", "art. 5º, X, da CF".
- **Súmula:** "Súmula 7/STJ", "Súmula Vinculante 10".
- **Precedente:** "REsp 1.234.567/SP", "RE 1.058.333", "HC 598.051/SP".
- **Tema repetitivo / repercussão geral:** "Tema 1095/STJ", "Tema 952 RG".

Combinar regex de alta precisão (formatos fixos: nº CNJ, súmula, REsp/RE) com NER jurídico para
formas livres ("o entendimento consolidado do STJ sobre comissão de corretagem"). Formas livres
sem âncora verificável → status `nao_verificavel` desde a extração.

### 3.2 Normalização (canônica / URN)

Mapear para uma chave estável antes de consultar:

```
"art. 489 do CPC"      → urn:lex:br:federal:lei:2015-03-16;13105!art489
"Súmula 7/STJ"         → stj:sumula:7
"REsp 1.234.567/SP"    → stj:resp:1234567  (+ nº CNJ quando disponível)
"Tema 1095/STJ"        → stj:tema:1095
```

A URN do LexML é o pivô para legislação. Para precedentes, manter par
{identificador do tribunal, nº CNJ} — o nº CNJ é a chave para o DATAJUD.

### 3.3 Roteamento por tipo

| Tipo | Existência | Conteúdo | Vigência |
|------|-----------|----------|----------|
| Legislação | LexML / Planalto | Planalto (texto do artigo) | Planalto (revogação) |
| Súmula | STF/STJ (base de súmulas) | texto oficial da súmula | STF/STJ (cancelamento) |
| Precedente | DATAJUD (nº CNJ) + portal do tribunal | ementa/espelho | STF/STJ (superação/modulação) |
| Tema repetitivo / RG | STJ/STF (base de temas) | tese firmada | STJ/STF (revisão de tese) |

### 3.4 Verificação — os três testes em ordem

1. **Existência.** A chave canônica retorna registro? Não → `nao_localizada` (forte indício de
   citação inventada). Sim → segue.
2. **Conteúdo (fit semântico).** Recupera-se a ementa/espelho/texto do artigo e compara-se com a
   afirmação da IA. **Aqui mora o risco**: a comparação não pode ser lexical (a IA parafraseia),
   mas o juiz semântico **só pode julgar consistência contra o texto recuperado** — nunca
   "completar" o que não está lá. Saída restrita a `consistente | divergente | insuficiente`,
   com a passagem-fonte exata anexada. Sem fonte recuperada, não há julgamento de conteúdo.
3. **Vigência.** Lei revogada / súmula cancelada / tese superada → `desatualizada`, mesmo que
   exista e o conteúdo bata.

---

## 4. Modelo de status (e o que é proibido)

```
confirmada       → existe + conteúdo consistente + vigente
divergente       → existe, mas a tese citada NÃO corresponde à ementa real
desatualizada    → existe e bate, mas revogada/superada/cancelada
nao_localizada   → não encontrada em fonte oficial (provável fabricação)
nao_verificavel  → citação genérica/sem âncora, ou fonte indisponível no momento
```

Proibições de produto, alinhadas à Recomendação OAB nº 001/2024 (verificação de
doutrina/jurisprudência) e ao protocolo anti-alucinação:

- **Nunca** marcar como "falso" — o validador prova presença, não ausência absoluta.
- **Nunca** "corrigir" automaticamente uma citação por inferência.
- **Sempre** anexar a fonte oficial e o trecho que sustenta o status.
- Indisponibilidade de fonte → `nao_verificavel` (degradação honesta), nunca `confirmada` por
  presunção.

---

## 5. Problemas difíceis e tratamento

**Número real, tese errada.** Tratado pelo eixo de conteúdo. Sem recuperar a ementa, não se
emite `confirmada`. Esta é a razão de existir do eixo 2.

**Citação fabricada (número inexistente).** Cai em `nao_localizada` na existência. Cuidado com
falso negativo por **defasagem do DATAJUD** (processo recente ainda não indexado): nesse caso,
cruzar com o portal do tribunal antes de concluir, e sinalizar `nao_verificavel` se a divergência
for por janela temporal.

**Paráfrase da tese.** Exige fit semântico com embeddings + verificação contra o texto-fonte,
não match de string.

**Precedente superado.** A existência e o conteúdo passam, mas a tese pode ter sido superada
(overruling) ou ter modulação de efeitos. O eixo de vigência consulta temas e notas de
superação. É um diferencial forte: a maioria das ferramentas para na existência.

**Cobertura e jurisdição.** TJs têm portais heterogêneos; comece por STF, STJ, TJPR e legislação
federal (cobre a maior parte do uso) e expanda. Fora de cobertura → `nao_verificavel` explícito,
nunca silêncio.

**Anti-alucinação do juiz semântico.** O LLM que compara tese × ementa roda com instrução
restritiva, recebe **apenas** o texto recuperado da fonte, e responde em esquema fechado com a
citação do trecho. Se não há trecho, não há veredito de conteúdo.

---

## 6. Modelo de dados (adições)

```sql
CREATE TABLE citation_check (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id  uuid NOT NULL REFERENCES ai_interaction(id),
  raw_text        text NOT NULL,          -- como apareceu na resposta
  cite_type       text NOT NULL,          -- legislacao|sumula|precedente|tema
  canonical_key   text,                   -- URN / chave canônica
  status          text NOT NULL,          -- confirmada|divergente|desatualizada|nao_localizada|nao_verificavel
  source          text,                   -- ex.: 'STJ/SCON', 'Planalto', 'DATAJUD'
  source_ref      text,                   -- URL/identificador oficial
  evidence_excerpt text,                  -- trecho-fonte que sustenta o status
  confidence      numeric(3,2),
  checked_at      timestamptz NOT NULL DEFAULT now()
);

-- Cache de fontes (reduz custo/latência e respeita rate limits)
CREATE TABLE source_cache (
  canonical_key   text PRIMARY KEY,
  payload         jsonb NOT NULL,         -- ementa/texto/metadados recuperados
  fetched_at      timestamptz NOT NULL,
  ttl_seconds     int NOT NULL            -- legislação: longo; precedente: médio
);
```

As citações também são serializadas no campo `citations` de `ai_interaction` (frente a), de modo
que o status integra a trilha imutável e o relatório de conformidade.

---

## 7. Custo, latência e rate limit

- **Cache agressivo** por chave canônica. Legislação consolidada muda pouco (TTL longo);
  precedentes e temas, TTL médio; respeitar revogações via invalidação por evento.
- **Validação assíncrona** quando o modo não é bloqueante: a resposta vai ao usuário com as
  citações "em verificação" e o resultado chega em segundos, anexado ao registro.
- **Lote por interação:** deduplicar citações repetidas antes de consultar.
- **DATAJUD:** chave pública + DSL Elasticsearch; orçar paginação `search_after` e o limite por
  página. Tratar defasagem explicitamente no status.

---

## 8. Integração com o gateway (frente a)

Este pipeline é o **estágio 6 (pós-voo)** do gateway. Fluxo:

```
resposta do modelo → extrai citações → valida (3 eixos) →
  grava citation_check + serializa em ai_interaction.citations →
  entra na cadeia de hash (vira prova) →
  marca a resposta ao usuário (verde/amarelo/vermelho por citação)
```

O relatório de conformidade ao sócio/cliente agrega: % de citações confirmadas, divergentes e
não localizadas por usuário/cliente/caso — métrica direta de diligência.

---

## 9. Fontes oficiais (mapa de integração)

- **DATAJUD — API Pública (CNJ)**, Resolução CNJ nº 331/2020; metadados e movimentos de
  processos; chave pública; sintaxe Elasticsearch; atualização não-imediata.
- **STF — Jurisprudência** (espelho do acórdão: ementa, decisão, legislação citada, tese de RG;
  súmulas e súmulas vinculantes; Tesauro).
- **STJ — SCON, Portal de Dados Abertos (datasets de acórdãos), súmulas e temas repetitivos.**
- **LexML (Senado)** — resolução por URN de legislação e jurisprudência; integra base do STJ.
- **Planalto** — texto consolidado de legislação federal e marcas de revogação.
- **TJPR e demais TJs** — jurisprudência estadual (expansão por jurisdição).
- **Recomendação OAB nº 001/2024** — fundamenta o requisito de verificação de
  doutrina/jurisprudência e supervisão humana.

> Regra final, repetida porque é o coração do produto: confirmar contra fonte oficial ou
> declarar não verificável. Nunca inventar, nunca "consertar".
