"use client";

import { useState } from "react";
import { Nav, PageWrapper } from "../components/nav";
import { trpc } from "@/lib/trpc-client";

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; label: string; dot: string }> = {
    confirmada:      { bg: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Confirmada", dot: "bg-emerald-500" },
    nao_localizada:  { bg: "bg-red-50 text-red-700 ring-red-200", label: "Não localizada", dot: "bg-red-500" },
    divergente:      { bg: "bg-amber-50 text-amber-700 ring-amber-200", label: "Divergente", dot: "bg-amber-500" },
    desatualizada:   { bg: "bg-orange-50 text-orange-700 ring-orange-200", label: "Desatualizada", dot: "bg-orange-500" },
    nao_verificavel: { bg: "bg-gray-50 text-gray-500 ring-gray-200", label: "Não verificável", dot: "bg-gray-400" },
  };
  const c = config[status] ?? config.nao_verificavel;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${c.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400">—</span>;
  const pct = Math.round(value * 100);
  const color = pct >= 90 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500">{pct}%</span>
    </div>
  );
}

export default function CitacoesPage() {
  const [text, setText] = useState("");
  const [showValidation, setShowValidation] = useState(false);

  const extract = trpc.citation.extract.useQuery(
    { text },
    { enabled: text.length > 10 }
  );

  const citationCount = extract.data?.length ?? 0;

  return (
    <>
      <Nav />
      <PageWrapper>
        <header className="bg-white border-b border-gray-100 px-8 py-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Validador de Citações</h1>
            <p className="text-sm text-gray-500 mt-1">
              Cole o texto da peça para extrair e validar citações contra fontes oficiais (DATAJUD/CNJ)
            </p>
          </div>
        </header>

        <main className="px-8 py-6 space-y-6">
          {/* Área de input */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700">
                Texto da peça
              </label>
              {citationCount > 0 && (
                <span className="text-xs font-medium bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full">
                  {citationCount} citação(ões) encontrada(s)
                </span>
              )}
            </div>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-4 text-sm min-h-[160px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y bg-gray-50 placeholder-gray-400 transition-colors focus:bg-white"
              placeholder="Ex.: Conforme art. 489, § 1º, do CPC, e o entendimento firmado no REsp 1.234.567/SP (Tema 1.001/STJ), é dever do julgador enfrentar todos os argumentos deduzidos. Vide também Súmula Vinculante 10/STF e a Lei nº 11.101/2005, art. 83..."
              value={text}
              onChange={(e) => { setText(e.target.value); setShowValidation(false); }}
            />
            {citationCount > 0 && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setShowValidation(true)}
                  className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm hover:shadow"
                >
                  Validar {citationCount} citação(ões) contra fontes oficiais
                </button>
              </div>
            )}
          </div>

          {/* Resultados da extração */}
          {extract.data && extract.data.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/50">
                <h2 className="font-semibold text-gray-900 text-sm">Citações extraídas</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {extract.data.map((c: {
                  raw_text: string; cite_type: string; canonical_key: string | null;
                }, i: number) => (
                  <div key={i} className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm">{c.raw_text}</p>
                      {c.canonical_key && (
                        <p className="font-mono text-xs text-gray-400 mt-1 truncate">{c.canonical_key}</p>
                      )}
                    </div>
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      c.cite_type === "legislacao" ? "bg-indigo-50 text-indigo-600" :
                      c.cite_type === "precedente" ? "bg-violet-50 text-violet-600" :
                      c.cite_type === "sumula" ? "bg-cyan-50 text-cyan-600" :
                      "bg-teal-50 text-teal-600"
                    }`}>
                      {c.cite_type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resultado da validação (simulado para demo — em produção, chamaria citation.validate) */}
          {showValidation && extract.data && extract.data.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50 bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900 text-sm">Resultado da validação</h2>
                  <span className="text-xs text-gray-500">
                    Fonte: DATAJUD/CNJ
                  </span>
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {extract.data.map((c: {
                  raw_text: string; cite_type: string; canonical_key: string | null;
                }, i: number) => {
                  const hasCnj = c.canonical_key?.startsWith("cnj:");
                  const status = hasCnj ? "nao_verificavel" : "nao_verificavel";
                  return (
                    <div key={i} className="px-6 py-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">{c.raw_text}</p>
                        {c.canonical_key && (
                          <p className="font-mono text-xs text-gray-400 mt-1">{c.canonical_key}</p>
                        )}
                      </div>
                      <ConfidenceBar value={null} />
                      <StatusBadge status={status} />
                    </div>
                  );
                })}
              </div>
              <div className="px-6 py-4 bg-amber-50/50 border-t border-amber-100">
                <p className="text-xs text-amber-700">
                  <strong>Nota:</strong> A validação em tempo real contra DATAJUD/CNJ requer o banco de dados ativo.
                  Em produção, cada citação com número CNJ é verificada contra a base oficial do Conselho Nacional de Justiça.
                  Legislação e súmulas serão validadas via LexML e portais dos tribunais superiores (em desenvolvimento).
                </p>
              </div>
            </div>
          )}

          {extract.data && extract.data.length === 0 && text.length > 10 && (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto rounded-full bg-gray-50 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-700 mb-2">Nenhuma citação encontrada</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                O texto não contém referências a legislação, súmulas, precedentes ou processos reconhecíveis.
              </p>
            </div>
          )}
        </main>
      </PageWrapper>
    </>
  );
}
