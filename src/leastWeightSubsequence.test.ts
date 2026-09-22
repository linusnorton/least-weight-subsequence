import { describe, expect, it, vi } from 'vitest';
import { leastWeightSubsequence, NoPathError } from './leastWeightSubsequence.js';
import type { GetWeight, NodeId, Segment } from './leastWeightSubsequence.js';
import {
  lookup,
  makeRng,
  makeStops,
  NRW_TO_LST,
  NRW_TO_LST_BEST_TOTAL,
  NRW_TO_LST_FARES,
  NRW_TO_LST_THROUGH_FARE,
  randomFares,
} from './testSupport.js';

/**
 * Exhaustive reference implementation, used only as a test oracle for the property
 * test at the bottom. Enumerates all 2^(n-2) ways to cut the sequence. Correct by
 * construction, and too slow beyond about 15 nodes.
 */
function bruteForce(path: NodeId[], getWeight: GetWeight): Segment[] {
  if (path.length < 2) return [];
  const interior = path.length - 2;
  let best: { segments: Segment[]; weight: number } | undefined;

  for (let mask = 0; mask < 1 << interior; mask++) {
    const cuts = [0];
    for (let bit = 0; bit < interior; bit++) {
      if (mask & (1 << bit)) cuts.push(bit + 1);
    }
    cuts.push(path.length - 1);

    const segments: Segment[] = [];
    let weight = 0;
    let spannable = true;

    for (let k = 0; k + 1 < cuts.length; k++) {
      const from = path[cuts[k]!]!;
      const to = path[cuts[k + 1]!]!;
      const edge = getWeight(from, to);
      if (edge === Infinity) {
        spannable = false;
        break;
      }
      segments.push([[from, to], edge]);
      weight += edge;
    }

    if (!spannable) continue;
    const better =
      best === undefined ||
      weight < best.weight ||
      (weight === best.weight && segments.length < best.segments.length);
    if (better) best = { segments, weight };
  }

  if (best === undefined) throw new NoPathError(path[0]!, path[path.length - 1]!);
  return best.segments;
}

/** Sums the weights of a set of segments. */
function totalCost(segments: readonly Segment[]): number {
  return segments.reduce((sum, [, weight]) => sum + weight, 0);
}

/**
 * Structural invariant every result must satisfy: the tickets are contiguous,
 * in journey order, start at the origin and end at the destination.
 */
function expectCoversJourney(tickets: Segment[], path: NodeId[]): void {
  expect(tickets.length).toBeGreaterThan(0);
  for (const [stops] of tickets) {
    expect(stops).toHaveLength(2);
  }
  expect(tickets[0]![0][0]).toBe(path[0]);
  expect(tickets[tickets.length - 1]![0][1]).toBe(path[path.length - 1]);
  for (let i = 1; i < tickets.length; i++) {
    expect(tickets[i]![0][0]).toBe(tickets[i - 1]![0][1]);
  }
}

describe('leastWeightSubsequence', () => {
  describe('degenerate journeys', () => {
    it('buys nothing for an empty path', () => {
      expect(leastWeightSubsequence([], lookup({}))).toEqual([]);
    });

    it('buys nothing for a single stop', () => {
      expect(leastWeightSubsequence(['NRW'], lookup({}))).toEqual([]);
    });
  });

  describe('basic journeys', () => {
    it('buys one ticket for a single segment', () => {
      expect(leastWeightSubsequence(['A', 'B'], lookup({ A: { B: 500 } }))).toEqual([[['A', 'B'], 500]]);
    });

    it('buys the through ticket when no split is cheaper', () => {
      const weights = { A: { B: 400, C: 500 }, B: { C: 400 } };
      expect(leastWeightSubsequence(['A', 'B', 'C'], lookup(weights))).toEqual([[['A', 'C'], 500]]);
    });

    it('splits when splitting is cheaper', () => {
      const weights = { A: { B: 100, C: 900 }, B: { C: 100 } };
      expect(leastWeightSubsequence(['A', 'B', 'C'], lookup(weights))).toEqual([
        [['A', 'B'], 100],
        [['B', 'C'], 100],
      ]);
    });
  });

  describe('Norwich to London Liverpool Street', () => {
    it('finds the two-ticket optimum, splitting at Diss', () => {
      expect(leastWeightSubsequence(NRW_TO_LST, lookup(NRW_TO_LST_FARES))).toEqual([
        [['NRW', 'DIS'], 1120],
        [['DIS', 'LST'], 3420],
      ]);
    });

    it('costs 45.40 rather than the 56.70 through fare', () => {
      const tickets = leastWeightSubsequence(NRW_TO_LST, lookup(NRW_TO_LST_FARES));
      expect(totalCost(tickets)).toBe(NRW_TO_LST_BEST_TOTAL);
      expect(totalCost(tickets)).toBeLessThan(NRW_TO_LST_THROUGH_FARE);
    });

    it('is not fooled by the cheapest prefix to Ipswich', () => {
      // Reaching IPS is cheapest unsplit (1860 < 1120 + 1030), yet the optimal
      // answer passes straight through Ipswich. Greedy implementations return
      // the 4810 answer here.
      const tickets = leastWeightSubsequence(NRW_TO_LST, lookup(NRW_TO_LST_FARES));
      expect(tickets.flatMap(([stops]) => stops)).not.toContain('IPS');
    });

    it('returns a contiguous cover of the journey', () => {
      expectCoversJourney(leastWeightSubsequence(NRW_TO_LST, lookup(NRW_TO_LST_FARES)), NRW_TO_LST);
    });

    it('agrees with exhaustive enumeration', () => {
      const expected = bruteForce(NRW_TO_LST, lookup(NRW_TO_LST_FARES));
      expect(leastWeightSubsequence(NRW_TO_LST, lookup(NRW_TO_LST_FARES))).toEqual(expected);
    });
  });

  describe('multiple splits', () => {
    it('buys three tickets when that is the optimum', () => {
      const weights = {
        A: { B: 100, C: 500, D: 1000 },
        B: { C: 100, D: 500 },
        C: { D: 100 },
      };
      expect(leastWeightSubsequence(['A', 'B', 'C', 'D'], lookup(weights))).toEqual([
        [['A', 'B'], 100],
        [['B', 'C'], 100],
        [['C', 'D'], 100],
      ]);
    });

    it('buys every leg separately when only adjacent fares exist', () => {
      const stops = makeStops(6);
      const weights: Record<string, Record<string, number>> = {};
      for (let i = 0; i + 1 < stops.length; i++) {
        weights[stops[i]!] = { [stops[i + 1]!]: 10 };
      }
      const tickets = leastWeightSubsequence(stops, lookup(weights));
      expect(tickets).toHaveLength(5);
      expect(totalCost(tickets)).toBe(50);
      expectCoversJourney(tickets, stops);
    });

    it('never costs more than the through fare', () => {
      const rng = makeRng(99);
      for (let trial = 0; trial < 50; trial++) {
        const stops = makeStops(6);
        const weights = randomFares(stops, rng);
        (weights['S0'] ??= {})['S5'] = 2500;
        expect(totalCost(leastWeightSubsequence(stops, lookup(weights)))).toBeLessThanOrEqual(2500);
      }
    });
  });

  describe('sparse fare matrices', () => {
    it('treats a missing fare as unbuyable, not as free', () => {
      // A -> C has no fare. Returning [['A','C'], 0] would be catastrophic.
      const weights = { A: { B: 100 }, B: { C: 100 } };
      expect(leastWeightSubsequence(['A', 'B', 'C'], lookup(weights))).toEqual([
        [['A', 'B'], 100],
        [['B', 'C'], 100],
      ]);
    });

    it('routes around a missing intermediate fare', () => {
      const weights = { A: { B: 100, D: 700 }, B: { C: 100 }, C: { D: 100 } };
      const tickets = leastWeightSubsequence(['A', 'B', 'C', 'D'], lookup(weights));
      expect(totalCost(tickets)).toBe(300);
      expectCoversJourney(tickets, ['A', 'B', 'C', 'D']);
    });

    it('throws when no ticket set covers the journey', () => {
      const weights = { A: { B: 100 } };
      expect(() => leastWeightSubsequence(['A', 'B', 'C'], lookup(weights))).toThrow(NoPathError);
    });

    it('throws when the only stop pair has no fare at all', () => {
      expect(() => leastWeightSubsequence(['A', 'B'], lookup({}))).toThrow(NoPathError);
    });

    it('ignores fares for stops that are not on the journey', () => {
      const weights = { A: { B: 100, Z: 1 }, B: { C: 100 }, Z: { C: 1 } };
      expect(totalCost(leastWeightSubsequence(['A', 'B', 'C'], lookup(weights)))).toBe(200);
    });
  });

  describe('contract details', () => {
    it('only buys forward segments', () => {
      // A cheap B -> A fare must not tempt it into buying a reverse ticket.
      const weights = { A: { B: 500 }, B: { A: 1 } };
      expect(leastWeightSubsequence(['A', 'B'], lookup(weights))).toEqual([[['A', 'B'], 500]]);
    });

    it('indexes by position, so a journey may revisit a stop', () => {
      // Out and back: A -> B -> A. There is no A -> A fare.
      const weights = { A: { B: 100 }, B: { A: 100 } };
      const tickets = leastWeightSubsequence(['A', 'B', 'A'], lookup(weights));
      expect(tickets).toEqual([
        [['A', 'B'], 100],
        [['B', 'A'], 100],
      ]);
    });

    it('handles zero-priced segments', () => {
      // 0 is falsy; `if (!price)` would discard this edge.
      const weights = { A: { B: 0, C: 50 }, B: { C: 10 } };
      expect(leastWeightSubsequence(['A', 'B', 'C'], lookup(weights))).toEqual([
        [['A', 'B'], 0],
        [['B', 'C'], 10],
      ]);
    });

    it('prefers fewer tickets when totals tie', () => {
      const weights = { A: { B: 100, C: 200 }, B: { C: 100 } };
      expect(leastWeightSubsequence(['A', 'B', 'C'], lookup(weights))).toEqual([[['A', 'C'], 200]]);
    });
  });

  describe('weight sources', () => {
    it('accepts a lookup function', () => {
      const get = (from: NodeId, to: NodeId): number =>
        NRW_TO_LST_FARES[from]?.[to] ?? Infinity;
      expect(totalCost(leastWeightSubsequence(NRW_TO_LST, get))).toBe(NRW_TO_LST_BEST_TOTAL);
    });

    it('produces identical results from a matrix and a direct function', () => {
      const get = (from: NodeId, to: NodeId): number =>
        NRW_TO_LST_FARES[from]?.[to] ?? Infinity;
      expect(leastWeightSubsequence(NRW_TO_LST, get)).toEqual(
        leastWeightSubsequence(NRW_TO_LST, lookup(NRW_TO_LST_FARES)),
      );
    });

    it('never asks for a backwards segment', () => {
      const get = vi.fn((from: NodeId, to: NodeId) => NRW_TO_LST_FARES[from]?.[to] ?? Infinity);
      leastWeightSubsequence(NRW_TO_LST, get);
      const order = new Map(NRW_TO_LST.map((stop, i) => [stop, i]));
      for (const [from, to] of get.mock.calls) {
        expect(order.get(from)!).toBeLessThan(order.get(to)!);
      }
    });

    it('prices each segment at most once', () => {
      // Fare lookup is the expensive part; the DP should never re-price an edge.
      const get = vi.fn((from: NodeId, to: NodeId) => NRW_TO_LST_FARES[from]?.[to] ?? Infinity);
      leastWeightSubsequence(NRW_TO_LST, get);
      const seen = get.mock.calls.map(([from, to]) => `${from}>${to}`);
      expect(new Set(seen).size).toBe(seen.length);
      expect(seen.length).toBeLessThanOrEqual(10); // C(5,2)
    });
  });

  describe('against exhaustive enumeration', () => {
    it('matches brute force on 200 random sparse matrices', () => {
      const rng = makeRng(20260921);
      for (let trial = 0; trial < 200; trial++) {
        const stops = makeStops(2 + Math.floor(rng() * 7));
        const weights = randomFares(stops, rng, 0.6);

        const actual = leastWeightSubsequence(stops, lookup(weights));
        const expected = bruteForce(stops, lookup(weights));

        // Ties beyond "fewest tickets" are unspecified, so compare the two
        // properties that are well defined rather than the exact split points.
        expect(totalCost(actual)).toBe(totalCost(expected));
        expect(actual).toHaveLength(expected.length);
        expectCoversJourney(actual, stops);
      }
    });
  });

  describe('performance', () => {
    it('handles a 50-stop journey with a full fare matrix', () => {
      const rng = makeRng(7);
      const stops = makeStops(50);
      const weights = randomFares(stops, rng, 1);

      const started = performance.now();
      const tickets = leastWeightSubsequence(stops, lookup(weights));
      const elapsed = performance.now() - started;

      expectCoversJourney(tickets, stops);
      expect(elapsed).toBeLessThan(250);
    });
  });
});
