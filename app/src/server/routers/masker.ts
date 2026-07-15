import { z } from "zod/v4";
import { publicProcedure, router } from "../trpc/init";
import { unmaskPii } from "@/lib/pii-masker";
import { maskPiiWithNer } from "@/lib/pii-ner";

export const maskerRouter = router({
  mask: publicProcedure
    .input(z.object({ text: z.string() }))
    .mutation(async ({ input }) => {
      // Regex estruturado + NER de nomes/endereços (quando ANTHROPIC_API_KEY
      // configurada). NER indisponível → só regex, nunca bloqueia.
      const result = await maskPiiWithNer(input.text);
      return {
        masked: result.masked,
        token_map: result.tokenMap,
        match_count: result.matches.length,
        techniques: result.techniques,
        types_found: [...new Set(result.matches.map((m) => m.type))],
        ner_applied: result.ner_applied,
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
