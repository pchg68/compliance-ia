"use client";

import { Nav, PageWrapper } from "../components/nav";
import { trpc } from "@/lib/trpc-client";
import { useOrgId } from "@/lib/auth-context";

export default function InteracoesPage() {
  const orgId = useOrgId();
  const interactions = trpc.interaction.list.useQuery({ org_id: orgId, limit: 50 });
  const chain = trpc.interaction.verifyChain.useQuery({ org_id: orgId });

  return (
    <>
      <Nav />
      <PageWrapper>
        <header className="bg-white border-b border-gray-100 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Trilha de Auditoria</h1>
              <p className="text-sm text-gray-500 mt-1">Registro imutável de todas as interações com IA — hash-chain verificável</p>
            </div>
            {chain.data && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                chain.data.valid
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}>
                <div className={`w-2 h-2 rounded-full ${chain.data.valid ? "bg-emerald-500" : "bg-red-500"}`} />
                Cadeia {chain.data.valid ? "íntegra" : "ADULTERADA"} — {chain.data.checked} registros
              </div>
            )}
          </div>
        </header>

        <main className="px-8 py-6">
          {interactions.isLoading && (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
                  <div className="h-4 w-full bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          )}

          {interactions.data && interactions.data.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/80">
                  <tr className="text-left text-gray-500 text-xs uppercase tracking-wider">
                    <th className="px-5 py-3 font-semibold">Seq</th>
                    <th className="px-5 py-3 font-semibold">Provedor</th>
                    <th className="px-5 py-3 font-semibold">Modelo</th>
                    <th className="px-5 py-3 font-semibold">Tipo</th>
                    <th className="px-5 py-3 font-semibold">Risco</th>
                    <th className="px-5 py-3 font-semibold">Decisão</th>
                    <th className="px-5 py-3 font-semibold">Checklist</th>
                    <th className="px-5 py-3 font-semibold">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {interactions.data.map((row: {
                    id: string; seq: number; provider: string; model: string;
                    task_type: string; risk_class: string; decision: string;
                    checklist_passed: boolean; created_at: string;
                  }) => (
                    <tr key={row.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-gray-600">{row.seq}</td>
                      <td className="px-5 py-3.5 text-gray-700">{row.provider}</td>
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-500">{row.model}</td>
                      <td className="px-5 py-3.5 text-gray-700">{row.task_type}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          row.risk_class === "excessivo" ? "bg-red-100 text-red-700" :
                          row.risk_class === "alto" ? "bg-orange-100 text-orange-700" :
                          row.risk_class === "moderado" ? "bg-yellow-100 text-yellow-700" :
                          "bg-green-100 text-green-700"
                        }`}>{row.risk_class}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          row.decision === "block" ? "bg-red-100 text-red-700" :
                          row.decision === "approval" ? "bg-purple-100 text-purple-700" :
                          row.decision === "masked" ? "bg-blue-100 text-blue-700" :
                          "bg-green-100 text-green-700"
                        }`}>{row.decision}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        {row.checklist_passed
                          ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              OK
                            </span>
                          : <span className="inline-flex items-center gap-1 text-red-600 text-xs font-semibold">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              Falhou
                            </span>}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-500">
                        {new Date(row.created_at).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !interactions.isLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-700 mb-2">Nenhuma interação registrada</h3>
              <p className="text-sm text-gray-500">A trilha de auditoria será preenchida conforme o uso.</p>
            </div>
          ) : null}
        </main>
      </PageWrapper>
    </>
  );
}
