import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Permission } from "../api/types";
import { Forbidden, Loading } from "../components/ui";
import { useAuth } from "./AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Signing in…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** UI-level guard only; every API endpoint enforces the same permission on the server. */
export function RequirePerm({ perm, any, children }: { perm?: Permission; any?: Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  const ok = perm ? can(perm) : (any ?? []).some(can);
  return ok ? <>{children}</> : <Forbidden />;
}
