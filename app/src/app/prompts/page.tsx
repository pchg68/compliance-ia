"use client";

import { Nav, PageWrapper } from "../components/nav";
import { trpc } from "@/lib/trpc-client";
import { useOrgId } from "@/lib/auth-context";

export default function PromptsPage() {
  const orgId = useOrgId();
  const prompts = trpc.prompt.list.useQuery({ org_id: orgId });

  return (
    <>
      <Nav />
      <PageWrapper>
        <header className="bg-white border-b border-gray-100 px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Biblioteca de Prompts</h1>
          <p className="text-sm text-gray-500 mt-1">Prompts pré-aprovados e classificados por risco para uso seguro</p>
        </header>

        <main className="px-8 py-6">
          {prompts.isLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
                  <div className="h-5 w-48 bg-gray-200 rounded mb-3" />
                  <div className="h-20 w-full bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          )}

          {prompts.data && prompts.data.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {prompts.data.map((p: {
                id: string; title: string; description: string | null;
                category: string; task_type: string; risk_class: string;
                template_text: string; version: number; active: boolean;
              }) => (
                <div key={p.id} className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{p.title}</h3>
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">v{p.version}</span>
                    </div>
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      p.risk_class === "alto" ? "bg-red-100 text-red-700" :
                      p.risk_class === "moderado" ? "bg-yellow-100 text-yellow-700" :
                      "bg-green-100 text-green-700"
                    }`}>{p.risk_class}</span>
                  </div>

                  {p.description && <p className="text-sm text-gray-500 mb-3">{p.description}</p>}

                  <div className="flex gap-2 mb-4">
                    <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-medium">{p.category}</span>
                    <span className="text-xs bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full font-medium">{p.task_type}</span>
                  </div>

                  <pre className="text-xs bg-slate-50 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap text-gray-600 border border-slate-100 max-h-40 overflow-y-auto">
                    {p.template_text}
                  </pre>
                </div>
              ))}
            </div>
          ) : !prompts.isLoading ? (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto rounded-full bg-indigo-50 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-700 mb-2">Nenhum prompt cadastrado</h3>
              <p className="text-sm text-gray-500">A biblioteca será preenchida com prompts pré-aprovados.</p>
            </div>
          ) : null}
        </main>
      </PageWrapper>
    </>
  );
}
