"use client";

import { useState } from "react";
import { Nav, PageWrapper } from "../components/nav";
import { trpc } from "@/lib/trpc-client";
import { useOrgId } from "@/lib/auth-context";

function isoStart(d: string) {
  return new Date(`${d}T00:00:00`).toISOString();
}
function isoEnd(d: string) {
  return new Date(`${d}T23:59:59`).toISOString();
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function BreakdownTable({ title, rows, keyName }: {
  title: string;
  rows: Record<string, unknown>[] | undefined;
  keyName: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{title}</h3>
      {rows && rows.length > 0 ? (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="py-1.5 text-gray-700">{String(r[keyName] ?? "—")}</td>
                <td className="py-1.5 text-right font-medium text-gray-900">{String(r.count ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-gray-400">Sem dados no período</p>
      )}
    </div>
  );
}

export default function RelatoriosPage() {
  const orgId = useOrgId();
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [start, setStart] = useState(firstOfMonth.toISOString().slice(0, 10));
  const [end, setEnd] = useState(today.toISOString().slice(0, 10));
  const [generated, setGenerated] = useState(false);

  const report = trpc.report.compliance.useQuery(
    { org_id: orgId, period_start: isoStart(start), period_end: isoEnd(end) },
    { enabled: generated }
  );
  const chain = trpc.interaction.verifyChain.useQuery(
    { org_id: orgId },
    { enabled: generated }
  );

  const r = report.data;
  const summary = r?.summary as
    | { total_interactions: number; checklist_passed: number; checklist_failed: number; first_interaction: string | null; last_interaction: string | null }
    | undefined;
  const passRate =
    summary && summary.total_interactions > 0
      ? Math.round((summary.checklist_passed / summary.total_interactions) * 100)
      : null;

  return (
    <>
      <Nav />
      <PageWrapper>
        <header className="bg-white border-b border-gray-100 px-8 py-6 no-print">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Relatório de Conformidade</h1>
              <p className="text-sm text-gray-500 mt-1">
                Documento de evidência de diligência no uso de IA — exportável para arquivo
              </p>
            </div>
          </div>
        </header>

        {/* Controles (não impressos) */}
        <div className="px-8 py-5 no-print">
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Início</label>
              <input
                type="date"
                value={start}
                onChange={(e) => { setStart(e.target.value); setGenerated(false); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Fim</label>
              <input
                type="date"
                value={end}
                onChange={(e) => { setEnd(e.target.value); setGenerated(false); }}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <button
              onClick={() => setGenerated(true)}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              Gerar relatório
            </button>
            {generated && r && (
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors shadow-sm ml-auto flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Exportar PDF
              </button>
            )}
          </div>
        </div>

        {/* Documento imprimível */}
        <div className="px-8 pb-10 print-area">
          {generated && report.isLoading && (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-500 shadow-sm">
              Gerando relatório...
            </div>
          )}

          {generated && r && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm max-w-3xl mx-auto print-page">
              {/* Cabeçalho do documento */}
              <div className="px-10 pt-10 pb-6 border-b-2 border-slate-900">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-white font-bold text-xs">JG</div>
                      <span className="font-bold text-slate-900">JurisOS Guard</span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Relatório de Conformidade no Uso de IA</h2>
                    <p className="text-sm text-gray-500 mt-1">Evidência de diligência — Recomendação OAB nº 001/2024</p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <p className="font-semibold text-gray-700">{r.organization}</p>
                    <p className="mt-1">Emitido em</p>
                    <p>{new Date(r.generated_at).toLocaleString("pt-BR")}</p>
                  </div>
                </div>
                <div className="mt-4 text-sm text-gray-600">
                  Período: <strong>{new Date(r.period.start).toLocaleDateString("pt-BR")}</strong> a{" "}
                  <strong>{new Date(r.period.end).toLocaleDateString("pt-BR")}</strong>
                </div>
              </div>

              {/* Selo de integridade da cadeia (o moat) */}
              {chain.data && (
                <div className={`mx-10 mt-6 rounded-lg border p-4 ${
                  chain.data.valid ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      chain.data.valid ? "bg-emerald-100" : "bg-red-100"
                    }`}>
                      <svg className={`w-6 h-6 ${chain.data.valid ? "text-emerald-600" : "text-red-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className={`font-semibold ${chain.data.valid ? "text-emerald-800" : "text-red-800"}`}>
                        {chain.data.valid ? "Trilha de auditoria íntegra" : "Trilha de auditoria ADULTERADA"}
                      </p>
                      <p className={`text-xs ${chain.data.valid ? "text-emerald-700" : "text-red-700"}`}>
                        Cadeia de hash SHA-256 verificada — {chain.data.checked} registro(s) encadeado(s) e imutável(eis)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Sumário executivo */}
              <div className="px-10 py-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Sumário executivo</h3>
                {summary && (
                  <div className="grid grid-cols-2 gap-x-8">
                    <StatRow label="Total de interações com IA" value={summary.total_interactions} />
                    <StatRow label="Taxa de conformidade (checklist)" value={passRate !== null ? `${passRate}%` : "—"} />
                    <StatRow label="Checklist aprovado" value={summary.checklist_passed} />
                    <StatRow label="Checklist reprovado" value={summary.checklist_failed} />
                  </div>
                )}
              </div>

              {/* Breakdowns */}
              <div className="px-10 pb-6 grid grid-cols-2 gap-8">
                <BreakdownTable title="Por classe de risco" rows={r.breakdown.by_risk_class} keyName="risk_class" />
                <BreakdownTable title="Por decisão" rows={r.breakdown.by_decision} keyName="decision" />
                <BreakdownTable title="Por tipo de tarefa" rows={r.breakdown.by_task_type} keyName="task_type" />
                <BreakdownTable title="Por usuário" rows={r.breakdown.by_user} keyName="email" />
              </div>

              {/* Base regulatória */}
              <div className="px-10 py-6 border-t border-gray-100">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Base regulatória</h3>
                <ul className="grid grid-cols-2 gap-2">
                  {r.regulatory_references.map((ref: string) => (
                    <li key={ref} className="text-sm text-gray-600 flex items-start gap-2">
                      <svg className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                      </svg>
                      {ref}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Rodapé / assinatura */}
              <div className="px-10 py-6 border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
                <p className="text-xs text-gray-500 leading-relaxed">
                  Este relatório constitui evidência de diligência no uso de inteligência artificial, gerado a partir
                  da trilha de auditoria imutável do JurisOS Guard. A integridade dos registros é assegurada por cadeia
                  de hash criptográfico (SHA-256) com encadeamento sequencial, impedindo alteração retroativa.
                  O escritório é usuário de IA e responsável pela supervisão humana das peças produzidas.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-8">
                  <div className="border-t border-gray-300 pt-2">
                    <p className="text-xs text-gray-500">Responsável pela conformidade</p>
                  </div>
                  <div className="border-t border-gray-300 pt-2">
                    <p className="text-xs text-gray-500">Sócio supervisor</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!generated && (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm max-w-3xl mx-auto">
              <div className="w-16 h-16 mx-auto rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-700 mb-2">Selecione um período e gere o relatório</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                O documento consolida as métricas de conformidade do período e o selo de integridade da trilha de auditoria, pronto para exportar em PDF e arquivar.
              </p>
            </div>
          )}
        </div>
      </PageWrapper>
    </>
  );
}
