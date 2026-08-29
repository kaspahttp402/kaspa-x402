import { encodePaymentProof } from './codec.js';
import { buildPaymentProof } from './pay.js';
import type { ComputeOutcome, PaymentRequiredBody, RequestComputeOptions, TaskRequest, TaskResult, SettlementReceipt } from './types.js';

const SETTLE_RETRY_MS = [1500, 3000, 5000, 8000, 12000];

/**
 * Thrown when the payment WAS broadcast but the gateway then rejected or never accepted it.
 * `txid` / `amountSompi` are the on-chain payment you already made — keep them for a manual
 * follow-up with the operator.
 */
export class PaidButUndeliveredError extends Error {
  constructor(
    message: string,
    readonly txid: string,
    readonly amountSompi: string
  ) {
    super(message);
    this.name = 'PaidButUndeliveredError';
  }
}

/**
 * Run one paid AI-compute request against a kaspa-ai-gateway: POST, get a 402 with a price, pay
 * it on-chain from your own wallet, retry with the proof, return the answer + the txid.
 */
export async function requestCompute(
  gatewayUrl: string,
  request: TaskRequest,
  options: RequestComputeOptions
): Promise<ComputeOutcome> {
  if (!options?.privateKey) throw new Error('options.privateKey (payer wallet, hex) is required.');
  const endpoint = `${gatewayUrl.replace(/\/$/, '')}/compute`;
  const clientKind = options.clientKind ?? 'api';
  const emit = options.onEvent ?? (() => {});
  const headers = { 'Content-Type': 'application/json', 'X-Client': clientKind };
  const body = JSON.stringify(request);

  const challengeRes = await fetch(endpoint, { method: 'POST', headers, body });
  if (challengeRes.status !== 402) {
    throw new Error(`Expected 402 from ${endpoint}, got ${challengeRes.status}: ${await challengeRes.text()}`);
  }
  const challenge = (await challengeRes.json()) as PaymentRequiredBody;
  const option = challenge.accepts?.[0];
  if (!option) throw new Error('The 402 response carried no payment options.');
  emit({ type: 'quote', amountSompi: option.amountSompi, payTo: option.payTo, network: option.network });

  const { proof } = await buildPaymentProof(option, options.privateKey, {
    rpcUrl: options.rpcUrl,
    network: options.network,
    priorityFeeSompi: options.priorityFeeSompi,
  });
  emit({ type: 'broadcast', txid: proof.txid });

  const paidHeaders = { ...headers, 'X-PAYMENT': encodePaymentProof(proof) };
  let paidRes = await fetch(endpoint, { method: 'POST', headers: paidHeaders, body });
  for (let attempt = 0; paidRes.status === 402 && attempt < SETTLE_RETRY_MS.length; attempt += 1) {
    emit({ type: 'settling', attempt: attempt + 1, maxAttempts: SETTLE_RETRY_MS.length });
    await new Promise((r) => setTimeout(r, SETTLE_RETRY_MS[attempt]));
    paidRes = await fetch(endpoint, { method: 'POST', headers: paidHeaders, body });
  }
  if (!paidRes.ok) {
    throw new PaidButUndeliveredError(
      `Payment ${proof.txid} was made but the gateway did not deliver: ${paidRes.status} ${await paidRes.text()}`,
      proof.txid,
      proof.amountSompi
    );
  }
  const settled = (await paidRes.json()) as { result: TaskResult; payment: SettlementReceipt };
  emit({ type: 'done', txid: proof.txid });
  return { result: settled.result, payment: settled.payment, txid: proof.txid };
}
