import * as React from "react";
import { getCurrentUser, subscribeToAuthChanges, type CurrentUser } from "../tenants.controller";

interface AuthContextValue {
  /** `undefined` while the initial session lookup is in flight. */
  user: CurrentUser | null | undefined;
  refresh: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<CurrentUser | null | undefined>(undefined);
  // Coalesces concurrent callers (e.g. LoginForm's explicit refresh() racing
  // the onAuthStateChange subscription's own refresh() for the same
  // SIGNED_IN event) into the one in-flight lookup.
  const inFlight = React.useRef<Promise<void> | null>(null);

  const refresh = React.useCallback(() => {
    if (!inFlight.current) {
      inFlight.current = getCurrentUser()
        .then(setUser)
        .finally(() => {
          inFlight.current = null;
        });
    }
    return inFlight.current;
  }, []);

  React.useEffect(() => {
    refresh();
    const subscription = subscribeToAuthChanges(() => {
      refresh();
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  return <AuthContext.Provider value={{ user, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
