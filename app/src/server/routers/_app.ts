import { router } from "../trpc/init";
import { interactionRouter } from "./interaction";
import { riskRouter } from "./risk";
import { reportRouter } from "./report";
import { promptRouter } from "./prompt";
import { alertRouter } from "./alert";
import { maskerRouter } from "./masker";

export const appRouter = router({
  interaction: interactionRouter,
  risk: riskRouter,
  report: reportRouter,
  prompt: promptRouter,
  alert: alertRouter,
  masker: maskerRouter,
});

export type AppRouter = typeof appRouter;
