import { cyfrCall } from './cyfr';
import { setRealtimeAuth } from './realtime';

/**
 * Auth client that routes all operations through the auth-api formula.
 * No direct catalyst access — every auth operation goes through a named
 * formula action with server-side validation.
 *
 * Database operations are NOT exposed here. All data access goes through
 * named formula actions via cyfrCall — never raw table queries from the browser.
 */

const AUTH_API_REF = 'formula:local.auth-api:0.1.0';

let _accessToken: string | null = sessionStorage.getItem('sb_access_token');

export function setAccessToken(token: string | null) {
  _accessToken = token;
  if (token) {
    sessionStorage.setItem('sb_access_token', token);
  } else {
    sessionStorage.removeItem('sb_access_token');
  }
  setRealtimeAuth(token);
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function setRefreshToken(token: string | null) {
  if (token) {
    sessionStorage.setItem('sb_refresh_token', token);
  } else {
    sessionStorage.removeItem('sb_refresh_token');
  }
}

function getRefreshToken(): string | null {
  return sessionStorage.getItem('sb_refresh_token');
}

async function authCall(action: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await cyfrCall('execution', {
    action: 'run',
    reference: AUTH_API_REF,
    input: { action, ...input },
    type: 'formula',
    timeout: 30000,
  });

  const res = result as Record<string, unknown> | null;
  if (res?.error) {
    const errObj = res.error as Record<string, string>;
    throw new Error(errObj.message || 'Auth operation failed');
  }

  return res || {};
}

// ── Auth Operations ────────────────────────────────────────────────

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    user_metadata?: Record<string, unknown>;
  };
}

export const auth = {
  async signUp(email: string, password: string, data?: Record<string, unknown>): Promise<AuthTokens> {
    const displayName = data?.display_name as string || '';
    const res = await authCall('sign_up', { email, password, display_name: displayName });

    const tokens: AuthTokens = {
      access_token: (res.access_token as string) || '',
      refresh_token: (res.refresh_token as string) || '',
      user: (res.user as AuthTokens['user']) || { id: '', email: '' },
    };

    if (tokens.access_token) {
      setAccessToken(tokens.access_token);
      setRefreshToken(tokens.refresh_token);
    }
    return tokens;
  },

  async signIn(email: string, password: string): Promise<AuthTokens> {
    const res = await authCall('sign_in', { email, password });

    const tokens: AuthTokens = {
      access_token: (res.access_token as string) || '',
      refresh_token: (res.refresh_token as string) || '',
      user: (res.user as AuthTokens['user']) || { id: '', email: '' },
    };

    setAccessToken(tokens.access_token);
    setRefreshToken(tokens.refresh_token);
    return tokens;
  },

  async signOut(): Promise<void> {
    try {
      if (_accessToken) {
        await authCall('sign_out', { access_token: _accessToken });
      }
    } finally {
      setAccessToken(null);
      setRefreshToken(null);
    }
  },

  async getUser(): Promise<AuthTokens['user'] | null> {
    if (!_accessToken) return null;
    try {
      const res = await authCall('get_user', { access_token: _accessToken });
      return (res.user as AuthTokens['user']) || null;
    } catch {
      return null;
    }
  },

  async resetPassword(email: string): Promise<void> {
    await authCall('reset_password', { email });
  },

  async refresh(): Promise<AuthTokens | null> {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;
    try {
      const res = await authCall('refresh', { refresh_token: refreshToken });

      if (res.expired) {
        setAccessToken(null);
        setRefreshToken(null);
        return null;
      }

      const tokens: AuthTokens = {
        access_token: (res.access_token as string) || '',
        refresh_token: (res.refresh_token as string) || '',
        user: (res.user as AuthTokens['user']) || { id: '', email: '' },
      };

      setAccessToken(tokens.access_token);
      setRefreshToken(tokens.refresh_token);
      return tokens;
    } catch {
      // Transient error (network hiccup, 502, rate limit) — preserve existing
      // tokens since they may still be valid for up to 10 more minutes.
      // Only the explicit { expired: true } path above should clear tokens.
      return null;
    }
  },
};
