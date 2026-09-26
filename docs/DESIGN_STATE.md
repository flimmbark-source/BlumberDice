# Design state

Every mechanic in the build is classified below. The spec's discipline rule is
that unresolved ideas must not be converted into implementation facts, and that
conflicting requirements should be surfaced rather than silently resolved. This
document is where both obligations are discharged.

Three labels are used:

- **Confirmed** — stated in the specification. Implemented as stated.
- **Proposed** — not stated, but required for the prototype to run. Implemented
  behind a named constant or a single swappable code path, and listed here.
- **Unresolved** — left open by the specification. Not implemented.

---

## Confirmed and implemented

| Rule | Where |
| --- | --- |
| Framework A: `Score += r` | `engine/game.ts` → `finalizeRoll` |
| Framework B: `Meta += 1`, `Score -= r`, floor 0, no event at 0 | `engine/game.ts` → `finalizeRoll` |
| Exactly one framework active; switching resets nothing about the build | `engine/game.ts` → `switchFramework` |
| One interconnected passive web, not two trees | `engine/nodes.ts` |
| Small / Notable / Keystone / Bridge classes | `engine/types.ts` → `NodeType` |
| Data-driven nodes; mechanics live in the engine, not the UI | `engine/nodes.ts`, `engine/tree.ts` |
| Mechanical tooltips only | every `description` in `engine/nodes.ts` |
| Progressive disclosure of Meta and the toggle | `ui/App.tsx`, `discoveryRequirements` |
| Inspectable statistics, valid under both frameworks | `ui/StatsPanel.tsx` |
| The main interaction is visually dominant | `ui/dice/` — a physics tray the player throws |
| Seeded RNG, deterministic state layer, local save | `engine/rng.ts`, `engine/save.ts` |
| No merit, morality, enlightenment, balance meter or ratio requirement | *nothing implements one; `tests/tree.test.ts` asserts no pre-discovery Meta cost leaks* |

There is no "correct" framework. Framework A remains fully functional after the
second framework is found, and the passive web contains no node that is only
useful in one of them except where its own text says so.

---

## Proposed — required to make the prototype run

### 1. Pacing model

**Why it exists.** The spec defers Rapid Cycle until "the exact pacing system is
known", but a playable incremental needs one.

**What was chosen.** A manual roll on a cooldown (`CONFIG.baseCooldownMs`,
700 ms), with bonus rolls resolving automatically on a stagger. Rapid Cycle is
implemented against this model as a cooldown multiplier.

**How to change it.** Replace the cooldown with any other gate; only
`manualRoll`, `tick` and the `cooldownMult` stat depend on it.

### 2. Per-action roll budget

**Why it exists.** Several legal Volume builds have an expected bonus-roll count
above 1 per roll. Those cascades never terminate. This is a real property of the
node set, not a bug, and it needs a brake.

**What was chosen.** `CONFIG.maxRollsPerAction` (250). One action resolves at
most that many rolls. It is shown in the stats panel rather than hidden, so a
player who hits it can see why.

**Alternative not taken.** Decaying the bonus chance with cascade depth. That
hides the limit instead of stating it.

### 3. Framework B discovery gate

**Why it exists.** The discovery sequence is explicitly unresolved, but
milestone 2 cannot be evaluated without one.

**What was chosen.** The statistics panel tracks "Rolls resolved" from the first
roll — a counter with no mechanical use. Once the player has opened that panel
and resolved `CONFIG.discoveryRollThreshold` (100) rolls, the row becomes
clickable, with no text prompting it. At
`CONFIG.discoveryHintThreshold` (250) the number begins to pulse. Clicking it
reveals Meta and the toggle.

**Why this shape.** It is mechanical rather than narrative, it lives in the
"room for curiosity outside the proper game" the spec asks for, and it explains
nothing. It is a placeholder: `discoveryGateOpen` in `engine/game.ts` is the
only thing that has to change.

The debug panel (backtick) can reveal the framework directly.

### 4. What a framework change clears

The spec says the build must not reset, and separately that stored state
"behaves according to its own explicit rules" — without saying which state is
which. The rule chosen:

- **Cleared** on a switch: Climb stacks, Pressure, ticket stacks, temporary
  weight pushes, temporary stat modifiers, the Flip cooldown, the
  rolls-since-bonus counter. The Carryover node keeps them instead.
- **Kept** on a switch: allocations, currencies, the distribution the passive
  web produces, held results, the prepared queue, the sealed face, roll history,
  run statistics.

Note the precise form of the probability guarantee. The distribution *the build
produces* is identical across a switch — nothing the passive web contributes to
the die changes. The distribution the *next roll* samples from can differ,
because a temporary weight push from Momentum or Near Miss is transient state
and is cleared with the rest of it. Carryover keeps those too, making even the
next roll's distribution stable. Both halves are asserted in
`tests/framework.test.ts`.

Carryover exists *because* the default is to clear. Both halves are asserted in
`tests/framework.test.ts`.

### 5. Jackpot mechanics are Framework A only

The spec says Framework B "does not care about jackpot payout when generating
Meta". Extended to the whole subsystem: in Framework B no jackpot pays, no
Pressure accrues, no ticket stacks build, no wager is taken and Let It Ride does
not trigger. The stats panel says `In this framework: inactive`.

The alternative — letting Pressure build in B and cash out in A — would have
created an attractive switch-timing play, but it makes a Score-payout mechanic
accumulate while Score is being consumed, which reads as incoherent. Flagged as
a candidate to revisit.

### 6. Meta purity

The spec's Framework B rule is one Meta per roll regardless of value. To keep
that legible under a 54-node web, a stronger internal rule is enforced:

> No node grants Meta per resolved roll. The only per-roll Meta is the flat 1.
> All other Meta comes from discrete events (pattern completions, framework
> transitions) and is never scaled by a rolled value.

This is what lets Pattern stay meaningful in Framework B without reintroducing
roll magnitude through the back door, and it makes Volume — not low rolls — the
Meta archetype. Asserted per build fixture in `tests/builds.test.ts`.

### 7. Afterimage's inherited property

The spec leaves "some property of the previous framework's final roll"
undefined. Chosen: bonus rolls created within 3 rolls of a switch resolve as the
last face rolled before the switch. Arbitrary among several workable readings.

### 8. Four bridges are single-entry

Not specified, and forced by the web's geometry. The bridge graph over the six
regions needs more adjacencies than a ring can offer: High Roller alone wants
Volume, Control and Pattern as neighbours, and a ring gives any region two.
With every bridge reachable from both its regions, the drawing had 26 crossing
connections.

**Overflow, Arrange, Afterimage and Hedge** now have one prerequisite each.
Each sits inside one region and performs another region's job, so reaching it
means investing in both. That is arguably the better design: a bridge entered
from either side is taken by buying one cheap entry node, which encourages no
hybridisation at all. Loaded Choice, More Tickets, Chain Reaction, Peak
Sequence and Counterplay keep both entrances — Loaded Choice because the
specification asks for High Roller and Control to both reach it.

Every bridge still declares both its regions, and `tests/tree.test.ts` checks
that each remains reachable from one of them.

### 9. Loaded Choice × Prepared Roll

Not specified. As first built, Prepared Roll silently nullified Loaded Choice —
two keystones where one deletes the other. Now they compose: with both
allocated, the choice is between the next queued result and a fresh sample, and
only taking the queued one consumes the queue.

### 9. Dice are thrown, not displayed

Not specified. The main interaction is a set of 3D cubes on an isometric
surface: clicking one pops it up, tumbles it through the air and rolls it to a
stop. It is a genuine rigid-body simulation — quaternion orientation, contact
impulses, friction — drawn with a hand-rolled isometric projection rather than
a 3D library.

It decides nothing. The engine has already resolved the roll, and the cube is
eased onto the face it was handed by the shortest rotation that puts that face
up. The randomness is cosmetic and deliberately *not* drawn from the seeded
game RNG, so watching dice can never perturb a reproducible run.
`tests/dice-physics.test.ts` asserts a die comes to rest with exactly the given
face up, for every face, and that it lands flat rather than on an edge.

One honest note: free physics cannot be trusted to land on a chosen face, so
the last part of the roll is steered. It is a cheat, and it is the price of
letting the engine stay authoritative.

What makes it invisible is that the cube performs the turn *in the air*: it
pops off the surface, rotates as it rises and falls, and lands flat on its
answer. A final hop is what a real die does, so the steered rotation has
something to hide behind. The hop also earns its keep mechanically — a cube
pivoting in place would drag its corners through the floor, since a rotating
cube needs its centre well above its resting height to clear — so its height is
derived from the worst clearance the actual rotation path demands, and its
airtime from that height under the sim's own gravity.

Two consequences worth stating:

- **Animation pace is decoupled from resolution pace.** The engine resolves a
  cascade on a stagger the tray cannot match, so tumble time shortens as the
  backlog grows (640ms for a single roll, 170ms deep in a cascade) and the tray
  recycles its oldest settled die past twelve on screen. The alternative —
  slowing the engine to match — would punish exactly the Volume builds whose
  whole point is throughput.
- **A die keeps tumbling while a decision is open.** The roll has suspended,
  so no result exists yet. This turned out to read well: the die hangs in the
  air while you choose.

### 10. Node tooltips are written per framework

The specification requires mechanical tooltips and progressive disclosure, and
those pull against each other: a node that pays Score one way and Meta the
other has to describe both, which names a framework the player may not know
exists yet.

Resolved by splitting the text. A node's `description` is either one line, or
one line per framework, and the panel shows only the line for the framework in
play. No tooltip anywhere names a framework — `tests/tree.test.ts` asserts
that, and also asserts that every node whose behaviour actually differs has
been split rather than left sharing a line.

A node that does nothing under the active framework says so plainly ("No
effect"), rather than being hidden. Knowing a node is inert right now is
information the player needs to read their own build.

### 11. Points are refundable in full

A "Refund Points" button in the corner of the web returns every point spent and
clears the build. Per-node refunds are not offered, because refunding one node
would orphan whatever hangs off it.

This is a deliberate prototype affordance and it has a real cost: free respec
removes commitment from the passive web, and commitment is part of what makes
buildcraft mean anything. It is here because the first milestone is "can I
build multiple interesting dice machines", and answering that question needs
cheap experimentation far more than it needs permanence. Whether the shipping
game charges for a respec, limits them, or drops them entirely is a separate
decision, and not one this prototype should make.

The button asks once before acting, since a mis-click would otherwise destroy
a build with no undo.

### 12. Hold is declared before the roll

Not specified. A prompt on every roll was intolerable. Base Hold is a pre-roll
toggle ("store next result") plus playing a held result in place of a roll.
**Hedge** is what makes the swap reactive — offered after the face is known.
This gives Hedge a clear reason to exist beyond its wager refund.

### 13. Tooltips lead with notation, and the prose is demoted

Not specified beyond "mechanical, never philosophical". The tooltips were
prose-first, which made them slow to compare: two nodes with the same shape
read as two different sentences.

Resolved by giving the tree one closed visual grammar and making it the
strongest element in the popup, with the prose below it as the precision
layer. This is affordable only because the tree is more uniform than it looks
— every node is `CONDITION → EFFECT` drawn from small closed sets, so one
grammar covers all fifty-four. It also does archetype work for free: rows of
faces read as High Roller, roll chips as Volume, sequences as Pattern,
substitutions as Control, wagers as Jackpot, switch marks as Adaptive.

Two decisions inside it are worth recording:

- **Concrete faces, not variables.** An earlier pass used `n`, `n+1`, `hi`,
  `lo` and `≥4`. That was wrong: a variable is text to decode, and decoding is
  what the notation was meant to remove. A node now shows an exemplar — `[2]
  [3] [4] → +8` — and the sentence underneath states the general rule. A
  regression test forbids the algebra coming back.
- **The prose got shorter, not redundant.** Word caps (34, or 46 for
  keystones) are asserted, so a mechanic carried by the diagram cannot also be
  spelled out at length below it. Hold's description lost three words to this
  and reads better for it.

The cost: the notation is a second thing to learn, and a player who never
looks at the prose will miss caps and exact durations that only fit there.
The bet is that the shapes are learned once and then pay out on every node.

A later pass added the piece that was missing: **a node's second rule is a
clause**, not a second equal row. Two rows of the same weight meant neither
was the headline, which is the readability problem the whole notation exists
to solve. A clause is indented, quieter, and prefixed by a glyph naming the
kind of rule (pays out, grants rolls, moves a counter, trades, denies). Only
one is allowed per node, and a node may never open with one. That constraint
is doing the real work: a node needing two clauses is a node doing two jobs.

The same pass made the node class a badge rather than an aside, colour-coded
Small / Notable / Keystone / Bridge. This follows the standard progression-tree
reading — a numeric upgrade, a new rule, and a change to the game are three
different kinds of information and should not look alike — and it is the one
place the tooltips now spend visual weight on something other than the
mechanic itself.

### 14. Pattern and Volume are themed spines, not a mesh

The Pattern region had nine nodes whose prerequisites crossed their own
themes: Run hung off Collector (a set node), Alternating Current off Step
*and* Collector. Nine separate rules, and the graph said nothing about how
they related. Same in Volume, where Second Wind chained off Echo although the
two are opposites — luck and reliability.

Rethreaded so the path itself states the kinship:

- **Match** — Repeat → Doubles → Palindrome
- **Sequence** — Repeat → Step → Run
- **Range** — Repeat → Collector → Alternating Current → Full Set
- **Chance** — Quick Hands → Low Gear → Follow Through → Splinter
- **Certainty** — Quick Hands → Rapid Cycle → { Echo | Second Wind }

Each spine needs somewhere to go, or its last notable is a dead end. Match
and Sequence recombine at Memory; Range's payoff is Chain Reaction, the
bridge out to Volume. That reassignment is also the better mechanic: Run
already grants a bonus roll, so hanging the bonus-roll bridge off it was
redundant, and Full Set did not grant one.

Zero crossings survived this, but not for free. Three spines in the Pattern
wedge crowded it, and `relieve` resolves crowding by pushing nodes outward —
it exiled Run to radius 766, an unreadably long link to its own parent. The
angle each branch receives is now weighted by subtree *size* rather than leaf
count, so a deep narrow branch is not given the same wedge as a shallow wide
one.

### 15. The reference builds were not buildable

Found while checking the above. The fixture builds used by `scripts/balance.ts`
and `tests/builds.test.ts` were duplicated in both files and had drifted:
seven of the thirteen described allocations the prerequisite graph does not
permit (slotMachine took Splinter without Follow Through, climber took Climb
without Heavy Six, and so on). `makeBuild` does not enforce prerequisites, so
nothing caught it, and the balance table had been reporting throughput for
builds no player could assemble.

The fixtures now live once, in `src/engine/fixtures.ts`, and two tests assert
that every one is closed under prerequisites and that no prerequisite costs
more than what it gates. Correcting them moved the hybrid numbers — the
slot-machine build reads 53.9 score/sec against the 31.9 previously reported —
so any balance conclusion drawn from the old hybrid rows should be re-checked.
The single-archetype rows are unaffected; they were already closed.

### 16. The interface had to be operable without a mouse

A pass over the running app, not the code. Six defects, four of them real
breakages rather than matters of taste:

- **Below 900px the passive web vanished.** Stacked, the grid was
  `auto 1fr` and the tray's 660px cap took the whole viewport, squeezing the
  side panel to zero — including the tab bar, so there was no way back to it.
  Half the game was unreachable at a narrow window. The tray now takes a
  share of the viewport and the web keeps a 300px floor.
- **The web could not be used without a mouse.** All 54 nodes were bare SVG
  `<g>` elements: no `tabindex`, no role, no label. Tab reached three tab
  buttons and nothing else. Nodes are now focusable and activate on Enter or
  Space, announce their name, class, cost and why they can or cannot be
  taken, and show the popup on focus as well as hover.
- **The die had no control at all.** Space rolled, via a global key handler,
  but nothing advertised it and no assistive technology could find it. There
  is now a real button, off-screen until focused, and the hint says so.
- **Nothing honoured `prefers-reduced-motion`.** A tumbling die, a hop, a
  fading ghost and an easing total are exactly what the setting is for. Under
  it the throw stays but the long tumble does not, and the total is simply
  the number — which also means dropping the hold that keeps the counter in
  step with a ghost that is no longer animating.
- **Colour was unexplained.** Hue carries the archetype and shape carries the
  class, and only shape was legended. There is a region key now.
- **Targets were 5px at narrow widths.** Fitting all 54 nodes into a short
  panel shrank a Small below anything clickable. Below a floor the web now
  starts zoomed and centred, and the player pans.

Not fixed, and worth deciding rather than drifting:

- A Small is 15px even on a wide screen, under the usual 24px guidance. Fixing
  it properly means larger nodes or invisible hit padding, and padding risks
  stealing hover from neighbours at the current spacing.
- The resting die sits in the lower half of its tray, leaving about 40% dead
  space above. The headroom is real — thrown dice use it — but at rest the
  composition reads as unbalanced rather than as reserved space.
- The cooldown is a 3px full-bleed line at the bottom of the play area. It
  reads as a divider, not as a meter, and it is nowhere near the die it gates.
- Nothing states a next goal. An incremental game usually shows the next
  milestone; here a new player sees a number going up and no target.
- The whole 54-node web is drawn at zero progress, which sits awkwardly with
  the progressive disclosure the specification asks for. Path of Exile can do
  this because its tree is the pitch; here it is 49 unreachable dots.

### 17. The tooltips were written in engine vocabulary

A pass over the copy alone. Two of the findings were misinformation rather
than style.

- **Repeat and Doubles both fire on a pair, and stack.** Their tooltips were
  the same sentence with a different number — "Two identical results in a row
  grant +3 Score" and "…grant +6 Score" — which reads as an upgrade
  replacing its predecessor, the usual convention. A pair with both allocated
  pays 9. Doubles now says "Adds a further +6 Score to every pair"; the word
  *further* is the whole fix.
- **The node that introduces Pressure was called Hot Streak, and the one that
  merely scales it was called Pressure.** A player met the term in a tooltip
  belonging to a different node. Worse, Hot Streak counts *misses* — the name
  promised a reward for winning and delivered one for losing. The introducer
  is now **Pressure** and the amplifier **Boiling Point**, which is also the
  order they are learned in.

The rest was register:

- **"Resolve" is a stage of the roll pipeline**, and it had leaked into
  fourteen tooltips where it meant nothing a player could act on. It also
  blunted the one node where the distinction matters — Hold, whose held
  result genuinely does not resolve — because by then the word had been
  skimmed past thirteen times. The player's word is *roll*.
- **"No effect." appeared nine times.** It says a node is inert without
  saying what would revive it, and the notation already marks it off. Those
  lines now state the condition: "Pays only while rolls add Score." No
  framework is named, so progressive disclosure holds.
- **Passive constructions** ("it is resampled", "its weight is
  redistributed", "cooldown is reduced by") became active.
- **Multiplication was spelled three ways** at once — "2.5x", "multiplied by
  1.2", "at 3x" — now always ×N.
- **"Roll" for something that happened, "result" for a stored or candidate
  value.** The pattern nodes were using both for the former.
- Rapid Cycle's notation said ×0.78 while its prose said 22%: one fact, two
  numbers, and a player left to check whether they were the same thing.

Longest description fell from 33 words to 26, so the caps came down from
34/46 to a single 28 — keystones had 46 on the theory that they do more, but
the longest needs 24. Complexity belongs in the notation and the clause, not
in a longer paragraph. Three tests now hold the line: the word cap, a ban on
engine vocabulary and "no effect", and one spelling of multiplication.

### 18. A milestone is not a goal, and neither is a recommendation

The score was a counter with no destination: nothing told a new player what
they were accumulating toward. Fixed without adding quests, missions or any
new progression rule — the tree and its costs already contain every number
this needs.

Three things are kept strictly apart, and only the first two are built:

- a **milestone** is a threshold at which something becomes possible,
- a **goal** is a node the player pinned themselves,
- a **recommendation** is the game deciding, and it is absent on purpose.

That distinction is what shapes the copy. Four nodes hang off `start` at 45
Score, so the opening state reads "45 Score · 4 upgrades unlock", never
"save for Weighted Edge". Naming one would be a recommendation, and it would
also be a lie about how the tree branches.

The state is one field: `pinned: string | null`. Everything else is derived
in `src/engine/goal.ts` — the cheapest reachable threshold, how many nodes
clear it, how many are affordable now, and the per-currency shortfall.
Pressing an unaffordable node in the web pins it; pressing it again clears
it; buying it clears it and selects nothing in its place.

Two decisions inside it:

- **The shortfall is never one blended percentage.** A node costing Score
  and Meta draws two bars, so the player can see which currency is the one
  holding them up. Collapsing them would hide the actual blocker.
- **The `AFTER` horizon only appears when the tree is unambiguous** — when
  buying the pinned node would open exactly one door that is not already
  open by another route. That is true of 18 of the 54 nodes and false of
  every region entry, which is correct: the point of a spine head is that it
  forks. Where it is ambiguous the line is omitted rather than picking one,
  which would be a recommendation wearing a different hat.

The brief's own illustration showed "AFTER Momentum" under Raised Floor.
In the real tree Momentum also needs Heavy Six, so buying Raised Floor
unlocks nothing on its own and the line is correctly absent there.

A bug fixed on the way: nodes carried `aria-disabled` for every state but
`available`. Once an unaffordable node became a real control — pressing it
sets the goal — that was telling assistive technology a working control was
disabled. It is now set only for genuinely inert states, and the label says
what activating the node will do.

### 19. Prepared Roll is a constraint, not a queue

Reworked on request: **"Results can only be one of the 3 numbers shown.
Changes every roll."** It was a queue of three predetermined results,
consumed front-first and reorderable; it is now a window of three faces the
die may land on, redrawn after every roll. `state.queue` became
`state.allowed`, `queueLength` became `allowedFaces`, and `swapQueue` is
gone along with its rail buttons.

Three decisions the wording did not settle:

- **The window is drawn uniformly, and the roll inside it is weighted.**
  Drawing it by weight as well applies the same bias twice, and it measured
  badly: a High Roller build went from 4.07 average face to 4.91 with the
  keystone — an effect its wording promises nowhere, and large enough to
  make the keystone mandatory for that archetype. Uniform keeps it what it
  says it is. Weight still decides which of the three lands, and a sealed
  face has no weight so it never appears.
- **Replacement effects that roll again roll inside the window**, and Raised
  Floor only lifts a 1 to a 2 when a 2 is in it. Otherwise the node's one
  promise would be false whenever they fired. Flip, Hold and Afterimage are
  excepted: those are substitutions the player built to override the die,
  not rolls, and each says so in its own tooltip.
- **Loaded Choice composes more simply than before.** It used to offer the
  queue head against a fresh sample, with only the former consuming the
  queue. Now both candidates are drawn from inside the window.

The result is a keystone that *costs* expected value for information. On a
matched build the average face goes 4.67 → 4.48 with it, and 4.33 with
Arrange as well. That is the intended shape: what you buy is knowing a 1
cannot come up when 1 is not shown, which is worth most to Pattern builds
reading for a run and to wagering, where it tells you whether a jackpot is
even on the table.

### 20. Arrange was a node that did nothing

Found while removing the queue. Arrange claimed two effects and had one.

"Held and queued results count toward patterns once played" was never an
effect: `pushRoll` runs for every resolved roll, so that is baseline
behaviour the tooltip described as if it were purchased. The `arrange` flag
appeared in exactly one line of engine code — widening the queue swap from
adjacent to any two — and `swapQueue` returned early without Prepared Roll,
so the node also did nothing at all unless you owned a 1,600 Score keystone.

Removing the queue would have left it a 580 Score, 80 Meta no-op. It now
narrows the window from 3 faces to 2, which is a real effect on the same
dependency it always had. That dependency is still a wart — a bridge whose
value is nil without one specific keystone — but fixing it means moving the
node or changing its prerequisites, which is a tree change and out of scope
here.

### 21. Highlighted terms explain themselves

The tooltips had been highlighting keywords since the notation pass, which
raised the obvious question they never answered: highlighted *how*, and
meaning what? A term now opens a small definition on hover, on press, or on
focus.

The registry and the glossary are one thing. `KEYWORDS` is derived from
`KEYWORD_FORMS`, so a word is highlighted precisely when there is an entry
explaining it and a definition can never be written that nothing reaches.
Inflections (held → Hold, wagered → Wager, stacking → Stacks) share an
entry rather than repeating one. Entries are held to the same standard as
node copy — no engine vocabulary, no framework named, a couple of sentences
— and the test caught the first draft of "bonus roll" saying *resolves*.

Two things the nesting forced:

- **The definition anchors to the card, not to the word.** Anchored to the
  word it overflowed the left edge of a 296px card whenever the term sat
  near the margin, and a heuristic about which terms were "near the edge"
  was guesswork. Anchored to the card it lands in the same place every
  time and cannot overflow. A card that sits below its node puts the
  definition below instead, since there is no room above.
- **Tab cannot reach the popup, so `?` does.** The popup always describes
  whichever node has focus, so tabbing out of a node moves to the next node
  and the popup changes underneath — meaning the only popup ever reachable
  by Tab is the last node's. Pressing `?` on a focused node moves focus to
  its first term; from there Enter toggles and Escape closes. The node's
  label mentions the key only when its description actually contains a
  term, so it does not pad all fifty-four.

The keyword opts back into pointer events for itself alone: the node popup
sets `pointer-events: none` so the web underneath stays hoverable, and
without that exception the pointer could never reach a term.

### 22. A roll no longer sweeps away a result nobody has read

Reported bug: a bonus die lands, the player clicks again, and it vanishes
before its number can be read.

Both paths through the old throw did it. `live.slice(0, dice)` re-threw the
first settled die, which may have been the bonus die — and `throwDie` clears
`rollId`, so the number went with it. `live.slice(dice)` retired the rest,
mid-reveal and all. Neither checked whether a die had been read.

The selection is now a pure function, `planThrow`, so it can be tested apart
from the render loop. A die with `rollId` still set has not been read —
`releaseFadedGhosts` clears that field when the ghost expires — and such a
die is neither re-thrown nor retired. The throw spawns a fresh die instead.
At a normal pace with a bonus-roll build, 27 reveals were on screen when a
click landed and none were cut short.

The exception is a full surface. Past nine live dice the longest-settled
reveals are given up anyway, because an unreadable pile helps nobody. No
Score is lost either way: a fading die keeps withholding its payout until it
leaves the world, and the HUD counts it then.

Protecting reveals broke the cap, which the first stress run caught: fifteen
dice on a surface that allows nine. `planThrow` was counting only settled
dice, so the ones still in the air and the ones it was about to spawn did
not count against the limit — harmless while every throw swept the surface
clean, fatal once protected dice could accumulate. It counts everything
standing after the throw now.

### 23. Three columns, from a supplied mockup

Rebuilt to match a design handed over as an image: a top bar with the
wordmark, a centred segmented tab group and the Score readout; then Build
Tree, Dice and Selected Upgrade side by side.

What that changed structurally:

- **The floating tooltip became a docked panel.** Entry 10 recorded the
  opposite move — a docked panel was floated because it changed height with
  every description and shoved the web around under the pointer. A fixed
  third column cannot do that, which is why the mockup's version is safe
  where the old one was not. `inspected` moved up to the app, since two
  columns read it now.
- **The tray is an arena, not a slab.** The floor is concentric rings drawn
  as circles in world space, so the projection makes the ellipses rather
  than them being faked, over a fixed starfield and a shaft of light. The
  physics is untouched: the dice still live in the same square.
- **A real Roll button**, with the cooldown as a number on it. Entry 16
  listed the old cooldown — a 3px full-bleed line nowhere near the die —
  as an unfixed finding; this is the fix.
- **"View full tree"** is not decoration. At 340px a 54-node web is
  unreadable, so the panel opens over the whole window.
- The game column is first in the DOM and placed back in the middle with
  `grid-column`, so Tab reaches Roll before fifty-four tree nodes.
- Refunding moved into a settings menu behind the gear, since the tree's
  bottom bar now holds zoom and the full-tree toggle.

Two departures from the mockup, both deliberate. Its "Collector — adds a new
face to the die" is not this game's Collector, and its node text is
placeholder generally, so every panel is filled from the real catalogue.
And its "NEXT IN CHAIN" is rendered here as **Leads to**: every node that
names this one as a prerequisite, which is a fact of the graph. It is not a
suggested route, and nodes the player has not discovered stay unnamed.

A bug the new layout exposed: `planThrow` only runs when the player rolls,
so a flurry of bonus rolls left its dice sitting until the next click — nine
of them in a tray that now shows one clearly. `sweepSpent` runs every frame
and retires dice whose number has been gone for a moment, keeping back as
many as the next throw will use.

### 24. Handful's dice are borrowed, not owned — withdrawn

Reverted. The five-second window was meant for bonus rolls, not for
Handful, so Handful is a flat `handfulDice: 3` again and its copy is back to
"Each click throws 3 dice instead of 1." `effectiveDice` survives the
revert as the one place that answers how many dice a click throws, which
the tray, the Roll button and the stats panel all read.

Kept below for the record, since the reasoning about what a five-second
window has to mean still applies wherever it lands.

#### What it said

Reworked on request: **"Dice that last for 5 seconds before disappearing."**
It was a flat `handfulDice: 3`, so every click threw three forever.

The sentence only means something if there is a window in which you have the
extras and one in which you do not, so: **rolling grants them and rolling
refreshes them, and they lapse five seconds after the last roll.** The first
click after a pause throws one die and lights them; keep rolling and the
whole handful goes. `effectiveDice` is the single place that decides, and
the tray, the Roll button and the stats panel all read it.

Worth knowing before tuning it: the base cooldown is about 700ms against a
five-second window, so in continuous play the extras never lapse and the
build measures the same as before — 9.95 rolls per action against 9.91.
What changed is what happens when you stop. If the intent was to make
Handful cost something during active play, five seconds is far too long and
the number is one constant.

The ×0.55 Score penalty is untouched. The node is strictly weaker now, so
that penalty may want revisiting, but that is a balance decision rather than
part of the change asked for.

### 25. Buying a node says so

A ring and twelve lines thrown outward from the node, over 700ms, in the
node's own region colour. It is driven off `allocatedKey` rather than the
click, so it fires wherever the purchase came from — the web, the upgrade
panel, or a keyboard press — and it deliberately does not fire on a refund
or a reload, both of which change the set by more than one node.

Two things went wrong worth recording. The lines first scaled about their
own centres rather than the node's, so they shimmered in place instead of
flying out; grouping them and scaling the group fixes it, and the group's
own origin is the node, so `transform-box: fill-box` — unreliable on an SVG
group — is not needed. And the effect looked broken in every screenshot
until it turned out the captures were landing after the 700ms had elapsed;
pausing the animation with a negative delay is how to photograph it.

Also in this pass: the goal button reads **Open in Web** and selects the
pinned node without buying it, and it is now offered while saving as well
as when the node is affordable, since reaching the node is the point either
way. The Score readout inside the Dice panel is gone — the top bar already
carries it. And the top bar gained a stacking context, because the settings
menu hangs below the bar and was being painted under the right-hand column,
which swallowed its clicks.

### 26. The dice get the room

Four trims, all in the same direction.

The upgrade panel lost its **Set as goal** button and its *"Already part of
your build"* line. Pinning is unchanged and still done by pressing the node
in the web, which is where the player already is when they decide; the goal
card by the dice keeps its own *clear*. The owned sentence said nothing the
**Owned** chip two lines above had not. The locked note stays, because
"connect an adjacent node first" tells you why you cannot buy it, which is
not a restatement of anything.

The one-line log strip under the dice is gone. Nothing was lost — the Log
tab has all of it, in full, and the strip only ever showed the last three
entries.

That space, plus a smaller reserve above the arena, goes to the dice. The
throw's headroom dropped from 34% of the canvas to 20%: it is real reserved
space that a thrown die uses, but the arc does not need to grow with the
panel, and at a third of a much taller column it was simply a hole. The
arena is also centred in what is left rather than dropped to the floor with
the slack piled above it. The dice area is now 627px against 187px of
controls, and the Roll button and the milestone card sit at the bottom.

### 26b. The tree's key is its regions

The Build Tree header carried Owned / Available / Locked / Goal. Those
states are legible from the nodes themselves — a lit node is available, a
dashed ring is the goal — while hue is the thing the eye is actually
sorting fifty-four nodes by and had only a second, floating key of its own.
The regions took the header and the floating copy went.

The game also opens with **The Die** selected, so the upgrade panel says
something before the player has pointed at anything.

### 27. The definition sits beside the word again

Entry 21 anchored the glossary popup to the card rather than the word,
because anchoring it to the word ran it off the edge whenever a term sat
near a margin — and the heuristic I had written to guess which terms were
"near the edge" was guesswork. Pinning it to the card was the right call
against that guesswork, but it was the wrong fix for the actual problem: a
definition belongs next to the thing it defines.

It is measured now instead of guessed. On open the word's rectangle is
read, the definition is centred on it and clamped to stay ten pixels inside
the window, and it goes above unless there is no room, in which case it
goes below. It is positioned against the window rather than an ancestor,
because the upgrade panel scrolls and would otherwise clip it. For the one
frame before the measurement it renders hidden, so it is never seen in the
wrong place.

Verified at three window sizes: centred on the word to the pixel, eight
pixels above it, wholly on screen every time. The clamp and the flip are
guards rather than everyday paths — the panel is 330px against a 244px
definition, and the top bar keeps any word below the height where a flip
would be needed — so the flip was exercised by forcing an oversized
definition, which correctly went below.

Cleaned up with it: fourteen rules for the floating tooltip the three-column
redesign deleted. Only its prose rule was still doing anything.

### 28. A bonus roll leaves a die behind

**"Dice that last for 5 seconds before disappearing"**, and this is where it
was meant to land. A bonus roll still resolves immediately as it always
did; it now *also* leaves a die that rolls alongside yours for five
seconds. Each die runs on its own clock from when it was granted, and
rolling does not top it up.

A cap was not optional. Each of those dice rolls, each roll can earn
another bonus roll, so the loop feeds itself; `maxBonusDice` is 6, which
with Handful's three puts a click at the nine dice the tray can show.

**This is a very large buff, and it does not price out.** Against the
previous table:

| build | rolls/action | Score/sec |
| --- | --- | --- |
| volume | 9.9 → **29.0** | 36 → **106** |
| pattern | 1.0 → **7.2** | 20 → **140** |
| comboEngine | 2.2 → **15.7** | 43 → **310** |
| slotMachine | 3.6 → **25.6** | 54 → **389** |

The cap is the knob: at 2 it is roughly a third of that, at 3 about half.
The costs in the tree were tuned against the old numbers and have not been
revisited.

It also breaks an invariant the spec cares about. `tests/builds.test.ts`
asserted Pattern rolled exactly as often as the baseline, because Pattern
adds no frequency modifiers — except Run grants a bonus roll, so Pattern
now gains rolls at **any** cap above zero. The assertion was rewritten to
the thing that still separates the archetypes: Pattern earns from valuable
rolls (Score per roll well above baseline) and Volume from cheap ones
(below baseline). Pattern still leaves the die's probabilities alone.

Two bugs found building it:

- **The clock stopped.** The store only ticked while something was pending
  or the cooldown was running, so the five seconds never elapsed and the
  dice accumulated for ever. The loop now also turns while bonus dice are
  out.
- **The floor was too small.** Sized for one die, seven of them heaped over
  each other and spilled out of the panel. The surface now grows with the
  dice standing on it — not merely with what the next click throws, since a
  cascade leaves more out than a click uses — and the drawing zooms to fit,
  so a quiet game still shows one big die.

---

## Unresolved — deliberately not implemented

- **Trauma.** No trauma stat, no damaged dice, no corrupted probability, no
  severity system. The definition on file ("trauma changes the severity of an
  outcome") is not enough to build from, and wagering already produces
  consequential losses without being labelled.
- **Will.** Not represented. Explicitly not a resource.
- **Environment and discovery layer.** Nothing beyond the placeholder gate. No
  narrative, NPCs, lore or enlightenment sequence.
- **What Meta is for beyond progression.** It only buys nodes.
- **Final web topology, node count and balance values.** The current graph is a
  working proposal. Costs are tunable numbers.

---

## Conflicts preserved rather than resolved

**1. Prototype scope says 15–25 nodes; the brief also asks for both
milestones.** Milestone 1 needs enough content to judge whether the game is fun,
and milestone 2 needs a web that behaves differently under the second framework.
The web has 54 nodes. The 42 available before discovery are the milestone 1
subset; the 12 inner-ring nodes are milestone 2. The scope rule was not
satisfied and is knowingly overshot.

**2. Control is the weakest archetype by measured throughput.** In the balance
report it produces ~6.2 Score/sec against a 5.0 baseline, while Volume reaches
36. Two causes, and they should not be conflated:

- *Measurement artifact.* Control's value is decision quality. A policy-driven
  simulation picks "always flip up" and never seals well, never times a hold,
  never reorders a queue. A human plays it far better than the harness can.
- *Genuine design position.* Control is an enabler. It pays off through Card
  Counter and Sequence Solver, not on its own.

Both are true, and a 1600-Score keystone that barely beats the baseline in
isolation is still a trap for a new player. Not resolved; flagged for playtest.

**3. "Do not tell the player to engage with both frameworks" vs. wanting them
to.** Handled structurally: every Meta-costing node is hidden until discovery,
so no unexplained Meta requirement is visible beforehand
(`tests/tree.test.ts` asserts this). Afterwards the costs vary in shape —
Carryover is 150 Score / 95 Meta, Counterweight is 420 / 35, Peak Sequence is
600 / 75 and Duality is 1500 / 650 — a Score-per-Meta spread of 1.6 to 12.0,
so no ratio is implied. Nothing states the requirement. Whether
players read the structure as intended is a playtest question.

**4. Adaptive is no longer entered from the root.** Three Adaptive nodes used
to hang directly off the starting node, which gave the root eight spokes and
put connective territory on top of every archetype's entry path. Adaptive now
grows from Control and Jackpot. This reads better — connective territory you
reach by having already invested somewhere — but it does mean a player
committed to one distant archetype pays a small entry tax to reach Adaptive.
Judged negligible (45-50 Score) and not resolved beyond that.

**5. The discovery gate can be missed.** A player who never opens the stats
panel never finds the second framework. The pulse at 250 rolls is a mitigation,
not a fix. Making it more visible would start explaining.

---

## Validation against the spec's own criteria

| Criterion | Status |
| --- | --- |
| 1. Framework A is fun without the theme explained | Needs playtest. The loop, the web and the feedback are in. |
| 2. Multiple builds feel mechanically distinct | Asserted across throughput, average face, rolls per action and volatility. |
| 3. Players develop preferences around outcomes | Structural: high results pay more, and the decision policies make the preference explicit. |
| 4. Probability manipulation is understandable | Stats panel shows per-face probability, and it matches the sampler to within 1.2 points over 40k rolls. |
| — The web is legible | Zero crossing connections and zero node-on-edge overlaps, asserted in `tests/layout.test.ts`. |
| 5. Framework B changes how builds are evaluated | Same build, same distribution, inverted incentive. Asserted for High Roller, Volume, Control and Loaded Choice. |
| 6. B does not merely make low rolls the new good rolls | Asserted: a low-roll build gains no Meta advantage, only Score preservation. Volume drives Meta. |
| 7. Pattern and Control stay interesting independent of raw value | Pattern pays Meta in B; Control's tools reverse direction rather than losing purpose. |
| 8. A stays meaningful after using B | Asserted: returning to A after a B sequence earns at the same rate. |
| 9. The web rewards experimentation | 5 archetype entry points from the root before discovery (8 after), 20 nodes with multiple prerequisites, no forced order. |
| 10. The lesson is never stated | No node description, label or UI string refers to it. |
