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
| Progressive workspace reveal: Dice + Score first; at 20 Score the tech window appears, with Build / Stats / Log as top-bar tabs | `ui/App.tsx` |
| Selecting a reachable unowned tree node inspects it and sets/clears it as the current goal; no separate goal button | `ui/TreeView.tsx`, `ui/SelectedUpgrade.tsx` |
| A pinned goal appears at the bottom of the Build view inside the tech window | `ui/App.tsx`, `ui/GoalBar.tsx` |
| Tech and Selected Upgrade are movable/minimizable windows; the Dice is a fixed central game area; Align Windows restores the authored side-window layout | `ui/DesktopWindow.tsx`, `ui/App.tsx` |
| The shell is presentation only: the instrument-faceplate skin changes no rule, no number and no label the game produces | `src/styles.css`, `ui/dice/render.ts` |
| Entropy pulls Score toward 0 at a fixed rate, draining above it and restoring below it | `engine/game.ts` → `applyEntropy` |
| Framework B may take Score below 0; Entropy is what brings it back | `engine/game.ts` → `finalizeRoll` |
| A bonus die that runs out of time is destroyed, even mid-roll | `engine/game.ts` → `tick`, `ui/dice/render.ts` → `drawZap` |
| Every mechanical event shown at a die is also written to the log | `engine/game.ts` → `completeRoll` |

There is no "correct" framework. Framework A remains fully functional after the
second framework is found, and the passive web contains no node that is only
useful in one of them except where its own text says so.

---

## Proposed — required to make the prototype run

### 0. Persistent 20-Score reveal

**Confirmed threshold.** The user explicitly set the tech window reveal at 20 Score, with Build / Stats / Log remaining alternate views selected from the top-bar tabs.

**Implementation detail.** The prototype records that threshold against lifetime `scoreEarned`, rather than current spendable Score, so buying an upgrade cannot make those windows disappear again.


### 0b. Entropy's rate

**Current confirmed behavior.** Entropy moves Score 1 point toward zero per
hit, behind `CONFIG.entropyPerTick`. Its interval is no longer fixed:
`entropyAttackIntervalMs` scales linearly with the 0–100 Entropy meter from
1000ms at empty to 50ms at full.

**Consequence.** Entropy begins as light pressure at 1 Score per second and
accelerates as repeated unshielded hits build the meter. Framework B still uses
the same force in reverse when Score is negative.

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
- **The web could not be used without a mouse.** All 56 nodes were bare SVG
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

### 29. Open in Web is a tour, not a jump

Pressing it once selected the goal. Pressing it again did the same thing,
which is a wasted press on a button the player is already looking at.

It now walks a list: the pinned goal first if there is one, then every node
that can be bought right now, wrapping at the end. Each press selects the
next in the upgrade panel and pans the web onto it. `openTargets` builds
the list, `App` holds the cursor — derived from what is currently selected,
so buying something or pinning something else corrects it without any
bookkeeping.

Centring is `t = C/z − p`: the group's transform maps a node at `p` to
`z * (p + t)`, so putting it at the viewBox centre `C` means that. The
request carries a rising counter rather than just an id, so asking for the
same node twice still pans — otherwise the second press of a wrapped cycle
would do nothing visible.

Measured in the browser: five presses walk the five affordable nodes in
order, the sixth returns to the first, and the selected node lands dead
centre horizontally and centred in the tree area vertically.

### 30. Dice as the game area

The Dice no longer lives inside desktop-window chrome. It is the fixed central
game area. The movable window model is reserved for tools around play: the tech
window on the left and Selected Upgrade on the right.

Next Goal no longer consumes its own window either. When a reachable unowned
node is selected, that selection sets the goal and the goal strip appears at
the bottom of the Build view in the tech window. Selecting the current goal
again clears it; there is no separate Set/Clear Goal button.

Align Windows therefore resets only the movable tool windows, not the central
game area or the embedded goal.

### 31. One mechanical die stays one physical die

A normal repeat roll never manufactures a second physical cube just because
the first cube is still finishing its previous visual lifecycle.

There are two distinct cases and they must not be confused:

- A settled die may still be showing its previous result. It is reused
  immediately; `throwDie` detaches that old result into a display-only ghost
  so readability survives without implying another physical die.
- The engine cooldown can finish a few frames before the same die has completed
  its tumble/alignment. In that narrow gap the new player roll is queued until
  the existing cube becomes reusable instead of spawning a replacement.

A die already tumbling with `result === null` is different: that is a
legitimate primed capacity/bonus die waiting to receive an upcoming roll
result. It counts toward the next throw and is neither queued away nor
re-thrown. The engine's mechanical `bonusDice` system, its duration, cap and
upgrade behavior remain unchanged.

---

### 30. Plates are sized by what is on them

A second pass against the same mockup. It changed no rule, number or label;
it changed which surface a thing is printed on and how tall a plate is.

- **The goal has a plate of its own.** It was a shelf bolted inside the tree's
  screen at a fixed 176px. The mockup gives it its own instrument below the
  tree, with the lamp and legend every other panel carries, so that is what it
  has. Its legend is "Next goal" rather than the mockup's "Available upgrades",
  because the panel also carries milestones and a chosen target, and a legend
  that only described one of its three states would be a lie on the other two.

- **The left column lays itself out.** Two plates share it, and the lower one
  is sized by its content, which ranges from a one-line milestone to a target
  with notation and two bars. A flex column (`.panel-rail`) means the tree is
  never told in pixels how much room the goal is taking; the alternative was a
  magic constant that every new goal state would falsify.

- **The inspector is sized by its content too.** Pinned top and bottom it left
  a tall empty screen under a short node, which is the one thing a machine
  face must never show: a lit panel with nothing on it. It now hugs what is in
  it and scrolls at `max-height`.

- **The Score legend went back where it belongs.** The Entropy work gave every
  child of the Score window `position: relative` so it would clear the meter
  behind it; that silently outranked the legend's own `position: absolute` and
  dropped "SCORE" into the flex row beside the digits. It is etched above the
  glass again, and the z-index it actually needed is all it keeps.

- **Paint, not information.** The enamel gained uneven ageing under the grain;
  the head gained a maker's stamp; two plates gained a stencilled line along
  the bottom. All of it is `aria-hidden`, none of it states a rule, and the
  tree's line is scoped to the Build view — under Stats it read as a caption
  for the table.

### 31. The machine looks used

Detail work on the same faceplate. It adds no element that could be mistaken
for a control and states nothing; it is about making the object read as cast,
painted and handled rather than as rectangles with gradients.

- **Legends are cut, not printed.** Every label on the enamel carries a
  highlight of the paint's own colour under the stroke, so it reads as
  engraved. The highlight sits *below* because the face is lit from above —
  flip it and the same two shadows read as embossed. Screen type is excluded:
  over glass the trick is a smear.

- **Lamps breathe.** A panel lamp on a running machine is never still. The
  chamber — the part actually doing work — gained the status lamp every other
  plate already had, and it runs hot while a roll is resolving. That repeats
  what the telemetry line on the glass says in words; it reports nothing new.

- **The switch is seated.** A cap that size is not glued to a panel, so it now
  sits in a machined collar. Recharge reads as a lit strip in a dark channel
  rather than as a progress bar.

- **The glass behaves like glass.** A weak diagonal band of room light, a
  highlight along the top edge where the tube meets the bezel, and viewfinder
  corners etched into the chamber. The brackets are eight background stubs
  rather than four elements that would exist only to be looked at.

- **The face has an edge.** A dark rim and a wide inner shadow say the panel
  carries on past the browser window. It sits below the head's z-index so the
  settings menu still clears it.

- **The hazard flashes are chipped**, because a flash that has never been
  knocked is a flash on a prop.

- **A louvered vent fills the bare face** below the inspector. That column
  ends where its content ends, which left a wide blank of enamel. A vent is
  the honest way to fill it: plainly part of the casing, impossible to mistake
  for a control. It sits behind the panels, so a tall inspector covers it
  instead of colliding with it.

Everything that animates is covered by the existing global
`prefers-reduced-motion` rule.

### 32. A second pass against the same photograph

Another look at the supplied mockup, item by item. Everything below is
presentation; the list at the end is the part of that image that cannot be
reproduced without inventing mechanics, and was not.

Matched:

- **The machine is an object.** It has a rounded edge and sits on something
  darker, instead of running off the window on four sides. Below a desktop
  there is no room to show an edge, so the face runs to the glass there.
- **Grime crosses panel seams.** Identical staining baked into every plate is
  the tell that gives a CSS mockup away — the eye reads the repeat. It now
  lives on one field over the whole face, unaligned to anything beneath it,
  and multiplies, so the near-black screens barely register it. Glass gets
  dusty; it does not get stained. Plates keep only what is genuinely theirs:
  their own scuffs and the rim where they turn from the light.
- **Screens sit behind a machined lip** rather than in a hole cut in the
  plate, and the chamber — the one screen big enough for it to read — has the
  corner radius and centre bloom of a real tube.
- **The reticle is a reticle.** Four rings, a doubled limit ring and a
  48-tick graduated dial were all doing the same job badly: past two circles
  the rings stop reading as a scale and start reading as texture. Two rings,
  the sighting cross, and square index marks where they meet.
- **The head is a bolted-on band**, with the seam below it showing, and the
  nameplate is screened straight onto the enamel instead of sitting on a
  bezel of its own.
- **The Score legend is dark ink on the enamel above the window.** The glass
  keeps its own box, so the Entropy field around it is unmoved.
- **"Leads to" has a plate of its own** under the inspector, and the column's
  stamp moves to whichever plate ends it — a terminal node has no chain, so
  there is no second plate to put it on.
- The tree plate takes a ringed body for its legend mark, on the Build view
  only; under Stats or Log the plate keeps the lamp every other one carries.

Not matched, because each one is a mechanic the game does not have:

- **AUTO ROLL and FAST MODE switches.** There is no auto-roll and no fast
  mode. Two dead levers on the deck would be worse than two absent ones.
- **"BUY 5" and an "N AVAILABLE" row.** Bulk purchase does not exist;
  allocation is one node at a time, chosen in the tree. The plate in that
  position carries the goal instead, and is labelled for what it holds.
- **GRAVITY and SPIN telemetry.** The chamber prints dice, rolls and seed,
  which are real state a player can act on. Gravity and spin would be two
  invented numbers that never change.

One more is a deliberate keep rather than a miss: the mockup draws every node
mark as a plain colour ring, where this build draws small, notable, keystone
and bridge as different shapes. The shape carries the node's class, so
flattening them to rings would trade information for a resemblance.

### 33. The photographed chassis, as an opt-in skin

A second faceplate. It is now the default, with `?skin=css` returning to the
drawn one and the choice remembered. The supplied photograph is laid down as one image and the
live content drops into the holes cut in it. No rule, number or label
changes; only which surface the machine is made of.

It is a skin rather than a replacement because the two are not
interchangeable, and the trade is worth stating plainly. Both are kept: the
photograph is the machine this game is meant to be, and the drawn chassis is
the one that still works when the photograph cannot — which is a real case,
not a hypothetical, since anything under 1000x560 falls back to it whatever
was asked for.

**What the photograph wins.** Everything material: enamel, grime, moulded
bevels, the curved CRT surround, painted hardware. None of that is reachable
with gradients, and the drawn chassis will never close the gap.

**What it costs.**

- **It cannot reflow.** The image is one fixed 1672×941 object, so this is a
  fixed stage scaled whole and letterboxed on the dark ground. Everything is
  in px, so the stage is laid out at true size and *transformed*, not fitted
  by percentage — fitting by percentage moves the boxes and leaves the type
  behind. Below 1000×560 the drawn chassis takes over, because scaled to a
  phone the photograph is a picture of a machine rather than a machine.
- **Plates are sized by their hole, not their content.** Entries 30 and 32
  went the other way on purpose. Here the inspector's hole is taller than a
  short node needs and the chain's hole is shorter than three rows, so one
  has dead glass and the other scrolls.
- **Slots are measured, not designed.** Every position in the photo-skin
  block is a cut-out's own bounding box as a percentage of the frame, so
  re-exporting the art means re-measuring. The deck is nested inside the
  chamber's box, so its four numbers are re-expressed against that box — the
  first place the mapping stops being a straight transcription.
- **Legends move onto the glass.** The drawn chassis etches them into the
  bezel; the photograph's bezels are too narrow to take one.
- **The chassis stops being live.** Breathing lamps, the chamber's working
  lamp and pressed-key travel on the plate are all painted still.

**Three things in the art do not match the build**, and none can be fixed
from this side:

1. The nameplate reads *BlumberDice*; the game is *Roll Reactor*.
2. The key bank has four cells and there are three views, so the fourth is
   dark. The tabs are laid on the painted dividers rather than spread evenly
   across them, which at least keeps the misfit honest.
3. Two toggle levers and an indicator lamp are painted onto the deck. There
   is no auto-roll and no fast mode, so all three are dead hardware —
   exactly what entry 32 declined to draw.

Fixing any of those means re-exporting the art, not editing the CSS.

### 34. The nameplate, the sign of a step, and changing channel

Four small things, none of which moves a rule.

**The photograph's nameplate is now the app's.** The painted *BlumberDice*
wordmark was cloned out of `ui/chassis.webp` itself rather than covered over:
an averaged column of clean enamel from inside the same plate, stretched
across the text, re-grained to match, and feathered at the edges. A patch
laid on top would have been a sticker; this keeps the plate's own vertical
shading. The app then prints its own nameplate on the blank plate, so the
name lives in one place and the art no longer contradicts the code.

**An Entropy step is drawn with its sign.** `EntropyTick.amount` was always
signed — negative while draining, positive while restoring — but the
projectile was red whatever it carried and the figure was the literal string
`-1`. The particle, its wake, its burst and its figure are now all written
against one set of custom properties, so a restoring step flips the whole
thing green together rather than in pieces, and the figure says what actually
moved.

**Changing channel restrikes the tube.** A tube does not cut between
pictures: the beam collapses, the new frame strikes bright, and it settles
over two shallow beats. The overlay is keyed on a counter rather than on the
channel, so picking the same channel twice still replays — a selector you can
hear moving but not see is worse than one you cannot hear at all. The
brightness flash across a whole panel is exactly what `prefers-reduced-motion`
exists to stop, so it is dropped entirely there.

**And it clunks.** `ui/sound.ts` synthesises the selector rather than
shipping a sample: a 45ms band-passed noise burst for the contact, whose
noise decays as well as its gain so the tail is duller than the head, over a
triangle dropping 190Hz to 74Hz for the housing. Everything is best-effort —
no `AudioContext`, no gesture yet, or a throw anywhere, and the channel still
changes in silence.

**Readability was measured, not eyeballed.** Against `--plate`, `--ink-soft`
was 4.24:1 where body text needs 4.5 and `--ink-faint` was 2.36:1 where even
decoration wants 3. Both were darkened until they cleared. The painted stamps
went from 7.5px to 8.5px, since quiet is the intent and invisible is not, and
the photo skin's legends from 9.5px to 11px. `--orange` on enamel sits at
3.15:1, which is why the nameplate is the only place it is used as type: at
34px it is large text, where 3:1 is the bar.

### 35. The type scale inside the screens

The chassis matched the mockup; the content on it did not. Measured off the
supplied image, the reference sets its panel content 1.3–1.6x larger than
this build did, and the panels here read as a dense readout where the
reference reads as an instrument you stand back from.

Raised to match, against measurements rather than taste: node name 21→26px,
prose 12.5→14.5px, chips 9.5→12px (and in the UI face, not the mono, because
they are words rather than readings), cost figure 21→25px, Allocate 15→20px,
chain rows 13→16px with the legend 9.5→12px, panel legends 11→13px.

Three things that were not simply size:

- **Dice are drawn as outlined cells, not white chips.** The reference prints
  a die on a screen the way an instrument would — a thin light outline with
  lit pips. A white-filled cell is a hole cut in the glass, which is what
  this build had.
- **The notation now has two scales.** The inspector prints the mechanic at
  reading size; the same notation inside a goal strip, a stats row or a
  decision prompt keeps the compact scale, because those boxes are captions
  and would otherwise burst. One component, two contexts.
- **The chamber telemetry speaks in one voice.** The value was white and bold
  against a muted label, which made three instrument readings look like three
  headlines. The reference prints the whole line at one weight and lets the
  colon do the work; the figure keeps only a small lift, so it is still the
  thing you scan to.

Also: tree node rings are drawn heavier and lit harder, since they carry the
whole panel; node names are `--text` rather than a shade of the screen; and
a painted stamp breaks per sentence rather than wherever its box runs out,
because two short lines read as a stamp and one wrapped line reads as an
accident.

**The photo skin pays for this**, exactly as entry 33 said it would. The
chain's hole is 160px and three rows at reading scale do not fit it, so there
the rows drop a size and their node marks drive the height down — a row you
cannot see at all is worse than one set a size down. Every hole also gained a
fade at its bottom edge: a cut-off line reads as a fault, a fade reads as
"there is more", which is the truth.

### 36. What a scaled stage broke

Making the photographed chassis the default exposed a class of bug the drawn
one never could: the photo skin lays the whole face out at its true pixel
size and then scales it as one object, and three places were measuring with
`getBoundingClientRect()`, which returns the *scaled* size.

- **The arena sat small and up in the corner.** `DiceTray`'s resize read a
  rect and wrote it back as a CSS px size, so the stage's scale was applied
  twice: the canvas came out at k² of the tray, anchored top-left. It now
  takes `clientWidth`/`clientHeight`, which is the layout box and is not
  affected by an ancestor transform, and carries no inline CSS size at all —
  the stylesheet already stretches it over the tray.

- **The die's hit region was nowhere near the die.** Pointer events arrive in
  visual coordinates while the projection is in layout ones. Measured: with
  one die drawn centred, its hover band ran 68–75% across the tube instead of
  43–57%. Hovering the die did nothing and hovering empty glass lit it. Both
  the tray and the tree now divide the stage's scale out first, deriving it
  from the element rather than from which skin is mounted.

- **The tree was drawn ~6% too large for its own viewport** and bled past the
  screen's edge, because the viewBox was fitted to the scaled rect.

- **Keyword definitions landed 86px off.** `position: fixed` is only
  viewport-relative while nothing above it is transformed; the scaled face
  becomes the containing block instead. The popup now converts into that
  element's own space and clamps to its width, and walks up to find it rather
  than hard-coding which skin is mounted — so the drawn chassis, where there
  is no such ancestor, is unaffected.

Separately: **a hole with nothing mounted behind it**. The photograph cuts
its holes once and for all, so a slot with no panel in it is a dead black
rectangle rather than an absence — four of them on a first run, before the
tree unlocks. Each now reads `No signal`, which states no rule and carries no
number, and is the difference between a machine with a channel off and a
machine that looks broken. The drawn chassis has no hole until there is
something to put in it and needs none of this.

### 37. The goal plate, restacked

Asked for three moves and given three moves: the legend to the right, the
name on top, the action under the name.

The legend is now printed on the glass at the end of the top row rather than
on the bezel above it, so that plate's bezel is a strip with a lamp on it and
the rows below get the height a legend would have taken — which is most of
what makes the stack fit the photographed slot.

Order down the plate: name (with its mark), then what the upgrade does, then
the action, then progress. The symbol row sits with the name it belongs to,
because it is the point of the panel.

The photographed slot is 102px and cannot grow. Four stacked rows do not fit
it at panel scale, so in that skin everything shrinks a step rather than
anything being dropped — an earlier pass hid the notation to make room, which
removed the one thing the panel exists to show.

Noted against my own earlier work: the pass before this one also swapped the
tour button for a purchase, renamed it, made the legend change with the goal's
state and added a count. None of that was asked for and all of it is reverted.
The button is the tour it always was, and says what it always said.

### 37. The goal plate, restacked

The legend to the right, the name on top, the action under the name and at
the far end of the plate.

The legend is printed on the glass at the end of the top row rather than on
the bezel above it, so that plate's bezel is a strip with a lamp on it, and
the rows below get the height a legend would have taken — which is most of
what makes the stack fit the photographed slot.

Order down the plate: name with its mark, then what the upgrade does, then
the action, then progress. The symbol row sits with the name it belongs to,
because it is the point of the panel.

The photographed slot is 102px and cannot grow. Four stacked rows do not fit
it at panel scale, so in that skin everything shrinks a step rather than
anything being dropped — an earlier pass hid the notation to make room, which
removed the one thing the panel exists to show.

Noted against my own earlier work: the pass before this one also swapped the
tour button for a purchase, renamed it, made the legend change with the
goal's state and added a count label. None of that was asked for and all of
it is reverted. The button is the tour it always was and says what it always
said.

### 38. The turn has two halves

A mechanics change, not a dressing one. The turn splits into a Plan phase and
a Roll phase, and the Score shield is what divides them.

**The shield already did this.** It is not Entropy protection — `grantScore`
returns early while locked, and so does Framework B's loss. It freezes Score
outright. Spending is untouched, because `allocate` writes Score directly
rather than through the grant path. So the phases fell out of a mechanic that
was already there:

- **Plan.** Shielded. Nothing is earned, nothing is lost, Entropy bounces off.
  The build tree and the inspector are usable and spending is open, which is
  what the phase is for.
- **Roll.** Unshielded. Score is live — earned, lost, and under attack.

**The view says which half you are in.** Pressing the switch, clicking the
chamber, pressing Space or taking the shield off the head's readout all do
the same thing: the machine whirrs and the player appears to pass through the
rolling chamber's glass. The surrounding UI falls away in depth, but the dice
surface itself does **not** zoom. Its existing rendered rectangle is translated
to the centre of the screen at the same size on both desktop and mobile.
Inside, a click on the dice is the throw. A compact Score/Entropy readout rises
from the bottom of the screen, unshielded, and engaging its shield reverses the
passage. Escape does the same, so the way out never depends on reaching one
control.

Consequences worth naming:

- **The phase is not saved.** A reload comes back in Plan, shielded, rather
  than resuming mid-throw with Score exposed.
- **A refund no longer requires an unlocked Score.** `canRefund` guarded on
  it, and with planning always shielded that would have made a full respec
  reachable only while rolling — the one moment nobody wants to do it. The
  guard was policy, not mechanism: `refundAll` writes Score directly, exactly
  as `allocate` does. Pinned by a test.
- **`deleteScore` stays shielded**, so it is unreachable in Plan. That one is
  destructive and the shield protecting it reads as correct; it is noted
  rather than changed.
- **The dice tray is the invariant.** Roll never scales it. `centreRollView`
  only applies the remaining screen-space translation needed to put the
  tray's current visual centre at the viewport centre. The photo skin's stage
  scale therefore remains whatever it already was; Roll does not multiply it.
- **Depth belongs to the machine around the tray.** The chamber shell moves
  past the viewer while the tray stays at scale 1. The implementation is
  deliberately different for the two Plan UIs: the drawn/CSS skin uses a
  separate DOM threshold around the glass; the photo skin cannot do that
  because its CRT surround is baked into one chassis bitmap. Desktop therefore
  mounts a fixed, viewport-level four-piece copy of the chassis with the CRT
  aperture clipped out. The outer shell exactly reproduces the resting stage
  fit, while the clipped pieces scale around the photographed chamber centre.
  Keeping that shell outside the translated `.viewport` is essential: the
  camera move must not also move the object that visually defines the passage.
  In the photo skin the rail wrappers are `display: contents`, so the actual
  fixed panels are faded and moved directly rather than trying to transform a
  box that does not exist. *(Half superseded by §42: the drawn skin's DOM
  threshold and the sideways-peeling panels are gone, and both skins now pass
  the same kind of four-piece shell. The rest — the invariant tray, the shell
  living outside the camera, `display: contents` — still holds.)*
- **Desktop and mobile use the same roll composition, not the same Plan
  implementation.** Both finish with the unchanged-size tray centred on
  screen, but each enters that state through the physical structure its UI
  actually has. This is why the desktop/photo passage and mobile/drawn passage
  have separate CSS paths.
- **Crossing the screen removes the television.** During entry, settled Roll
  and exit, the tray loses its CRT glass/scanline overlay, viewfinder marks,
  white enamel rings and rounded TV edge. The tray telemetry, hint and queue
  text are hidden as well. Gameplay result/proc text painted by the dice
  renderer remains, because that belongs to the roll rather than to the TV
  interface.
- **The phosphor field continues beyond the old glass.** The tray/canvas does
  not enlarge. A fixed `.rollfield` fills the viewport behind it for entry,
  Roll and exit. While immersed, the tray stops drawing its own rectangular
  CRT backdrop and draws only the arena/dice over that field, so there is no
  visible seam where the old television ended.
- **The tray stays mounted.** Its physics world is not recreated when the
  phase changes. Translation also does not demand a larger canvas backing
  store, which avoids the fill-rate cost of the old magnifying drive.
- **React Three Fiber is not used for this transition.** Nothing here requires
  a second WebGL scene: CSS transforms can move the existing DOM machine
  around the already-rendered canvas using compositor-friendly
  transform/opacity properties. Adding R3F would add bundle, GPU and memory
  cost without supplying a capability the transition needs. *(This originally
  said "CSS perspective transforms". There was a `perspective` on `.viewport`
  and a `translateZ` on every peripheral panel, and none of it did anything —
  see §42.)*
- **The switch is the painted cap, edge for edge.** Measured off the art with
  its shaded lip included — x 742..1058, y 736..868 of the 1672x941 frame.
  Taking only the saturated face left the moulding's own bottom edge showing
  under ours. The deck box is set to exactly that and the cap fills it, so
  there is one set of numbers rather than two that have to agree.
- **The readout rumbles with the pressure.** `--rumble` is the Entropy meter
  behind the glass as 0..1, and the shake widens *and* quickens with it —
  amplitude alone reads as a drift rather than a machine under load. At zero
  the amplitude is zero, so it sits still without the animation needing to be
  switched off.
- **The Roll readout is deliberately smaller than the head readout.** Its
  Score glass is capped at 184px and its attached stop tab is compacted. The
  tab's width is reserved in the HUD layout, so the entire Score-plus-tab
  control is centred and remains inside narrow phone screens. The tab says
  "Tap to stop" for a coarse pointer and "Click to stop" otherwise. On the
  stacked/mobile layout the redundant "Score" legend above this Roll readout
  is hidden.

---

### 39. A phone held sideways gets the faceplate

The small-screen rules used to be one width: below 901px, stack. That is the
right call for a phone held upright and the wrong one for the same phone held
sideways, where the viewport is 844x390. A stack spends width it has to buy
height it does not have, and it pushes the Roll switch below the fold — the
one control the game is played with.

So the stacking condition is no longer a plain width. The machine stacks when
the viewport is too narrow for three columns at all (under 760px), **or** when
it is tall enough not to need them (521px and up), **or** when it is held
upright. Equivalently: a wide, short, sideways screen keeps the faceplate.

- **The stacking condition is layout-only.** `styles.css` owns it. Roll no
  longer mirrors this breakpoint in TypeScript because desktop and mobile use
  the same centred fixed-size tray composition.
- **Stacked/mobile uses surface navigation.** Its top key bank has a
  mobile-only **Roll** tab. Roll shows the chamber/deck; Build, Stats and Log
  hide that surface and show the information panel instead. Selecting the
  Score control from another mobile surface switches to Roll before entering
  the mechanical Roll phase. The tray remains mounted while hidden, so
  navigation does not reset physics.
- **Build is tree-first on mobile.** Goal no longer lives in Build; it belongs
  to the Roll surface beneath the chamber/deck. The Build surface is therefore
  the tree plus node inspection, without a second vertical Goal block.
- **Mobile node inspection sits directly below the tree.** Selecting a node
  adds a second Build plate immediately beneath the tech tree in normal flow.
  The phone view keeps the detailed symbolic notation and the node's complete
  authored mechanical effect, exact cost/state, Goal control and Allocate
  action. The desktop-only Leads To plate remains omitted on phone. Desktop
  keeps the full side inspector and separate Leads To plate.
- **The mobile tree sleeps when it can.** TreeView receives stable callback
  props so its memoization survives unrelated store publishes. Touch/pen pans
  mutate only the SVG graph transform during the gesture and commit React
  state once on release instead of rerendering every node and edge on every
  pointermove. Coarse-pointer rendering also drops node glow filters while
  preserving state through shape, stroke and fill.
- **Return sequencing is camera first, Plan UI second.** During exit the
  viewport uses the 1.4s return camera curve but remains visually in the
  driven state, keeping the tree, panels, controls and other Plan chrome
  hidden. Only after the return passage completes are those elements restored
  in one frame; they must not slide back in while the camera is still moving.
  On desktop, data-bearing screen contents then run a short stepped phosphor
  restrike/flicker while the chassis stays still, so the information appears
  to come back online like an old computer screen.
- **The letterbox rules were split.** What the head gives up when the screen
  is short — the key glyphs, most of its padding, the two switch banks
  sharing a row — is true of either layout and stays keyed to the letterbox
  alone. What was stack-specific — standing the deck beside the chamber,
  dropping the cast vents — moved under the narrow-stack width, because a
  faceplate already stands them side by side.
- **The panels had to give up their floor.** Each side panel wants 25.5% but
  never less than 260px. On 844px that floor plus the 14px inset puts a
  panel's inner edge past where the chamber starts, and the three columns
  collide. Sideways they take a flat 27% with no floor and the chamber is
  moved in to clear them.
- **The face gives up its trim, not its content.** The footers, the cast
  vents, the hazard block on each bezel and the object's own cream edge go,
  because each is decoration; the panels, the tree, the goal and its bars all
  stay. The one piece of *content* dropped is the "Next goal" legend on the
  milestone card, where the head beside it already reads "Next milestone" —
  it was the same sentence twice on 190px of glass. Where the row carries a
  node's name instead, the legend stays and the name truncates.
- **The goal plate is sized to its content, not scrolled.** Capped at 46% of
  the rail it needed 120px and had 96, so it scrolled inside a 96px box. It
  now takes 58% and is tightened to fit that, which is honest at a glance in
  a way a hidden scrollbar is not. The tree yields, because the tree is the
  elastic panel and the goal is a fixed block.

Measured at 800x360, 844x390, 915x412 and 932x430: no page overflow in either
axis, no panel outside the viewport, no clipped bezel title, no scrolling goal
plate. The drive still covers the screen edge to edge and returns to identity.

---

### 40. The photograph on a phone held sideways, and what it costs

39 gave a sideways phone the drawn faceplate. It was then asked for the
photograph instead, with the numbers on the table, so the photograph is what
it gets. The reasoning is recorded here because the decision is against the
measurements rather than ignorant of them.

The stage is a fixed 1672x941 object scaled as a whole. A landscape phone is
about 390px tall, so the fit scale is 390/941, about 0.41, and nothing tunes
that away: no phone is 560px tall in landscape, and scaling to cover instead
crops the head strip and the switch row clean off the screen -- taking the
Score pill with them. At 0.41 the readouts land at 5.4px against a design
value of 13px, the Score value at 7.5px, and 18% of the screen is the dark
surround the stage cannot fill. Those are accepted. `?skin=css` still opts out
and is remembered, which is the way back, and the drawn faceplate's own
landscape rules from 39 are what it returns to.

What was not accepted is a control too small to press, which is a different
kind of cost: the readouts are merely hard to read, but a 12x12 key cannot be
used at all. The relief is keyed to the pointer, so a mouse sees none of it,
and it takes two forms:

- **A pad, where there is room.** The Score pill is drawn 122x24 and keeps
  exactly that; an invisible pseudo-element gives it a 44px box to be hit in.
  It sits in a cut-out with painted chassis above and below, so the pad lands
  on nothing. Same for the tree's "View full tree" key, 11px tall as drawn.
- **Real size, where there is not.** The tree's three tools sit on a 15px
  pitch, so any pad wide enough to matter would swallow its neighbour. They
  are counter-scaled instead -- a length divided by the stage scale is
  authored larger exactly as the stage shrinks -- and land at 26px. They are
  chrome on the tree's own screen rather than part of the machine's casting,
  so growing them costs the photograph less than a key nobody can press.

The pad must not redeclare `position` on the Score pill. The photo skin
stretches it across its cut-out with `position: absolute; inset: 0`, and a
`position: relative` added for the pseudo-element's sake drops the `inset`
and collapses the pill to the width of its text. Only the tree key, which is
statically positioned, is given a containing block.

**The skin is now re-read when the window changes shape.** It used to be read
once, which was survivable while the choice turned on size floors alone -- a
window does not often cross 1000px -- but it turns on orientation now, and a
phone opened upright and then turned sideways is the ordinary case. The drive
re-aims on the same signal, because a drive aimed at the chassis the machine
was wearing a moment ago points nowhere.

**Still rough, and known.** Tree nodes draw at 15px at rest. The web is
pinch-and-pan on touch and the zoom keys are now pressable, so four presses
of + puts a node at 26px; the path exists but it is a path rather than a
direct tap.

Measured at 800x360, 844x390 and 932x430 with a coarse pointer: the
photograph is worn, the Score pill's tap box is 44px tall while its drawn
size is unchanged, the tree tools are 26px and do not overlap or leave their
screen, and there is no page overflow. With a mouse, at 1440x900, nothing
changes: no pad is generated and the tool keys stay as drawn.

---

### 41. The drive is a dolly, not a whip

At 900ms on a smooth ease the push into the chamber was a camera move. It was
asked to be a machine winding a dolly forward on rails instead, which is three
separate properties, and only the first is obvious.

**It is slow.** 2.2s in. Weight is mostly duration.

**It travels at a steady speed through the middle.** This is the actual tell.
An eased curve is accelerating or braking at every moment; a driven rail is
doing neither. So the middle of the move is flat in speed, and the ease lives
only at the two ends.

**And the curve that produces a steady speed is not a straight line.** What
the eye reads as speed in a zoom is how fast the view magnifies -- the rate of
change of the scale over the scale itself -- so a scale climbing evenly from 1
to 3.3 looks quick at the start and crawls at the end. Even *perceived* speed
needs the scale to grow by a constant factor per second, which in the numbers
CSS interpolates is a curve biased hard toward the end: a quarter of the way
through the move it is about a sixth of the way through the numbers. Written
down the stops look wrong. Measured on screen they are the only ones that look
right.

`linear()` is what makes any of this expressible; a cubic bezier has four
numbers and cannot hold a flat middle, two hesitations and a settle. Each
declaration is preceded by a bezier that approximates it, because an unknown
timing function invalidates the whole shorthand -- the fallback is a merely
smooth drive rather than no drive at all.

Over that shape sit the mechanical details:

- **Two catches**, near a third and two thirds along, where the drive chain
  takes up and gives. Measured, perceived speed drops from about 0.50 to 0.21
  at the first and from 0.59 to 0.15 at the second, then recovers. They are
  slower movement, never a jump, which is what separates a mechanism from a
  dropped frame.
- **A settle.** It ends a few thousandths past its mark and comes back: peak
  scale 2.7798 against a resting 2.7733, the way a carriage meets its stop.
- **A tick on each catch**, at a third the level of the end detents, so the
  sound is of the thing the eye is watching rather than beside it.

**The retraction is the same curve read backwards** -- same rails, same
catches -- with a moment of load before it releases (it moves a few
thousandths further *in* first). It runs 1400ms rather than 2200. It is not a
lesser move; the player is on their way back to work rather than being shown
something, and a slow exit is only a slow exit.

Both directions are cut entirely under `prefers-reduced-motion`. A 2.2s
magnification of the whole screen is the most vestibular thing this game does.

Measured at 1100x620, 1280x720, 1440x900 and 1672x941: the settled drive still
covers the window on every axis and the glass reaches the left edge. The
durations land at 2200ms and 1400ms, and `linear()` is what the browser
applies rather than the fallback.

### 42. The passage has three beats

The drive of §41 was right about its own curve and wrong about everything
around it. Every state change the passage needed was hung on the first frame
of the drive — the one frame in the whole two seconds where the machine is
sitting perfectly still in front of the player — so the enamel went flat, the
chamber lost its bezel, the tray lost its rings and its glass, and four
riveted panels started sliding sideways off a faceplate they are bolted to,
all before anything had moved. This is what that is instead.

**Beat one: arm.** 260ms in which nothing travels. The information screens
collapse to a line and go out, using the same CRT vocabulary the channel
switch already had, and a phone uses the beat to bring the Roll surface on
screen and return the page to the top. It exists because a machine does not
start moving in the same instant its screens go dark — and because the
faceplate that covers those screens a moment later must not be the thing that
hides them going out. It has its own sound: a falling blip and two ticks.

**Beat two: drive.** As §41, with one change of subject. What passes the
camera is the faceplate, in one piece, with the chamber cut out of it. Both
skins do this with the same element: four full-window layers of the same
material, each clipped to one band around the opening so the material runs
continuously across the seams, scaled about the opening's centre. The bands
are cut from the tray's measured rectangle at the moment the drive engages
(`passageGeometry`, `passageClipPaths`) and the same measurement is kept for
the return. A rim carrying the tray's own enamel rings is drawn on the
opening, so the tray can give its rings up in the same frame the shell puts
identical ones back in the same place: the edge of the opening is continuous
for the entire passage rather than a rectangle punched in a plate.

**Beat three: land.** Unchanged in shape — camera first, screens second — but
the faceplate is now solid again before the camera arrives, and the tubes
strike after it. The strike gained a sound.

Consequences worth naming:

- **One class decides what the live machine gives up.** `.viewport--covered`
  is true only while the shell is opaque over the whole window, and every rule
  that strips the enamel, the chamber bezel, the tray's glass and the panels
  hangs off it. The timer that sets it sits 8% inside the shell's own
  cross-fade at each end, and that margin is not decoration: a timer starts
  counting when React schedules the work, while the animation it is racing
  does not start until the shell is committed and painted. Line them up
  exactly and a slow frame shows the roll field through a machine that has
  already taken itself apart.
- **The peripheral panels no longer travel.** They faded over 260ms of a
  1400ms move, so they were invisible for four fifths of a journey they
  completed where nobody could see it — and while they *were* visible they
  were plates sliding off the faceplate they are riveted to. They now cross-
  fade out under the shell in a seventh of a second, plate against plate,
  with their screens already dark.
- **The 220px Z push on each of them did nothing.** `perspective` applies to
  its own element's children, and `.app` sat between `.viewport` and every one
  of those panels without preserving 3D, so the pushes were flattened away
  before they were ever composited. The `perspective`, the `preserve-3d` and
  the Z values are gone rather than made to work: the faceplate shell supplies
  the depth, and it does it with scale, which composites the same everywhere.
- **The roll field fades rather than switching on.** At full opacity from the
  first frame it announced the whole move before the machine had begun it. It
  comes up under the shell and goes back down under it. The body no longer
  repaints to the screen colour on frame one either; that was what turned the
  crossing frames into a dark green wash.
- **The instrument arrives when the camera does.** The Score readout used to
  leave on the press, putting it on screen four fifths of a second into a
  two-second drive, and then vanish outright on the way back — the one thing a
  physical object in a physical machine cannot do. It now waits out the drive
  (`hudDelay`, shared with the servo booked in `sound.ts`), latches as the
  drive takes its last detent, and is stowed down its rail in the 380ms before
  the returning faceplate has faded up at all, so the two are never in frame
  together.
- **A stacked layout runs a shorter drive.** The length of a drive should be
  the length of the thing it drives past. On the faceplate the chamber is
  about a third of the width and the plate has two thirds of a screen to clear
  on each side; stacked, it is nearly the whole width, the faceplate is off
  the edges a quarter of the way in, and the rest was an empty green field
  with a die drifting through it. Same curve, same weight, less distance:
  1500/1000 against 2200/1400. The number lives in `phase.ts` and in a
  `--drive-in`/`--drive-out` custom property keyed to the same breakpoint.
- **Reduced motion cuts the timers too, not just the animations.** The phase
  timers ran the full 2.2s with the animations switched off, so the machine
  sat blank for two seconds with nothing happening in them, under two seconds
  of motor noise driving nothing. `driveTimings(reduced)` shortens the clock
  and `playWhirr` drops its motor below 400ms, keeping the detent — a switch
  that was pressed should still sound like one.
- **The shield is derived from the phase, not set alongside it.** Both halves
  used to set the lock themselves, with an effect catching Plan when it
  drifted. That worked while the whole phase change happened inside one click
  handler. It does not when the drive is armed first and commits a beat later
  from a timer: a store notification arriving between the two was enough for
  that effect to see Plan and an unlocked Score together and put the shield
  straight back on, so the chamber opened with Score frozen and the roll could
  neither earn nor lose. One effect now sets the lock from the phase.
- **The panel the photograph is mounted in travels with it.** The stage is a
  fixed 1672x941 object fitted into whatever window it is given, so on most
  windows there is a margin left over, and that margin is part of the machine
  — the panel the faceplate is bolted into. It used to be painted on the
  document, which meant it could not travel: on the drive's first frame it
  simply blinked out while the machine it belongs to drove away without it.
  It is a band of the shell now. That is what collapsed the two shells into
  one: the photograph used to have its own, sized to the stage and clipped
  with the CRT aperture's percentages written down by hand, which left no
  room in it for anything outside the stage. Measuring the opening instead of
  writing it down lets the photograph, its panel and the drawn chassis all be
  bands of one window-sized sheet — and one sheet is the only thing that can
  move as one object. The hard-coded aperture percentages and the shell's
  authored-pixel camera deltas went with it.
- **`--stage-k` is published to the document root.** Two places draw that
  panel — the document at rest, the shell while it is travelling — and they
  have to agree exactly or the handoff at each end of the drive is a change
  of material. Publishing the one number they both derive the stage rectangle
  from is cheaper than measuring it twice and safer than writing it down
  twice. `--surround` and `--stage-recess` are then single definitions that
  both wear.
- **The panel itself was wallpaper and is now metal.** It was a flat sheet of
  the faceplate's own colour with a screw head tiled every 48px along all
  four edges: the same tone as the thing it was supposed to be setting off,
  and an even grid of dots that repeated visibly across a wide screen. It is
  darker than the faceplate now and lit the same way, so the photograph is
  the lit object sitting in it; it falls off into shadow toward the window's
  edges; the stage sits in a milled recess with a lip that catches the light;
  and its fixings are placed at thirds of the stage's own edges rather than
  tiled. That last point is geometry, not taste: the stage is fitted with a
  `min()`, so it always meets the window exactly on one axis and there is
  never a margin on all four sides — fixings at the stage's corners land off
  the screen on every ordinary window, which is what the first attempt did.
  Two per edge always puts a pair in whichever bands exist and lets the other
  pair fall off the screen, at any window shape, with nothing repeating.
- **A brushed finish was tried and reverted.** Any repeating gradient fine
  enough to read as brushed is also fine enough to alias; on a 2x screen it
  came out as corduroy. Broad uneven blotching cannot do that, and it is what
  `--plate-wear` already does for the faceplate.
- **The dice are allowed out of the tray, upward.** A die is thrown to about
  two and a half of its own heights and a die dropped in for a bonus or a
  cascade starts at six and is thrown from there, both above the top of a tray
  sized to hold the floor. Measured: an ordinary throw put 6-17px of die above
  the tray's top edge, and a drop-in put 118-130px of it there — on a phone
  whose tray is 341px tall. All of it was cut off at a line that, once the
  passage has taken the glass and the rings away, nobody can see: dice
  vanished into it and appeared out of it. The dice canvas now reaches the
  rest of the window upward (`diceHeadroom`) and every clip between it and the
  window is switched off — but only inside `.viewport--covered`, the same
  window in which there is no machine to clip against. In Plan the chamber is
  a box, the bezel is its lid, a die above the glass has gone behind it, and
  the cut is correct; the lift is zero there and the backing store is the size
  it always was. The floor never moves either way: the lift is added to the
  dice layer's origin alone, so it changes what can be seen and nothing about
  where anything is.
- **What is still a cut.** The chamber's own bezel — its rounded outline, its
  etched name and its lamp — becomes plain plate inside the shell's 150ms
  cross-fade rather than travelling as itself. Reproducing it in the shell
  would mean a second source of truth for the chamber's asymmetric frame,
  its two labels and its lamp, and that will rot. It is plate dissolving into
  plate of the same colour, at the one moment the whole face is already
  moving, and it is left as a known cost.

### 43. The machine was redrawing a still picture

A performance pass, measured rather than guessed. Every number below is from
this container, whose Chromium runs on SwiftShader — software rasterisation,
no GPU — so the absolute frame rates are not anybody's real frame rates. What
it is a good proxy for is a weak device, because the costs it exaggerates are
exactly the ones that hurt on a cheap phone: large blended layers, deep layer
trees, and fill.

**The profiler said it was not the game.** Ninety-two per cent of the Roll
phase was `(program)` — the browser's own rendering — against about five per
cent of everything the game executes, engine and React together. So the pass
went after pixels, not code.

**And the pixels were nearly all one canvas, drawing nothing.** Repainted
area per second, before:

| | before | after |
| --- | --- | --- |
| Plan, at rest | 22.6M px/s | ~0.0M px/s |
| Roll, at rest | 25.7M px/s | 0.2M px/s |
| Roll, dice in the air | 38.3M px/s | 38.3M px/s |

The dice layer was ninety-odd per cent of it and it never stopped: a tray of
dice lying perfectly still was cleared and redrawn sixty times a second for as
long as the tab was open. The fix is to compare each frame's inputs against
the last one's and skip the draw when they match (`worldSignature`). The
comparison covers what the draw calls actually read — a cube's place and
orientation, its fade, the pointer, the rings on the floor, the state that
decides what is drawn at all — and deliberately excludes the clock, because a
handful of things *are* functions of the clock and would otherwise freeze
mid-fade. Those report themselves instead: each raises a flag at the point it
decides it still has something to draw (`beginDiceFrame`), so the next frame
is drawn unconditionally and nothing has to write down how long a fade lasts
in two places.

Frames per second, free-running, median of three four-second runs:

| | plan | roll | throwing |
| --- | --- | --- | --- |
| desktop, photographed skin | 84 → 678 | 50 → 366 | 46 → 47 |
| phone, drawn chassis | 180 → 761 | 105 → 389 | 78 → 88 |

The main thread went from pinned at 100% to 9% in Plan and 15% in Roll.
Throwing is unchanged and should be: dice in the air is the one case where the
canvas genuinely has a new picture every frame.

The rest, in order of what it was worth:

- **`opacity: 0` is not free, and it was hiding a whole machine.** Everything
  the passage hides was transparent rather than hidden, which keeps it in the
  layer tree, keeps it rasterised, and keeps anything animating inside it
  animating. Roll carried 69 composited layers against 20 for the whole
  faceplate at rest. The plates in the layout use `visibility: hidden`, which
  keeps the box — the drawn chassis is a column, and taking the head or the
  deck out of the flow would resize the chamber under them and move the tray
  the passage has just centred. Everything absolutely positioned, and every
  pseudo-element, goes out with `display: none`. 69 layers → 44.
- **Two of those were worth their own rule.** The chassis grime is a
  `mix-blend-mode` layer the size of the machine, so every frame beneath it —
  the dice canvas included — had to be read back to blend it; and the enamel's
  speckle is another, the size of the window, which the roll field is opaque
  over anyway. Both are `display: none` once there is nothing under them to
  grime.
- **A glow is a painted property.** The Score shield breathed by animating
  `box-shadow` and its sheen travelled by animating `background-position`,
  which between them repainted the plate three million times a second for the
  whole of Plan — the largest thing left once the canvas stopped. The shield
  now fades and the sheen slides on a transform, both of which the compositor
  does without repainting. Same for the lamp on every panel: a lamp dims as a
  whole rather than only in its halo, so it breathes with opacity.
- **`will-change` is a promise kept only while there is something to
  promise.** The viewport held one permanently, pinning a window-sized layer
  through every second of Plan, where it never moves. The arm beat is what
  makes dropping it safe: the hint goes on a quarter-second before the drive
  engages.
- **The web was being rebuilt by a number it cannot read.** Every node's
  shading turns on `can this be bought`, which is a set of `>=` tests against a
  small fixed list of prices — but the live Score was handed to it as a prop,
  and Entropy moves Score every frame. So the memo never held: a rebuild of
  every node's status and a fresh render of the whole web, per frame.
  `affordanceOf` rounds each currency down to the largest price at or below it,
  which every one of those tests answers identically. Pinned by a test that
  checks every node at every value either side of every price.
- **The dice canvas backing store is capped lower**, 3 → 2 on desktop and 1.75
  → 1.5 on a phone. The dice are large flat-shaded solids with no fine detail
  to lose, and each step of that multiplier squares the fill a throw costs.

**One thing was tried and reverted**, and is written down so it is not tried
again: moving the shake jolt off the canvas transforms and onto the two canvas
elements as a CSS transform. A jolt is a translation, so it should have been
free and should have saved the floor's twelve million pixels a second of
redrawing. Measured, Chromium invalidates the whole document layer when a
transparent canvas moves over it, and twenty-two million pixels a second came
back on the document. Promoting the canvas first did not help. The floor
redrawing during a shake is the cheaper of the two.

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
The web has 56 nodes. The 44 available before discovery are the milestone 1
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


### Score force field

**Current confirmed behavior.** Score protection is independent of Goals. Clicking the Score display toggles a force field. While engaged, passive gains/losses and Entropy cannot move Score, but the player may still deliberately spend Score (for example on upgrades or stakes). Refunds remain blocked because they would increase Score. Entropy continues to attack at the cadence set by the Entropy meter and ricochets from the field in one swift reversal. Clicking Score again disengages the field and restores normal Score movement.


### Entropy pressure

Entropy is now also a 0–100 pressure meter integrated directly into the Score pill. The red underlay fills left-to-right behind the black Score glass and never shows a number. Each unshielded dot hit adds 1 Entropy. Cadence is linear from 1000ms at 0 to 50ms at 100. With the Score force field active, attacks ricochet and do not add pressure; the meter drains continuously at 10 points/second. This decay rate is a tuning value in CONFIG.
