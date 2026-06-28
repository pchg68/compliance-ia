-- Migration: base local de súmulas oficiais (STJ/STF)
-- Súmulas são conjunto finito e estável -> ingestão em tabela local é mais
-- escalável e confiável que scraping por requisição. A carga completa vem de
-- um job de sincronização contra as fontes oficiais (dados abertos STJ / Corte
-- Aberta STF). Invariante 6: só entram textos verificados em fonte oficial.

CREATE TABLE sumula_oficial (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribunal      text NOT NULL CHECK (tribunal IN ('stj','stf')),
  numero        int NOT NULL,
  vinculante    boolean NOT NULL DEFAULT false,
  texto         text NOT NULL,
  revogada      boolean NOT NULL DEFAULT false,
  source_ref    text,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  -- chave canônica usada pelo extractor/validador
  canonical_key text GENERATED ALWAYS AS (
    tribunal || ':sumula' || (CASE WHEN vinculante THEN '_vinculante' ELSE '' END) || ':' || numero
  ) STORED,
  UNIQUE (tribunal, numero, vinculante)
);

CREATE INDEX idx_sumula_canonical ON sumula_oficial(canonical_key);

-- Súmulas não mudam de texto; correções entram como nova carga. Sem RLS:
-- é dado público compartilhado entre todos os tenants (como o source_cache).

-- ============================================================
-- Seed: súmulas canônicas com texto exato verificado em fonte oficial.
-- A base completa é populada pelo job de sincronização oficial.
-- ============================================================
INSERT INTO sumula_oficial (tribunal, numero, vinculante, texto, source_ref) VALUES
(
  'stj', 7, false,
  'A pretensão de simples reexame de prova não enseja recurso especial.',
  'https://www.stj.jus.br/docs_internet/SumulasSTJ.pdf'
),
(
  'stf', 282, false,
  'É inadmissível o recurso extraordinário, quando não ventilada, na decisão recorrida, a questão federal suscitada.',
  'https://portal.stf.jus.br/jurisprudencia/sumariosumulas.asp'
),
(
  'stf', 10, true,
  'Viola a cláusula de reserva de plenário (CF, artigo 97) a decisão de órgão fracionário de tribunal que, embora não declare expressamente a inconstitucionalidade de lei ou ato normativo do poder público, afasta sua incidência, no todo ou em parte.',
  'https://portal.stf.jus.br/jurisprudencia/sumariosumulas.asp'
)
ON CONFLICT (tribunal, numero, vinculante) DO NOTHING;
