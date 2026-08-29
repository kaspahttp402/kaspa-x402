// Loads the vendored Kaspa WASM bindings. The published `kaspa-wasm` on npm is stuck at a
// broken 0.13.0; this bundles the working 2.0.1 nodejs build from rusty-kaspa (see ./vendor).
// The bindings need a W3C WebSocket global before the module evaluates, and ESM hoists module
// evaluation ahead of same-file top-level code -- so the shim and the import must both happen
// inside this function, in this order.

export interface KaspaKeypair {
  publicKey: string;
  toAddress(networkId: unknown): { toString(): string };
}
export interface KaspaPrivateKey {
  toString(): string;
  toKeypair(): KaspaKeypair;
}
export interface KaspaUtxoEntry {
  address: string | undefined;
  outpoint: { transactionId: string; index: number };
  amount: bigint;
  scriptPublicKey: unknown;
  isCoinbase: boolean;
  blockDaaScore: bigint;
}
export interface KaspaPendingTransaction {
  sign(privateKeys: KaspaPrivateKey[]): Promise<void> | void;
  submit(rpc: KaspaRpcClient): Promise<string>;
}
export interface KaspaGenerator {
  next(): Promise<KaspaPendingTransaction | null>;
}
export interface KaspaXPrv {
  toString(): string;
}
export interface KaspaRpcClient {
  connect(args?: { blockAsyncConnect?: boolean }): Promise<void>;
  disconnect(): Promise<void>;
  readonly isConnected: boolean;
  getUtxosByAddresses(addresses: string[]): Promise<{ entries: KaspaUtxoEntry[] }>;
}

export interface KaspaSdk {
  RpcClient: new (config: { url?: string; resolver?: unknown; encoding: unknown; networkId: unknown }) => KaspaRpcClient;
  Resolver: new () => unknown;
  PrivateKey: new (hex: string) => KaspaPrivateKey;
  Generator: new (args: {
    entries: KaspaUtxoEntry[];
    outputs: { address: string; amount: bigint }[];
    priorityFee: bigint;
    changeAddress: string;
    networkId: unknown;
  }) => KaspaGenerator;
  XPrv: new (seedHex: string) => KaspaXPrv;
  NetworkId: new (id: string) => unknown;
  Encoding: { Borsh: unknown; SerdeJson: unknown };
  Keypair: { random(): KaspaKeypair & { privateKey: KaspaPrivateKey } };
  initConsolePanicHook?(): void;
}

let cached: KaspaSdk | null = null;

// The bindings live in ./vendor (shipped in the package's `files`). dist/sdk.js resolves this to
// <package>/vendor/kaspa-wasm-2.0.1/kaspa.js at runtime.
const WASM_ENTRY = new URL('../vendor/kaspa-wasm-2.0.1/kaspa.js', import.meta.url).href;

export async function loadKaspaSdk(): Promise<KaspaSdk> {
  if (cached) return cached;
  if (!('WebSocket' in globalThis)) {
    const { default: WebSocketImpl } = await import('isomorphic-ws');
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocketImpl;
  }
  const imported = (await import(WASM_ENTRY)) as { default?: KaspaSdk } & KaspaSdk;
  const sdk = (imported.default ?? imported) as KaspaSdk;
  sdk.initConsolePanicHook?.();
  cached = sdk;
  return sdk;
}
