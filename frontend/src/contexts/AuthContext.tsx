import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { auth, getAccessToken, setAccessToken } from '../lib/supabase';
import { clearRealtime } from '../lib/realtime';
import { cyfrCall } from '../lib/cyfr';
import type { Profile, UserTier } from '../lib/types';

const SETTINGS_API_REF = 'formula:local.settings-api:0.1.0';

interface AuthUser {
  id: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  profile: Profile | null;
  tier: UserTier;
  isGodfather: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const initRef = useRef(false);

  const tier: UserTier = profile?.tier ?? 'associate';
  const isGodfather = tier === 'godfather';

  // On mount, check for existing session via stored token.
  // Ref guard prevents StrictMode's double-mount from racing on token refresh.
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function init() {
      const token = getAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }

      // Try to get the user with the stored token
      let currentUser = await auth.getUser();

      // If expired, try refresh
      if (!currentUser) {
        const tokens = await auth.refresh();
        if (tokens) {
          currentUser = tokens.user;
        }
      }

      if (currentUser) {
        // Sync realtime auth — sessionStorage hydration doesn't call setAccessToken(),
        // so the realtime client is unauthenticated until we do this explicitly.
        setAccessToken(getAccessToken());
        setUser({ id: currentUser.id, email: currentUser.email });
        await fetchProfile();
      }

      setLoading(false);
    }
    init();
  }, []);

  // Auto-refresh token to keep realtime alive (tokens expire ~60min).
  // Also refreshes on tab wake (visibilitychange) to recover from sleep.
  // Tracks consecutive failures — 3 in a row means tokens are likely stale.
  const refreshingRef = useRef(false);
  const failCountRef = useRef(0);

  useEffect(() => {
    if (!user) return;

    async function refreshSession() {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        const result = await auth.refresh();
        if (result) {
          // Success — reset failure counter
          failCountRef.current = 0;
        } else if (!getAccessToken()) {
          // Server confirmed expiry (tokens were cleared) — clean sign out
          clearRealtime();
          setUser(null);
          setProfile(null);
        } else {
          // Transient failure (tokens preserved) — track consecutive failures
          failCountRef.current += 1;
          if (failCountRef.current >= 3) {
            // Tokens are likely stale after 3 consecutive failures — clean sign out
            clearRealtime();
            await auth.signOut();
            setUser(null);
            setProfile(null);
          }
        }
      } catch {
        // Unexpected error — same as transient failure
        failCountRef.current += 1;
        if (failCountRef.current >= 3) {
          clearRealtime();
          await auth.signOut();
          setUser(null);
          setProfile(null);
        }
      } finally {
        refreshingRef.current = false;
      }
    }

    const interval = setInterval(refreshSession, 50 * 60 * 1000);

    function handleVisibility() {
      if (document.visibilityState === 'visible') refreshSession();
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user]);

  async function fetchProfile() {
    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      const result = await cyfrCall('execution', {
        action: 'run',
        reference: SETTINGS_API_REF,
        input: { action: 'get_profile', access_token: accessToken },
        type: 'formula',
        timeout: 30000,
      });

      const res = result as Record<string, unknown> | null;
      if (res?.error) return;

      const data = res?.profile as Profile | null;
      if (data) setProfile(data);
    } catch {
      // Profile may not exist yet (race with trigger)
    }
  }

  async function signIn(email: string, password: string) {
    const tokens = await auth.signIn(email, password);
    const u = { id: tokens.user.id, email: tokens.user.email };
    setUser(u);
    await fetchProfile();
  }

  async function signUp(email: string, password: string, displayName: string) {
    const tokens = await auth.signUp(email, password, { display_name: displayName });

    // If no access_token, email confirmation is required — user isn't logged in yet
    if (!tokens.access_token) {
      throw new Error('We sent word to your email. Confirm your loyalty before you sit at the table.');
    }

    const u = { id: tokens.user.id, email: tokens.user.email };
    setUser(u);
    // Small delay to let the profile trigger fire
    await new Promise((r) => setTimeout(r, 500));
    await fetchProfile();
  }

  async function signOut() {
    clearRealtime();
    await auth.signOut();
    setUser(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ user, profile, tier, isGodfather, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
