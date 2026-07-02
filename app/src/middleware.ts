import { NextResponse, type NextRequest } from "next/server";

// Rotas públicas — sem verificação de cookie de sessão.
const PUBLIC_PATHS = ["/landing", "/api/trpc", "/_next", "/favicon.ico"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Passa rotas públicas sem verificar
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Verifica presença do cookie de sessão do Supabase.
  // O nome do cookie usa o padrão sb-<project-ref>-auth-token.
  const hasCookie = Array.from(request.cookies.getAll()).some(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );

  // Sem cookie: redireciona para landing (que exibe o LoginScreen via AuthGuard).
  // Não redireciona para /login dedicada porque o LoginScreen está embutido
  // no AuthGuard — evita page flicker de redirecionamento duplo.
  if (!hasCookie && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
