"use client";

import { useState } from "react";
import Link from "next/link";
import { Nav, PageWrapper } from "../components/nav";
import { trpc } from "@/lib/trpc-client";

/**
 * Fluxo completo de registro de uma interação com IA (Fase 1):
 * 1. Formulário: contexto + sinais de risco.
 * 2. Gate: mascaramento de PII + classificação de risco pela política ativa
 *    (proxy.forward). Bloqueado → encerra; senão → checklist ético.
 * 3. Atestação do checklist (Recomendação OAB 001/2024 ou AI Act, conforme
 *    jurisdição) → captura na trilha imutável → validação de citações.
 */

const TASK_TYPES = [
  { value: "pesquisa", label: "Pesquisa jurídica" },
  { value: "resumo", label: "Resumo de documento" },
  { value: "peca", label: "Peça processual" },
  { value: "contrato", label: "Contrato" },
  { value: "parecer", label: "Parecer" },
  { value: "revisao", label: "Revisão de texto" },
];

const PROVIDERS = ["anthropic", "openai", "google", "outro"];

const SENSITIVITY_OPTIONS = [
  { value: "pii", label: "Dados pessoais (PII)" },
  { value: "sensivel_lgpd", label: "Dados sensíveis (art. 5º, II, LGPD)" },
  { value: "segredo_justica", label: "Processo em segredo de justiça" },
];

interface ChecklistItemState {
  eixo: string;
  pergunta: string;
  automatico: boolean;
  resposta: boolean | null;
}

interface GateResult {
  blocked: boolean;
  reason?: string;
  risk_tier: string;
  risk_class?: string;
  decision: string;
  prompt_masked?: string;
  pii_masked: number;
  pii_types?: string[];
  controls?: string[];
  alerts_generated: number;
  policy_id?: string | null;
  checklist_items?: { eixo: string; pergunta: string; automatico: boolean }[];
}

interface DoneResult {
  seq: number;
  row_hash: string;
  approval_status: string | null;
  citations: {
    total: number;
    by_status: Record<string, number>;
  } | null;
}

const TIER_LABEL: Record<string, string> = {
  vedado: "Vedado (risco excessivo)",
  alto: "Alto",
  moderado: "Moderado",
  residual: "Residual (baixo)",
};

const DECISION_LABEL: Record<string, string> = {
  block: "Bloquear",
  require_approval: "Exige aprovação de sócio",
  allow_with_masking: "Permitido com mascaramento",
  allow: "Permitido",
};

const EIXO_LABEL: Record<string, string> = {
  legislacao: "Legislação e jurisprudência",
  confidencialidade: "Confidencialidade",
  etica: "Ética e supervisão",
  comunicacao: "Comunicação com o cliente",
};

export default function RegistrarPage() {
  const [step, setStep] = useState<"form" | "blocked" | "checklist" | "done">("form");

  // Formulário
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("");
  const [taskType, setTaskType] = useState("pesquisa");
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [sensitivity, setSensitivity] = useState<string[]>([]);
  const [legalEffect, setLegalEffect] = useState(false);
  const [autonomy, setAutonomy] = useState<"com_revisao" | "sem_revisao">("com_revisao");
  const [providerPosture, setProviderPosture] = useState<"aprovado" | "nao_aprovado">("aprovado");
  const [clientProibeIa, setClientProibeIa] = useState(false);

  // Resultado do gate + checklist
  const [gate, setGate] = useState<GateResult | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItemState[]>([]);
  const [done, setDone] = useState<DoneResult | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const forward = trpc.proxy.forward.useMutation();
  const mask = trpc.masker.mask.useMutation();
  const capture = trpc.interaction.capture.useMutation();
  const submitChecklist = trpc.risk.submitChecklist.useMutation();
  const validateCitations = trpc.citation.validate.useMutation();

  function toggleSensitivity(value: string) {
    setSensitivity((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  async function avaliarRisco() {
    setFlowError(null);
    try {
      const result = (await forward.mutateAsync({
        provider,
        model: model.trim() || "desconhecido",
        prompt,
        task_type: taskType,
        signals: {
          data_sensitivity: sensitivity,
          legal_effect: legalEffect,
          autonomy,
          provider_posture: providerPosture,
          client_constraints: clientProibeIa ? ["proibe_ia"] : [],
          injection_flags: [],
        },
      })) as GateResult;

      setGate(result);
      if (result.blocked) {
        setStep("blocked");
        return;
      }
      setChecklist(
        (result.checklist_items ?? []).map((item) => ({
          ...item,
          // Itens automáticos: o mascaramento de PII acabou de rodar no gate;
          // a conferência de citações roda na etapa final (citation.validate).
          resposta: item.automatico ? true : null,
        }))
      );
      setStep("checklist");
    } catch (e) {
      setFlowError(e instanceof Error ? e.message : "Falha ao avaliar o risco.");
    }
  }

  async function registrar() {
    if (!gate) return;
    if (!gate.policy_id) {
      setFlowError("A organização não tem política ativa — configure a jurisdição em Configurações.");
      return;
    }
    setFlowError(null);
    setRegistering(true);
    try {
      // Mascarar na borda (mesma função determinística usada no gate) — o núcleo
      // rejeita capture com PII residual (verificação fail-closed no servidor).
      const promptMask = await mask.mutateAsync({ text: prompt });
      const respMask = response.trim()
        ? await mask.mutateAsync({ text: response })
        : null;

      const checklistPassed =
        checklist.length === 0 || checklist.every((i) => i.resposta === true);

      const cap = await capture.mutateAsync({
        provider,
        model: model.trim() || "desconhecido",
        task_type: taskType,
        risk_class: (gate.risk_class ?? "alto") as "excessivo" | "alto" | "moderado" | "baixo",
        prompt_original: prompt,
        prompt_masked: promptMask.masked,
        response_original: response.trim() || null,
        response_masked: respMask?.masked ?? null,
        policy_id: gate.policy_id,
        decision: gate.decision as "allow" | "allow_with_masking" | "require_approval" | "block",
        pii_technique: { ...promptMask.techniques, ...(respMask?.techniques ?? {}) },
        checklist_passed: checklistPassed,
        citations: null,
      });

      let approvalStatus: string | null = null;
      if (checklist.length > 0) {
        const sub = await submitChecklist.mutateAsync({
          interaction_id: cap.id,
          items: checklist.map((i) => ({
            eixo: i.eixo,
            pergunta: i.pergunta,
            resposta: i.resposta === true,
            automatico: i.automatico,
          })),
          needs_approval: gate.decision === "require_approval",
        });
        approvalStatus = sub.approval_status;
      }

      let citations: DoneResult["citations"] = null;
      if (response.trim()) {
        const cit = await validateCitations.mutateAsync({
          interaction_id: cap.id,
          response_text: response,
        });
        citations = { total: cit.total, by_status: cit.by_status };
      }

      setDone({ seq: cap.seq, row_hash: cap.row_hash, approval_status: approvalStatus, citations });
      setStep("done");
    } catch (e) {
      setFlowError(e instanceof Error ? e.message : "Falha ao registrar a interação.");
    } finally {
      setRegistering(false);
    }
  }

  function reiniciar() {
    setStep("form");
    setGate(null);
    setChecklist([]);
    setDone(null);
    setFlowError(null);
    setPrompt("");
    setResponse("");
  }

  const checklistCompleto = checklist.every((i) => i.resposta !== null);

  return (
    <>
      <Nav />
      <PageWrapper>
        <header className="bg-white border-b border-gray-100 px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Registrar Interação</h1>
          <p className="text-sm text-gray-500 mt-1">
            Avaliação de risco, checklist ético e registro na trilha de auditoria imutável
          </p>
        </header>

        <main className="px-8 py-6 max-w-3xl space-y-6">
          {/* Indicador de etapas */}
          <div className="flex items-center gap-2 text-xs font-medium">
            {["Contexto e risco", "Checklist ético", "Registro na trilha"].map((label, i) => {
              const current =
                step === "form" ? 0 : step === "checklist" ? 1 : step === "done" ? 2 : 0;
              const active = i <= current && step !== "blocked";
              return (
                <div key={label} className="flex items-center gap-2">
                  {i > 0 && <div className="w-8 h-px bg-gray-200" />}
                  <span
                    className={`px-3 py-1.5 rounded-full ${
                      active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {i + 1}. {label}
                  </span>
                </div>
              );
            })}
          </div>

          {flowError && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">
              {flowError}
            </div>
          )}

          {/* ETAPA 1 — Formulário */}
          {step === "form" && (
            <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Provedor
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Modelo
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="claude-sonnet-5"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Tipo de tarefa
                  </label>
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {TASK_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Prompt enviado ao modelo
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm min-h-[110px] focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                  placeholder="Cole aqui o prompt. PII (CPF, e-mail, telefone, nº de processo...) será mascarado automaticamente antes do registro."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Resposta do modelo <span className="normal-case font-normal text-gray-400">(opcional — citações serão validadas)</span>
                </label>
                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg p-3 text-sm min-h-[110px] focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                  placeholder="Cole a resposta gerada. Citações a leis, súmulas e processos serão verificadas contra fontes oficiais."
                />
              </div>

              <fieldset className="border-t border-gray-100 pt-4">
                <legend className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Sinais de risco
                </legend>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5 text-sm text-gray-700">
                  {SENSITIVITY_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sensitivity.includes(opt.value)}
                        onChange={() => toggleSensitivity(opt.value)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {opt.label}
                    </label>
                  ))}
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={legalEffect}
                      onChange={(e) => setLegalEffect(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Produz efeito jurídico (peça, contrato, parecer)
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={clientProibeIa}
                      onChange={(e) => setClientProibeIa(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Cliente proíbe uso de IA (cláusula contratual)
                  </label>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Revisão humana
                    </label>
                    <select
                      value={autonomy}
                      onChange={(e) => setAutonomy(e.target.value as typeof autonomy)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="com_revisao">Com revisão humana</option>
                      <option value="sem_revisao">Sem revisão humana</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                      Postura do provedor
                    </label>
                    <select
                      value={providerPosture}
                      onChange={(e) => setProviderPosture(e.target.value as typeof providerPosture)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="aprovado">Aprovado pelo escritório</option>
                      <option value="nao_aprovado">Não aprovado</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              <div className="flex justify-end pt-2">
                <button
                  onClick={avaliarRisco}
                  disabled={prompt.trim().length < 10 || forward.isPending}
                  className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-60 flex items-center gap-2"
                >
                  {forward.isPending && (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {forward.isPending ? "Avaliando risco..." : "Avaliar risco e prosseguir"}
                </button>
              </div>
            </div>
          )}

          {/* ETAPA — Bloqueado */}
          {step === "blocked" && gate && (
            <div className="bg-white rounded-xl border border-red-200 p-8 shadow-sm text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-red-50 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <h2 className="font-semibold text-gray-900 mb-2">Interação bloqueada pelo motor de risco</h2>
              <p className="text-sm text-gray-600 mb-1">
                Classificação: <strong>{TIER_LABEL[gate.risk_tier] ?? gate.risk_tier}</strong>
              </p>
              <p className="text-sm text-gray-500 mb-6">
                O bloqueio e {gate.alerts_generated} alerta(s) foram registrados para a equipe de compliance.
              </p>
              <button
                onClick={reiniciar}
                className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
              >
                Voltar ao início
              </button>
            </div>
          )}

          {/* ETAPA 2 — Checklist */}
          {step === "checklist" && gate && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    gate.risk_tier === "alto" ? "bg-orange-100 text-orange-700" :
                    gate.risk_tier === "moderado" ? "bg-yellow-100 text-yellow-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    Risco: {TIER_LABEL[gate.risk_tier] ?? gate.risk_tier}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                    {DECISION_LABEL[gate.decision] ?? gate.decision}
                  </span>
                  <span className="text-xs text-gray-500">
                    {gate.pii_masked > 0
                      ? `${gate.pii_masked} dado(s) pessoal(is) mascarado(s): ${(gate.pii_types ?? []).join(", ")}`
                      : "Nenhum PII estruturado detectado"}
                  </span>
                </div>
                {gate.prompt_masked && gate.pii_masked > 0 && (
                  <pre className="mt-3 text-xs bg-slate-50 rounded-lg p-3 whitespace-pre-wrap text-gray-600 border border-slate-100 max-h-32 overflow-y-auto">
                    {gate.prompt_masked}
                  </pre>
                )}
              </div>

              {checklist.length > 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/50">
                    <h2 className="font-semibold text-gray-900 text-sm">Checklist ético</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Atestação exigida pelo nível de risco — fica registrada na trilha como evidência de diligência.
                    </p>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {checklist.map((item, i) => (
                      <div key={i} className="px-6 py-4 flex items-start gap-4">
                        <div className="flex-1">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">
                            {EIXO_LABEL[item.eixo] ?? item.eixo}
                          </p>
                          <p className="text-sm text-gray-800 mt-0.5">{item.pergunta}</p>
                          {item.automatico && (
                            <p className="text-xs text-emerald-600 mt-1">Verificado automaticamente pela plataforma</p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() =>
                              setChecklist((prev) =>
                                prev.map((p, j) => (j === i ? { ...p, resposta: true } : p))
                              )
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              item.resposta === true
                                ? "bg-emerald-600 text-white"
                                : "bg-gray-100 text-gray-500 hover:bg-emerald-50 hover:text-emerald-700"
                            }`}
                          >
                            Sim
                          </button>
                          <button
                            onClick={() =>
                              setChecklist((prev) =>
                                prev.map((p, j) => (j === i ? { ...p, resposta: false } : p))
                              )
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              item.resposta === false
                                ? "bg-red-600 text-white"
                                : "bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-700"
                            }`}
                          >
                            Não
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm text-sm text-gray-600">
                  Risco residual — nenhum item de checklist é exigido; a interação será apenas registrada.
                </div>
              )}

              <div className="flex justify-between items-center">
                <button
                  onClick={reiniciar}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  ← Cancelar
                </button>
                <button
                  onClick={registrar}
                  disabled={!checklistCompleto || registering}
                  className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-60 flex items-center gap-2"
                >
                  {registering && (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {registering ? "Registrando na trilha..." : "Atestar e registrar na trilha"}
                </button>
              </div>
            </div>
          )}

          {/* ETAPA 3 — Concluído */}
          {step === "done" && done && (
            <div className="bg-white rounded-xl border border-emerald-200 p-8 shadow-sm">
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="font-semibold text-gray-900">Interação registrada na trilha imutável</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Registro nº <strong>{done.seq}</strong> — hash{" "}
                  <span className="font-mono text-xs">{done.row_hash.slice(0, 16)}…</span>
                </p>
                {done.approval_status === "pendente" && (
                  <p className="text-sm text-purple-700 bg-purple-50 rounded-lg px-3 py-2 mt-3 inline-block">
                    Checklist enviado para aprovação de um perfil administrativo.
                  </p>
                )}
              </div>

              {done.citations && done.citations.total > 0 && (
                <div className="border-t border-gray-100 pt-4 mb-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                    Citações validadas contra fontes oficiais
                  </h3>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span><strong className="text-emerald-600">{done.citations.by_status.confirmada ?? 0}</strong> confirmadas</span>
                    <span><strong className="text-red-600">{done.citations.by_status.nao_localizada ?? 0}</strong> não localizadas</span>
                    <span><strong className="text-orange-600">{done.citations.by_status.desatualizada ?? 0}</strong> desatualizadas</span>
                    <span><strong className="text-gray-500">{done.citations.by_status.nao_verificavel ?? 0}</strong> não verificáveis</span>
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-3">
                <Link
                  href="/interacoes"
                  className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Ver trilha de auditoria
                </Link>
                <button
                  onClick={reiniciar}
                  className="px-5 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Registrar outra
                </button>
              </div>
            </div>
          )}
        </main>
      </PageWrapper>
    </>
  );
}
