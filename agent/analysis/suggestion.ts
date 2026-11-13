import { z } from "zod";

export const suggestionSchema = z.object({
  recommendation: z.string().trim().min(1),
  evidenceIds: z.array(z.string()).min(1),
});

export function parseSuggestion(value: unknown, sources: readonly { id: string }[]) {
  const suggestion = suggestionSchema.parse(value);
  const validIds = new Set(sources.map((source) => source.id));

  for (const id of suggestion.evidenceIds) {
    if (!validIds.has(id)) {
      throw new Error(`建议引用了不存在的来源：${id}`);
    }
  }
  return suggestion;
}
