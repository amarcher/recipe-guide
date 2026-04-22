"use client";

import { SessionProvider } from "next-auth/react";
import { SessionGate } from "./SessionGate";
import { ConfirmProvider } from "./ConfirmDialog";

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionGate />
      <ConfirmProvider>{children}</ConfirmProvider>
    </SessionProvider>
  );
}
