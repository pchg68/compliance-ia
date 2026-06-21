"use client";

import { Nav } from "../components/nav";
import { trpc } from "@/lib/trpc-client";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";

export default function AlertasPage() {
  const alerts = trpc.alert.list.useQuery({ org_id: DEMO_ORG_ID, limit: 50 });

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full">
        <h1 className="text-2xl font-bold mb-6">Alertas</h1>

        {alerts.isLoading && <p className="text-gray-500">Carregando...</p>}

        {alerts.data && alerts.data.length > 0 ? (
          <div className="space-y-3">
            {alerts.data.map((a: {
              id: string; severity: string; category: string;
              title: string; description: string; status: string; created_at: string;
            }) => (
              <div key={a.id} className={`bg-white rounded-lg border p-4 ${
                a.severity === "critical" ? "border-red-300" :
                a.severity === "high" ? "border-orange-300" :
                a.severity === "medium" ? "border-yellow-300" :
                "border-gray-200"
              }`}>
                <div className="flex items-center gap-3 mb-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    a.severity === "critical" ? "bg-red-100 text-red-700" :
                    a.severity === "high" ? "bg-orange-100 text-orange-700" :
                    a.severity === "medium" ? "bg-yellow-100 text-yellow-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{a.severity}</span>
                  <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded">{a.category}</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded ${
                    a.status === "open" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                  }`}>{a.status}</span>
                </div>
                <p className="font-medium">{a.title}</p>
                <p className="text-sm text-gray-500 mt-1">{a.description}</p>
                <p className="text-xs text-gray-400 mt-2">{new Date(a.created_at).toLocaleString("pt-BR")}</p>
              </div>
            ))}
          </div>
        ) : !alerts.isLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            Nenhum alerta registrado.
          </div>
        ) : null}
      </main>
    </>
  );
}
