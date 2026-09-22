# least-weight-subsequence

Dijkstra picks which nodes you visit. This picks where you cut a sequence you are
visiting all of.

You have a fixed list of points, in order, and you pass through every one of them.
The only decision is which points are boundaries, where one segment ends and the
next begins. Spanning any two points has a weight, and you want the cheapest set of
segments covering the whole list.

![Each forward pair is probed against the weight matrix. best[] and from[] update when a cheaper prefix is found, and the predecessor chain is walked back to recover the segments. C is travelled through but is never a cut point.](docs/algorithm.svg)

```ts
leastWeightSubsequence(['A', 'B', 'C', 'D', 'E'], getWeight)
// => [ [['A','B'], 100], [['B','D'], 250], [['D','E'], 40] ]
```

## Why this is not Dijkstra

In the graph, the segment `B→D` skips `C`. That looks like a shortest path routing
around a node, which is why the problem seems to call for Dijkstra.

It does not, because "skipped" means something different here. A node Dijkstra
skips is one you never go to. A node this skips is one you still travel straight
through, it just is not a boundary. Nothing is ever avoided, so there is no route
to find, only cut points to choose.

That removes most of Dijkstra's machinery:

* No priority queue. Dijkstra's heap decides which node to settle next. Here the
  answer is always the next node in the sequence, so the heap does nothing. One
  pass, left to right.
* No topological sort. The sequence is already in topological order.
* Negative weights are fine. Nothing is settled in weight order, and a DAG has no
  cycles, so a negative edge cannot invalidate a node that is already done.

## The name

The "subsequence" is the sequence of cut points, not a subset of the elements.
Every element is always covered. The name comes from Hirschberg and Larmore (1987)
and is kept so the literature is easy to find.

## The algorithm

Shortest path in a DAG whose nodes are positions in the sequence and whose edges
are spannable pairs. A valid cover is exactly a path from the first position to the
last, so the cheapest cover is the shortest path.

    best[0] = 0
    best[j] = min over i < j of ( best[i] + weight(i, j) )

Edges are relaxed in sequence order. By the time the outer loop reaches `i`, every
edge into `i` has been relaxed, so `best[i]` is final when it is read. Predecessor
pointers are decoded once at the end.

`O(n^2)` time, `O(n)` space, not `2^(n-1)`. The number of segments is never chosen,
it falls out of the search.

## Compared with a general shortest path library

This is the textbook DAG shortest path algorithm specialised to a complete DAG over
a sequence. There are n(n-1)/2 edges, one per forward pair, and the graph is never
built because the sequence and the weight function define it entirely.

The one real difference is what it refuses to assume. Generic implementations of
this recurrence often require the weight function to satisfy the quadrangle
inequality (concave or convex Monge), which allows `O(n log n)` through SMAWK,
LARSCH or Knuth optimisation. This does not, so it stays `O(n^2)` and stays correct
for arbitrary weight functions, including non-monotone ones where spanning a longer
pair costs less than a pair it contains.

## Assumptions

If one of these does not hold, the result is wrong rather than slow.

* A segment's weight depends only on its two endpoints, not on which other segments
  were chosen. This is what makes the subproblems independent. Bulk discounts,
  per-transaction caps and "at most one of these" rules all break it.
* The sequence is fixed. You choose where to cut it, not which nodes to visit.
  Choosing the route as well is a larger problem.
* Segments are contiguous, non-overlapping, forward only, and cover everything. No
  gaps, no overlaps, no backtracking, no overshooting past either end.
* One scalar objective. Ties break towards fewer segments and there is no second
  criterion. Multi-objective needs Pareto labels per node rather than one number.
* No cap on segment count. "At most k segments" is a different recurrence
  (`best[j][t]`, `O(n^2 k)`), not a filter applied afterwards.
* `getWeight` is pure. Each pair is queried at most once and the answer is trusted.

## Contract

`leastWeightSubsequence(path, getWeight)` returns one entry per segment, in sequence
order: `[[from, to], weight]`, carrying that segment's own weight rather than a
running total.

* `Infinity` means there is no edge. It propagates through the arithmetic by
  itself, so the loop needs no branch for it.
* `NaN` is treated as no edge, because every comparison against it is false. A
  buggy `getWeight` degrades quietly instead of throwing, so guard it at your
  boundary rather than in the loop.
* Positions are indexed, not node ids. A sequence may repeat a node.
* Ties on total weight break towards fewer segments. Ties beyond that are
  unspecified and the tests do not depend on them.
* Fewer than two nodes returns `[]`.
* No spanning set throws `NoPathError`.
* Weights are summed as doubles. Use integers if you need exact totals, since
  `11.20 + 34.20 === 45.400000000000006`.

## Async weight lookups

If `getWeight` hits the network or a database, import the async entry point:

```ts
import { leastWeightSubsequenceAsync } from 'least-weight-subsequence/async';

const segments = await leastWeightSubsequenceAsync(path, async (from, to) => {
  const row = await db.lookupWeight(from, to);
  return row?.weight ?? Infinity;
});
```

Same recurrence, same results, same contract. What differs is how the lookups are
scheduled.

Every edge leaving `i` is independent of every other, so a whole row is requested
at once. That is `n` rounds of latency rather than `n^2 / 2`. At n=50 with a 20ms
lookup it is roughly one second rather than twenty-five.

Rows still run in sequence, because `best[i]` has to be final before the edges
leaving `i` are relaxed. That is also what preserves the guarantee that nothing is
requested for a pair behind an unreachable prefix.

A row is up to `n - 1` calls in flight. Cap it if the other end will not enjoy
that:

```ts
await leastWeightSubsequenceAsync(path, getWeight, { concurrency: 8 });
```

Returning a plain number instead of a promise is allowed, so a lookup that is
usually cached does not have to wrap every hit. `NoPathError` is the same class
from both entry points, so `instanceof` works across them.

## Performance

The `O(n^2)` loop is not the cost. At n=50 it runs in about 37 µs for all 1,225
edges and allocates nothing until the decode. `getWeight` is the cost. It is a lazy
callback so you can memoise, batch or skip work behind it. The search calls it at
most once per forward pair, and never for pairs behind an unreachable prefix.

## Layout

    src/leastWeightSubsequence.ts        the algorithm
    src/async.ts                         the async entry point
    src/leastWeightSubsequence.test.ts   tests, fixtures and a brute force oracle
    scripts/generate-diagram.ts          regenerates docs/algorithm.svg
    docs/algorithm.svg                   the diagram above

The oracle enumerates all `2^(n-2)` cuts. It is correct by construction and too
slow beyond about 15 nodes. A property test cross-checks `leastWeightSubsequence`
against it on 200 random sparse matrices, which catches relaxation bugs that
hand-picked fixtures miss.

## Running

    npm test
    npm run typecheck
    npm run build
    npm run diagram
