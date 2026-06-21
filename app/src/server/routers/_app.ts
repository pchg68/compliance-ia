import { router } from "../trpc/init";
import { interactionRouter } from "./interaction";

export const appRouter = router({
  interaction: interactionRouter,
});

export type AppRouter = typeof appRouter;
