import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { checkAuthStatus } from "../api";

export function RequireTinasuzeAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    checkAuthStatus()
      .then((status) => {
        if (!cancelled) setAuthenticated(status.authenticated);
      })
      .catch(() => {
        if (!cancelled) setAuthenticated(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (authenticated === null) return null;
  if (!authenticated) return <Navigate to="/builder/login" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}
