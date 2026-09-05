import * as React from "react";
import { Redirect } from "wouter";
import { useAuth } from "./AuthProvider";

/** Gates every module route (clients/matters/deadlines/payments/catalog/audit) behind a session. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (user === undefined) return null;
  if (user === null) return <Redirect to="/login" />;
  return <>{children}</>;
}
