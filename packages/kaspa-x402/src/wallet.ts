import { loadKaspaSdk } from './sdk.js';

export interface GeneratedWallet {
  address: string;
  privateKey: string;
}

/** Create a fresh random Kaspa keypair for the given network ('mainnet' | 'testnet-10' | ...). */
export async function generateWallet(network = 'mainnet'): Promise<GeneratedWallet> {
  const kaspa = await loadKaspaSdk();
  const keypair = kaspa.Keypair.random();
  return {
    address: keypair.toAddress(new kaspa.NetworkId(network)).toString(),
    privateKey: keypair.privateKey.toString(),
  };
}

/** Address for a private key on a network -- no network calls. */
export async function addressForKey(privateKeyHex: string, network = 'mainnet'): Promise<string> {
  const kaspa = await loadKaspaSdk();
  return new kaspa.PrivateKey(privateKeyHex).toKeypair().toAddress(new kaspa.NetworkId(network)).toString();
}
