"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc-client";

interface MeData {
  user_id: string;
  org_id: string;
  role: string | null;
  email: string | null;
}

interface AuthState {
  session: Session | null;
  me: MeData | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Resolve org/role no servidor quando há sessão
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: !!session,
    retry: false,
  });

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
  }, []);

  const loading = sessionLoading || (!!session && meQuery.isLoading);

  return (
    <AuthContext.Provider
      value={{
        session,
        me: meQuery.data ?? null,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}

/**
 * Retorna o org_id do usuário logado. Dentro de páginas protegidas pelo
 * AuthGuard, `me` está sempre presente; fora dele, retorna string vazia.
 */
export function useOrgId(): string {
  const { me } = useAuth();
  return me?.org_id ?? "";
}

/** Guarda de rota: exige login + vínculo a um escritório. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, me, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (!me) {
    return <NoOrgScreen email={session.user.email ?? ""} />;
  }

  return <>{children}</>;
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fn =
        mode === "signin"
          ? supabase.auth.signInWithPassword({ email, password })
          : supabase.auth.signUp({ email, password });
      const { error } = await fn;
      if (error) setError(error.message);
    } catch {
      setError("Falha ao autenticar. Verifique a conexão.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xl mb-4">
            JG
          </div>
          <h1 className="text-2xl font-bold text-white">JurisOS Guard</h1>
          <p className="text-sm text-slate-400 mt-1">Governança e auditoria de IA jurídica</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            {mode === "signin" ? "Entrar" : "Criar conta"}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {mode === "signin"
              ? "Acesse o painel de conformidade do seu escritório"
              : "Cadastre-se para começar"}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                E-mail
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="voce@escritorio.com.br"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Senha
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 text-white text-sm font-medium rounded-lg py-2.5 hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {submitting ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            {mode === "signin" ? (
              <>
                Não tem conta?{" "}
                <button onClick={() => { setMode("signup"); setError(null); }} className="text-blue-600 font-medium hover:underline">
                  Criar conta
                </button>
              </>
            ) : (
              <>
                Já tem conta?{" "}
                <button onClick={() => { setMode("signin"); setError(null); }} className="text-blue-600 font-medium hover:underline">
                  Entrar
                </button>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Acesso restrito a profissionais autorizados do escritório.
        </p>
      </div>
    </div>
  );
}

function NoOrgScreen({ email }: { email: string }) {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="font-semibold text-gray-900 mb-2">Conta sem vínculo a um escritório</h2>
        <p className="text-sm text-gray-500 mb-6">
          O e-mail <strong>{email}</strong> está autenticado, mas ainda não foi associado a um escritório no JurisOS Guard.
          Solicite ao administrador da sua organização que vincule seu acesso.
        </p>
        <button
          onClick={signOut}
          className="text-sm text-blue-600 font-medium hover:underline"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
