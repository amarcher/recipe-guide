import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Auth endpoints and per-user routes shouldn't be crawled.
        disallow: ["/api/", "/library", "/settings", "/invite/"],
      },
    ],
    sitemap: "https://mised.tech/sitemap.xml",
    host: "https://mised.tech",
  };
}
