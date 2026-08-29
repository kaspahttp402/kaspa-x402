# kaspa-compute-mcp

An [MCP](https://modelcontextprotocol.io) server that gives any MCP-capable AI agent one tool —
**`kaspa_compute`** — to run AI tasks, paying per call in Kaspa (KAS) over HTTP 402. No API key.

Points at a hosted [kaspa-ai-gateway](https://github.com/kaspahttp402/kaspa-ai-gateway) (a free,
non-commercial demo — operator takes 0%).

## Install

Add to your MCP client's config (`claude_desktop_config.json`, Cursor, Cline, …):

```jsonc
{
  "mcpServers": {
    "kaspa-compute": {
      "command": "npx",
      "args": ["-y", "kaspa-compute-mcp"],
      "env": {
        "KASPA_COMPUTE_GATEWAY": "https://kaspai.win",
        "KASPA_COMPUTE_PRIVATE_KEY": "<your kaspa wallet private key>",
        "KASPA_COMPUTE_MAX_SPEND_KAS": "1"
      }
    }
  }
}
```

`npx -y` means there's nothing to install by hand.

## Get a wallet

```
npx kaspa-compute-mcp init
```

Creates a fresh Kaspa wallet, prints the address + the exact config block above with the key
filled in, and saves `kaspa-compute-wallet.json`. Fund the address with a few KAS (buy on any
exchange that lists Kaspa, withdraw), paste the block, restart your MCP client.

## The tool

`kaspa_compute(prompt, model?, maxTokens?)`
- `model`: `kaspa-fast-1` (default) or `kaspa-reasoning-1`
- Returns the answer, the amount paid in KAS, and the transaction id.
- **Every call broadcasts a real Kaspa transaction and costs a flat 0.2 KAS (~half a cent).**

## Env vars

| Var | Default | |
|---|---|---|
| `KASPA_COMPUTE_GATEWAY` | — | the hosted gateway URL (required) |
| `KASPA_COMPUTE_PRIVATE_KEY` | — | payer wallet, hex (required to actually pay) |
| `KASPA_COMPUTE_MAX_SPEND_KAS` | `1` | per-session cap — the server refuses once cumulative spend hits this |
| `KASPA_COMPUTE_RPC_URL` | auto | a specific Kaspa wRPC node; omit to auto-discover a public one |

## License

MIT.
