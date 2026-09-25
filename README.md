# BlumberDice

A dice-based incremental with a passive web and two mutually exclusive ways of
resolving a roll.

```bash
npm install
npm run dev        # play it
npm test           # 116 deterministic tests
npm run typecheck
npm run build
```

Press `` ` `` in-game for debug tools (grant currency, fast-forward rolls,
reveal the second framework, hard reset).

---

## How it plays

Click **Roll**. A die resolves and you gain Score. Score buys nodes on a passive
web, and the nodes change what a roll *is* — how the distribution is shaped, how
often extra rolls appear, what sequences are worth, what you can do to a result
after seeing it.

Roughly a hundred rolls in, a second way of resolving a roll becomes available.
The build does not change. The die does not change. What a roll is worth does.

The game never explains why.

---

## Architecture

Game logic is a pure, deterministic layer that knows nothing about React. The
entire simulation is reproducible from a seed, which is what makes the test
suite and the balance harness possible.

```
src/engine/
  types.ts      closed vocabularies: stats, flags, conditions, effects, node model
  rng.ts        seeded generator; its whole state lives in GameState
  dice.ts       weight-based distribution, clamping, sampling
  patterns.ts   sequence detection over a windowed roll history
  tree.ts       build resolution, prerequisites, costs, allocation rules
  nodes.ts      the passive web, as data
  game.ts       roll pipeline, both frameworks, switching, economy, decisions
  save.ts       versioned local save
  sim.ts        headless harness for fixtures and balance runs

src/ui/         store, HUD, passive web, stats, decisions, control rail, debug
tests/          framework, probability, tree, builds, interactions, save
scripts/        balance.ts, audit.ts
```

### Nodes are data

A node declares stat modifiers, capability flags and triggers. The engine
implements each kind once; adding a node that reuses existing kinds means
editing `nodes.ts` and nothing else.

```ts
{
  id: 'br_overflow',
  name: 'Overflow',
  nodeType: 'bridge',
  region: 'high',
  bridges: ['high', 'volume'],
  description: 'Resolving a 5 or 6 has a 28% chance to grant a bonus roll.',
  costs: { score: 520 },
  prerequisites: ['hr_heavy6', 'vl_cycle'],
  position: { x: 276, y: -380 },
  tags: ['bridge', 'bonus-roll'],
  triggers: [{
    on: 'onResolve',
    when: [{ kind: 'face', in: [5, 6] }, { kind: 'chance', p: 0.28 }],
    effects: [{ kind: 'bonusRoll', count: 1 }],
  }],
}
```

Keystones that change a rule rather than a number are flags with a code path in
`game.ts`. Everything else is pure data.

### The roll pipeline

`generate → loadedChoice → hold → flip → finalize → ride`

Each stage can suspend and wait for the player. `processIntent` returns
`suspended`, the queue freezes, and `resolveDecision` resumes it. The same
pipeline runs headless in tests via `drain`, which applies an automatic policy.

This is what lets Control and Jackpot be genuine decisions rather than
automation, and it is why the player can set a *default* per mechanic — take the
higher of two dice, or the lower. That setting is the shortest expression of
what the player currently thinks a roll is for.

### The passive web

One connected graph rooted at a single node: five archetype regions on spokes
(High Roller, Volume, Jackpot, Control, Pattern), bridge nodes in the gaps
between them, and a connective inner ring that appears once the second framework
is known.

54 nodes — 20 small, 20 notable, 8 bridge, 6 keystone. Prerequisites are OR, so
most deep nodes have several routes in. Build identity is carried by shape, size
and connection structure; there are no branch labels.

---

## Testing

```
tests/framework.test.ts      both resolution rules, the Score floor, switching invariants
tests/probability.test.ts    normalisation, clamping, seeded long-run frequencies
tests/tree.test.ts           graph integrity, prerequisites, costs, illegal allocations
tests/builds.test.ts         fixtures for all six archetypes and six hybrids
tests/interactions.test.ts   keystone composition, hold, flip, seal, wagering, adaptive
tests/save.test.ts           round-trip, migration, in-flight cascades
```

The build tests assert *distinctness*, not target numbers: that High Roller
raises the average face without adding rolls, that Volume does the reverse, that
Jackpot's payout variance is multiples of High Roller's, that Pattern earns from
sequences while leaving the distribution untouched, and that the same Loaded
Choice keystone serves opposite goals depending on which framework is active.

`scripts/balance.ts` prints per-build economics for both frameworks and the time
to afford each cost tier; `scripts/audit.ts` prints graph statistics.

```bash
node --experimental-strip-types scripts/balance.ts
```

---

## Design state

`docs/DESIGN_STATE.md` classifies every mechanic as confirmed, proposed or
unresolved, records the eight places where the prototype had to choose something
the specification left open, and states the four design conflicts that were
preserved rather than papered over — including the one where the node count
knowingly overshoots the stated prototype scope, and the one where Control
measures as the weakest archetype.
