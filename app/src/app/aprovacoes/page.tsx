"use client";

import { useState } from "react";
import { Nav, PageWrapper } from "../components/nav";
import { trpc } from "@/lib/trpc-client";
import { useAuth } from "@/lib/auth-context";

const ADMIN_ROLES = ["admin", "compliance", "developer"];

const EIXO_LABEL: Record<string, string> = {
  legislacao: "Legislação e jurisprudência",
  confidencialidade: "Confidencialidade",
  etica: "Ética e supervisão",
  comunicacao: "Comunicação com o cliente",
};

interface PendingItem {
  id: string;
  interaction_id: string;
  items: { eixo: string; pergunta: string; resposta: boolean | string; automatico: boolean }[];
  attested_by_email: string | null;
  seq: number;
  provider: string;
  model: string;
  task_type: string;
  risk_class: string;
  decision: string;
  prompt_masked: string;
  created_at: string;
}

export default function AprovacoesPage() {
  const { me } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(me?.role ?? "");
  const [expanded, setExpanded] = useState<string | null>(null);

  const pending = trpc.risk.listPendingChecklists.useQuery(undefined, { enabled: isAdmin });
  const approve = trpc.risk.approveChecklist.useMutation({
    onSuccess: () => pending.refetch(),
  });

  if (!isAdmin) {
    return (
      <>
        <Nav />
        <PageWrapper>
          <div className="min-h-screen flex items-center justify-center px-8">
            <div className="bg-white rounded-xl border border-gray-100 p-10 text-center shadow-sm max-w-md">
              <h2 className="font-semibold text-gray-900 mb-2">Acesso restrito</h2>
              <p className="text-sm text-gray-500">
                A fila de aprovação é visível apenas para perfis administrativos
                (admin, compliance ou desenvolvedor).
              </p>
            </div>
          </div>
        </PageWrapper>
      </>
    );
  }

  const rows = (pending.data ?? []) as PendingItem[];

  return (
    <>
      <Nav />
      <PageWrapper>
        <header className="bg-white border-b border-gray-100 px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Aprovações Pendentes</h1>
              <p className="text-sm text-gray-500 mt-1">
                Supervisão de sócio exigida pelo gate de risco — OAB/SP: sócios devem garantir supervisão
              </p>
            </div>
            {rows.length > 0 && (
              <span className="px-3 py-1.5 rounded-full text-sm font-semibold bg-purple-50 text-purple-700">
                {rows.length} pendente(s)
              </span>
            )}
          </div>
        </header>

        <main className="px-8 py-6 space-y-4 max-w-4xl">
          {pending.isLoading && (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
              Carregando...
            </div>
          )}

          {!pending.isLoading && rows.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-12 text-center shadow-sm">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-700 mb-2">Nenhuma aprovação pendente</h3>
              <p className="text-sm text-gray-500">
                Interações de alto risco aparecem aqui até um sócio decidir.
              </p>
            </div>
          )}

          {rows.map((row) => (
            <div key={row.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs font-semibold text-gray-500">#{row.seq}</span>
                <span className="text-sm font-medium text-gray-900">{row.task_type}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  row.risk_class === "excessivo" ? "bg-red-100 text-red-700" :
                  row.risk_class === "alto" ? "bg-orange-100 text-orange-700" :
                  "bg-yellow-100 text-yellow-700"
                }`}>
                  {row.risk_class}
                </span>
                <span className="text-xs text-gray-400">
                  {row.provider} · {row.model}
                </span>
                <span className="text-xs text-gray-400 ml-auto">
                  Atestado por {row.attested_by_email ?? "—"} em{" "}
                  {new Date(row.created_at).toLocaleString("pt-BR")}
                </span>
              </div>

              {/* Prompt mascarado — colapsado por padrão (conteúdo denso) */}
              <div className="px-6 pb-3">
                <button
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {expanded === row.id ? "Ocultar detalhes" : "Ver prompt mascarado e checklist atestado"}
                </button>
                {expanded === row.id && (
                  <div className="mt-3 space-y-3">
                    <pre className="text-xs bg-slate-50 rounded-lg p-3 whitespace-pre-wrap text-gray-600 border border-slate-100 max-h-40 overflow-y-auto">
                      {row.prompt_masked}
                    </pre>
                    <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                      {row.items.map((item, i) => (
                        <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                          <span className={`shrink-0 w-2 h-2 rounded-full ${
                            item.resposta === true ? "bg-emerald-500" : "bg-red-500"
                          }`} />
                          <div className="flex-1">
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 block">
                              {EIXO_LABEL[item.eixo] ?? item.eixo}
                            </span>
                            <span className="text-gray-700">{item.pergunta}</span>
                          </div>
                          <span className={`text-xs font-semibold ${
                            item.resposta === true ? "text-emerald-600" : "text-red-600"
                          }`}>
                            {item.resposta === true ? "Sim" : "Não"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-3 bg-gray-50/50 border-t border-gray-100 flex items-center justify-end gap-2">
                <button
                  onClick={() => approve.mutate({ checklist_id: row.id, status: "bloqueado" })}
                  disabled={approve.isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-red-200 text-red-700 hover:bg-red-50 transition-colors disabled:opacity-60"
                >
                  Bloquear
                </button>
                <button
                  onClick={() => approve.mutate({ checklist_id: row.id, status: "ressalva" })}
                  disabled={approve.isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-white border border-amber-200 text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-60"
                >
                  Aprovar com ressalva
                </button>
                <button
                  onClick={() => approve.mutate({ checklist_id: row.id, status: "aprovado" })}
                  disabled={approve.isPending}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-60"
                >
                  Aprovar
                </button>
              </div>
            </div>
          ))}
        </main>
      </PageWrapper>
    </>
  );
}
