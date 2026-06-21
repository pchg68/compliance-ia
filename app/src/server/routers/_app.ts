import { router } from "../trpc/init";
import { interactionRouter } from "./interaction";
import { riskRouter } from "./risk";
import { reportRouter } from "./report";
import { promptRouter } from "./prompt";
import { alertRouter } from "./alert";
import { maskerRouter } from "./masker";
import { citationRouter } from "./citation";
import { anchorRouter } from "./anchor";
import { dashboardRouter } from "./dashboard";
import { proxyRouter } from "./proxy";
import { jurisdictionRouter } from "./jurisdiction";

export const appRouter = router({
  interaction: interactionRouter,
  risk: riskRouter,
  report: reportRouter,
  prompt: promptRouter,
  alert: alertRouter,
  masker: maskerRouter,
  citation: citationRouter,
  anchor: anchorRouter,
  dashboard: dashboardRouter,
  proxy: proxyRouter,
  jurisdiction: jurisdictionRouter,
});

export type AppRouter = typeof appRouter;
