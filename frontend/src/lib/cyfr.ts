const CYFR_URL = import.meta.env.VITE_CYFR_URL || '/cyfr';
const CYFR_KEY = import.meta.env.VITE_CYFR_PUBLIC_KEY || '';

let requestId = 0;

function isRetryable(err: unknown): boolean {
  // Network failures (fetch throws TypeError for network errors)
  if (err instanceof TypeError) return true;

  // Abort errors (timeout)
  if (err instanceof DOMException && err.name === 'AbortError') return true;

  if (err instanceof CyfrError) {
    // Execution errors or empty responses — transient infrastructure issues
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

  // Check for execution-level errors
  if (data.result?.isError) {
    throw new CyfrError(-33100, text);
  }

  const parsed = JSON.parse(text);

  // CYFR wraps execution results in {status, result, ...} envelope — unwrap it
  if (parsed.status === 'completed' && 'result' in parsed) {
    return parsed.result;
  }

  // If it's a direct error from the execution envelope
  if (parsed.status === 'error' || parsed.type === 'execution_failed') {
    const errPayload = parsed.message ?? parsed.error;
    const errMsg = typeof errPayload === 'string' ? errPayload : (errPayload?.message ?? JSON.stringify(errPayload) ?? 'Execution failed');
    throw new CyfrError(-33100, errMsg);
  }

  return parsed;
}

export async function cyfrCall(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const timeout = typeof args.timeout === 'number' ? args.timeout : 30000;

  // Skip retry for long operations (> 60s) to avoid duplicate side effects
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
