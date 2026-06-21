import { initTRPC } from "@trpc/server";
import superjson from "superjson";

export interface Context {
  orgId: string | null;
  userId: string | null;
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
