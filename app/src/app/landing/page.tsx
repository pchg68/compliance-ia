"use client";

import Link from "next/link";

function Feature({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
        <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 leading-relaxed">{children}</p>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Topo */}
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">JG</div>
            <span className="font-bold text-gray-900">JurisOS Guard</span>
          </div>
          <Link href="/" className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors">
            Entrar
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Multas por jurisprudência inventada por IA já são realidade nos tribunais
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight max-w-3xl mx-auto">
            Use IA no escritório com prova de diligência — não com risco de multa.
          </h1>
          <p className="text-lg text-gray-600 mt-6 max-w-2xl mx-auto leading-relaxed">
            JurisOS Guard é a camada de governança que valida as citações das suas peças contra
            fontes oficiais e registra cada uso de IA numa trilha de auditoria imutável.
            Funciona por cima de qualquer IA — ChatGPT, Gemini, Jus IA.
          </p>
          <div className="flex items-center justify-center gap-3 mt-8">
            <Link href="/" className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
              Começar agora
            </Link>
            <a href="#como-funciona" className="px-6 py-3 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors">
              Como funciona
            </a>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Escopo honesto: entregamos evidência de diligência, não enquadramento estatutário.
          </p>
        </div>
      </section>

      {/* O problema */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="bg-slate-900 rounded-3xl p-10 text-white">
          <h2 className="text-2xl font-bold mb-3">A responsabilidade é de quem assina a peça.</h2>
          <p className="text-slate-300 max-w-2xl leading-relaxed">
            Em 2025 e 2026, advogados foram multados — e tiveram o caso comunicado à OAB — por
            citarem jurisprudência inexistente gerada por IA. A ferramenta não responde pela
            alucinação; o advogado responde. A defesa não é evitar a IA, é provar que houve
            conferência e supervisão.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <div>
              <p className="text-3xl font-bold text-blue-400">Citação</p>
              <p className="text-sm text-slate-400 mt-1">validada contra fonte oficial antes de protocolar</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-400">Trilha</p>
              <p className="text-sm text-slate-400 mt-1">imutável, com hash-chain verificável</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-400">Relatório</p>
              <p className="text-sm text-slate-400 mt-1">exportável como evidência para sócios e OAB</p>
            </div>
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-2">Três camadas de proteção</h2>
        <p className="text-gray-500 text-center mb-10">Do controle individual à prova institucional</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Feature icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" title="Validador de citações">
            Cada lei, súmula e processo citado é conferido contra DATAJUD/CNJ, LexML e súmulas
            oficiais do STJ/STF. O que não se confirma é marcado como não-verificável — nunca
            inventamos uma fonte.
          </Feature>
          <Feature icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" title="Trilha de auditoria imutável">
            Toda interação com IA entra numa cadeia de hash criptográfico que impede alteração
            retroativa. Transforma &quot;eu revisei&quot; em prova assinada de quando, por quem e com qual verificação.
          </Feature>
          <Feature icon="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" title="Relatório de conformidade">
            Dashboard para sócios e compliance, com relatório exportável que demonstra a governança
            do uso de IA no escritório perante a OAB, o cliente e auditores.
          </Feature>
        </div>
      </section>

      {/* Diferenciais */}
      <section className="bg-slate-50 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Independente da IA que você usa</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              JurisOS Guard não é mais um copiloto jurídico. É a camada de compliance do copiloto —
              funciona por cima do ChatGPT, do Gemini, do Jus IA ou de qualquer modelo. Você não
              troca de ferramenta; você ganha controle e prova sobre o uso de todas elas.
            </p>
            <ul className="space-y-2">
              {[
                "Mascaramento de dados pessoais na borda (LGPD)",
                "Classificação de risco mapeando a Recomendação OAB 001/2024",
                "Multi-jurisdição: Brasil e União Europeia (GDPR/AI Act)",
                "Controle de acesso por perfil (sócio, compliance, advogado)",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                  <svg className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-medium text-gray-700">Trilha de auditoria íntegra</span>
            </div>
            <div className="space-y-3 font-mono text-xs text-gray-500">
              <div className="flex justify-between"><span>seq #1042</span><span className="text-emerald-600">✓ hash verificado</span></div>
              <div className="flex justify-between"><span>art. 489 CPC</span><span className="text-emerald-600">confirmada</span></div>
              <div className="flex justify-between"><span>Súmula 7/STJ</span><span className="text-emerald-600">confirmada</span></div>
              <div className="flex justify-between"><span>REsp 9.999.999</span><span className="text-red-500">não localizada</span></div>
              <div className="flex justify-between"><span>checklist OAB</span><span className="text-emerald-600">aprovado</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold text-gray-900">Proteja seu escritório, seus clientes e sua reputação.</h2>
        <p className="text-gray-600 mt-3 max-w-xl mx-auto">
          Comece a registrar e validar o uso de IA hoje. A diligência que protege amanhã se constrói agora.
        </p>
        <Link href="/" className="inline-block mt-8 px-8 py-3.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
          Acessar a plataforma
        </Link>
      </section>

      {/* Rodapé */}
      <footer className="border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-[10px]">JG</div>
            <span>JurisOS Guard</span>
          </div>
          <p>Camada de governança e auditoria de IA jurídica. Evidência de diligência — não enquadramento estatutário.</p>
        </div>
      </footer>
    </div>
  );
}
