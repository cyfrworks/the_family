import type { AgentOutput } from './types';

const CYFR_URL = import.meta.env.VITE_CYFR_URL || '/cyfr';
const CYFR_KEY = import.meta.env.VITE_CYFR_PUBLIC_KEY || '';

let requestId = 0;

export async function cyfrCall(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(CYFR_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-11-25',
      ...(CYFR_KEY ? { Authorization: `Bearer ${CYFR_KEY}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++requestId,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });

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

// Maps provider name to catalyst reference and request format
const CATALYST_MAP: Record<string, { registry: string; buildInput: (p: InvokeParams) => Record<string, unknown>; extractContent: (data: Record<string, unknown>) => string }> = {
  openai: {
    registry: 'catalyst:local.openai:0.1.0',
    buildInput: (p) => ({
      operation: 'responses.create',
      params: {
        model: p.model,
        instructions: p.system,
        input: p.messages,
        tools: [{ type: 'web_search_preview' }],
        max_output_tokens: p.maxTokens ?? 4096,
      },
    }),
    extractContent: (data) => {
      const output = data.output as Array<{ type: string; content?: Array<{ type: string; text: string }> }>;
      if (!output) return '';
      return output
        .filter((item) => item.type === 'message')
        .flatMap((item) => item.content ?? [])
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text)
        .join('');
    },
  },
  claude: {
    registry: 'catalyst:local.claude:0.1.0',
    buildInput: (p) => ({
      operation: 'messages.create',
      params: {
        model: p.model,
        system: p.system,
        messages: p.messages,
        max_tokens: p.maxTokens ?? 4096,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      },
    }),
    extractContent: (data) => {
      const content = data.content as Array<{ type: string; text: string }>;
      return content?.filter((c) => c.type === 'text').map((c) => c.text).join('') ?? '';
    },
  },
  gemini: {
    registry: 'catalyst:local.gemini:0.1.0',
    buildInput: (p) => ({
      operation: 'generate',
      params: {
        model: p.model,
        systemInstruction: { parts: [{ text: p.system }] },
        contents: p.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: p.maxTokens ?? 4096 },
        tools: [{ google_search: {} }, { url_context: {} }],
      },
    }),
    extractContent: (data) => {
      const candidates = data.candidates as Array<{ content: { parts: Array<{ text: string }> } }>;
      return candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
    },
  },
};

interface InvokeParams {
  provider: string;
  model: string;
  system: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens?: number;
}

export async function invokeAgent(params: InvokeParams): Promise<AgentOutput> {
  const catalyst = CATALYST_MAP[params.provider];
  if (!catalyst) {
    throw new CyfrError(-1, `Unknown provider: ${params.provider}`);
  }

  const result = await cyfrCall('execution', {
    action: 'run',
    reference: { registry: catalyst.registry },
    input: catalyst.buildInput(params),
    type: 'catalyst',
    timeout: 120000,
  });

  // cyfrCall unwraps to {status, data: {...}} or {status, error: {...}}
  const wrapper = result as { status?: number; data?: Record<string, unknown>; error?: Record<string, unknown> };

  // Check for provider-level errors (e.g. 404 model not found, 401 bad key)
  if (wrapper.error) {
    const errMsg = (wrapper.error as { message?: string; error?: { message?: string } }).error?.message
      ?? (wrapper.error as { message?: string }).message
      ?? JSON.stringify(wrapper.error);
    throw new CyfrError(wrapper.status ?? -1, errMsg);
  }

  const data = wrapper.data ?? (result as Record<string, unknown>);
  const content = catalyst.extractContent(data);

  if (!content) {
    throw new CyfrError(-1, 'Empty response from provider');
  }

  return {
    provider: params.provider,
    model: params.model,
    content,
    stream: false,
    component_ref: catalyst.registry,
  };
}

export class CyfrError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = 'CyfrError';
    this.code = code;
  }
}
