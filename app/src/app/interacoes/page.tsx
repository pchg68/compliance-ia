"use client";

import { Nav } from "../components/nav";
import { trpc } from "@/lib/trpc-client";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";

export default function InteracoesPage() {
  const interactions = trpc.interaction.list.useQuery({ org_id: DEMO_ORG_ID, limit: 50 });
  const chain = trpc.interaction.verifyChain.useQuery({ org_id: DEMO_ORG_ID });

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Trilha de Auditoria</h1>
          {chain.data && (
            <div className={`px-3 py-1 rounded text-sm font-medium ${
              chain.data.valid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}>
              Cadeia de hash: {chain.data.valid ? "íntegra" : "ADULTERADA"}
              {" "}({chain.data.checked} registros)
            </div>
          )}
        </div>

        {interactions.isLoading && <p className="text-gray-500">Carregando...</p>}

        {interactions.data && interactions.data.length > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-3">Seq</th>
                  <th className="px-4 py-3">Provedor</th>
                  <th className="px-4 py-3">Modelo</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Risco</th>
                  <th className="px-4 py-3">Decisão</th>
                  <th className="px-4 py-3">Checklist</th>
                  <th className="px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody>
                {interactions.data.map((row: {
                  id: string; seq: number; provider: string; model: string;
                  task_type: string; risk_class: string; decision: string;
                  checklist_passed: boolean; created_at: string;
                }) => (
                  <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{row.seq}</td>
                    <td className="px-4 py-3">{row.provider}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.model}</td>
                    <td className="px-4 py-3">{row.task_type}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        row.risk_class === "excessivo" || row.risk_class === "alto"
                          ? "bg-red-100 text-red-700"
                          : row.risk_class === "moderado"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-green-100 text-green-700"
                      }`}>{row.risk_class}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        row.decision === "block" ? "bg-red-100 text-red-700" :
                        row.decision === "approval" ? "bg-purple-100 text-purple-700" :
                        row.decision === "masked" ? "bg-blue-100 text-blue-700" :
                        "bg-green-100 text-green-700"
                      }`}>{row.decision}</span>
                    </td>
                    <td className="px-4 py-3">
                      {row.checklist_passed
                        ? <span className="text-green-600">OK</span>
                        : <span className="text-red-600">Falhou</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(row.created_at).toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !interactions.isLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            Nenhuma interação registrada.
          </div>
        ) : null}
      </main>
    </>
  );
}
