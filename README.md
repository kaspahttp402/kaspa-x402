# kaspa-402

Pay for AI compute **per call, in Kaspa (KAS)**, over HTTP 402 — no API key, no signup, no
human clicking "buy". This repo is how you plug into a running
[kaspa-ai-gateway](https://github.com/kaspahttp402/kaspa-ai-gateway): a free, non-commercial
Kaspa-adoption demo where the operator takes **0%** and requests are priced only to cover the
real upstream AI cost.

## Which one do you want?

| You want to… | Use |
|---|---|
| Give an MCP agent (Claude Desktop, Cursor, Cline, …) a pay-per-call compute tool | **[`kaspa-compute-mcp`](packages/kaspa-compute-mcp)** — one config block |
| Call the gateway from your own Node code | **[`kaspa-402`](packages/kaspa-402)** — `npm i kaspa-402`, ~10 lines |
| Integrate from another language | **[the HTTP 402 protocol doc](docs/HTTP-402-PROTOCOL.md)** — implement it yourself |

## The MCP way (fastest)

```jsonc
// claude_desktop_config.json  (or any MCP client's config)
{
  "mcpServers": {
    "kaspa-compute": {
      "command": "npx",
      "args": ["-y", "kaspa-compute-mcp"],
      "env": {
        "KASPA_COMPUTE_GATEWAY": "https://<the hosted gateway URL>",
        "KASPA_COMPUTE_PRIVATE_KEY": "<a funded kaspa wallet private key>"
      }
    }
  }
}
```

Need a wallet? `npx kaspa-compute-mcp init` makes one and prints this block filled in. Fund the
address it shows with a few KAS, and your agent can call `kaspa_compute` from then on.

## The library way

```ts
import { requestCompute } from 'kaspa-402';

const { result, txid } = await requestCompute(
  'https://<gateway-url>',
  { prompt: 'Explain GHOSTDAG in two sentences.', model: 'kaspa-fast-1' },
  { privateKey: process.env.MY_KASPA_KEY! }   // pays the 402 on-chain from this wallet
);

console.log(result.output.text);   // the answer
console.log(txid);                 // the real Kaspa transaction that paid for it
```

## How a paid request works

1. `POST /compute` → gateway replies **HTTP 402** with a price and a one-off Kaspa address.
2. Your wallet broadcasts a real KAS payment to that address.
3. Retry the request with an `X-PAYMENT` header proving the txid.
4. Gateway verifies it landed on-chain, runs the task, returns the answer.

Kaspa's ~10 blocks/sec settlement is what makes that whole loop fit inside one HTTP request.

## Packages

- **[`kaspa-402`](packages/kaspa-402)** — the client library. Bundles the Kaspa WASM SDK, finds
  a public node automatically, does the 402 dance.
- **[`kaspa-compute-mcp`](packages/kaspa-compute-mcp)** — an MCP server exposing one tool,
  `kaspa_compute`, with a per-session spend cap.

## License

MIT.
