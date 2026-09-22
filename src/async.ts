import { NoPathError } from './main.js';
import type { NodeId, Segment } from './main.js';

/**
 * Asynchronous form of `leastWeightSubsequence`, for weight lookups that hit the
 * network, a database or anything else returning a promise.
 *
 * Results are identical to the synchronous version for the same weights. The
 * recurrence is unchanged:
 *
 *     best[0] = 0
 *     best[j] = min over i < j of ( best[i] + weight(i, j) )
 *
 * Every edge leaving `i` is independent of every other, so a whole row is
 * requested at once rather than one pair at a time. That is `path.length` rounds
 * of latency instead of `path.length^2 / 2`. Rows still run in sequence, because
 * `best[i]` has to be final before the edges leaving `i` are relaxed, which is
 * also what preserves the guarantee that nothing is ever requested for a pair
 * behind an unreachable prefix.
 *
 * See the synchronous version for the full contract. It applies here unchanged.
 *
 * @param path      The nodes to cover, in order.
 * @param getWeight Weight lookup; resolve to `Infinity` where no edge exists.
 * @param options   Optional concurrency cap.
 * @returns One entry per segment, in sequence order.
 */
export async function leastWeightSubsequenceAsync(
  path: NodeId[],
  getWeight: AsyncGetWeight,
  options: AsyncOptions = {},
): Promise<Segment[]> {
  if (path.length < 2) {
    return [];
  }

  const concurrency = options.concurrency ?? Number.POSITIVE_INFINITY;
  if (concurrency < 1) {
    throw new RangeError(`concurrency must be at least 1, got ${concurrency}`);
  }

  const best = new Float64Array(path.length).fill(Infinity);
  const from = new Int32Array(path.length).fill(-1);
  const edge = new Float64Array(path.length);
  best[0] = 0;

  for (let i = 0; i < path.length; i++) {
    if (best[i] === Infinity) {
      continue;
    }

    for (let start = i + 1; start < path.length; start += concurrency) {
      const stop = Math.min(start + concurrency, path.length);

      const pending: Array<number | PromiseLike<number>> = [];
      for (let j = start; j < stop; j++) {
        pending.push(getWeight(path[i], path[j]));
      }
      const weights = await Promise.all(pending);

      for (let k = 0; k < weights.length; k++) {
        const j = start + k;
        const weight = weights[k];
        const total = best[i] + weight;

        if (total < best[j]) {
          best[j] = total;
          from[j] = i;
          edge[j] = weight;
        }
      }
    }
  }

  if (best[path.length - 1] === Infinity) {
    throw new NoPathError(path[0], path[path.length - 1]);
  }

  let count = 0;
  for (let j = path.length - 1; j > 0; j = from[j]) {
    count++;
  }

  const segments = new Array<Segment>(count);
  for (let j = path.length - 1, k = count - 1; j > 0; j = from[j], k--) {
    segments[k] = [[path[from[j]], path[j]], edge[j]];
  }

  return segments;
}

export { NoPathError };
export type { NodeId, Segment };

/**
 * Lazy weight lookup that may return a promise. Resolve to `Infinity` when no
 * edge exists between the two nodes.
 *
 * Returning a plain number is allowed, so a lookup that is usually cached and
 * occasionally remote does not have to wrap every hit in a promise.
 */
export type AsyncGetWeight = (
  from: NodeId,
  to: NodeId,
) => number | PromiseLike<number>;

export interface AsyncOptions {
  /**
   * Maximum number of `getWeight` calls in flight at once. Defaults to a whole
   * row, which is up to `path.length - 1` concurrent calls. Set it when the
   * lookup talks to something that will not enjoy 50 simultaneous requests.
   */
  concurrency?: number;
}
