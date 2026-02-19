import { cyfrCall } from './cyfr';

/**
 * Supabase client that routes all operations through the CYFR Supabase catalyst.
 * No direct Supabase JS dependency — everything goes through CYFR's WASM sandbox.
 */

interface Filter {
  column?: string;
  op?: string;
  value?: string;
  or?: Filter[];
  and?: Filter[];
}

interface OrderBy {
  column: string;
  direction?: 'asc' | 'desc';
}

interface SelectParams {
  select?: string;
  filters?: Filter[];
  order?: OrderBy[];
  limit?: number;
  offset?: number;
}

interface CatalystResult<T = unknown> {
  status: number;
  data: T;
  error?: { type: string; message: string };
}

let _accessToken: string | null = localStorage.getItem('sb_access_token');

export function setAccessToken(token: string | null) {
  _accessToken = token;
  if (token) {
    localStorage.setItem('sb_access_token', token);
  } else {
    localStorage.removeItem('sb_access_token');
  }
}

export function getAccessToken(): string | null {
  return _accessToken;
}

async function callCatalyst<T = unknown>(operation: string, params: Record<string, unknown>): Promise<CatalystResult<T>> {
  // Inject access_token for RLS if we have one
  if (_accessToken && !params.access_token) {
    params = { ...params, access_token: _accessToken };
  }

  const result = await cyfrCall('execution', {
    action: 'run',
    reference: { registry: 'catalyst:local.supabase:0.1.0' },
    input: { operation, params },
    type: 'catalyst',
  });

  return result as CatalystResult<T>;
}

function assertOk<T>(result: CatalystResult<T>, context?: string): T {
  if (result.error) {
    throw new Error(context ? `${context}: ${result.error.message}` : result.error.message);
  }
  return result.data;
}

// ── Database Operations ────────────────────────────────────────────

export const db = {
  async select<T = unknown>(table: string, params: SelectParams = {}): Promise<T[]> {
    const result = await callCatalyst<T[]>('db.select', { table, ...params });
    return assertOk(result);
  },

  async selectOne<T = unknown>(table: string, params: SelectParams = {}): Promise<T | null> {
    const rows = await db.select<T>(table, { ...params, limit: 1 });
    return rows[0] ?? null;
  },

  async insert<T = unknown>(table: string, body: Record<string, unknown>): Promise<T[]> {
    const result = await callCatalyst<T[]>('db.insert', { table, body });
    return assertOk(result);
  },

  async update<T = unknown>(table: string, body: Record<string, unknown>, filters: Filter[]): Promise<T[]> {
    const result = await callCatalyst<T[]>('db.update', { table, body, filters });
    return assertOk(result);
  },

  async delete(table: string, filters: Filter[]): Promise<void> {
    const result = await callCatalyst('db.delete', { table, filters });
    assertOk(result);
  },

  async rpc<T = unknown>(fn: string, body: Record<string, unknown> = {}): Promise<T> {
    const result = await callCatalyst<T>('db.rpc', { function: fn, body });
    return assertOk(result);
  },
};

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
    const result = await callCatalyst<Record<string, unknown>>('auth.signup', {
      email,
      password,
      ...(data ? { data } : {}),
      access_token: undefined, // don't send current token for signup
    });
    const raw = assertOk(result, 'Sign up failed');

    // Normalize response: Supabase returns different shapes depending on
    // whether email confirmation is enabled (user object only, no session)
    // vs autoconfirm (full token response with nested user).
    const tokens: AuthTokens = raw.access_token
      ? raw as unknown as AuthTokens
      : {
          access_token: '',
          refresh_token: '',
          user: { id: (raw as { id: string }).id, email: (raw as { email: string }).email },
        };

    if (tokens.access_token) {
      setAccessToken(tokens.access_token);
      localStorage.setItem('sb_refresh_token', tokens.refresh_token);
    }
    return tokens;
  },

  async signIn(email: string, password: string): Promise<AuthTokens> {
    const result = await callCatalyst<AuthTokens>('auth.signin', {
      email,
      password,
      access_token: undefined,
    });
    const tokens = assertOk(result, 'Sign in failed');
    setAccessToken(tokens.access_token);
    localStorage.setItem('sb_refresh_token', tokens.refresh_token);
    return tokens;
  },

  async signOut(): Promise<void> {
    try {
      if (_accessToken) {
        await callCatalyst('auth.signout', { access_token: _accessToken });
      }
    } finally {
      setAccessToken(null);
      localStorage.removeItem('sb_refresh_token');
    }
  },

  async getUser(): Promise<AuthTokens['user'] | null> {
    if (!_accessToken) return null;
    try {
      const result = await callCatalyst<AuthTokens['user']>('auth.user', {
        access_token: _accessToken,
      });
      return assertOk(result);
    } catch {
      return null;
    }
  },

  async refresh(): Promise<AuthTokens | null> {
    const refreshToken = localStorage.getItem('sb_refresh_token');
    if (!refreshToken) return null;
    try {
      const result = await callCatalyst<AuthTokens>('auth.refresh', {
        refresh_token: refreshToken,
        access_token: undefined,
      });
      const tokens = assertOk(result);
      setAccessToken(tokens.access_token);
      localStorage.setItem('sb_refresh_token', tokens.refresh_token);
      return tokens;
    } catch {
      setAccessToken(null);
      localStorage.removeItem('sb_refresh_token');
      return null;
    }
  },
};
