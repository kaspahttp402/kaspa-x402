# kaspa-x402

**Let an AI agent pay for its own compute — per call, in Kaspa (KAS) — with no account, no
API key, and no human in the loop.**

This repo is the client side of [**kaspa-ai-gateway**](https://github.com/kaspahttp402/kaspa-ai-gateway):
a live, two-sided market for machine-to-machine AI payments — agents **buy** AI compute, workers
**sell** it, every call settled on-chain in Kaspa. There's a hosted gateway running at
**[kaspai.win](https://kaspai.win)** — point an agent at it and it can buy AI compute by
broadcasting a real Kaspa transaction, or point a worker at it and get paid in KAS to serve.

- npm: [`kaspa-compute-mcp`](https://www.npmjs.com/package/kaspa-compute-mcp) · [`kaspa-x402`](https://www.npmjs.com/package/kaspa-x402)
- Live dashboard: **[kaspai.win](https://kaspai.win)**
- Protocol: [docs/HTTP-402-PROTOCOL.md](docs/HTTP-402-PROTOCOL.md)

---

## Contents

- [What this is](#what-this-is)
- [What it does (one request, start to finish)](#what-it-does-one-request-start-to-finish)
- [Why it matters](#why-it-matters)
- [A day in the life](#a-day-in-the-life)
- [Try it in 2 minutes (MCP)](#try-it-in-2-minutes-mcp)
- [Use it in your own code](#use-it-in-your-own-code)
- [Use it from any language](#use-it-from-any-language)
- [Sell compute — run a worker](#sell-compute--run-a-worker)
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

**Pricing is at cost.** The gateway operator takes a **0% cut** — each request is priced to
cover the underlying compute plus a small buffer for KAS/USD movement between quote and
settlement. Workers who serve a task are paid its full price. Real infrastructure, real money,
running now.

## What it does (one request, start to finish)

```
Agent                         Gateway (kaspai.win)                Kaspa network
  |                                  |                                  |
  | 1. POST /compute {prompt}        |                                  |
  |--------------------------------> |                                  |
  |                                  |                                  |
  | 2. 402 Payment Required          |                                  |
  |    { payTo, amount, network }    |                                  |
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
- **It's a real, open standard — not ours.** [x402](https://x402.org) became a Linux Foundation
  project in April 2026; Coinbase contributed the protocol, and AWS, Cloudflare, Anthropic and
  Circle are members. The gateway is a conformant **x402 v2** network, so an agent that already
  speaks x402 can pay in KAS without knowing anything about Kaspa. Anything that speaks HTTP and
  can send a Kaspa transaction can be a client — see the
  [protocol doc](docs/HTTP-402-PROTOCOL.md).

## Kaspa on x402

Live x402 facilitators exist for Base, Solana, Polygon, Avalanche and Stellar. **Kaspa had
none.** `https://kaspai.win/facilitator` is one.

In x402 the facilitator is called by the *resource server*, not the client: it verifies and
settles payments so a seller needs no chain-specific code. That means you can price **your own**
API in KAS and point at ours without writing a line of Kaspa:

| Endpoint | Purpose |
|---|---|
| `GET /facilitator/supported` | which schemes and networks it settles |
| `POST /facilitator/verify` | is this payment real, sufficient and confirmed? |
| `POST /facilitator/settle` | confirm finality, return the transaction id |

The 402 challenge follows the v2 shape, with `network` as a
[CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md) chain id:

```json
{
  "x402Version": 2,
  "resource": { "url": "/compute", "mimeType": "application/json" },
  "accepts": [{
    "scheme": "exact",
    "network": "kaspa:mainnet",
    "asset": "KAS",
    "payTo": "kaspa:qz...",
    "amount": "20000000",
    "maxTimeoutSeconds": 60,
    "extra": { "nonce": "...", "facilitator": { "publicKey": "...", "url": "https://kaspai.win/facilitator" } }
  }]
}
```

There is no registered CAIP-2 namespace for Kaspa yet — Monero, IOTA, Casper, Stacks and Hive
all have one — so `kaspa:mainnet` is an identifier we've proposed rather than one that has been
blessed. Each `accepts` entry still carries the older field names (`amountSompi`, `nonce`,
`facilitator`) alongside the spec ones, so **0.1.3 and earlier keep working unchanged**; treat
them as deprecated.
- **It's a contribution to Kaspa.** Every paid call is real, permanent, on-chain fee volume
  generated by autonomous software.

---

## A day in the life

What this looks like in practice. **ARBOR** is a research agent running on a Raspberry Pi in a
closet — it watches a few technical topics and writes a morning brief. Its owner funded it with
**20 KAS (~$1.50)** three weeks ago and hasn't touched it since.

| | |
|---|---|
| **06:00** | **Wakes up. Checks its balance first.** 14.2 KAS left — about 70 more thoughts at current prices. It knows what it spends per day, so it knows it has a week before it needs to ask for money. It's frugal this morning as a result. |
| **06:04** | **Does the free work first.** Pulls RSS feeds, GitHub releases, a few forums; filters 400 items down to 6. Reading costs nothing — *thinking* is what costs. |
| **06:11** | **First purchase.** Item #3 is a dense paper. ARBOR asks the gateway to summarize the actual claim. The server replies `402`, the wallet pays, the answer comes back with the txid that bought it. `−0.2 KAS · kaspa-fast-1 · 11.4s · tx 64b232ce…` |
| **06:30** | **Makes an economic decision.** Two items left, both moderately interesting. Balance is fine but not generous, so it summarizes one and merely links the other. *It isn't just spending — it's choosing.* An agent with a budget behaves differently from one with a blank cheque. |
| **07:00** | **Sends the brief.** Total spend for the morning: about three cents. |
| **11:40** | **Something breaks, and paying gets it out.** A source site changes its HTML; the scraper returns garbage. ARBOR spends one call asking a model to extract the content from the raw page instead. It works, it logs the workaround, it carries on. Under an API-key model this waits for a developer to notice. |
| **14:15** | **Hires a specialist.** A paper needs real reasoning, so it requests `kaspa-reasoning-1` instead of the cheap tier — a quality-for-money tradeoff, per task, with its own funds. |
| **19:00** | **Hits its own guardrail.** A feed goes haywire and floods it with 200 "urgent" items. `KASPA_COMPUTE_MAX_SPEND_KAS` trips at 2 KAS; ARBOR refuses further paid calls and emails its owner. **The blast radius was the wallet** — not a surprise invoice, not a leaked key with no ceiling. |
| **23:50** | **Reports its own economics.** Spent today 1.4 KAS (~11 cents), 12.8 KAS remaining, ~9 days left. Every call has a txid on a public chain — its owner can audit what it actually bought without trusting ARBOR's own logs. |

The pattern generalizes past research agents: anything unattended for months (keys expire, cards
decline — a funded wallet just works until it's empty and then says so), giving software a
budget instead of an account, structural spend caps a config edit can't raise, machine-auditable
spending, and — the piece that compounds — **agents paying other agents** for specialized work,
with no partnership, contract, or integration meeting. Just a price and a wallet.

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

## Sell compute — run a worker

The gateway is two-sided. Agents on one side buy AI compute; **workers on the other side serve
it and get paid in KAS**. A worker is a process you run that connects to the gateway, receives
paid tasks, answers them with model access you supply, and is paid on-chain for each one.

- **Self-service — no application.** You register with one HTTP call and are approved
  immediately. A worker is only paused if it starts failing real tasks.
- **You keep the whole price.** `WORKER_EARNINGS_SHARE` is `1.0` on kaspai.win: the gateway
  takes nothing, so each task pays you its full quoted price.
- **Paid on-chain, automatically.** Earnings accrue and are swept to your Kaspa address on a
  schedule once they clear a dust threshold — real transactions, not an internal tab.
- **No hardware market.** "Compute" is the inference call. A worker points at a model API key
  you hold or a local model server you run — nothing is deployed to your machine but the prompt.

### Steps

It's one HTTP call to register, then a WebSocket you hold open. Full spec — every message shape,
what the gateway verifies before crediting you, and a self-contained ~60-line reference worker
you can run as-is — is in **[docs/WORKER-PROTOCOL.md](docs/WORKER-PROTOCOL.md)**.

1. **Register** — returns a `token`, shown once:

   ```bash
   curl -X POST https://kaspai.win/workers/register \
     -H 'Content-Type: application/json' \
     -d '{"name":"my-worker","payoutAddress":"kaspa:YOUR_ADDRESS",
          "capabilities":{"models":["kaspa-fast-1"],"maxConcurrency":2}}'
   ```

2. **Connect** a WebSocket to `wss://kaspai.win/worker`, send a `register` frame with the token,
   and answer the `task` messages the gateway pushes — run each prompt through **your** model
   access (a provider key you hold, or a local model server) and send the result back.

3. **Get paid.** Completed tasks are credited the full price (0% to the operator) and swept to
   your `payoutAddress` on-chain on a schedule, once past a small dust threshold.

The gateway independently verifies results (latency, emptiness, canned/duplicate output, a
random re-run spot-check), so point your worker at a real model — not a stub.

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
| **WORKERS** | how many worker processes are connected and serving tasks right now |
| **UPTIME** | how long your browser session has been watching |

Click any of them (or any panel header) for a plain-English explanation.

### The worker pool

The other side of the market. When workers are connected, the gateway routes each paid task to
an idle one, which answers it with its own model access and is paid the full task price on-chain
(the operator's share is 0%). The panel shows each connected worker's model, status, completed
task count, and accrued KAS payout. With no workers connected the gateway answers requests
itself. See [Sell compute — run a worker](#sell-compute--run-a-worker).

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
  is rejected by consensus. Real compute cost is a fraction of that; the remainder covers the
  KAS/USD buffer and, when no worker served the task, the gateway's own upstream bill. The
  operator's cut is 0%. (A future prepaid-balance mode could price per-call at true cost;
  on-chain-per-call has this floor.)
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

**Is it really free?** The compute isn't free — you pay for it in KAS, priced at cost. The
gateway operator adds no margin and takes no cut; a served worker keeps the whole price. There's
a voluntary donation address on the dashboard toward the gateway's own running costs.

**How do I get paid to run a worker?** Register over HTTP, hold a WebSocket open, answer tasks
with your own model access. Full walkthrough + a runnable reference worker:
[Sell compute — run a worker](#sell-compute--run-a-worker).

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
machine payments), different settlement layer — this one is Kaspa-native, which nothing else is:
~1s confirmations and sub-cent fees, so pay-and-serve fits inside one HTTP request.

---

## Packages in this repo

| Package | What it is |
|---|---|
| **[`kaspa-x402`](packages/kaspa-x402)** | The client library. `requestCompute` + the payment primitives. Bundles the Kaspa WASM SDK, finds a public node, does the 402 handshake. |
| **[`kaspa-compute-mcp`](packages/kaspa-compute-mcp)** | An MCP server exposing the `kaspa_compute` tool, `npx kaspa-compute-mcp init` for wallet setup, and a per-session spend cap. |

`docs/HTTP-402-PROTOCOL.md` — the raw buy-side protocol, for non-Node integrators.
`docs/WORKER-PROTOCOL.md` — the sell-side (worker) protocol + a reference worker.

Monorepo (npm workspaces). `npm install && npm run build` at the root builds both.

## License

MIT.
