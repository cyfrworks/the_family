// Thin REST proxy for informant API.
// Accepts simple JSON POST and wraps it into the CYFR MCP envelope.
//
// Usage:
//   POST /inform { "token": "inf_...", "action": "send_message", "sit_down_id": "...", "content": "..." }
//
// Dev:  node inform-proxy.js (port 4002)
// Prod: node inform-proxy.js (or via docker-compose)

const http = require('http');

const CYFR_URL = process.env.CYFR_URL || 'http://localhost:4000/mcp';
const CYFR_KEY = process.env.CYFR_PUBLIC_KEY || process.env.EXPO_PUBLIC_CYFR_PUBLIC_KEY || '';
const PORT = process.env.INFORM_PORT || 4002;

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'POST only' }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    try {
      const input = JSON.parse(body);

      if (!input.token || !input.action) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: token, action' }));
        return;
      }

      const mcp = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'execution',
          arguments: {
            action: 'run',
            reference: 'formula:local.informant-api:0.1.0',
            input,
            type: 'formula',
          },
        },
      };

      const upstream = await fetch(CYFR_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CYFR_KEY}`,
          'MCP-Protocol-Version': '2025-11-25',
        },
        body: JSON.stringify(mcp),
      });

      const data = await upstream.json();
      const text = data.result?.content?.[0]?.text;

      if (data.error || data.result?.isError) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: text || data.error?.message || 'Request failed' }));
      } else {
        // Unwrap CYFR execution envelope — return just the formula result
        let result = text || '{}';
        let parsed;
        try {
          parsed = JSON.parse(result);
          if (parsed.status === 'completed' && parsed.result !== undefined) {
            parsed = parsed.result;
            result = JSON.stringify(parsed);
          }
        } catch {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(result);
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Inform proxy listening on :${PORT}`);
});
