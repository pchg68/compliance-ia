import { router } from "../trpc/init";
import { interactionRouter } from "./interaction";
import { riskRouter } from "./risk";
import { reportRouter } from "./report";

export const appRouter = router({
  interaction: interactionRouter,
  risk: riskRouter,
  report: reportRouter,
});

export type AppRouter = typeof appRouter;
