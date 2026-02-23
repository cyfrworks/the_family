const CYFR_URL = import.meta.env.VITE_CYFR_URL || '/cyfr';
const CYFR_KEY = import.meta.env.VITE_CYFR_PUBLIC_KEY || '';

let requestId = 0;

export async function cyfrCall(toolName: string, args: Record<string, unknown>): Promise<unknown> {
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

export class CyfrError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = 'CyfrError';
    this.code = code;
  }
}
