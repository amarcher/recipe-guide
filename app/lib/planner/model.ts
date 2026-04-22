import { anthropic } from "@ai-sdk/anthropic";

// Single entry-point so the provider choice stays in one place. The Vercel
// session context prefers `"provider/model"` strings through the AI Gateway,
// but this app already has ANTHROPIC_API_KEY wired for /api/parse — keeping
// the direct Anthropic provider avoids requiring a new credential to ship.
// Switching to the gateway later is a one-line change here.
export const plannerModel = anthropic("claude-opus-4-7");

// Lighter model for the intake chat — lower latency, enough capability for
// the "thoughtful friend" conversation quality we want.
export const intakeChatModel = anthropic("claude-sonnet-4-6");
