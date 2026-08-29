# The HTTP 402 flow (any language)

If you're not on Node, implement this directly. It's four HTTP calls and one Kaspa transaction.

## 1. Ask for the task

```
POST /compute
Content-Type: application/json
X-Client: api            # optional label for the gateway's activity feed

{ "prompt": "…", "model": "kaspa-fast-1", "maxTokens": 512 }
```

The gateway replies **`402 Payment Required`**:

```json
{
  "x402Version": 1,
  "error": "payment required",
  "accepts": [{
    "scheme": "exact",
    "network": "mainnet",
    "asset": "KAS",
    "payTo": "kaspa:qq…",          // a one-off address unique to this request
    "amountSompi": "742000",        // 1 KAS = 100_000_000 sompi
    "nonce": "b1c2…",               // ties your payment to this request
    "maxTimeoutSeconds": 60,
    "facilitator": { "publicKey": "02…", "url": "https://…/facilitator" }
  }]
}
```

Take `accepts[0]`.

## 2. Pay on-chain

Broadcast a normal Kaspa transaction sending exactly `amountSompi` to `payTo`, from a wallet you
control. Any Kaspa library/SDK/wallet that can build and submit a transaction works. Note the
resulting **txid** and your **payer address**.

## 3. Retry with proof

Build the proof object:

```json
{
  "scheme": "exact",
  "network": "mainnet",
  "payer": "kaspa:qr…",            // your sending address
  "txid": "…",                     // from step 2
  "amountSompi": "742000",         // must equal the quote
  "nonce": "b1c2…"                 // from step 1
}
```

`X-PAYMENT` = base64 of that JSON. Resend the **same** POST body:

```
POST /compute
Content-Type: application/json
X-Client: api
X-PAYMENT: eyJzY2hlbWUiOiJleGFjdCIs…
```

## 4. Handle the response

- **`200`** → `{ "result": { "output": { "text": "…" }, "usage": {…}, … }, "payment": {…} }`. Done.
- **`402` again** → the payment is broadcast but not visible on-chain yet. Wait ~1–8 s and
  resend with the **same** `X-PAYMENT` header. Retry a handful of times before giving up — the
  money is already spent.
- **`4xx`/`5xx`** with a body → read the error. A `503` means compute is temporarily unavailable
  and **no payment was requested** (don't pay).

## Rules

- The nonce is single-use. One payment settles one request.
- Pay the **exact** `amountSompi`. Underpaying is rejected; overpaying is not credited back.
- The per-request `payTo` address binds the payment to your request — don't reuse a quote.
- Optionally verify the `402` challenge signature against `facilitator.publicKey` before paying.

A reference implementation is [`kaspa-x402`](../packages/kaspa-x402) (`src/client.ts` + `src/pay.ts`).
