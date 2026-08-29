# kaspa-x402

Client library for paying an **HTTP 402 (Payment Required)** challenge on-chain in Kaspa (KAS).
Talks to a [kaspa-ai-gateway](https://github.com/kaspahttp402/kaspa-ai-gateway).

```
npm install kaspa-x402
```

Node 20+. Bundles the Kaspa WASM SDK; finds a public Kaspa node automatically.

## Usage

```ts
import { requestCompute } from 'kaspa-x402';

const outcome = await requestCompute(
  'https://kaspai.win',
  { prompt: 'Explain GHOSTDAG in two sentences.', model: 'kaspa-fast-1' },
  {
    privateKey: process.env.MY_KASPA_KEY!,   // funded wallet that pays the 402
    onEvent: (e) => console.log(e),          // optional progress: quote / broadcast / settling / done
  }
);

outcome.result.output.text;   // the answer
outcome.txid;                 // the Kaspa transaction that paid for it
outcome.payment.amountSompi;  // what it cost (1 KAS = 100_000_000 sompi)
```

## API

### `requestCompute(gatewayUrl, request, options)`

`request`: `{ prompt: string; model?: 'kaspa-fast-1' | 'kaspa-reasoning-1'; maxTokens?: number; temperature?: number }`

`options`:
| | |
|---|---|
| `privateKey` | **required** — payer wallet, hex |
| `rpcUrl` | a specific Kaspa wRPC node; omit to auto-discover a public one |
| `network` | override the network id (default: from the gateway's quote) |
| `priorityFeeSompi` | extra fee on top of the mass-based fee (default `10000n`) |
| `onEvent` | `(e: PayEvent) => void` progress callback |
| `clientKind` | activity-feed label: `'api'` \| `'mcp'` \| `'agent'` \| `'signal'` |

Returns `{ result, payment, txid }`. Throws on a non-402 first response, a rejected payment, or
an unfunded wallet.

### Other exports

- `generateWallet(network?)` → `{ address, privateKey }`
- `addressForKey(privateKeyHex, network?)` → address string
- `sendKas(privateKeyHex, toAddress, amountSompi, network, opts?)` → `{ txid, fromAddress }`
- `buildPaymentProof(option, privateKeyHex, opts?)` — pay a `PaymentOption`, get a `PaymentProof`
- `encodePaymentProof(proof)` — the `X-PAYMENT` header value
- `closeRpc()` — drop the shared node connection (lets a script exit)

## Notes

- A wallet holding one big UTXO can hit Kaspa's KIP-9 "storage mass" limit paying a tiny amount.
  The error explains the fix (split the balance into smaller UTXOs).
- One-shot scripts: call `closeRpc()` at the end or the open WebSocket keeps the process alive.

## License

MIT.
