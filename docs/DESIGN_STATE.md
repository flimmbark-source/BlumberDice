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

### 8. Loaded Choice × Prepared Roll

Not specified. As first built, Prepared Roll silently nullified Loaded Choice —
two keystones where one deletes the other. Now they compose: with both
allocated, the choice is between the next queued result and a fresh sample, and
only taking the queued one consumes the queue.

### 9. Hold is declared before the roll

Not specified. A prompt on every roll was intolerable. Base Hold is a pre-roll
toggle ("store next result") plus playing a held result in place of a roll.
**Hedge** is what makes the swap reactive — offered after the face is known.
This gives Hedge a clear reason to exist beyond its wager refund.

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

**4. The discovery gate can be missed.** A player who never opens the stats
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
| 5. Framework B changes how builds are evaluated | Same build, same distribution, inverted incentive. Asserted for High Roller, Volume, Control and Loaded Choice. |
| 6. B does not merely make low rolls the new good rolls | Asserted: a low-roll build gains no Meta advantage, only Score preservation. Volume drives Meta. |
| 7. Pattern and Control stay interesting independent of raw value | Pattern pays Meta in B; Control's tools reverse direction rather than losing purpose. |
| 8. A stays meaningful after using B | Asserted: returning to A after a B sequence earns at the same rate. |
| 9. The web rewards experimentation | 5 archetype entry points from the root before discovery (8 after), 20 nodes with multiple prerequisites, no forced order. |
| 10. The lesson is never stated | No node description, label or UI string refers to it. |
