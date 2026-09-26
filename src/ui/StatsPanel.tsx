import {
  CONFIG, currentDistribution, discoveryGateOpen, displayStats, effectiveDice, getBuild,
  type GameState,
} from '../engine/game.ts';
import { expectedValue } from '../engine/dice.ts';
import { missingFaces } from '../engine/patterns.ts';
import { regionsInvested } from '../engine/tree.ts';
import { FACES } from '../engine/types.ts';
import { actions } from './store.ts';
import { MiniDie } from './Die.tsx';

/** Inspection of the machine the player has built. Valid under either framework. */
export function StatsPanel({ s }: { s: GameState }): JSX.Element {
  const build = getBuild(s);
  const stats = displayStats(s, build);
  const dist = currentDistribution(s, build);
  const ev = expectedValue(dist);
  const cooldown = CONFIG.baseCooldownMs * stats.cooldownMult;
  const gateOpen = discoveryGateOpen(s);
  const hinting = gateOpen && s.totalRolls >= CONFIG.discoveryHintThreshold;

  const bonus = stats.bonusRollChance;
  const jackpotP = build.flags.has('jackpot') ? dist.probabilities[5] : null;

  return (
    <div className="stats">
      <Section title="The die">
        <div className="bars">
          {FACES.map((f) => {
            const p = dist.probabilities[f - 1];
            return (
              <div className="bar" key={f}>
                <span className="bar__label">{f}</span>
                <span className="bar__track"><span className="bar__fill" style={{ width: `${p * 100}%` }} /></span>
                <span className="bar__value">{(p * 100).toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
        <Row label="Average result" value={ev.toFixed(3)} />
        {s.sealedFace !== null && <Row label="Sealed face" value={String(s.sealedFace)} />}
      </Section>

      <Section title="Pacing">
        <Row label="Roll cooldown" value={`${(cooldown / 1000).toFixed(2)}s`} />
        <Row label="Dice per action" value={String(effectiveDice(s))} />
        <Row label="Bonus roll chance" value={`${(bonus * 100).toFixed(1)}%`} />
        {stats.bonusFromBonusChance > 0 && (
          <Row label="…from a bonus roll" value={`${((bonus + stats.bonusFromBonusChance) * 100).toFixed(1)}%`} />
        )}
        {stats.splinterChance > 0 && <Row label="Split chance" value={`${(stats.splinterChance * 100).toFixed(1)}%`} />}
        {stats.secondWindThreshold > 0 && (
          <Row label="Rolls without a bonus" value={`${s.transient.rollsSinceBonus} / ${Math.floor(stats.secondWindThreshold)}`} />
        )}
        <Row label="Rolls per action cap" value={String(CONFIG.maxRollsPerAction)} />
      </Section>

      <Section title="Payout">
        {s.framework === 'A' ? (
          <>
            <Row label="Score multiplier" value={`×${stats.scoreMult.toFixed(2)}`} />
            {stats.scoreFlat !== 0 && <Row label="Flat Score (unconditional)" value={`+${stats.scoreFlat}`} />}
            {build.flags.has('oneInSix') && <Row label="Score source" value="6 only, at 9× value" />}
          </>
        ) : (
          <Row label="Score lost per roll" value={`rolled value × ${stats.lossMult.toFixed(2)}`} />
        )}
        {s.discovered.includes('frameworkB') && (
          <Row label="Meta per resolved roll" value="1" />
        )}
      </Section>

      {build.flags.has('jackpot') && (
        <Section title="Jackpot">
          <Row label="Jackpot chance per roll" value={`${((jackpotP ?? 0) * 100).toFixed(1)}%`} />
          <Row label="Base payout" value={`${stats.jackpotFlat} × ${stats.jackpotMult.toFixed(2)}`} />
          {stats.pressureCap > 0 && (
            <Row label="Pressure" value={`${Math.round(s.transient.counters.pressure ?? 0)} / ${Math.round(stats.pressureCap)}`} />
          )}
          {build.flags.has('moreTickets') && (
            <Row label="Ticket stacks" value={`${s.transient.counters.tickets ?? 0} / ${CONFIG.ticketMaxStacks}`} />
          )}
          {s.riding > 0 && <Row label="Unbanked and riding" value={String(Math.round(s.riding))} />}
          {s.framework === 'B' && <Row label="In this framework" value="inactive" />}
        </Section>
      )}

      <Section title="Sequences">
        <div className="statrow">
          <span className="statrow__label">Recent results</span>
          <span className="statrow__value hist">
            {s.pattern.history.length === 0
              ? <span className="muted">none</span>
              : s.pattern.history.map((f, i) => <MiniDie key={i} face={f} />)}
          </span>
        </div>
        <Row label="History window" value={String(Math.floor(stats.historyWindow))} />
        <Row label="Pattern reward" value={`×${stats.patternRewardMult.toFixed(2)}`} />
        <div className="statrow">
          <span className="statrow__label">Faces still missing</span>
          <span className="statrow__value hist">
            {missingFaces(s.pattern).length === 0
              ? <span className="muted">none</span>
              : missingFaces(s.pattern).map((f) => <MiniDie key={f} face={f} />)}
          </span>
        </div>
        {Object.keys(s.stats.patternCounts).length > 0 && (
          <div className="tags">
            {Object.entries(s.stats.patternCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => <span className="tag" key={k}>{k} ×{v}</span>)}
          </div>
        )}
      </Section>

      {(s.transient.tempStats.length > 0 || s.transient.weightPush.length > 0
        || s.transient.climb > 0 || s.pendulumRollsLeft > 0 || s.awaitingReflection) && (
        <Section title="Active effects">
          {s.transient.climb > 0 && <Row label="Climb stacks" value={`${s.transient.climb} / ${CONFIG.climbMaxStacks}`} />}
          {s.transient.flipCooldown > 0 && <Row label="Flip ready in" value={`${s.transient.flipCooldown} rolls`} />}
          {s.transient.weightPush.map((e, i) => (
            <Row key={`w${i}`} label={`Face ${e.face} weight`} value={`+${e.value.toFixed(2)} for ${Math.max(0, e.expiresAt - s.totalRolls)} rolls`} />
          ))}
          {s.transient.tempStats.map((e, i) => (
            <Row key={`t${i}`} label={String(e.stat)} value={`${e.op === 'mult' ? '×' : '+'}${e.value} for ${Math.max(0, e.expiresAt - s.totalRolls)} rolls`} />
          ))}
          {s.pendulumRollsLeft > 0 && <Row label="Pendulum payouts left" value={String(s.pendulumRollsLeft)} />}
          {s.awaitingReflection && <Row label="Watching for" value={`a repeat of ${s.faceBeforeSwitch ?? '—'}`} />}
        </Section>
      )}

      {build.flags.has('duality') && (
        <Section title="Investment">
          <Row label="Regions with 2+ nodes" value={String(regionsInvested(build, 2))} />
        </Section>
      )}

      <Section title="This run">
        <button
          type="button"
          className={`statrow statrow--button${gateOpen ? ' statrow--live' : ''}${hinting ? ' statrow--hint' : ''}`}
          onClick={() => { if (gateOpen) actions.discover(); }}
          disabled={!gateOpen}
        >
          <span className="statrow__label">Rolls resolved</span>
          <span className="statrow__value">{s.totalRolls}</span>
        </button>
        <Row label="Actions taken" value={String(s.stats.manualRolls)} />
        <Row label="Bonus rolls generated" value={String(s.stats.bonusRolls)} />
        <Row label="Score earned" value={fmt(s.stats.scoreEarned)} />
        {s.discovered.includes('frameworkB') && (
          <>
            <Row label="Score consumed" value={fmt(s.stats.scoreLost)} />
            <Row label="Meta earned" value={fmt(s.stats.metaEarned)} />
            <Row label="Framework changes" value={String(s.stats.switches)} />
          </>
        )}
        {s.stats.jackpots > 0 && <Row label="Jackpots" value={String(s.stats.jackpots)} />}
        <div className="bars bars--counts">
          {FACES.map((f) => {
            const n = s.stats.faceCounts[f];
            const total = FACES.reduce((a, x) => a + s.stats.faceCounts[x], 0) || 1;
            return (
              <div className="bar" key={f}>
                <span className="bar__label">{f}</span>
                <span className="bar__track"><span className="bar__fill bar__fill--alt" style={{ width: `${(n / total) * 100}%` }} /></span>
                <span className="bar__value">{n}</span>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="statsection">
      <h3 className="statsection__title">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="statrow">
      <span className="statrow__label">{label}</span>
      <span className="statrow__value">{value}</span>
    </div>
  );
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString();
}
