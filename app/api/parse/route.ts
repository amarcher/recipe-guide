import { NextRequest, NextResponse } from "next/server";
import { parseRecipeUrl } from "@/app/lib/parser";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let url: string;
  try {
    const body = await req.json();
    url = String(body?.url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "Provide a valid http(s) URL." },
      { status: 400 }
    );
  }

  try {
    const { card, cached } = await parseRecipeUrl(url);
    return NextResponse.json(card, {
      headers: { "X-Cache": cached ? "HIT" : "MISS" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown parse error";
    console.error("[api/parse] failed:", url, msg);
    // 4xx so Cloudflare passes our JSON body through to the client; CF
    // intercepts 5xx responses and replaces them with its own HTML error page.
    const status = /ANTHROPIC_API_KEY/.test(msg) ? 500 : 422;
    return NextResponse.json({ error: msg }, { status });
  }
}
