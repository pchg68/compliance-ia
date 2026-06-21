"use client";

import { Nav } from "./components/nav";
import { trpc } from "@/lib/trpc-client";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color ?? "text-gray-900"}`}>{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const summary = trpc.dashboard.summary.useQuery({ org_id: DEMO_ORG_ID });
  const daily = trpc.dashboard.daily.useQuery({ org_id: DEMO_ORG_ID, days: 7 });
  const alerts = trpc.dashboard.alertStats.useQuery({ org_id: DEMO_ORG_ID });
  const citations = trpc.dashboard.citationStats.useQuery({ org_id: DEMO_ORG_ID });

  const s = summary.data;

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full">
        <h1 className="text-2xl font-bold mb-6">Dashboard de Conformidade</h1>

        {summary.isLoading && <p className="text-gray-500">Carregando...</p>}

        {s && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard label="Total de interações" value={s.total_interactions} />
              <StatCard label="Bloqueadas" value={s.blocked} color="text-red-600" />
              <StatCard label="Alto risco" value={s.risk_high} color="text-orange-500" />
              <StatCard label="Checklist reprovado" value={s.checklist_failed} color="text-yellow-600" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard label="Permitidas" value={s.allowed} color="text-green-600" />
              <StatCard label="Com mascaramento" value={s.masked} color="text-blue-600" />
              <StatCard label="Aguardando aprovação" value={s.pending_approval} color="text-purple-600" />
              <StatCard label="Risco excessivo" value={s.risk_excessive} color="text-red-700" />
            </div>
          </>
        )}

        {!s && !summary.isLoading && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            Nenhuma interação registrada ainda. As métricas aparecerão aqui conforme o uso.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="font-semibold mb-3">Atividade diária (últimos 7 dias)</h2>
            {daily.data && daily.data.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2">Data</th>
                    <th className="pb-2">Interações</th>
                    <th className="pb-2">Bloqueadas</th>
                    <th className="pb-2">Alto risco</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.data.map((d: { day: string; interactions: number; blocked: number; high_risk: number }) => (
                    <tr key={d.day} className="border-b border-gray-100">
                      <td className="py-2">{new Date(d.day).toLocaleDateString("pt-BR")}</td>
                      <td className="py-2">{d.interactions}</td>
                      <td className="py-2 text-red-600">{d.blocked}</td>
                      <td className="py-2 text-orange-500">{d.high_risk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-400 text-sm">Sem dados no período</p>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="font-semibold mb-3">Alertas</h2>
            {alerts.data && alerts.data.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2">Severidade</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Qtde</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.data.map((a: { severity: string; status: string; count: number }, i: number) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          a.severity === "critical" ? "bg-red-100 text-red-700" :
                          a.severity === "high" ? "bg-orange-100 text-orange-700" :
                          a.severity === "medium" ? "bg-yellow-100 text-yellow-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>{a.severity}</span>
                      </td>
                      <td className="py-2">{a.status}</td>
                      <td className="py-2 font-medium">{a.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-400 text-sm">Nenhum alerta</p>
            )}
          </div>
        </div>

        <div className="mt-6 bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Citações verificadas</h2>
          {citations.data && citations.data.length > 0 ? (
            <div className="flex gap-4">
              {citations.data.map((c: { status: string; count: number }) => (
                <div key={c.status} className="text-center">
                  <p className={`text-xl font-bold ${
                    c.status === "confirmada" ? "text-green-600" :
                    c.status === "nao_localizada" ? "text-red-600" :
                    c.status === "divergente" ? "text-orange-600" :
                    "text-gray-500"
                  }`}>{c.count}</p>
                  <p className="text-xs text-gray-500">{c.status.replace(/_/g, " ")}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Nenhuma citação verificada</p>
          )}
        </div>
      </main>
    </>
  );
}
