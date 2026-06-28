"use client";

import { Nav, PageWrapper } from "./components/nav";
import { trpc } from "@/lib/trpc-client";
import { useOrgId } from "@/lib/auth-context";

function StatCard({ label, value, color, icon, subtitle }: {
  label: string; value: string | number; color: string; icon: string; subtitle?: string;
}) {
  const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    blue:   { bg: "bg-blue-50", text: "text-blue-700", icon: "bg-blue-100 text-blue-600" },
    red:    { bg: "bg-red-50", text: "text-red-700", icon: "bg-red-100 text-red-600" },
    amber:  { bg: "bg-amber-50", text: "text-amber-700", icon: "bg-amber-100 text-amber-600" },
    green:  { bg: "bg-emerald-50", text: "text-emerald-700", icon: "bg-emerald-100 text-emerald-600" },
    purple: { bg: "bg-purple-50", text: "text-purple-700", icon: "bg-purple-100 text-purple-600" },
  };
  const c = colorMap[color] ?? colorMap.blue;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${c.text}`}>{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg ${c.icon} flex items-center justify-center`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
      </div>
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmada: "bg-emerald-100 text-emerald-700",
    nao_localizada: "bg-red-100 text-red-700",
    divergente: "bg-amber-100 text-amber-700",
    desatualizada: "bg-orange-100 text-orange-700",
    nao_verificavel: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${styles[status] ?? styles.nao_verificavel}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default function DashboardPage() {
  const orgId = useOrgId();
  const summary = trpc.dashboard.summary.useQuery({ org_id: orgId });
  const daily = trpc.dashboard.daily.useQuery({ org_id: orgId, days: 7 });
  const alerts = trpc.dashboard.alertStats.useQuery({ org_id: orgId });
  const citations = trpc.dashboard.citationStats.useQuery({ org_id: orgId });

  const s = summary.data;

  return (
    <>
      <Nav />
      <PageWrapper>
        <header className="bg-white border-b border-gray-100 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard de Conformidade</h1>
              <p className="text-sm text-gray-500 mt-1">Visão geral do uso de IA e integridade da trilha de auditoria</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-sm font-medium">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Trilha íntegra
              </div>
            </div>
          </div>
        </header>

        <main className="px-8 py-6 space-y-6">
          {summary.isLoading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
                  <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
                  <div className="h-8 w-16 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          )}

          {s && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total de interações"
                value={s.total_interactions}
                color="blue"
                icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                subtitle="registradas na trilha"
              />
              <StatCard
                label="Bloqueadas"
                value={s.blocked}
                color="red"
                icon="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                subtitle="por política de risco"
              />
              <StatCard
                label="Alto risco"
                value={s.risk_high}
                color="amber"
                icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                subtitle="requerem supervisão"
              />
              <StatCard
                label="Checklist aprovado"
                value={s.total_interactions > 0 ? `${Math.round(((s.total_interactions - s.checklist_failed) / s.total_interactions) * 100)}%` : "—"}
                color="green"
                icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                subtitle="taxa de conformidade"
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Atividade diária */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-4">Atividade dos últimos 7 dias</h2>
              {daily.data && daily.data.length > 0 ? (
                <div className="space-y-3">
                  {daily.data.map((d: { day: string; interactions: number; blocked: number; high_risk: number }) => {
                    const maxVal = Math.max(...daily.data!.map((x: { interactions: number }) => x.interactions), 1);
                    return (
                      <div key={d.day} className="flex items-center gap-4">
                        <span className="text-xs text-gray-500 w-20 shrink-0 font-mono">
                          {new Date(d.day).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                        </span>
                        <div className="flex-1">
                          <MiniBar value={d.interactions} max={maxVal} color="bg-blue-500" />
                        </div>
                        <div className="flex gap-4 text-xs w-36 shrink-0">
                          <span className="text-gray-600">{d.interactions} int.</span>
                          {d.blocked > 0 && <span className="text-red-600">{d.blocked} bloq.</span>}
                          {d.high_risk > 0 && <span className="text-amber-600">{d.high_risk} risco</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-400 text-sm py-8 text-center">Sem dados no período</p>
              )}
            </div>

            {/* Alertas */}
            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-4">Alertas ativos</h2>
              {alerts.data && alerts.data.length > 0 ? (
                <div className="space-y-3">
                  {alerts.data.map((a: { severity: string; status: string; count: number }, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          a.severity === "critical" ? "bg-red-500" :
                          a.severity === "high" ? "bg-orange-500" :
                          a.severity === "medium" ? "bg-yellow-500" :
                          "bg-gray-400"
                        }`} />
                        <span className="text-sm capitalize">{a.severity}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">{a.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500">Nenhum alerta</p>
                </div>
              )}
            </div>
          </div>

          {/* Citações verificadas */}
          <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Citações verificadas</h2>
            {citations.data && citations.data.length > 0 ? (
              <div className="flex flex-wrap gap-4">
                {citations.data.map((c: { status: string; count: number }) => (
                  <div key={c.status} className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
                    <StatusBadge status={c.status} />
                    <span className="text-2xl font-bold text-gray-800">{c.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm py-4 text-center">Nenhuma citação verificada ainda</p>
            )}
          </div>

          {/* Métricas secundárias */}
          {s && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Permitidas" value={s.allowed} color="green" icon="M5 13l4 4L19 7" />
              <StatCard label="Com mascaramento" value={s.masked} color="blue" icon="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              <StatCard label="Aguardando aprovação" value={s.pending_approval} color="purple" icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              <StatCard label="Risco excessivo" value={s.risk_excessive} color="red" icon="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </div>
          )}

          {!s && !summary.isLoading && (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto rounded-full bg-blue-50 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-700 mb-2">Nenhuma interação registrada</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                As métricas de conformidade aparecerão aqui conforme as interações de IA forem capturadas e auditadas.
              </p>
            </div>
          )}
        </main>
      </PageWrapper>
    </>
  );
}
