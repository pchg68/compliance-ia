"use client";

import { Nav } from "../components/nav";
import { trpc } from "@/lib/trpc-client";

export default function ConfiguracoesPage() {
  const jurisdictions = trpc.jurisdiction.list.useQuery();
  const brProfile = trpc.jurisdiction.get.useQuery({ code: "BR" });
  const euProfile = trpc.jurisdiction.get.useQuery({ code: "EU" });

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full">
        <h1 className="text-2xl font-bold mb-6">Configurações</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[brProfile, euProfile].map((profile) => {
            const p = profile.data;
            if (!p) return null;
            return (
              <div key={p.code} className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="font-semibold text-lg">{p.code}</h2>
                  <span className="text-sm text-gray-500">{p.label}</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Locale</p>
                    <p className="text-sm">{p.locale}</p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Níveis de risco</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.risk_levels.map((r: { key: string; label: string }) => (
                        <span key={r.key} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                          {r.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Checklist</p>
                    <p className="text-sm">{p.checklist_alto_count} itens (alto risco), {p.checklist_moderado_count} itens (moderado)</p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Referências regulatórias</p>
                    <ul className="text-sm text-gray-600 mt-1 space-y-1">
                      {p.regulatory_refs.map((ref: string) => (
                        <li key={ref}>• {ref}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="font-semibold mb-3">Jurisdições disponíveis</h2>
          {jurisdictions.data && (
            <div className="flex gap-3">
              {jurisdictions.data.map((j: { code: string; label: string }) => (
                <div key={j.code} className="border border-gray-200 rounded-lg px-4 py-3 text-center">
                  <p className="font-bold text-lg">{j.code}</p>
                  <p className="text-xs text-gray-500">{j.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
