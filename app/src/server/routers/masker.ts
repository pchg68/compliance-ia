import { z } from "zod/v4";
import { publicProcedure, router } from "../trpc/init";
import { maskPii, unmaskPii } from "@/lib/pii-masker";

export const maskerRouter = router({
  mask: publicProcedure
    .input(z.object({ text: z.string() }))
    .mutation(({ input }) => {
      const result = maskPii(input.text);
      return {
        masked: result.masked,
        token_map: result.tokenMap,
        match_count: result.matches.length,
        techniques: result.techniques,
        types_found: [...new Set(result.matches.map((m) => m.type))],
      };
    }),

  unmask: publicProcedure
    .input(
      z.object({
        masked: z.string(),
        token_map: z.record(z.string(), z.string()),
      })
    )
    .mutation(({ input }) => {
      return { original: unmaskPii(input.masked, input.token_map) };
    }),
});
