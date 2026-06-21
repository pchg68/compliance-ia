import { router } from "../trpc/init";
import { interactionRouter } from "./interaction";
import { riskRouter } from "./risk";
import { reportRouter } from "./report";
import { promptRouter } from "./prompt";

export const appRouter = router({
  interaction: interactionRouter,
  risk: riskRouter,
  report: reportRouter,
  prompt: promptRouter,
});

export type AppRouter = typeof appRouter;
