import { describe, expect, it } from 'vitest';
import { leastWeightSubsequence, NoPathError } from './main.js';
import { leastWeightSubsequenceAsync } from './async.js';
import type { AsyncGetWeight } from './async.js';
import {
  asyncLookup,
  lookup,
  makeRng,
  makeStops,
  NRW_TO_LST,
  NRW_TO_LST_FARES,
  randomFares,
  tracked,
  type Weights,
} from '../test/helpers.js';

describe('leastWeightSubsequenceAsync', () => {

  it('returns nothing for degenerate sequences', async () => {
    await expect(leastWeightSubsequenceAsync([], asyncLookup({}))).resolves.toEqual([]);
    await expect(leastWeightSubsequenceAsync(['NRW'], asyncLookup({}))).resolves.toEqual([]);
  });

  it('finds the same optimum as the synchronous version', async () => {
    await expect(
      leastWeightSubsequenceAsync(NRW_TO_LST, asyncLookup(NRW_TO_LST_FARES)),
    ).resolves.toEqual([
      [['NRW', 'DIS'], 1120],
      [['DIS', 'LST'], 3420],
    ]);
  });

  it('matches the synchronous version on 200 random sparse matrices', async () => {
    const rng = makeRng(8675309);
    for (let trial = 0; trial < 200; trial++) {
      const stops = makeStops(2 + Math.floor(rng() * 7));
      const weights = randomFares(stops, rng, 0.6);
      await expect(leastWeightSubsequenceAsync(stops, asyncLookup(weights))).resolves.toEqual(
        leastWeightSubsequence(stops, lookup(weights)),
      );
    }
  });

  it('accepts a lookup that returns plain numbers', async () => {
    const get: AsyncGetWeight = (from, to) => NRW_TO_LST_FARES[from]?.[to] ?? Infinity;
    await expect(leastWeightSubsequenceAsync(NRW_TO_LST, get)).resolves.toEqual(
      leastWeightSubsequence(NRW_TO_LST, lookup(NRW_TO_LST_FARES)),
    );
  });

  it('rejects with the same NoPathError class the sync version throws', async () => {
    await expect(
      leastWeightSubsequenceAsync(['A', 'B', 'C'], asyncLookup({ A: { B: 100 } })),
    ).rejects.toBeInstanceOf(NoPathError);
  });

  it('propagates a rejected lookup', async () => {
    const boom: AsyncGetWeight = async () => {
      throw new Error('lookup failed');
    };
    await expect(leastWeightSubsequenceAsync(['A', 'B'], boom)).rejects.toThrow('lookup failed');
  });

  it('requests a whole row concurrently', async () => {
    // Four edges leave NRW, and none of them depend on each other.
    const t = tracked(NRW_TO_LST_FARES);
    await leastWeightSubsequenceAsync(NRW_TO_LST, t.get);
    expect(t.peak()).toBe(4);
  });

  it('respects a concurrency cap', async () => {
    const t = tracked(NRW_TO_LST_FARES);
    await leastWeightSubsequenceAsync(NRW_TO_LST, t.get, { concurrency: 2 });
    expect(t.peak()).toBe(2);
  });

  it('still queries each pair at most once under a cap', async () => {
    const t = tracked(NRW_TO_LST_FARES);
    await leastWeightSubsequenceAsync(NRW_TO_LST, t.get, { concurrency: 2 });
    expect(new Set(t.calls).size).toBe(t.calls.length);
    expect(t.calls).toHaveLength(10);
  });

  it('never queries behind an unreachable prefix', async () => {
    // B cannot be reached, so no edge should ever be requested leaving it.
    const weights: Weights = { A: { C: 10, D: 100 }, C: { D: 10 } };
    const t = tracked(weights);
    await expect(leastWeightSubsequenceAsync(['A', 'B', 'C', 'D'], t.get)).resolves.toEqual([
      [['A', 'C'], 10],
      [['C', 'D'], 10],
    ]);
    expect(t.calls.filter((c) => c.startsWith('B>'))).toEqual([]);
  });

  it('rejects a concurrency below 1', async () => {
    await expect(
      leastWeightSubsequenceAsync(NRW_TO_LST, asyncLookup(NRW_TO_LST_FARES), { concurrency: 0 }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
