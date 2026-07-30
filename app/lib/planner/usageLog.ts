import { neon } from "@neondatabase/serverless";
import type { LanguageModel } from "ai";

// Same fire-and-forget dashboard logging as app/lib/parser.ts, shaped for
// AI SDK call results (usage.inputTokens/outputTokens).
export function logPlannerUsage(
  endpoint: string,
  model: LanguageModel,
  usage: { inputTokens?: number; outputTokens?: number },
  metadata: Record<string, unknown> = {}
) {
  const dbUrl = process.env.DASHBOARD_DATABASE_URL;
  if (!dbUrl) {
    console.warn(`[${endpoint}] DASHBOARD_DATABASE_URL not set; usage not logged`);
    return;
  }
  const sql = neon(dbUrl);
  const modelId = typeof model === "string" ? model : model.modelId;
  sql`INSERT INTO api_usage (project, service, endpoint, tokens_in, tokens_out, model, metadata)
    VALUES ('recipe-guide', 'anthropic', ${endpoint}, ${usage.inputTokens ?? 0}, ${usage.outputTokens ?? 0}, ${modelId}, ${JSON.stringify(metadata)})`.catch(
    (e) => console.error(`[${endpoint}] usage log failed:`, e)
  );
}
