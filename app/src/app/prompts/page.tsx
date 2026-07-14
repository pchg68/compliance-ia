"use client";

import { useState } from "react";
import { Nav, PageWrapper } from "../components/nav";
import { trpc } from "@/lib/trpc-client";
import { useAuth, useOrgId } from "@/lib/auth-context";

const ADMIN_ROLES = ["admin", "compliance", "developer"];

const CATEGORIES = ["pesquisa", "peticionamento", "contratos", "pareceres", "resumos", "revisao"];
const TASK_TYPES = ["pesquisa", "resumo", "peca", "contrato", "parecer", "revisao"];

function NovoPromptForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [taskType, setTaskType] = useState(TASK_TYPES[0]);
  const [riskClass, setRiskClass] = useState<"excessivo" | "alto" | "moderado" | "baixo">("moderado");
  const [templateText, setTemplateText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = trpc.prompt.create.useMutation({
    onSuccess: () => {
      setOpen(false);
      setTitle("");
      setDescription("");
      setTemplateText("");
      setError(null);
      onCreated();
    },
    onError: (e) => setError(e.message),
  });

  if (!open) {
    return (
      <div className="mb-6 flex justify-end">
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          + Novo prompt pré-aprovado
        </button>
      </div>
    );
  }

  // Variáveis {{nome}} são detectadas automaticamente do texto do template.
  const detectedVars = [...new Set([...templateText.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];

  return (
    <div className="mb-6 bg-white rounded-xl border border-gray-100 p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Novo prompt pré-aprovado</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-gray-400 hover:text-gray-600">
          Cancelar
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Título</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Pesquisa de jurisprudência sobre tema"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Descrição</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Quando usar este prompt"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Categoria</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Tipo de tarefa</label>
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            {TASK_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Classe de risco</label>
          <select
            value={riskClass}
            onChange={(e) => setRiskClass(e.target.value as typeof riskClass)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="baixo">baixo</option>
            <option value="moderado">moderado</option>
            <option value="alto">alto</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          Texto do template <span className="normal-case font-normal text-gray-400">(use {"{{variavel}}"} para campos)</span>
        </label>
        <textarea
          value={templateText}
          onChange={(e) => setTemplateText(e.target.value)}
          placeholder={"Pesquise a jurisprudência dominante do {{tribunal}} sobre {{tema}}, citando apenas precedentes que você possa referenciar com número de processo."}
          className="w-full border border-gray-200 rounded-lg p-3 text-sm min-h-[110px] focus:ring-2 focus:ring-blue-500 outline-none resize-y font-mono"
        />
        {detectedVars.length > 0 && (
          <p className="text-xs text-gray-500 mt-1.5">
            Variáveis detectadas: {detectedVars.map((v) => `{{${v}}}`).join(", ")}
          </p>
        )}
      </div>
      {error && (
        <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      <div className="flex justify-end">
        <button
          onClick={() =>
            create.mutate({
              title,
              description: description.trim() || null,
              category,
              task_type: taskType,
              risk_class: riskClass,
              template_text: templateText,
              variables: detectedVars.map((name) => ({ name })),
            })
          }
          disabled={title.trim().length < 3 || templateText.trim().length < 10 || create.isPending}
          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-60"
        >
          {create.isPending ? "Salvando..." : "Salvar prompt"}
        </button>
      </div>
    </div>
  );
}

export default function PromptsPage() {
  const orgId = useOrgId();
  const { me } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(me?.role ?? "");
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
          {isAdmin && <NovoPromptForm onCreated={() => prompts.refetch()} />}
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
