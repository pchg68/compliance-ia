"use client";

import { useState } from "react";
import { Nav, PageWrapper } from "../components/nav";
import { trpc } from "@/lib/trpc-client";
import { useAuth } from "@/lib/auth-context";

const ADMIN_ROLES = ["admin", "compliance", "developer"];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  compliance: "Compliance",
  developer: "Desenvolvedor",
  member: "Membro",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-50 text-red-700",
  compliance: "bg-purple-50 text-purple-700",
  developer: "bg-blue-50 text-blue-700",
  member: "bg-gray-100 text-gray-600",
};

export default function EquipePage() {
  const { me } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(me?.role ?? "");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin" | "compliance" | "developer">("member");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const users = trpc.onboarding.listUsers.useQuery();
  const invite = trpc.onboarding.inviteUser.useMutation({
    onSuccess: (data) => {
      setSuccess(`${data.email} adicionado como ${ROLE_LABELS[data.role]}.`);
      setEmail("");
      users.refetch();
    },
    onError: (e) => setError(e.message),
  });

  const updateRole = trpc.onboarding.updateRole.useMutation({
    onSuccess: () => users.refetch(),
  });

  return (
    <>
      <Nav />
      <PageWrapper>
        <header className="bg-white border-b border-gray-100 px-8 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Equipe</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie os membros e perfis de acesso do escritório</p>
        </header>

        <main className="px-8 py-6 space-y-6">
          {/* Convidar usuário — restrito a admin/compliance/developer */}
          {isAdmin && (
          <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Adicionar membro</h2>
            <div className="flex gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); setSuccess(null); }}
                placeholder="email@escritorio.com.br"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as typeof role)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="member">Membro</option>
                <option value="compliance">Compliance</option>
                <option value="admin">Administrador</option>
                <option value="developer">Desenvolvedor</option>
              </select>
              <button
                onClick={() => invite.mutate({ email, role })}
                disabled={!email || invite.isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {invite.isPending ? "Adicionando..." : "Adicionar"}
              </button>
            </div>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            {success && <p className="text-sm text-green-600 mt-2">{success}</p>}
            <p className="text-xs text-gray-400 mt-3">
              O usuário receberá acesso ao painel ao fazer login com este e-mail.
            </p>
          </div>
          )}

          {/* Lista de usuários */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 text-sm">Membros</h2>
              {users.data && (
                <span className="text-xs text-gray-400">{users.data.length} membro(s)</span>
              )}
            </div>

            {users.isLoading && (
              <div className="p-8 text-center text-gray-400 text-sm">Carregando...</div>
            )}

            {users.data && users.data.length > 0 && (
              <div className="divide-y divide-gray-50">
                {users.data.map((u: { id: string; email: string; role: string; created_at: string }) => (
                  <div key={u.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-500 shrink-0">
                      {u.email.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{u.email}</p>
                      <p className="text-xs text-gray-400">
                        Desde {new Date(u.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    {isAdmin ? (
                      <select
                        value={u.role}
                        onChange={(e) => updateRole.mutate({ user_id: u.id, role: e.target.value as "member" | "admin" | "compliance" | "developer" })}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        <option value="member">Membro</option>
                        <option value="compliance">Compliance</option>
                        <option value="admin">Administrador</option>
                        <option value="developer">Desenvolvedor</option>
                      </select>
                    ) : (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-600"}`}>
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    )}
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
