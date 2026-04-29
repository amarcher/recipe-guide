import { ImageResponse } from "next/og";
import { prisma } from "@/app/lib/prisma";

// Roadmap item 2.17 — OG image for the Hosted Menu. Cream paper aesthetic
// with the family name + week. Kept text-only to dodge OG's image-fetch
// limits and the still-life primitive's CSS dependence.

export const runtime = "nodejs";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

export default async function HostedMenuOg({
  params,
}: {
  params: { slug: string };
}) {
  const plan = await prisma.weeklyPlan.findUnique({
    where: { publishedSlug: params.slug },
    select: {
      family: { select: { name: true } },
      hostNote: true,
      weekOf: true,
    },
  });
  const familyName = plan?.family?.name ?? "the kitchen";
  const weekDate = plan
    ? plan.weekOf.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "this week";

  return new ImageResponse(
    (
      <div
        style={{
          background: "#f8f1e2",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
        }}
      >
        <div
          style={{
            fontSize: 22,
            color: "#8b7548",
            letterSpacing: 8,
            textTransform: "uppercase",
            marginBottom: 30,
          }}
        >
          From the kitchen of {familyName}
        </div>
        <div
          style={{
            fontFamily: "serif",
            fontSize: 92,
            fontWeight: 500,
            color: "#1f1f1f",
            textAlign: "center",
            lineHeight: 1.05,
          }}
        >
          The week of {weekDate}
        </div>
        {plan?.hostNote && (
          <div
            style={{
              marginTop: 40,
              maxWidth: 900,
              fontSize: 28,
              fontStyle: "italic",
              color: "#5b5043",
              textAlign: "center",
            }}
          >
            {plan.hostNote.length > 180
              ? plan.hostNote.slice(0, 180) + "…"
              : plan.hostNote}
          </div>
        )}
      </div>
    ),
    size,
  );
}
