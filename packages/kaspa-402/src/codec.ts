import type { PaymentProof } from './types.js';

/** base64(JSON) of a payment proof -- the value of the X-PAYMENT header. */
export function encodePaymentProof(proof: PaymentProof): string {
  return Buffer.from(JSON.stringify(proof), 'utf8').toString('base64');
}
