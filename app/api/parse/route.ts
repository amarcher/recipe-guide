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
    const status = /ANTHROPIC_API_KEY/.test(msg) ? 500 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
