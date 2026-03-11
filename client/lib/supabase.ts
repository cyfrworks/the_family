import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getSupabase, setRealtimeAuth } from './realtime';

let _accessToken: string | null = null;
let _refreshToken: string | null = null;

export async function hydrateTokens() {
  if (Platform.OS === 'web') {
    _accessToken = sessionStorage.getItem('sb_access_token');
    _refreshToken = sessionStorage.getItem('sb_refresh_token');
  } else {
    _accessToken = await SecureStore.getItemAsync('sb_access_token');
    _refreshToken = await SecureStore.getItemAsync('sb_refresh_token');
  }
  if (_accessToken && _refreshToken) {
    await getSupabase().auth.setSession({ access_token: _accessToken, refresh_token: _refreshToken });
  }
  if (_accessToken) setRealtimeAuth(_accessToken);
}

export function initAuthListener() {
  const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' && session) {
      setAccessToken(session.access_token);
      setRefreshToken(session.refresh_token);
    } else if (event === 'SIGNED_OUT') {
      setAccessToken(null);
      setRefreshToken(null);
    }
  });
  return data.subscription;
}

export function setAccessToken(token: string | null) {
  _accessToken = token;
  if (Platform.OS === 'web') {
    token ? sessionStorage.setItem('sb_access_token', token) : sessionStorage.removeItem('sb_access_token');
  } else {
    if (token) {
      SecureStore.setItemAsync('sb_access_token', token);
    } else {
      SecureStore.deleteItemAsync('sb_access_token');
    }
  }
  setRealtimeAuth(token);
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function setRefreshToken(token: string | null) {
  _refreshToken = token;
  if (Platform.OS === 'web') {
    token ? sessionStorage.setItem('sb_refresh_token', token) : sessionStorage.removeItem('sb_refresh_token');
  } else {
    if (token) {
      SecureStore.setItemAsync('sb_refresh_token', token);
    } else {
      SecureStore.deleteItemAsync('sb_refresh_token');
    }
  }
}

export function getRefreshToken(): string | null {
  return _refreshToken;
}

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
    const displayName = (data?.display_name as string) || '';
    if (password.length < 8) throw new Error('Password must be at least 8 characters.');
    if (!displayName) throw new Error('Display name is required.');

    const { data: result, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });

    if (error) throw new Error(error.message);
    if (!result.session) throw new Error('We sent word to your email. Confirm your loyalty before you sit at the table.');

    const tokens: AuthTokens = {
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
      user: {
        id: result.user!.id,
        email: result.user!.email!,
        user_metadata: result.user!.user_metadata,
      },
    };

    setAccessToken(tokens.access_token);
    setRefreshToken(tokens.refresh_token);
    return tokens;
  },

  async signIn(email: string, password: string): Promise<AuthTokens> {
    const { data: result, error } = await getSupabase().auth.signInWithPassword({ email, password });

    if (error) throw new Error('Invalid credentials');

    const tokens: AuthTokens = {
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
      user: {
        id: result.user.id,
        email: result.user.email!,
        user_metadata: result.user.user_metadata,
      },
    };

    setAccessToken(tokens.access_token);
    setRefreshToken(tokens.refresh_token);
    return tokens;
  },

  async signOut(): Promise<void> {
    try {
      if (_accessToken && _refreshToken) {
        await getSupabase().auth.setSession({ access_token: _accessToken, refresh_token: _refreshToken });
      }
      await getSupabase().auth.signOut();
    } finally {
      setAccessToken(null);
      setRefreshToken(null);
    }
  },

  async getUser(): Promise<AuthTokens['user'] | null> {
    if (!_accessToken) return null;
    try {
      const { data, error } = await getSupabase().auth.getUser(_accessToken);
      if (error || !data.user) return null;
      return {
        id: data.user.id,
        email: data.user.email!,
        user_metadata: data.user.user_metadata,
      };
    } catch {
      return null;
    }
  },

  async resetPassword(email: string): Promise<void> {
    const { error } = await getSupabase().auth.resetPasswordForEmail(email);
    if (error) throw new Error(error.message);
  },

  async refresh(): Promise<AuthTokens | null> {
    const refreshToken = getRefreshToken();
    if (!refreshToken || !_accessToken) return null;
    try {
      await getSupabase().auth.setSession({ access_token: _accessToken, refresh_token: refreshToken });
      const { data, error } = await getSupabase().auth.refreshSession();

      if (error || !data.session) {
        setAccessToken(null);
        setRefreshToken(null);
        return null;
      }

      const tokens: AuthTokens = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: {
          id: data.session.user.id,
          email: data.session.user.email!,
          user_metadata: data.session.user.user_metadata,
        },
      };

      setAccessToken(tokens.access_token);
      setRefreshToken(tokens.refresh_token);
      return tokens;
    } catch {
      return null;
    }
  },
};
