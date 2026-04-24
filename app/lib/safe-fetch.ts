import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// SSRF guard for outbound fetches against user-supplied URLs (recipe parsing,
// future ingestion paths). Rejects URLs whose hostname resolves to any
// non-public address: loopback, link-local (incl. cloud metadata
// 169.254.169.254), RFC1918, CGNAT, multicast/reserved, and the IPv6
// equivalents.
//
// Known limitation: a targeted DNS-rebinding attack could pass `assertSafeUrl`
// (lookup returns a public IP) and then resolve to a private IP at fetch time.
// Mitigating that fully requires resolving once and dialing by IP with a Host
// header, which is more invasive than is warranted here today.

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const MAX_REDIRECTS = 5;

export function isPrivateIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved / broadcast
    return false;
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true; // link-local
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // unique local fc00::/7
    if (lower.startsWith("ff")) return true; // multicast
    // IPv4-mapped IPv6 (::ffff:a.b.c.d)
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // unparseable → treat as unsafe
}

export async function assertSafeUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeUrlError("invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeUrlError("only http(s) URLs are allowed");
  }
  const host = parsed.hostname;
  if (!host) {
    throw new UnsafeUrlError("URL has no host");
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new UnsafeUrlError("URL points at a non-public address");
    }
    return;
  }
  let addresses;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError("hostname lookup failed");
  }
  if (addresses.length === 0) {
    throw new UnsafeUrlError("hostname did not resolve");
  }
  for (const a of addresses) {
    if (isPrivateIp(a.address)) {
      throw new UnsafeUrlError("URL resolves to a non-public address");
    }
  }
}

export type SafeFetchInit = Omit<RequestInit, "redirect"> & {
  maxRedirects?: number;
};

export async function safeFetch(
  url: string,
  init: SafeFetchInit = {}
): Promise<Response> {
  const max = init.maxRedirects ?? MAX_REDIRECTS;
  let current = url;
  for (let hop = 0; hop <= max; hop++) {
    await assertSafeUrl(current);
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) {
        throw new UnsafeUrlError("redirect with no Location header");
      }
      current = new URL(next, current).toString();
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError("too many redirects");
}
