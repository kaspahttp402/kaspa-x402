/**
 * Buying from a real metered server, over a real socket.
 *
 * This is the first test in this package, and it is an integration test rather than a unit one on
 * purpose: the thing worth checking is not that `buyMetered` calls the functions it calls, but
 * that a server quoting the `metered` scheme and a client written here actually complete a session
 * and agree on what is owed. A mock of the server would only assert that the mock matches my idea
 * of the server.
 *
 * No chain is involved. A session produces a doubly-signed statement of the debt; settling it is a
 * separate step with its own machinery, and its absence here is not a gap in what is being tested.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import {
  MeteredService, serveMetered, meterFor, utf8, publicKeyHex,
  type OfferTerms, type Deliver,
} from 'metered-protocol';
import { buyMetered, offeredScheme, asText, NotMetered } from './metered.js';

const PROVIDER_SK = 'a7'.repeat(32);
const BUYER_SK = 'b8'.repeat(32);
const PRICE = 3;

const TERMS: OfferTerms = {
  v: 1, scheme: 'metered', network: 'kaspa:testnet-10', asset: 'KAS',
  unit: 'net.bytes_delivered.v1', meter: 'octets',
  unitPriceSompi: PRICE, babelUnits: 32, maxBabels: 16,
  toleranceAbs: 0, checkpointEvery: 0, responseWindowDaa: 600,
};

/** Answers each ask with that many bytes, capped by the slice the buyer reserved. */
const deliver: Deliver = (ask: string, maxUnits: number) =>
  utf8(ask.repeat(maxUnits).slice(0, Math.min(maxUnits, ask.length * 3)));

async function server(terms: OfferTerms = TERMS, d: Deliver = deliver) {
  const service = new MeteredService({
    terms, providerSk: PROVIDER_SK, providerPubkey: publicKeyHex(PROVIDER_SK),
    meter: meterFor(terms.meter, terms.unit), deliver: d,
  });
  const s = serveMetered({ service });
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  return {
    base: `http://127.0.0.1:${(s.address() as AddressInfo).port}`,
    stop: () => new Promise<void>((r) => s.close(() => r())),
  };
}

test('a client can see which scheme is quoted before it spends anything', async () => {
  const { base, stop } = await server();
  try {
    assert.equal(await offeredScheme(base, BUYER_SK), 'metered');
    assert.equal(await offeredScheme('http://127.0.0.1:1', BUYER_SK), null, 'an unreachable server quotes nothing');
  } finally {
    await stop();
  }
});

test('A WHOLE SESSION: three slices, each counted by the buyer and signed by both', async () => {
  const { base, stop } = await server();
  try {
    const seen: number[] = [];
    const bought = await buyMetered(base, {
      buyerKeyHex: BUYER_SK,
      asks: ['ab', 'cde', 'f'],
      expectedNetwork: 'kaspa:testnet-10',
      onBabel: (o) => seen.push(o.billedUnits),
    });

    assert.equal(bought.babels.length, 3);
    assert.deepEqual(seen, [6, 9, 3], 'each ask delivers three times its own length');
    assert.equal(bought.totalUnits, 18);
    assert.equal(bought.totalSompi, 18 * PRICE, 'billed for the bytes that arrived');
    assert.equal(asText(bought), 'ababab' + 'cdecdecde' + 'fff');

    // The part worth keeping: a statement of the debt that consensus can enforce.
    assert.notEqual(bought.settlement, null);
    assert.equal(bought.settlement?.state.cumulativeUnits, 18);
    assert.equal(bought.settlement?.state.cumulativeSompi, 18 * PRICE);
    assert.match(bought.settlement?.providerSig ?? '', /^[0-9a-f]{128}$/);
    assert.match(bought.settlement?.buyerSig ?? '', /^[0-9a-f]{128}$/, 'the buyer signed its own count');
  } finally {
    await stop();
  }
});

test('UNDER-DELIVERY IS BILLED SHORT, not at what was reserved', async () => {
  // The seller returns four bytes however large a slice was authorised. A one-shot scheme cannot
  // express this: there, the price is agreed before anyone knows what will arrive.
  const { base, stop } = await server(TERMS, () => utf8('abcd'));
  try {
    const bought = await buyMetered(base, { buyerKeyHex: BUYER_SK, asks: ['anything'] });
    assert.equal(bought.totalUnits, 4, 'four bytes, not the 32 reserved');
    assert.equal(bought.totalSompi, 4 * PRICE);
  } finally {
    await stop();
  }
});

test('a server that overstates what it sent is refused, and the session stops', async () => {
  const { base, stop } = await server();
  try {
    // The provider counts with a meter that inflates. The buyer counts the same bytes honestly,
    // the two disagree past a tolerance of zero, and there is no arbiter to appeal to.
    const lying = new MeteredService({
      terms: TERMS, providerSk: PROVIDER_SK, providerPubkey: publicKeyHex(PROVIDER_SK),
      meter: (c: Uint8Array) => c.length * 2, deliver,
    });
    const s = serveMetered({ service: lying });
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
    const liar = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    try {
      await assert.rejects(
        () => buyMetered(liar, { buyerKeyHex: BUYER_SK, asks: ['ab'] }),
        /differ by more than/,
      );
    } finally {
      await new Promise<void>((r) => s.close(() => r()));
    }
  } finally {
    await stop();
  }
});

test('the buyer refuses a wrong network, and an empty session, before spending', async () => {
  const { base, stop } = await server();
  try {
    await assert.rejects(
      () => buyMetered(base, { buyerKeyHex: BUYER_SK, asks: ['ab'], expectedNetwork: 'kaspa:mainnet' }),
      /network/,
    );
    await assert.rejects(() => buyMetered(base, { buyerKeyHex: BUYER_SK, asks: [] }), NotMetered);
  } finally {
    await stop();
  }
});
