# BlumberDice

A dice-based incremental with a passive web and two mutually exclusive ways of
resolving a roll.

```bash
npm install
npm run dev        # play it
npm test           # 145 deterministic tests
npm run typecheck
npm run build
```

Press `` ` `` in-game for debug tools (grant currency, fast-forward rolls,
reveal the second framework, hard reset).

---

## How it plays

Click the die. It pops off an isometric surface, tumbles through the air,
bounces, rolls to a stop, and floats its result above itself. You gain Score. Score buys nodes on a passive
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
src/ui/dice/    3D dice: vector/quaternion maths, rigid-body simulation,
                isometric canvas painting, React glue
tests/          framework, probability, tree, builds, interactions, save,
                layout, dice-physics
scripts/        radial.ts (generates the web layout), balance.ts, audit.ts,
                measure.ts, layoutlib.ts
```

### The dice

Real cubes, in a real 3D world, drawn in isometric projection on a canvas —
no 3D library.

`ui/dice/math3d.ts` holds vectors, quaternions and the projection. The camera
is a true isometric one: the ground axes lean 30 degrees apart, z runs straight
up the screen, and the view direction works out to -(1,1,1), which doubles as
the depth key for sorting.

`ui/dice/physics.ts` is a rigid-body simulation. Each die is a cube with an
orientation quaternion and an angular velocity, integrated under gravity. Its
eight vertices are solved against five planes — the surface and four walls —
with a normal impulse and Coulomb friction per contact. A uniform cube has a
scalar inertia tensor, which keeps that solver short. Velocity and position are
solved in separate passes: pushing the body out once per penetrating vertex
over-corrects badly, because a cube resting flat has four contacts, and summing
their corrections pumps in energy until it never settles.

`ui/dice/render.ts` paints it. Back faces are culled against the view
direction, the remaining three are depth-sorted and flat-shaded from a single
light, and pips are drawn in each face's own 2D frame, so the projection places
them exactly. Shadows are the convex hull of the eight vertices cast down the
light ray onto the surface, blurred by height.

It decides nothing. The engine resolves every roll first; a cube tumbles freely
and is then turned onto the face it was handed, by the shortest rotation that
puts that face up, so the animation can never disagree with the game state. Its
randomness is deliberately not drawn from the seeded RNG, so watching dice
cannot perturb a reproducible run.

That turn happens **in the air**: the cube pops off the surface, rotates as it
rises and falls, and lands flat on its answer. The hop is not decoration. A
cube pivoting in place drags its corners through the floor — a rotating cube
needs its centre well above its resting height to clear — so the hop is sized
by walking the actual rotation path and taking the worst clearance it demands,
then given the airtime that same height would take under the sim's own gravity.
It reads as a final bounce because it is one.

The HUD waits for the dice. A roll's Score is credited by the engine the moment
it resolves, which is while the die is still in the air, so the tray withholds
each roll's currency until the number above that die has faded and only then
lets the counter move. In a cascade the total tallies up as the ghosts expire
one by one; in the second framework the loss lands the same way, after you have
seen what you rolled. Re-throwing a die releases its hold immediately, because
that is also when its number disappears.

`tests/dice-physics.test.ts` pins all of it: a die comes to rest with exactly
the given face up for every face, sits perfectly flat rather than on an edge,
leaves the surface while it turns, never scrapes a corner through the floor,
stays inside the walls, always stops within 1s, and holds its currency back for
exactly as long as its number is showing.

### The passive web

One connected graph rooted at a single node: five archetype spokes (High
Roller, Volume, Jackpot, Control, Pattern) with bridge nodes in the gaps
between them, and a connective inner region that appears once the second
framework is known.

Positions are generated, not hand-placed. 53 of the 69 connections form a
spanning tree, and a radial tree drawing has no crossings among those by
construction; `scripts/radial.ts` then enumerates sector orders and child
orderings to place the remaining connections cleanly. The result is **zero
crossing connections and zero node-on-edge overlaps**, enforced by
`tests/layout.test.ts`.

```bash
node --experimental-strip-types scripts/radial.ts --write   # regenerate
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

54 nodes — 20 small, 20 notable, 8 bridge, 6 keystone. Prerequisites are OR, so
most deep nodes have several routes in. Build identity is carried by shape, size
and connection structure; there are no branch labels.

Node information appears in a popup anchored above the last node you pointed at
or pressed, so it stays readable while you look elsewhere and follows that node
as you pan. It floats over the web rather than sitting in the layout — a docked
panel changed height with every description and shoved the web around under the
pointer — and it never takes a pointer event, so the node beneath stays
hoverable. Clicking empty canvas puts it away; panning does not, since a drag
is not a dismissal. **Refund Points** sits in the corner of the web: a full
respec, since refunding a single node would orphan whatever hangs off it.

A node whose behaviour differs between the two frameworks carries one line of
text for each, and only the line for the framework in play is shown. No tooltip
names a framework; a node that is inert right now simply says so.

---

## Testing

```
tests/framework.test.ts      both resolution rules, the Score floor, switching invariants
tests/probability.test.ts    normalisation, clamping, seeded long-run frequencies
tests/tree.test.ts           graph integrity, prerequisites, costs, illegal allocations
tests/builds.test.ts         fixtures for all six archetypes and six hybrids
tests/interactions.test.ts   keystone composition, hold, flip, seal, wagering, adaptive
tests/save.test.ts           round-trip, migration, in-flight cascades
tests/layout.test.ts         no crossing connections, no overlaps, link length
tests/dice-physics.test.ts   3D settling, the result face, containment, projection
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
