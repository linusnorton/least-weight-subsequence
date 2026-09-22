import { expect } from 'vitest';
import { NoPathError } from '../src/main.js';
import type { GetWeight, NodeId, Segment } from '../src/main.js';
import type { AsyncGetWeight } from '../src/async.js';

export type Weights = Partial<Record<NodeId, Partial<Record<NodeId, number>>>>;

/**
 * Norwich -> London Liverpool Street, calling at Diss, Ipswich and Stratford.
 *
 * FARES ARE ILLUSTRATIVE, in integer pence. They are shaped to contain a real
 * split-ticketing anomaly, not to match any published Greater Anglia price.
 *
 * Exhaustive costs of all 8 possible splits:
 *   NRW-LST                    5670  (the through fare)
 *   NRW-DIS, DIS-LST           4540  <- optimum
 *   NRW-DIS, DIS-SRT, SRT-LST  4550
 *   NRW-IPS, IPS-LST           4810
 *   NRW-IPS, IPS-SRT, SRT-LST  4680
 *   NRW-SRT, SRT-LST           5650
 *   NRW-DIS, DIS-IPS, IPS-LST  5100
 *   every leg separately       4970
 *
 * Note the trap: the cheapest way to reach IPS is the unsplit NRW-IPS (1860,
 * against 2150 via Diss), yet the globally optimal answer skips IPS entirely.
 * Anything greedy gets this wrong.
 */
export const NRW_TO_LST: NodeId[] = ['NRW', 'DIS', 'IPS', 'SRT', 'LST'];

export const NRW_TO_LST_FARES: Weights = {
  NRW: { DIS: 1120, IPS: 1860, SRT: 5410, LST: 5670 },
  DIS: { IPS: 1030, SRT: 3190, LST: 3420 },
  IPS: { SRT: 2580, LST: 2950 },
  SRT: { LST: 240 },
};

export const NRW_TO_LST_THROUGH_FARE = 5670;
export const NRW_TO_LST_BEST_TOTAL = 4540;

/** Deterministic PRNG, so the property tests never flake. */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/**
 * Builds a random sparse fare matrix over `stops`.
 *
 * Adjacent segments are always priced, so a covering ticket set always exists;
 * longer segments are present with probability `density`. Prices are random and
 * deliberately not monotone in distance. That non-monotonicity is the whole reason
 * split ticketing works, and any implementation assuming otherwise should fail
 * these tests.
 */
export function randomFares(
  stops: NodeId[],
  rng: () => number,
  density = 0.7,
): Weights {
  const weights: Weights = {};
  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const adjacent = j === i + 1;
      if (!adjacent && rng() > density) continue;
      const from = stops[i]!;
      const to = stops[j]!;
      (weights[from] ??= {})[to] = 1 + Math.floor(rng() * 5000);
    }
  }
  return weights;
}

/** `['S0', 'S1', ... ]` */
export function makeStops(count: number): NodeId[] {
  return Array.from({ length: count }, (_, i) => `S${i}`);
}

/**
 * Adapts a sparse matrix to the lookup signature the implementation takes.
 * `Infinity` is the implementation's "no edge" sentinel.
 */
export const lookup =
  (weights: Weights): GetWeight =>
  (from, to) =>
    weights[from]?.[to] ?? Infinity;

/**
 * Exhaustive reference implementation, used only as a test oracle for the property
 * test at the bottom. Enumerates all 2^(n-2) ways to cut the sequence. Correct by
 * construction, and too slow beyond about 15 nodes.
 */
export function bruteForce(path: NodeId[], getWeight: GetWeight): Segment[] {
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
export function totalCost(segments: readonly Segment[]): number {
  return segments.reduce((sum, [, weight]) => sum + weight, 0);
}

/**
 * Structural invariant every result must satisfy: the tickets are contiguous,
 * in journey order, start at the origin and end at the destination.
 */
export function expectCoversJourney(tickets: Segment[], path: NodeId[]): void {
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

export const asyncLookup =
  (weights: Weights): AsyncGetWeight =>
  async (from, to) =>
    weights[from]?.[to] ?? Infinity;

/** Wraps a matrix so the test can see call order and overlap. */
export function tracked(weights: Weights, delayMs = 1) {
  const calls: string[] = [];
  let inFlight = 0;
  let peak = 0;
  const get: AsyncGetWeight = async (from, to) => {
    calls.push(`${from}>${to}`);
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    inFlight--;
    return weights[from]?.[to] ?? Infinity;
  };
  return { get, calls, peak: () => peak };
}
