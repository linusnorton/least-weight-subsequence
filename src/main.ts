
/**
 * Covers a sequence of nodes with the cheapest set of contiguous, non-overlapping
 * segments, where any pair `i < j` may be spanned by a single segment.
 *
 * This is the least-weight subsequence problem (Hirschberg & Larmore, 1987):
 * shortest path in a DAG whose nodes are positions in the sequence and whose
 * edges are spannable pairs. A valid cover is exactly a path from the first
 * position to the last, so the cheapest cover is the shortest path.
 *
 *     best[0] = 0
 *     best[j] = min over i < j of ( best[i] + weight(i, j) )
 *
 * Edges are relaxed in sequence order, which is already a topological order, so
 * there is no priority queue. By the time the outer loop reaches `i`, every edge
 * into `i` has been relaxed, so `best[i]` is final when it is read.
 *
 * O(n^2) edges rather than the 2^(n-1) ways to partition the sequence. The number
 * of segments is never chosen; it falls out of the search.
 *
 * The hot loop touches only numbers. The predecessor and the weight of the final
 * edge into each position are enough to rebuild the answer, so nothing is
 * allocated until the decode at the end.
 *
 * Contract:
 *  - Index by POSITION, not by `NodeId`. A sequence may legitimately repeat a node.
 *  - Only forward pairs (`i < j`) are ever segments.
 *  - `Infinity` from `getWeight` means the pair cannot be spanned. It is not a
 *    weight of zero.
 *  - Ties on total weight are broken in favour of FEWER segments, since ascending
 *    `i` reaches the shorter prefix first and the comparison is strict.
 *  - Returns `[]` for a sequence of fewer than two nodes (nothing to span).
 *  - Throws `NoPathError` if no set of segments spans the sequence.
 *
 * @param path      The nodes to cover, in order.
 * @param getWeight Weight lookup; `Infinity` where no edge exists.
 * @returns One entry per segment, in sequence order.
 */
export function leastWeightSubsequence(
  path: NodeId[],
  getWeight: GetWeight,
): Segment[] {
  if (path.length < 2) {
    return [];
  }

  const best = new Float64Array(path.length).fill(Infinity);
  const from = new Int32Array(path.length).fill(-1);
  const edge = new Float64Array(path.length);
  best[0] = 0;

  for (let i = 0; i < path.length; i++) {
    if (best[i] === Infinity) {
      continue;
    }

    for (let j = i + 1; j < path.length; j++) {
      const weight = getWeight(path[i], path[j]);
      const total = best[i] + weight;

      if (total < best[j]) {
        best[j] = total;
        from[j] = i;
        edge[j] = weight;
      }
    }
  }

  if (best[path.length - 1] === Infinity) {
    throw new NoPathError(path[0], path[path.length - 1]);
  }

  // Walk the predecessor chain once to size the result, then again to fill it
  // back to front. `from` is a complete chain back to 0 because the last entry is
  // finite.
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

/** Thrown when no set of segments spans the sequence. */
export class NoPathError extends Error {
  constructor(from: NodeId, to: NodeId) {
    super(`No sequence of segments spans ${from} to ${to}`);
    this.name = 'NoPathError';
  }
}


/** Identifies a node in the sequence. */
export type NodeId = string;

/**
 * Lazy weight lookup. Return `Infinity` when no edge exists between the two
 * nodes. It propagates through the arithmetic on its own, so the hot loop needs no
 * special case for it.
 *
 * Preferred over a precomputed matrix when a weight is expensive to work out: it
 * lets you skip edges the search never asks for, and memoise or batch behind the
 * seam.
 */
export type GetWeight = (from: NodeId, to: NodeId) => number;

/**
 * One segment of the chosen cover: `[[from, to], weight]`, carrying that
 * segment's own weight rather than a running total.
 *
 * Use integer weights if you need exact totals. Summing floats accumulates error,
 * so `11.20 + 34.20 === 45.400000000000006`.
 */
export type Segment = [nodes: NodeId[], weight: number];
