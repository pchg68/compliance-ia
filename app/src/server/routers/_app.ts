import { router } from "../trpc/init";
import { interactionRouter } from "./interaction";
import { riskRouter } from "./risk";

export const appRouter = router({
  interaction: interactionRouter,
  risk: riskRouter,
});

export type AppRouter = typeof appRouter;
