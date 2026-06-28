"use client";

import { Nav, PageWrapper } from "../components/nav";
import { trpc } from "@/lib/trpc-client";

export default function ConfiguracoesPage() {
  const jurisdictions = trpc.jurisdiction.list.useQuery();
  const brProfile = trpc.jurisdiction.get.useQuery({ code: "BR" });
  const euProfile = trpc.jurisdiction.get.useQuery({ code: "EU" });

  return (
    <>
      <Nav />
      <PageWrapper>
        <header className="bg-white border-b border-gray-100 px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
          <p className="text-sm text-gray-500 mt-1">Jurisdições, políticas de risco e parâmetros do sistema</p>
        </header>

        <main className="px-8 py-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[brProfile, euProfile].map((profile) => {
              const p = profile.data;
              if (!p) return null;
              return (
                <div key={p.code} className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                  <div className="flex items-center gap-3 mb-5">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                      p.code === "BR" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {p.code}
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">{p.label}</h2>
                      <p className="text-xs text-gray-500">Locale: {p.locale}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2">Níveis de risco</p>
                      <div className="flex flex-wrap gap-1.5">
                        {p.risk_levels.map((r: { key: string; label: string }) => (
                          <span key={r.key} className="text-xs bg-slate-50 text-gray-700 px-2.5 py-1 rounded-full border border-slate-100 font-medium">
                            {r.label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Checklist</p>
                      <p className="text-sm text-gray-700">{p.checklist_alto_count} itens (alto risco), {p.checklist_moderado_count} itens (moderado)</p>
                    </div>

                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2">Referências regulatórias</p>
                      <ul className="space-y-1.5">
                        {p.regulatory_refs.map((ref: string) => (
                          <li key={ref} className="text-sm text-gray-600 flex items-start gap-2">
                            <svg className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                            </svg>
                            {ref}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Jurisdições disponíveis</h2>
            {jurisdictions.data && (
              <div className="flex gap-3">
                {jurisdictions.data.map((j: { code: string; label: string }) => (
                  <div key={j.code} className="border border-gray-100 rounded-xl px-5 py-4 text-center hover:shadow-sm transition-shadow bg-gray-50/50">
                    <p className="font-bold text-xl text-gray-800">{j.code}</p>
                    <p className="text-xs text-gray-500 mt-1">{j.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </PageWrapper>
    </>
  );
}
