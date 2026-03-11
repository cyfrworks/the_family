import { Platform } from 'react-native';
import { auth, getAccessToken } from './supabase';
import { getDevHost } from './dev-host';

function getCyfrUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_CYFR_URL;
  if (Platform.OS === 'web') return envUrl || '/cyfr';
  if (envUrl && envUrl.startsWith('http')) return envUrl;
  const devHost = getDevHost();
  if (devHost) return `http://${devHost}:4000/mcp`;
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

function isAuthError(err: unknown): boolean {
  if (!(err instanceof CyfrError)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes('bad_jwt') || msg.includes('token is expired') || msg.includes('invalid jwt') || err.code === 403;
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
    const cyfrErr = data.error as Record<string, unknown>;
    throw new CyfrError(cyfrErr.code as number, cyfrErr.message as string);
  }

  const result = data.result as Record<string, unknown> | undefined;
  const content = result?.content as Array<Record<string, unknown>> | undefined;
  const text = content?.[0]?.text as string | undefined;
  if (!text) {
    throw new CyfrError(-1, 'Empty response from CYFR');
  }

  if (result?.isError) {
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
    if (isAuthError(err)) {
      const refreshed = await auth.refresh();
      if (refreshed) {
        const input = args.input as Record<string, unknown> | undefined;
        if (input && 'access_token' in input) {
          input.access_token = getAccessToken();
        }
        return cyfrCallOnce(toolName, args);
      }
    }
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

// ---------------------------------------------------------------------------
// Streaming (SSE) support for execution events
// ---------------------------------------------------------------------------

function getCyfrBaseUrl(): string {
  if (Platform.OS === 'web') return '';
  const envUrl = process.env.EXPO_PUBLIC_CYFR_URL;
  if (envUrl && envUrl.startsWith('http')) {
    try { return new URL(envUrl).origin; } catch { /* fall through */ }
  }
  const devHost = getDevHost();
  if (devHost) return `http://${devHost}:4000`;
  return 'http://localhost:4000';
}

export interface CyfrStreamHandlers {
  onEmit?: (data: Record<string, unknown>) => void;
  onComplete?: (data: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
}

/**
 * Start a streaming execution via `run_stream` and connect to the SSE event stream.
 * Returns a cleanup function to close the connection.
 */
export async function cyfrCallStream(
  toolName: string,
  args: Record<string, unknown>,
  handlers: CyfrStreamHandlers,
): Promise<() => void> {
  // 1. Start streaming execution via MCP (returns immediately with execution_id)
  const streamArgs = { ...args, action: 'run_stream' };
  const result = (await cyfrCallOnce(toolName, streamArgs)) as Record<string, unknown>;

  const streamUrl = result.stream_url as string | undefined;
  if (!streamUrl) {
    throw new CyfrError(-1, 'No stream_url in run_stream response');
  }

  // 2. Build full SSE URL
  const fullUrl = `${getCyfrBaseUrl()}${streamUrl}`;

  // 3. Connect via fetch (not EventSource — CYFR rejects Accept: text/event-stream)
  const controller = new AbortController();

  consumeSSE(fullUrl, controller.signal, handlers).catch(() => {
    // Stream ended or failed — already handled by consumeSSE
  });

  return () => controller.abort();
}

/**
 * Consume an SSE stream using fetch + ReadableStream.
 * CYFR rejects EventSource's mandatory `Accept: text/event-stream` header with 406,
 * so we use plain fetch which doesn't set that header.
 */
function parseSSEChunk(
  chunk: string,
  state: { buffer: string; currentEvent: string; currentData: string },
  handlers: CyfrStreamHandlers,
) {
  state.buffer += chunk;
  const lines = state.buffer.split('\n');
  state.buffer = lines.pop() ?? '';

  for (const line of lines) {
    if (line === '') {
      // Empty line = event boundary — dispatch
      if (state.currentData) {
        const eventName = state.currentEvent || 'message';
        try {
          const parsed = JSON.parse(state.currentData);
          if (eventName === 'emit') handlers.onEmit?.(parsed);
          else if (eventName === 'complete') handlers.onComplete?.(parsed);
          else if (eventName === 'error') handlers.onError?.(new CyfrError(-1, parsed.message ?? 'Stream error'));
        } catch { /* non-JSON — ignore */ }
      }
      state.currentEvent = '';
      state.currentData = '';
    } else if (line.startsWith('event:')) {
      state.currentEvent = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      state.currentData += (state.currentData ? '\n' : '') + line.slice(5).trim();
    }
  }
}

async function consumeSSE(
  url: string,
  signal: AbortSignal,
  handlers: CyfrStreamHandlers,
): Promise<void> {
  // Try fetch + ReadableStream first (works on web)
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      handlers.onError?.(new Error(`SSE connect failed: ${res.status}`));
      return;
    }
    const reader = res.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      const state = { buffer: '', currentEvent: '', currentData: '' };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parseSSEChunk(decoder.decode(value, { stream: true }), state, handlers);
        }
        parseSSEChunk('\n\n', state, handlers); // flush remaining
      } catch (err) {
        if (signal.aborted) return;
        handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
      return;
    }
  } catch {
    // fetch streaming not supported — fall through to XHR
  }

  // Fallback: XHR with onprogress (works on React Native)
  return new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest();
    let processed = 0;
    const state = { buffer: '', currentEvent: '', currentData: '' };

    xhr.open('GET', url);

    signal.addEventListener('abort', () => xhr.abort());

    xhr.onprogress = () => {
      const newText = xhr.responseText.slice(processed);
      processed = xhr.responseText.length;
      if (newText) parseSSEChunk(newText, state, handlers);
    };

    xhr.onloadend = () => {
      // Flush any remaining data
      const remaining = xhr.responseText.slice(processed);
      if (remaining) parseSSEChunk(remaining + '\n\n', state, handlers);
      resolve();
    };

    xhr.onerror = () => {
      handlers.onError?.(new Error('SSE connection failed'));
      resolve();
    };

    xhr.send();
  });
}
