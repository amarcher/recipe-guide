"use client";

import { useEffect, useState } from "react";

export type FamilySummary = {
  id: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  memberCount: number;
  recipeCount: number;
  joinedAt: number;
};

export function useMyFamilies(): {
  families: FamilySummary[];
  loaded: boolean;
  refresh: () => Promise<void>;
} {
  const [families, setFamilies] = useState<FamilySummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/families");
      if (!res.ok) {
        setFamilies([]);
      } else {
        const data = (await res.json()) as { families: FamilySummary[] };
        setFamilies(data.families);
      }
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return { families, loaded, refresh };
}

export async function createFamily(name: string): Promise<{ id: string } | null> {
  const res = await fetch("/api/families", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { id: string };
}

export async function leaveFamily(id: string): Promise<boolean> {
  const res = await fetch(`/api/families/${id}/leave`, { method: "POST" });
  return res.ok;
}

export async function deleteFamily(id: string): Promise<boolean> {
  const res = await fetch(`/api/families/${id}`, { method: "DELETE" });
  return res.ok;
}

export async function createInvite(
  familyId: string
): Promise<{ code: string; expiresAt: number } | null> {
  const res = await fetch(`/api/families/${familyId}/invites`, {
    method: "POST",
  });
  if (!res.ok) return null;
  return (await res.json()) as { code: string; expiresAt: number };
}
