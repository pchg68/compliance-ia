"use client";

import { useState } from "react";
import { Nav } from "../components/nav";
import { trpc } from "@/lib/trpc-client";

export default function CitacoesPage() {
  const [text, setText] = useState("");
  const extract = trpc.citation.extract.useQuery(
    { text },
    { enabled: text.length > 10 }
  );

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full">
        <h1 className="text-2xl font-bold mb-6">Validador de Citações</h1>

        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cole o texto para extrair citações jurídicas:
          </label>
          <textarea
            className="w-full border border-gray-300 rounded-lg p-3 text-sm min-h-[120px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="Ex.: Conforme art. 489 do CPC e Súmula 7/STJ, o REsp 1.234.567/SP decidiu..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        {extract.data && extract.data.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-3">Citação</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Chave canônica</th>
                </tr>
              </thead>
              <tbody>
                {extract.data.map((c: {
                  raw_text: string; cite_type: string; canonical_key: string | null;
                }, i: number) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-4 py-3 font-medium">{c.raw_text}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700">{c.cite_type}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {c.canonical_key ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {extract.data && extract.data.length === 0 && text.length > 10 && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            Nenhuma citação jurídica encontrada no texto.
          </div>
        )}
      </main>
    </>
  );
}
