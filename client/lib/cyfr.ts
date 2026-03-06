import { Platform } from 'react-native';

// Web: use relative /cyfr path (proxied by Metro dev server or Caddy in prod, avoids CORS)
// Native: use direct URL (no CORS restrictions on native)
function getCyfrUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_CYFR_URL;
  if (Platform.OS === 'web') {
    // Relative paths work on web (proxied). If env is a full URL, still use it.
    return envUrl || '/cyfr';
  }
  // Native needs a full URL. If env is a relative path, fall back to localhost.
  if (envUrl && envUrl.startsWith('http')) return envUrl;
  return 'http://localhost:4000/mcp';
}

const CYFR_URL = getCyfrUrl();
const CYFR_KEY = process.env.EXPO_PUBLIC_CYFR_PUBLIC_KEY || '';

let requestId = 0;

function isRetryable(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (err instanceof Error && err.name === 'AbortError') return true;
  if (err instanceof CyfrError) {
    return err.code === -33100 || err.code === -1;
  }
  return false;
}

async function cyfrCallOnce(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const fetchTimeout = typeof args.timeout === 'number' ? args.timeout + 5000 : 35000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchTimeout);

  let res: Response;
  try {
    res = await fetch(CYFR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': '2025-11-25',
        ...(CYFR_KEY ? { Authorization: `Bearer ${CYFR_KEY}` } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json();

  if (data.error) {
    throw new CyfrError(data.error.code, data.error.message);
  }

  const text = data.result?.content?.[0]?.text;
  if (!text) {
    throw new CyfrError(-1, 'Empty response from CYFR');
  }

  if (data.result?.isError) {
    throw new CyfrError(-33100, text);
  }

  const parsed = JSON.parse(text);

  if (parsed.status === 'completed' && 'result' in parsed) {
    return parsed.result;
  }

  if (parsed.status === 'error' || parsed.type === 'execution_failed') {
    const errPayload = parsed.message ?? parsed.error;
    const errMsg = typeof errPayload === 'string' ? errPayload : (errPayload?.message ?? JSON.stringify(errPayload) ?? 'Execution failed');
    throw new CyfrError(-33100, errMsg);
  }

  return parsed;
}

export async function cyfrCall(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const timeout = typeof args.timeout === 'number' ? args.timeout : 30000;
  if (timeout > 60000) {
    return cyfrCallOnce(toolName, args);
  }
  try {
    return await cyfrCallOnce(toolName, args);
  } catch (err) {
    if (isRetryable(err)) {
      await new Promise((r) => setTimeout(r, 1000));
      return cyfrCallOnce(toolName, args);
    }
    throw err;
  }
}

export class CyfrError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = 'CyfrError';
    this.code = code;
  }
}
