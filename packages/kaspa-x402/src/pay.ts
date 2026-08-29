import { loadKaspaSdk, type KaspaRpcClient, type KaspaSdk } from './sdk.js';
import type { PaymentOption, PaymentProof } from './types.js';

export interface SentPayment {
  txid: string;
  fromAddress: string;
}

let rpcSingleton: KaspaRpcClient | null = null;

async function getRpc(kaspa: KaspaSdk, networkId: unknown, rpcUrl?: string): Promise<KaspaRpcClient> {
  if (rpcSingleton?.isConnected) return rpcSingleton;
  // borsh, not json: the public Resolver node pool only serves the borsh wRPC endpoint (a json
  // client just hangs forever trying to connect). borsh is also the SDK default.
  const encoding = kaspa.Encoding.Borsh;
  const client = rpcUrl
    ? new kaspa.RpcClient({ url: rpcUrl, encoding, networkId })
    : new kaspa.RpcClient({ resolver: new kaspa.Resolver(), encoding, networkId });
  await client.connect({ blockAsyncConnect: false });
  for (let i = 0; i < 150 && !client.isConnected; i += 1) await new Promise((r) => setTimeout(r, 100));
  if (!client.isConnected) throw new Error('Could not connect to a Kaspa node (pass rpcUrl, or check your network).');
  rpcSingleton = client;
  return client;
}

/** Build, sign, and broadcast one KAS payment. */
export async function sendKas(
  privateKeyHex: string,
  toAddress: string,
  amountSompi: bigint,
  network: string,
  opts: { rpcUrl?: string; priorityFeeSompi?: bigint } = {}
): Promise<SentPayment> {
  const kaspa = await loadKaspaSdk();
  const networkId = new kaspa.NetworkId(network);
  const rpc = await getRpc(kaspa, networkId, opts.rpcUrl);

  const privateKey = new kaspa.PrivateKey(privateKeyHex);
  const fromAddress = privateKey.toKeypair().toAddress(networkId).toString();

  const { entries } = await rpc.getUtxosByAddresses([fromAddress]);
  if (!entries.length) throw new Error(`No UTXOs for ${fromAddress} -- fund this wallet with KAS first.`);

  const generator = new kaspa.Generator({
    entries,
    outputs: [{ address: toAddress, amount: amountSompi }],
    priorityFee: opts.priorityFeeSompi ?? 300_000n, // matches the gateway's proven default; ~0.003 KAS
    changeAddress: fromAddress,
    networkId,
  });

  let txid = '';
  try {
    let pending = await generator.next();
    while (pending) {
      await pending.sign([privateKey]);
      txid = await pending.submit(rpc);
      pending = await generator.next();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/storage mass/i.test(msg)) {
      throw new Error(
        `${msg} -- this wallet's UTXO(s) are too large relative to the amount being sent (Kaspa's KIP-9 rule). ` +
          `Split the balance into smaller UTXOs by sending the wallet a few smaller payments to itself.`
      );
    }
    throw error instanceof Error ? error : new Error(msg);
  }
  if (!txid) throw new Error('Kaspa transaction generator produced no transaction.');
  return { txid, fromAddress };
}

export async function buildPaymentProof(
  option: PaymentOption,
  privateKeyHex: string,
  opts: { rpcUrl?: string; priorityFeeSompi?: bigint; network?: string } = {}
): Promise<{ proof: PaymentProof; payerAddress: string }> {
  const amountSompi = BigInt(option.amountSompi);
  const network = opts.network ?? option.network;
  const { txid, fromAddress } = await sendKas(privateKeyHex, option.payTo, amountSompi, network, opts);
  return {
    payerAddress: fromAddress,
    proof: { scheme: 'exact', network, payer: fromAddress, txid, amountSompi: amountSompi.toString(), nonce: option.nonce },
  };
}

export async function closeRpc(): Promise<void> {
  if (rpcSingleton) {
    await rpcSingleton.disconnect();
    rpcSingleton = null;
  }
}
