// The wire shapes of the HTTP-402 handshake, matching what a kaspa-ai-gateway serves.

export interface FacilitatorInfo {
  publicKey: string;
  url: string;
}

export interface PaymentOption {
  scheme: 'exact';
  network: string;
  asset: 'KAS';
  payTo: string;
  amountSompi: string;
  resource: string;
  description: string;
  mimeType: 'application/json';
  maxTimeoutSeconds: number;
  nonce: string;
  facilitator: FacilitatorInfo;
}

export interface PaymentRequiredBody {
  x402Version: 1;
  error: string;
  accepts: PaymentOption[];
}

export interface PaymentProof {
  scheme: 'exact';
  network: string;
  payer: string;
  txid: string;
  amountSompi: string;
  nonce: string;
}

export interface SettlementReceipt {
  success: true;
  txid: string;
  payer: string;
  amountSompi: string;
  nonce: string;
  network: string;
  settledAt: string;
  signature?: string;
}

export type Tier = 'kaspa-fast-1' | 'kaspa-reasoning-1';

export interface TaskRequest {
  prompt: string;
  model?: Tier;
  maxTokens?: number;
  temperature?: number;
}

export interface TaskResult {
  id: string;
  model: string;
  createdAt: string;
  latencyMs: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  output: { text: string; summary: string; confidence: number; tags: string[] };
  processedBy: string;
}

export interface ComputeOutcome {
  result: TaskResult;
  payment: SettlementReceipt;
  txid: string;
}

export type PayEvent =
  | { type: 'quote'; amountSompi: string; payTo: string; network: string }
  | { type: 'broadcast'; txid: string }
  | { type: 'settling'; attempt: number; maxAttempts: number }
  | { type: 'done'; txid: string };

export interface RequestComputeOptions {
  /** Payer private key, hex. Required. */
  privateKey: string;
  /** Kaspa wRPC node URL. Omit to auto-discover a public node via the SDK Resolver. */
  rpcUrl?: string;
  /** Override the network id (default: taken from the gateway's 402 quote). */
  network?: string;
  /** Priority fee in sompi added on top of the SDK's mass-based fee. Default 300000 (~0.003 KAS). */
  priorityFeeSompi?: bigint;
  /** Progress callback. */
  onEvent?: (event: PayEvent) => void;
  /** Label for the gateway's public activity feed: 'api' | 'mcp' | 'agent' | 'signal'. */
  clientKind?: string;
}
