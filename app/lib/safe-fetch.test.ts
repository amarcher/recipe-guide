import { describe, it, expect } from "vitest";
import { isPrivateIp, assertSafeUrl, UnsafeUrlError } from "./safe-fetch";

describe("isPrivateIp", () => {
  it("flags IPv4 loopback", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("127.255.0.1")).toBe(true);
  });

  it("flags IPv4 RFC1918 ranges", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("10.255.255.255")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("192.168.0.1")).toBe(true);
    expect(isPrivateIp("192.168.255.255")).toBe(true);
  });

  it("flags IPv4 link-local incl. cloud metadata 169.254.169.254", () => {
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("169.254.0.1")).toBe(true);
  });

  it("flags IPv4 CGNAT 100.64.0.0/10", () => {
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("100.127.255.255")).toBe(true);
  });

  it("flags IPv4 multicast and reserved", () => {
    expect(isPrivateIp("224.0.0.1")).toBe(true);
    expect(isPrivateIp("239.255.255.255")).toBe(true);
    expect(isPrivateIp("255.255.255.255")).toBe(true);
  });

  it("flags IPv4 0.0.0.0", () => {
    expect(isPrivateIp("0.0.0.0")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("172.32.0.1")).toBe(false); // just outside RFC1918
    expect(isPrivateIp("100.63.255.255")).toBe(false); // just outside CGNAT
    expect(isPrivateIp("169.253.255.255")).toBe(false); // just outside link-local
  });

  it("flags IPv6 loopback and unspecified", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("::")).toBe(true);
  });

  it("flags IPv6 link-local, unique-local, multicast", () => {
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fd12:3456::1")).toBe(true);
    expect(isPrivateIp("ff02::1")).toBe(true);
  });

  it("flags IPv4-mapped IPv6 pointing at a private IP", () => {
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows public IPv6 addresses", () => {
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false); // Cloudflare
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false); // Google
  });

  it("treats unparseable input as unsafe", () => {
    expect(isPrivateIp("not-an-ip")).toBe(true);
    expect(isPrivateIp("")).toBe(true);
  });
});

describe("assertSafeUrl", () => {
  it("rejects non-http(s) protocols", async () => {
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toBeInstanceOf(
      UnsafeUrlError
    );
    await expect(assertSafeUrl("gopher://example.com/")).rejects.toBeInstanceOf(
      UnsafeUrlError
    );
    await expect(assertSafeUrl("ftp://example.com/")).rejects.toBeInstanceOf(
      UnsafeUrlError
    );
  });

  it("rejects malformed URLs", async () => {
    await expect(assertSafeUrl("not a url")).rejects.toBeInstanceOf(
      UnsafeUrlError
    );
  });

  it("rejects IP-literal URLs that resolve to private space", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/")).rejects.toBeInstanceOf(
      UnsafeUrlError
    );
    await expect(
      assertSafeUrl("http://169.254.169.254/latest/meta-data/")
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeUrl("http://[::1]/")).rejects.toBeInstanceOf(
      UnsafeUrlError
    );
  });

  it("accepts a public IP literal", async () => {
    await expect(assertSafeUrl("http://1.1.1.1/")).resolves.toBeUndefined();
  });
});
