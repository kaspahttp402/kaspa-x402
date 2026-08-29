# kaspa-x402

**Let an AI agent pay for its own compute — per call, in Kaspa (KAS) — with no account, no
API key, and no human in the loop.**

This repo is the client side of [**kaspa-ai-gateway**](https://github.com/kaspahttp402/kaspa-ai-gateway):
a live, free, non-commercial demo of machine-to-machine payments for AI. There's a hosted
gateway running at **[kaspai.win](https://kaspai.win)** — point an agent at it and it can buy
AI compute by broadcasting a real Kaspa transaction.

- npm: [`kaspa-compute-mcp`](https://www.npmjs.com/package/kaspa-compute-mcp) · [`kaspa-x402`](https://www.npmjs.com/package/kaspa-x402)
- Live dashboard: **[kaspai.win](https://kaspai.win)**
- Protocol: [docs/HTTP-402-PROTOCOL.md](docs/HTTP-402-PROTOCOL.md)

---

## Contents

- [What this is](#what-this-is)
- [What it does (one request, start to finish)](#what-it-does-one-request-start-to-finish)
- [Why it matters](#why-it-matters)
- [Try it in 2 minutes (MCP)](#try-it-in-2-minutes-mcp)
- [Use it in your own code](#use-it-in-your-own-code)
- [Use it from any language](#use-it-from-any-language)
- [The live gateway & dashboard (kaspai.win)](#the-live-gateway--dashboard-kaspaiwin)
  - [The payment feed](#the-payment-feed)
  - [The blockDAG visualizer](#the-blockdag-visualizer)
  - [The stat row](#the-stat-row)
  - [The worker pool](#the-worker-pool)
  - [M05H — the trading-bot demo](#m05h--the-trading-bot-demo)
- [Money, cost & safety](#money-cost--safety)
- [FAQ](#faq)
- [Packages in this repo](#packages-in-this-repo)
- [License](#license)

---

## What this is

Autonomous software — a bot, an agent, a scheduled script, another AI — can't sign up for a
credit card or click "Buy". Traditional payment rails need a human, an account, and don't work
at fractions-of-a-cent amounts. **kaspa-x402 is a payment rail built for machines instead.**

It uses **HTTP 402 "Payment Required"** (a status code reserved in the HTTP spec since 1997 and
never really used) plus **Kaspa**, a proof-of-work cryptocurrency that confirms transactions in
about one second. An agent asks a server for work, the server answers "402, here's the price and
where to pay", the agent's wallet pays on-chain, the agent retries with proof, and the work runs
— all inside a single normal web request.

The hosted gateway at **kaspai.win** does one kind of work: **AI compute** (LLM calls). You send
a prompt, you pay a few hundredths of a cent in KAS, you get the model's answer back plus the
transaction id that paid for it.

**It is non-commercial.** The operator takes a **0% cut**. Each request is priced only to cover
the real upstream AI API cost (Anthropic etc.) plus a small buffer for exchange-rate wobble.
It's a demonstration that this pattern works on real infrastructure with real money — not a
business. (Reselling LLM API access for profit isn't allowed by the providers' terms anyway.)

## What it does (one request, start to finish)

```
Agent                         Gateway (kaspai.win)                Kaspa network
  |                                  |                                  |
  | 1. POST /compute {prompt}        |                                  |
  |--------------------------------> |                                  |
  |                                  |                                  |
  | 2. 402 Payment Required          |                                  |
  |    { payTo, amountSompi, nonce } |                                  |
  | <--------------------------------|                                  |
  |                                  |                                  |
  | 3. broadcast payment -------------------------------------------------->|
  |    (from the agent's own wallet)                       ~1s to confirm  |
  |                                  |                                  |
  | 4. POST /compute again           |                                  |
  |    + X-PAYMENT: <proof>          |                                  |
  |--------------------------------> | 5. verify txid on-chain --------->|
  |                                  | 6. run the LLM call               |
  | 7. 200 { result, payment }       |                                  |
  | <--------------------------------|                                  |
```

That's the whole protocol. `kaspa-x402` (the library) and `kaspa-compute-mcp` (the MCP server)
wrap steps 1–7 so you never think about them.

## Why it matters

- **Agents can transact without a human.** No signup, no KYC, no stored card, no per-vendor API
  key. A wallet with a few dollars of KAS in it is the entire credential.
- **Micropayments actually work.** A call costs a fixed **0.2 KAS (~half a cent)** — the
  smallest amount that reliably settles on Kaspa given its anti-dust rules. Card networks can't
  process a payment that size economically; a Kaspa transaction can.
- **It's fast enough to be invisible.** Kaspa targets ~10 blocks per second, so "pay and get a
  confirmation" fits inside one HTTP request. On Bitcoin-speed settlement this pattern is
  unusable.
- **It's a real, open protocol.** HTTP 402 + a documented challenge/proof format. Anything that
  speaks HTTP and can send a Kaspa transaction can be a client — see the
  [protocol doc](docs/HTTP-402-PROTOCOL.md).
- **It's a contribution to Kaspa.** Every paid call is real, permanent, on-chain fee volume
  generated by autonomous software.

---

## Try it in 2 minutes (MCP)

If you use **Claude Desktop, Cursor, Cline, or any other MCP client**, this gives your agent a
`kaspa_compute` tool it can call to run AI tasks paid in KAS.

### 1. Make a wallet

```
npx kaspa-compute-mcp init
```

This prints:
- a **Kaspa address** — fund it with a small amount of KAS (buy on any exchange that lists
  Kaspa, then withdraw ~1–5 KAS to this address)
- a **private key** — this wallet only ever holds spending money; keep it separate from
  anything important
- the **config block** below, filled in

It also saves `kaspa-compute-wallet.json` in the current folder.

### 2. Add the config block

Paste into your MCP client's config (for Claude Desktop that's `claude_desktop_config.json`):

```jsonc
{
  "mcpServers": {
    "kaspa-compute": {
      "command": "npx",
      "args": ["-y", "kaspa-compute-mcp"],
      "env": {
        "KASPA_COMPUTE_GATEWAY": "https://kaspai.win",
        "KASPA_COMPUTE_PRIVATE_KEY": "your_key_from_step_1",
        "KASPA_COMPUTE_MAX_SPEND_KAS": "1"
      }
    }
  }
}
```

Restart your MCP client. (`KASPA_COMPUTE_GATEWAY` is optional — `https://kaspai.win` is the
built-in default.)

### 3. Use it

Ask your agent to use the `kaspa_compute` tool. Behind the scenes it hits `kaspai.win`, pays the
402 from your wallet, and returns the answer **plus** the transaction id and the exact amount
paid. Look the txid up on any Kaspa explorer (e.g. [kas.fyi](https://kas.fyi)) — it's a real
transaction.

**The `kaspa_compute` tool:**

| Argument | |
|---|---|
| `prompt` | the task |
| `model` | `kaspa-fast-1` (default, cheap/quick) or `kaspa-reasoning-1` (stronger, pricier) |
| `maxTokens` | optional cap on the response length |

**Safety:** `KASPA_COMPUTE_MAX_SPEND_KAS` (default `1`) is a per-session ceiling. Once the
server has spent that much KAS it refuses further calls until restarted — a runaway agent can't
drain the wallet.

---

## Use it in your own code

For agents you're building yourself in Node (≥20):

```
npm install kaspa-x402
```

```ts
import { requestCompute } from 'kaspa-x402';

const outcome = await requestCompute(
  'https://kaspai.win',
  { prompt: 'Explain GHOSTDAG in two sentences.', model: 'kaspa-fast-1' },
  {
    privateKey: process.env.MY_KASPA_KEY!,   // a funded wallet — pays the 402 on-chain
    onEvent: (e) => console.log(e),           // optional: 'quote' -> 'broadcast' -> 'settling' -> 'done'
  }
);

console.log(outcome.result.output.text);   // the answer
console.log(outcome.txid);                 // the Kaspa transaction that paid for it
console.log(outcome.payment.amountSompi);  // cost (1 KAS = 100_000_000 sompi)
```

`requestCompute` handles the full 402 dance: gets the quote, builds and broadcasts the payment
from your wallet, retries with the proof while the transaction settles, and returns the result.
It finds a public Kaspa node automatically (pass `rpcUrl` to use a specific one).

Other exports: `generateWallet`, `addressForKey`, `sendKas`, `buildPaymentProof`,
`encodePaymentProof`, `closeRpc`. See [packages/kaspa-x402/README.md](packages/kaspa-x402/README.md).

---

## Use it from any language

Not on Node? The whole thing is four HTTP calls and one Kaspa transaction. It's written up
step by step, with the exact header and JSON shapes, in
**[docs/HTTP-402-PROTOCOL.md](docs/HTTP-402-PROTOCOL.md)**. Any Kaspa SDK/library/wallet that can
build and submit a transaction is enough to implement a client.

---

## The live gateway & dashboard (kaspai.win)

Open **[kaspai.win](https://kaspai.win)** in a browser. It's a retro-terminal dashboard showing
the gateway's real activity, live. Everything on it is real data pulled from the running server
— if it can't reach the server it clearly switches to a `SIMULATED` label and shows plausible
placeholder numbers; it never fakes being live.

### The payment feed

A live stream of real HTTP 402 payments as agents pay for compute. Each row:

| Column | |
|---|---|
| time | when it settled |
| KAS | amount paid |
| ≈ USD | that amount at the live KAS/USD rate |
| txid | the real Kaspa transaction (shortened) |
| via | which kind of client paid — `api` (library / raw), `mcp` (the MCP tool), `agent` (the reference consumer agent), `signal` (M05H) |

No prompt or response content is ever shown or stored — only the on-chain facts and the
channel.

### The blockDAG visualizer

The animated 3D structure behind everything is a live sketch of **Kaspa's blockDAG**. Unlike a
blockchain (one block at a time in a single line), Kaspa is a *directed acyclic graph* — many
blocks can be produced at once and reference multiple parents, which is how it hits ~10 blocks
per second without the chain splitting.

- **Blocks appear continuously**, roughly matching Kaspa's real block rate.
- **They fork** (two blocks off one parent) and **merge** (one block referencing several tips) —
  that's the DAG widening and knitting back together.
- **Bright cyan blocks** are unresolved tips — just created, not yet folded into the accepted
  order.
- **Theme-colored blocks** are on the resolved, agreed-upon chain (GHOSTDAG picks a "selected
  parent" line through the DAG).
- A **flash** marks a merge point where competing tips got reconciled.
- The camera drifts and orbits on its own, occasionally passing *through* the structure.
- A faint scrolling caption at the bottom explains the colors as they go by.

It's illustrative, not a literal render of mainnet — the point is to make "what a blockDAG is"
tangible while you watch real payments land on it.

### The stat row

Eight live readouts:

| | |
|---|---|
| **KAS / USD** | live spot price (same oracle the gateway prices tasks with) |
| **SOMPI COLLECTED** | total paid through the gateway, all time |
| **TASKS** | AI requests completed |
| **MEMPOOL** | unconfirmed transactions in the connected node right now |
| **PEERS** | how many other Kaspa nodes the gateway's node is connected to |
| **NODE SYNC** | how caught up the gateway's own Kaspa node is |
| **WORKERS** | how many optional helper processes are attached (usually 0 — see below) |
| **UPTIME** | how long your browser session has been watching |

Click any of them (or any panel header) for a plain-English explanation.

### The worker pool

The gateway answers every request itself, using its own AI provider key. The WORKER POOL panel
is for an optional mode where extra helper processes can attach and share the load — normally
there are none, and the panel just says *"the gateway is answering requests itself."* You don't
need to think about it to use the gateway.

### M05H — the trading-bot demo

Click **TRADING BOT DEMO**. M05H is a small autonomous agent that **funds its own AI reasoning
with crypto micropayments** — the whole pattern, made concrete:

- It watches the **real** live KAS/USD price.
- When you ask it to analyze (or on its own schedule), it **pays the gateway in real KAS**, from
  its own wallet, for an AI-generated BUY/SELL/HOLD read — the same 402 flow as any other client
  (these show up in the payment feed tagged `signal`).
- It manages a **paper** portfolio — fake cash and fake KAS holdings, purely illustrative. **No
  real exchange, no real orders, no real trading.** You can give it a Kaspa address as a
  "memory key" so it remembers your paper portfolio across visits (no private key, no real
  funds — just a label).
- It has a face that reacts (mood colors, blinking, a laugh on a paper win, tears on a paper
  loss), a chat box, and auto-trade triggers.

The point isn't the trading — it's that an agent can autonomously pay for the intelligence it
needs, out of money it already controls, with no human approving each call.

---

## Money, cost & safety

- **What a call costs: a flat 0.2 KAS (~half a cent).** That's a floor forced by Kaspa's
  anti-dust rule (KIP-9): a payment much smaller than that, spent from a normally-funded wallet,
  is rejected by consensus. The real compute cost of a task is a fraction of 0.2 KAS — the
  remainder goes to the gateway's treasury toward the upstream API bill and a KAS/USD volatility
  buffer. The operator still takes no personal cut. (A future prepaid-balance mode could price
  per-call at true cost; on-chain-per-call has this floor.)
- **Nothing is refunded.** You pay the quoted amount; overpaying isn't credited back
  (`kaspa-x402` always pays the exact quote). Underpaying is rejected.
- **The wallet you configure is real money.** Fund it with only what you want an agent to be
  able to spend. Start with ~1–5 KAS.
- **Spend cap:** `kaspa-compute-mcp` enforces `KASPA_COMPUTE_MAX_SPEND_KAS` per session.
- **No content is stored.** The gateway keeps on-chain settlement records (txid, amount, payer,
  rate) as an audit trail — never prompts or responses.
- **Network:** Kaspa **mainnet**. Real KAS.
- **A wallet holding one large UTXO** can hit Kaspa's KIP-9 "storage mass" rule when paying a
  tiny amount — the error tells you how to fix it (split the balance into smaller UTXOs).

---

## FAQ

**Is it really free?** The compute isn't free — you pay the real API cost in KAS. But the
operator adds no margin and takes no cut. There's a voluntary donation address on the dashboard
that goes toward the out-of-pocket API bill.

**Do I need my own Kaspa node?** No. `kaspa-x402` discovers a public node automatically. Pass
`rpcUrl` if you want to use a specific one.

**Which models?** Two tiers: `kaspa-fast-1` (quick, cheap) and `kaspa-reasoning-1` (stronger).
A "tier" is a capability class — the gateway routes it to a real model; what you pay for is what
runs.

**What if the gateway is down / rejects my payment?** A `503` means compute is temporarily
unavailable and **no payment was requested** — don't pay. If a payment was made but the gateway
errored afterward, that's logged on the operator side for a manual refund (rare — a circuit
breaker prevents most of these).

**Can I run my own gateway?** Yes — it's open source in the
[kaspa-ai-gateway repo](https://github.com/kaspahttp402/kaspa-ai-gateway), with a full runbook.

**Is this the same as x402 / L402 / other agent-payment schemes?** Same idea (HTTP 402 for
machine payments), different settlement layer — this one is Kaspa-native, which nothing else is,
and it's non-commercial.

---

## Packages in this repo

| Package | What it is |
|---|---|
| **[`kaspa-x402`](packages/kaspa-x402)** | The client library. `requestCompute` + the payment primitives. Bundles the Kaspa WASM SDK, finds a public node, does the 402 handshake. |
| **[`kaspa-compute-mcp`](packages/kaspa-compute-mcp)** | An MCP server exposing the `kaspa_compute` tool, `npx kaspa-compute-mcp init` for wallet setup, and a per-session spend cap. |

`docs/HTTP-402-PROTOCOL.md` — the raw protocol, for non-Node integrators.

Monorepo (npm workspaces). `npm install && npm run build` at the root builds both.

## License

MIT.
