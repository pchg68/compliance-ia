"use client";

import { Nav } from "../components/nav";
import { trpc } from "@/lib/trpc-client";

const DEMO_ORG_ID = "00000000-0000-0000-0000-000000000001";

export default function PromptsPage() {
  const prompts = trpc.prompt.list.useQuery({ org_id: DEMO_ORG_ID });

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full">
        <h1 className="text-2xl font-bold mb-6">Biblioteca de Prompts</h1>

        {prompts.isLoading && <p className="text-gray-500">Carregando...</p>}

        {prompts.data && prompts.data.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {prompts.data.map((p: {
              id: string; title: string; description: string | null;
              category: string; task_type: string; risk_class: string;
              template_text: string; version: number; active: boolean;
            }) => (
              <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold">{p.title}</h3>
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">v{p.version}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    p.risk_class === "alto" ? "bg-red-100 text-red-700" :
                    p.risk_class === "moderado" ? "bg-yellow-100 text-yellow-700" :
                    "bg-green-100 text-green-700"
                  }`}>{p.risk_class}</span>
                </div>
                {p.description && <p className="text-sm text-gray-500 mb-2">{p.description}</p>}
                <div className="flex gap-2 mb-3">
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded">{p.category}</span>
                  <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded">{p.task_type}</span>
                </div>
                <pre className="text-xs bg-gray-50 rounded p-3 overflow-x-auto whitespace-pre-wrap text-gray-700">
                  {p.template_text}
                </pre>
              </div>
            ))}
          </div>
        ) : !prompts.isLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            Nenhum prompt cadastrado na biblioteca.
          </div>
        ) : null}
      </main>
    </>
  );
}
