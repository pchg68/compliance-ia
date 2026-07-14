"use client";

import { Nav, PageWrapper } from "../components/nav";
import { trpc } from "@/lib/trpc-client";
import { useAuth, useOrgId } from "@/lib/auth-context";

const ADMIN_ROLES = ["admin", "compliance", "developer"];

export default function AlertasPage() {
  const orgId = useOrgId();
  const { me } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(me?.role ?? "");
  const alerts = trpc.alert.list.useQuery({ org_id: orgId, limit: 50 });
  const resolve = trpc.alert.resolve.useMutation({
    onSuccess: () => alerts.refetch(),
  });

  return (
    <>
      <Nav />
      <PageWrapper>
        <header className="bg-white border-b border-gray-100 px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Alertas</h1>
          <p className="text-sm text-gray-500 mt-1">Notificações de segurança, risco e conformidade</p>
        </header>

        <main className="px-8 py-6">
          {alerts.isLoading && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
                  <div className="h-4 w-48 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-full bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          )}

          {alerts.data && alerts.data.length > 0 ? (
            <div className="space-y-3">
              {alerts.data.map((a: {
                id: string; severity: string; category: string;
                title: string; description: string; status: string; created_at: string;
              }) => (
                <div key={a.id} className={`bg-white rounded-xl border shadow-sm p-5 transition-shadow hover:shadow-md ${
                  a.severity === "critical" ? "border-l-4 border-l-red-500 border-gray-100" :
                  a.severity === "high" ? "border-l-4 border-l-orange-500 border-gray-100" :
                  a.severity === "medium" ? "border-l-4 border-l-yellow-500 border-gray-100" :
                  "border-gray-100"
                }`}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      a.severity === "critical" ? "bg-red-100 text-red-700" :
                      a.severity === "high" ? "bg-orange-100 text-orange-700" :
                      a.severity === "medium" ? "bg-yellow-100 text-yellow-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>{a.severity}</span>
                    <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{a.category}</span>
                    <span className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full ${
                      a.status === "open" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                    }`}>{a.status === "open" ? "Aberto" : "Resolvido"}</span>
                  </div>
                  <p className="font-semibold text-gray-900">{a.title}</p>
                  <p className="text-sm text-gray-500 mt-1">{a.description}</p>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-gray-400">{new Date(a.created_at).toLocaleString("pt-BR")}</p>
                    {isAdmin && a.status === "open" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => resolve.mutate({ alert_id: a.id, status: "acknowledged" })}
                          disabled={resolve.isPending}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60"
                        >
                          Reconhecer
                        </button>
                        <button
                          onClick={() => resolve.mutate({ alert_id: a.id, status: "dismissed" })}
                          disabled={resolve.isPending}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60"
                        >
                          Descartar
                        </button>
                        <button
                          onClick={() => resolve.mutate({ alert_id: a.id, status: "resolved" })}
                          disabled={resolve.isPending}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
                        >
                          Resolver
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : !alerts.isLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-700 mb-2">Tudo limpo</h3>
              <p className="text-sm text-gray-500">Nenhum alerta registrado.</p>
            </div>
          ) : null}
        </main>
      </PageWrapper>
    </>
  );
}
