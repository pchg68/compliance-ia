import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import type { Context } from "@/server/trpc/init";

function createContext(): Context {
  // TODO: extrair org_id e user_id do header/auth
  return { orgId: null, userId: null };
}

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
  });
}

export { handler as GET, handler as POST };
