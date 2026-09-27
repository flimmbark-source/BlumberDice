# Roll Reactor

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

In Codespaces, a dev container or any remote VM, open the forwarded URL — the
**Ports** panel's entry for 5173, not `localhost:5173`, which points at your
own machine. The server binds every interface (`server.host` in
`vite.config.ts`) so the forwarder can reach it; Vite's default of loopback
only would refuse that connection and you would be served a "page can't be
found" while the dev server sat there reporting itself ready.

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

## The look

An instrument faceplate: enamelled bone-white panels, riveted at the corners,
with recessed phosphor screens cut into them. Everything is drawn in code, so
there is not one image file in the project.

Two rules keep it coherent.

**Panel or screen, never half of each.** A panel is opaque, warm, and lit from
above; a screen is dark, green, and lit from inside. Everything the player
*reads* — the web, the inspector, stats, the log, the chamber — is on a
screen. Everything the player *grabs* — the view keys, the rockers of the
control rail, the two big switches — is hardware sitting on the plate around
it. The fixed side panels use the same visual grammar: their title strip is the
plate and their body is the screen. They are authored parts of the machine
face now, not draggable desktop windows.

**Orange is spent, not sprinkled.** It marks the action being offered and
nothing else, which is why exactly two controls wear it — Roll, and
Allocate — and why the amber of the score head is a different colour from it.
Beyond that, colour carries three jobs: **amber** is Score and the thing
being saved for, **teal** is Meta, **rust** is anything that takes something
away. A node's region is a hue and its class is a silhouette, exactly as
before — those predate the machine and are untouched by it.

The whole skin lives in two places and touches no mechanic:

- `src/styles.css` — the palette, at the top, and every rule that dresses a
  control with it.
- `src/ui/dice/render.ts` — the tray's two themes, one per framework.

`src/ui/Ornaments.tsx` and `src/ui/ornaments.css` are the previous skin's
decoration: generated botanical sprigs and the ruined arch the die used to be
thrown under. They are mounted nowhere and imported nowhere, and are kept
whole so that direction is two edits away rather than a rewrite — import the
stylesheet from `main.tsx`, and put `<VineFrame />` back in the desktop and
`<ArchBackdrop />` back in the arena.

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

### The regions are themed spines

Within a region the prerequisite path is the explanation. Pattern runs as
three spines off Repeat — **Match** (Doubles → Palindrome), **Sequence**
(Step → Run) and **Range** (Collector → Alternating Current → Full Set) —
and Volume forks at Quick Hands into a chance spine and a certainty one. A
player reading the graph should be able to tell what a branch is about before
opening a single node.

`scripts/radial.ts` regenerates positions after any prerequisite change and
reports crossings; `tests/layout.test.ts` fails if any remain, or if a link
grows too long to read as local.

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

### Tooltips are notation, not paragraphs

Every node in the web says the same sentence: **a condition produces an
effect**, sometimes with a probability or a duration attached. The conditions
come from a small closed set (eleven pattern shapes, five face sets, three
Score thresholds, two chance gates, the switch, a counter) and so do the
effects (a payout, a bonus roll, a weight change, a multiplier, a
substitution, storage, a counter tick). Fifty-six nodes, one grammar.

`src/engine/notation.ts` is that grammar, and `src/ui/Notation.tsx` draws it.
A node's `notation` is one or two rows of tokens — die faces, a blank die for
"any value", an arrow (labelled with its probability where there is one), a
storage slot, a fill meter, the bonus-roll chip, a Score or Meta amount, a
weight change. Nodes whose mechanic differs by framework give a row per
framework, like `description` does, and a node inert under the framework in
play draws a single struck-through `off` token rather than nothing.

```ts
notation: [[die(2), die(3), die(4), to(), score('+8'), roll()]]   // Run
notation: [[die(1, 'dim'), to('30%'), die(2)]]                     // Raised Floor
notation: { A: [[die(3), die(3), to(), score('+3')]], B: [[off()]] }
```

A node's second rule is a **clause**: indented under the statement, prefixed
by a glyph saying what kind of rule it is (pays out, grants rolls, moves a
counter, trades one thing for another, takes something away). Splitting them
is what lets the prose shrink — Doubles no longer spells out three-of-a-kind
below a diagram that already shows it.

```ts
notation: [
  [die(3), die(3), to(), score('+6')],
  clause('score', die(3), die(3), die(3), to(), score('+20')),
]
```

Quantities are written as concrete die faces, never as `n`, `hi` or `≥4`: a
letter is text that has to be decoded, which is the thing the notation exists
to avoid. The exemplar carries the shape, the prose underneath carries the
general rule. `tests/notation.test.ts` enforces that, along with the row and
token caps, the shared tokens (a bonus roll is always the roll chip, a
weighted face is always that face), the prose word cap, and the keyword
registry in `KEYWORDS` — terms that name a system rather than describe one,
highlighted identically wherever they appear. It also enforces the clause
rules: a node never opens with one, never carries more than one, and always
says what kind of rule it is.

The popup's three classes are told apart before a word is read — a Small is
blue, a Notable violet, a Keystone gold, a Bridge teal — because the class is
what says whether a node is a number, a new rule, or a change to the game.

`src/engine/glossary.ts` is both the keyword registry and the definitions
behind it: `KEYWORDS` is derived from the surface-form map, so a highlighted
term always has an entry and an entry is always reachable. Hovering,
pressing or focusing a term opens it; on a focused node, `?` moves into the
first one.

House style for node copy: say the number, never a vague quantifier; *roll*
for something that happened and *result* for a stored or candidate value;
×N for multiplication; active voice; second person only where the player
makes a choice; and no pipeline vocabulary — a node never mentions
*resolving*. A node inert under the framework in play states the condition
that would revive it rather than saying "no effect".

`scripts/sheet.html` renders every card as a contact sheet for eyeballing
the whole vocabulary at once: `npx vite`, then `node scripts/sheet-shot.mjs
out.png`.

### The next target is always on screen

`src/engine/goal.ts` derives what the player is working toward from the tree
alone — no quests, no new resources. It reports a **milestone** (the cheapest
reachable threshold and how many nodes clear it), a **ready** state, or a
**goal**: a node the player pinned by pressing it in the web. It never names
a node the player did not choose.

`GoalBar` renders that beside the die, using the tree's own notation as the
reward preview. Costs in two currencies get two bars, never one blended
percentage, so the blocking requirement stays visible.

### The shell in detail

The chamber is drawn by the same renderer as always. `THEME_A` and `THEME_B`
moved to a dark floor with a signal-coloured dial, and the sighting cross on
it is drawn along the two ground diagonals — under this projection `(1,-1,0)`
lands horizontal and `(1,1,0)` lands vertical, so axes that genuinely belong
to the floor are also the ones that read as a crosshair through the glass.
The dice stay bone white: they are the one real object in there.

The surface keeps the separate canvas layer it was given for the arch. It is
redrawn far less often than the dice are, and the tray still publishes
`--arena-back` and `--arena-depth` — the projected circle's far rim and its
depth — so anything that must stand *on* the floor and *behind* the throw has
real measurements to stand on rather than a percentage guessing at them.

The telemetry printed on the chamber glass — status, dice per throw, rolls so
far, generator state — restates what the roll button and the debug panel
already say. It reports; it decides nothing, and no figure on it is new.

### The shell on a small screen

A phone is not a small desktop, so three things change below 900px and the
rest is the same machine.

The **page scrolls, not a pane inside it**. Nested scrolling on touch eats
the gesture that should be moving the page and breaks the browser's own
address-bar behaviour, so the workspace stops being its own scroller.

The **head becomes a strip that stays put**. At the desktop's sizes it took
38% of a phone screen and pushed the Roll switch below the fold, which is the
one control the game is played with. It keeps Score and the view keys in
reach however far down the web the player has scrolled. The right-hand group
gets `display: contents` so its three controls join the head's own flex flow —
otherwise the framework switch, which wants a full row, drags the readouts
onto a second one and leaves the nameplate alone on a third. Below 480px the
nameplate goes down to its mark, because that row is worth more to the
chamber.

**Panels stack, play first.** The chamber and the switch own the first screen
and the fixed web, stats and log panels follow
underneath, in the order the desktop reads left to right. Held sideways,
where there is width to spare and no height at all, the deck stands beside
the chamber instead of under it.

Two things follow the pointer rather than the width, since a tablet is wide
and still touched: controls grow to finger size under `(pointer: coarse)`,
and the prompts stop naming keys that are not there — `ui/pointer.ts` is
what lets the die say *tap* and the switch stop offering a Space bar.

### Entropy

A constant pull toward zero Score: `CONFIG.entropyPerTick` (6) applied once
every 2.5 seconds, in `tick`. It is one rule rather than two — Score moves *toward*
zero, so it drains a positive balance and restores a negative one at the same
rate, and the last step in either direction is short rather than overshooting,
so zero is a resting point.

Framework B is what lets Score go under. It no longer floors at zero: a roll
in B costs its face whether or not the Score is there, and Entropy is what
climbs back out afterwards. That makes Entropy a stabiliser rather than a
pure tax — it is the only force in the game that pushes in both directions.

Each step is recorded in `entropyLog` and floated off the Score readout by the
HUD, the way a result floats off a die. A Score under zero turns the readout
red; falling merely dims it, because the colour is reserved for actual debt
rather than every Entropy step.

Entropy steps are **not** logged individually — that would bury everything
else the log is for. A change of direction is logged once, when it turns.

### The log mirrors the dice

Every proc handed to the tray is written to the log in the same place, from
the same array, in `completeRoll`. Nothing can be shown at a die without also
being recorded, because it is one loop over `intent.procs` rather than a
`log()` call remembered at each of nineteen sites.

The log keeps 240 lines for this. A cascading build throws dozens of procs
from a single click, and at the old depth of 60 a couple of clicks pushed the
whole of the previous minute out of the panel.

### Bonus dice are destroyed, not forgotten

A bonus die runs on its own clock and, when that clock runs out, is destroyed
where it lies — mid-throw or not. The engine counts the lapses in
`bonusLapses`; the tray diffs that count and fires one destruct beam per die,
drawn in `render.ts`. The beam is struck along world z, which under this
projection is straight up the screen, so it falls vertically however the arena
is panned or zoomed.

The tray also keeps the surface populated up to `effectiveDice`, not just
trimmed down to it. A bonus roll puts a die on the clock the moment it is
granted, so one appears to roll alongside yours — which is also what the beam
has to take when that clock runs out.

### The roll pipeline

`generate → loadedChoice → hold → flip → finalize → ride`

Each stage can suspend and wait for the player. `processIntent` returns
`suspended`, the queue freezes, and `resolveDecision` resumes it. The same
pipeline runs headless in tests via `drain`, which applies an automatic policy.

This is what lets Control and Jackpot be genuine decisions rather than
automation, and it is why the player can set a *default* per mechanic — take the
higher of two dice, or the lower. That setting is the shortest expression of
what the player currently thinks a roll is for.

56 nodes — 22 small, 20 notable, 8 bridge, 6 keystone. Prerequisites are OR, so
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
