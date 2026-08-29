# Run a worker (any language)

A worker is the sell side of the gateway. It registers once over HTTP, then holds a WebSocket
open and answers the tasks the gateway pushes to it. Completed tasks are credited in KAS and
paid out on-chain to the address you registered with.

It's one HTTP call plus one WebSocket. Everything below is against the hosted gateway at
`https://kaspai.win`; swap the host for your own gateway if you run one.

## 1. Register

```
POST /workers/register
Content-Type: application/json

{
  "name": "my-worker",
  "payoutAddress": "kaspa:qq…",              // where earnings are paid; must match the gateway's network
  "capabilities": {
    "models": ["kaspa-fast-1", "kaspa-reasoning-1"],   // the tiers you'll serve
    "maxConcurrency": 2                                  // tasks the gateway may have in flight with you at once
  }
}
```

Reply **`201`**:

```json
{
  "workerId": "wk_…",
  "token": "…",          // shown once — save it
  "approval": "approved" // or "pending" if the gateway runs WORKER_ALLOWLIST_ONLY
}
```

`models` must be a non-empty subset of `["kaspa-fast-1", "kaspa-reasoning-1"]`. `maxConcurrency`
is `1`–`64`. A `payoutAddress` on the wrong network (`kaspatest:` against a mainnet gateway, or
vice-versa) is rejected here, not silently later.

## 2. Connect

Open a WebSocket to **`wss://kaspai.win/worker`** and send a `register` frame within 10 seconds
(the gateway drops an unregistered socket):

```json
{ "type": "register", "token": "…", "capabilities": { "models": ["kaspa-fast-1"], "maxConcurrency": 2 } }
```

The gateway replies:

```json
{ "type": "registered", "workerId": "wk_…" }
```

On a bad token or malformed capabilities it sends `{ "type": "error", "taskId": "", "message": "…" }`
and closes the socket. Reconnect (with backoff) whenever the socket closes.

## 3. Answer tasks

The gateway pushes:

```json
{
  "type": "task",
  "taskId": "…",
  "request": { "prompt": "…", "model": "kaspa-fast-1", "maxTokens": 512, "temperature": 0.7 }
}
```

Run the prompt through whatever model you're serving, then send back **one** of:

```json
{
  "type": "result",
  "taskId": "…",
  "result": {
    "id": "<uuid>",
    "model": "<the real model id you actually called>",
    "createdAt": "2026-08-28T00:00:00.000Z",
    "latencyMs": 1234,
    "usage": { "promptTokens": 0, "completionTokens": 0, "totalTokens": 0 },
    "output": {
      "text": "<the answer>",
      "summary": "<short summary, or repeat text>",
      "confidence": 0.9,
      "tags": []
    },
    "processedBy": "worker"
  }
}
```

```json
{ "type": "error", "taskId": "…", "message": "why it failed" }
```

Send a result or an error for every task. If you don't answer within the gateway's task timeout
(30s default) the task is failed for you and served locally instead.

### What the gateway checks before crediting you

Registration is open, so the gateway independently verifies every result. A result is discarded
(no credit, counts toward the failure rate that auto-suspends a worker) if:

- it came back in under ~50 ms — implausibly fast for a real model call;
- `output.text` is empty or under 5 characters;
- the same `output.text` is returned for two different prompts (canned output);
- it fails a spot-check (when the operator has sampling enabled): the gateway re-runs the prompt
  through its own model and compares term overlap, so well-formed filler that isn't a real
  answer is caught too.

Serve real model output and none of this matters. Don't point a worker at a simulated/stub
model — you'd be failing checks and getting suspended, not earning.

## 4. Get paid

Credited earnings (the full task price — the gateway's cut is 0%) accrue per worker and are
swept to your `payoutAddress` on a schedule (~5 min) once the balance clears a small dust
threshold. Real on-chain transactions; nothing to claim.

Registered workers, their status, task counts, and accrued payout are visible at
`GET /workers` and on the dashboard's WORKER POOL panel.

---

## Reference worker (Node)

Self-contained. Needs `ws` (`npm i ws`) and Node ≥ 20, run as an ES module (`worker.mjs`, or
`"type": "module"` in `package.json`). Serves an OpenAI-compatible endpoint — point `MODEL_URL`
at OpenAI, Groq, a local llama.cpp/vLLM/Ollama server, whatever you hold the key to.

```
PAYOUT_ADDRESS=kaspa:… MODEL_URL=https://api.openai.com/v1/chat/completions \
  MODEL_KEY=sk-… MODEL_FAST=gpt-4o-mini node worker.mjs
```

```js
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

const REGISTER_URL = 'https://kaspai.win/workers/register';
const WS_URL       = 'wss://kaspai.win/worker';
const PAYOUT_ADDR  = process.env.PAYOUT_ADDRESS;              // kaspa:…
const MODEL_URL    = process.env.MODEL_URL;                   // https://api.openai.com/v1/chat/completions
const MODEL_KEY    = process.env.MODEL_KEY;                   // your provider key
const MODEL_FAST   = process.env.MODEL_FAST || 'gpt-4o-mini';
const MODEL_REASON = process.env.MODEL_REASONING || MODEL_FAST;
const CAPS = { models: ['kaspa-fast-1', 'kaspa-reasoning-1'], maxConcurrency: 2 };

const reg = await fetch(REGISTER_URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'ref-worker', payoutAddress: PAYOUT_ADDR, capabilities: CAPS }),
}).then((r) => r.json());
if (!reg.token) throw new Error(`register failed: ${JSON.stringify(reg)}`);
console.log(`registered ${reg.workerId} (${reg.approval})`);

async function runModel({ prompt, model, maxTokens }) {
  const started = Date.now();
  const id = model === 'kaspa-reasoning-1' ? MODEL_REASON : MODEL_FAST;
  const res = await fetch(MODEL_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${MODEL_KEY}` },
    body: JSON.stringify({ model: id, max_tokens: maxTokens ?? 512, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`model ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const text = body.choices?.[0]?.message?.content ?? '';
  const u = body.usage ?? {};
  return {
    id: randomUUID(),
    model: id,
    createdAt: new Date().toISOString(),
    latencyMs: Date.now() - started,
    usage: {
      promptTokens: u.prompt_tokens ?? 0,
      completionTokens: u.completion_tokens ?? 0,
      totalTokens: u.total_tokens ?? 0,
    },
    output: { text, summary: text.slice(0, 200), confidence: 0.9, tags: [] },
    processedBy: 'worker',
  };
}

function connect() {
  const ws = new WebSocket(WS_URL);
  ws.on('open', () => ws.send(JSON.stringify({ type: 'register', token: reg.token, capabilities: CAPS })));
  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'registered') return console.log(`connected as ${msg.workerId}`);
    if (msg.type !== 'task') return;
    try {
      const result = await runModel(msg.request);
      ws.send(JSON.stringify({ type: 'result', taskId: msg.taskId, result }));
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', taskId: msg.taskId, message: String(err?.message || err) }));
    }
  });
  ws.on('close', () => { console.log('disconnected, retrying in 3s'); setTimeout(connect, 3000); });
  ws.on('error', (e) => console.error('socket error:', e.message));
}
connect();
```
