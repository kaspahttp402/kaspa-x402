/**
 * Buying from a server that quotes a metered SESSION instead of a single price.
 *
 * `requestCompute` handles x402's `exact` scheme: one price, one payment, one answer. That works
 * when the size of the work is known before it is done. It is not, for anything whose cost depends
 * on the output -- a model's reply, a file's length -- and x402 says so, listing multi-settlement
 * and pay-per-chunk as out of scope.
 *
 * `metered` is the scheme that fills that gap, and this is the client half. The buyer authorises
 * one slice at a time, counts what arrives itself, and signs only the figure it measured. What
 * comes back is a signed statement of what is owed, which the covenant on Kaspa can enforce
 * whether or not either party is still cooperating.
 *
 * NOTHING HERE REIMPLEMENTS THE PROTOCOL. It is a thin pass-through to `metered-protocol`, so a
 * caller that already depends on this package can speak the scheme without learning a second one,
 * and the accounting stays in the implementation that has a conformance suite behind it.
 */
import {
  openSession, runBabel, readOffer, meterFor, publicKeyHex,
  type Offer, type State,
} from 'metered-protocol';

export class NotMetered extends Error {}

export interface BabelOutcome {
  /** The bytes this slice delivered. Text units arrive as UTF-8. */
  content: Uint8Array;
  /** What the two sides agreed to bill for it, which may be less than was reserved. */
  billedUnits: number;
}

export interface MeteredPurchase {
  offer: Offer;
  babels: BabelOutcome[];
  totalUnits: number;
  totalSompi: number;
  /**
   * The last agreed State and both signatures over its 72-byte preimage.
   *
   * This is the part worth keeping. It is what the covenant's `settle` entry takes, and without
   * both signatures a caller holds a number nobody is obliged to honour. `null` only when nothing
   * was delivered.
   */
  settlement: { state: State; providerSig: string; buyerSig: string } | null;
}

export interface BuyMeteredOptions {
  /** The buyer's secret key, hex. Its public half is what the Offer commits to. */
  buyerKeyHex: string;
  /** One request per slice. The server decides what a request means; the protocol does not. */
  asks: string[];
  /** Refuse an Offer that names a different chain before spending anything. */
  expectedNetwork?: string;
  /**
   * Run once after the Offer exists and before the first slice.
   *
   * THE ORDER IS FORCED: a covenant's address is derived from the Offer's own session id, so it
   * cannot be funded until the session is open, and a seller has no reason to deliver against
   * funds that are not there yet. Anything paying on chain hooks in here.
   */
  afterOpen?: (offer: Offer) => Promise<void>;
  /** Called as each slice lands, for progress. */
  onBabel?: (outcome: BabelOutcome, index: number) => void;
}

/**
 * Which scheme a server is quoting, without paying it anything.
 *
 * A 402 carries its scheme in the offer, so a client can look before it decides how to pay. This
 * exists so a caller holding one endpoint can route to `buyMetered` or to `requestCompute`
 * without guessing from the URL.
 */
export async function offeredScheme(base: string, buyerKeyHex: string): Promise<string | null> {
  try {
    const offer = await readOffer(base, publicKeyHex(buyerKeyHex));
    return offer.scheme ?? null;
  } catch {
    return null;
  }
}

/**
 * Run a whole metered session and return what was delivered and what is owed.
 *
 * Every slice is measured by this client against the meter the Offer names -- not accepted from
 * the server. If the two counts disagree beyond the Offer's tolerance the underlying session
 * halts and this throws, which is the protocol's only remedy for disagreement and deliberately
 * not a retry.
 */
export async function buyMetered(base: string, opts: BuyMeteredOptions): Promise<MeteredPurchase> {
  if (opts.asks.length === 0) throw new NotMetered('a session with no asks buys nothing');

  const offer = await readOffer(base, publicKeyHex(opts.buyerKeyHex));
  if (offer.scheme !== 'metered') {
    throw new NotMetered(`this server quotes "${offer.scheme}", not "metered"`);
  }

  const meter = meterFor(offer.meter, offer.unit);
  const { session } = await openSession(base, opts.buyerKeyHex, meter, opts.expectedNetwork);
  if (opts.afterOpen) await opts.afterOpen(offer);

  const babels: BabelOutcome[] = [];
  let settlement: MeteredPurchase['settlement'] = null;
  let totalUnits = 0;

  for (const [i, ask] of opts.asks.entries()) {
    const out = await runBabel(base, session, ask);
    const outcome: BabelOutcome = { content: out.content, billedUnits: out.billedUnits };
    babels.push(outcome);
    totalUnits += out.billedUnits;
    settlement = { state: out.state, providerSig: out.providerSig, buyerSig: out.buyerSig };
    opts.onBabel?.(outcome, i);
  }

  return { offer, babels, totalUnits, totalSompi: session.spentSompi, settlement };
}

/** The delivered slices joined back into text, for units that are text. */
export const asText = (purchase: MeteredPurchase): string =>
  purchase.babels.map((b) => new TextDecoder().decode(b.content)).join('');
