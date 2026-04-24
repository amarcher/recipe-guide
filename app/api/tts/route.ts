import { NextRequest, NextResponse } from "next/server";

// Prototype TTS proxy for the Cast speaker integration. Streams audio/mpeg
// from Google Translate's TTS endpoint. This endpoint is not a documented
// public API and can break without warning; it's fine for personal kitchen
// use but swap for a real provider (ElevenLabs, Google Cloud TTS, Polly)
// before relying on this in production.

export const runtime = "nodejs";

const CHUNK = 180; // Translate TTS rejects strings longer than ~200 chars.
const MAX_TEXT = 1500; // Cap inbound payload to limit upstream cost / abuse.

function chunks(text: string): string[] {
  const out: string[] = [];
  let cur = text.trim();
  while (cur.length > CHUNK) {
    let split = cur.lastIndexOf(" ", CHUNK);
    if (split < 40) split = CHUNK;
    out.push(cur.slice(0, split));
    cur = cur.slice(split).trim();
  }
  if (cur) out.push(cur);
  return out;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q) return new NextResponse("missing q", { status: 400 });
  if (q.length > MAX_TEXT) {
    return new NextResponse("q too long", { status: 413 });
  }
  const lang = req.nextUrl.searchParams.get("lang") ?? "en";

  // Fetch each chunk and concatenate; Cast receivers accept a single media
  // URL, so we can't stream multiple sources in one request.
  const parts = chunks(q);
  const buffers: Uint8Array[] = [];
  for (let i = 0; i < parts.length; i++) {
    const url =
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob` +
      `&tl=${encodeURIComponent(lang)}&total=${parts.length}&idx=${i}` +
      `&textlen=${parts[i].length}&q=${encodeURIComponent(parts[i])}`;
    const upstream = await fetch(url, {
      headers: {
        // Translate TTS checks the UA; a browser-style UA gets through.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        Accept: "audio/mpeg",
      },
    });
    if (!upstream.ok) {
      return new NextResponse(`upstream ${upstream.status}`, {
        status: 502,
      });
    }
    buffers.push(new Uint8Array(await upstream.arrayBuffer()));
  }

  const total = buffers.reduce((n, b) => n + b.byteLength, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const b of buffers) {
    merged.set(b, off);
    off += b.byteLength;
  }

  return new NextResponse(merged, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
