import { router, protectedProcedure } from "../trpc/init";

export const authRouter = router({
  /** Retorna o usuário autenticado e seu vínculo com o escritório. */
  me: protectedProcedure.query(({ ctx }) => {
    return {
      user_id: ctx.userId,
      org_id: ctx.orgId,
      role: ctx.role,
      email: ctx.email,
    };
  }),
});
