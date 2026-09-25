import { displayStats, getBuild, type GameState } from '../engine/game.ts';
import { FACES, type Face } from '../engine/types.ts';
import { actions } from './store.ts';
import { MiniDie } from './Die.tsx';

/**
 * Persistent mechanics the player configures between rolls. Each block appears
 * only once the node that grants it is allocated.
 */
export function ControlRail({ s }: { s: GameState }): JSX.Element | null {
  const build = getBuild(s);
  const stats = displayStats(s, build);
  const blocks: JSX.Element[] = [];

  if (build.flags.has('seal')) {
    blocks.push(
      <div className="rail__block" key="seal">
        <div className="rail__title">Sealed face</div>
        <div className="rail__row">
          <button
            type="button"
            className={`chip${s.sealedFace === null ? ' chip--on' : ''}`}
            onClick={() => actions.seal(null)}
          >
            none
          </button>
          {FACES.map((f) => (
            <button
              key={f}
              type="button"
              className={`chip${s.sealedFace === f ? ' chip--on' : ''}`}
              onClick={() => actions.seal(s.sealedFace === f ? null : f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>,
    );
  }

  const capacity = Math.floor(stats.holdCapacity);
  if (build.flags.has('hold') || capacity > 0) {
    blocks.push(
      <div className="rail__block" key="hold">
        <div className="rail__title">Held {s.held.length}/{capacity}</div>
        <div className="rail__row">
          {s.held.length === 0 && <span className="rail__muted">empty</span>}
          {s.held.map((f, i) => (
            <MiniDie
              key={i}
              face={f}
              active={s.useHeldNext === i}
              onClick={() => actions.useHeld(s.useHeldNext === i ? null : i)}
              title={s.useHeldNext === i ? 'Will replace the next roll' : 'Play this instead of the next roll'}
            />
          ))}
        </div>
        <div className="rail__row">
          <button
            type="button"
            className={`chip${s.storeNext ? ' chip--on' : ''}`}
            disabled={s.held.length >= capacity}
            onClick={() => actions.storeNext(!s.storeNext)}
          >
            store next result
          </button>
        </div>
        {s.useHeldNext !== null && <div className="rail__note">Next roll plays the selected result.</div>}
        {s.storeNext && <div className="rail__note">Next result is stored instead of resolving.</div>}
      </div>,
    );
  }

  if (build.flags.has('preparedRoll')) {
    const free = build.flags.has('arrange');
    blocks.push(
      <div className="rail__block" key="queue">
        <div className="rail__title">Next results{free ? '' : ' — swap adjacent'}</div>
        <div className="rail__row">
          {s.queue.map((f, i) => (
            <span className="queueslot" key={i}>
              <MiniDie face={f} />
              {i < s.queue.length - 1 && (
                <button
                  type="button"
                  className="queueslot__swap"
                  title={`Swap positions ${i + 1} and ${i + 2}`}
                  onClick={() => actions.swapQueue(i, i + 1)}
                >
                  ⇄
                </button>
              )}
            </span>
          ))}
          {free && s.queue.length > 2 && (
            <button
              type="button"
              className="chip"
              title="Swap the first and last queued results"
              onClick={() => actions.swapQueue(0, s.queue.length - 1)}
            >
              ⇄ ends
            </button>
          )}
        </div>
      </div>,
    );
  }

  if (build.flags.has('stake') && s.framework === 'A') {
    const max = Math.floor(Math.min(stats.stakeMax, s.score));
    blocks.push(
      <div className="rail__block" key="stake">
        <div className="rail__title">
          Wager {s.stakeAmount} / {Math.floor(stats.stakeMax)}
          {s.stakeAmount > 0 && <span className="rail__hot"> → {Math.round(s.stakeAmount * stats.stakeReturnMult)} on a 6</span>}
        </div>
        <div className="rail__row">
          <input
            type="range"
            min={0}
            max={Math.max(0, max)}
            value={Math.min(s.stakeAmount, Math.max(0, max))}
            onChange={(e) => actions.stake(Number(e.target.value))}
          />
          <button type="button" className="chip" onClick={() => actions.stake(0)}>clear</button>
        </div>
      </div>,
    );
  }

  const policyRows: JSX.Element[] = [];
  if (build.flags.has('loadedChoice')) {
    policyRows.push(
      <PolicyRow
        key="lc" label="Two results"
        options={[['ask', 'ask me'], ['higher', 'take higher'], ['lower', 'take lower']]}
        value={s.policies.loadedChoice}
        onPick={(v) => actions.policy('loadedChoice', v as 'ask' | 'higher' | 'lower')}
      />,
    );
  }
  if (build.flags.has('flip')) {
    policyRows.push(
      <PolicyRow
        key="fl" label="Flip"
        options={[['ask', 'ask me'], ['higher', 'flip upward'], ['lower', 'flip downward'], ['never', 'never']]}
        value={s.policies.flip}
        onPick={(v) => actions.policy('flip', v as 'ask' | 'higher' | 'lower' | 'never')}
      />,
    );
  }
  if (build.flags.has('hedge')) {
    policyRows.push(
      <PolicyRow
        key="hd" label="Swap held"
        options={[['ask', 'ask me'], ['never', 'never']]}
        value={s.policies.hold}
        onPick={(v) => actions.policy('hold', v as 'ask' | 'never')}
      />,
    );
  }
  if (build.flags.has('letItRide')) {
    policyRows.push(
      <PolicyRow
        key="lr" label="Payout"
        options={[['ask', 'ask me'], ['bank', 'always bank'], ['ride', 'always ride']]}
        value={s.policies.letItRide}
        onPick={(v) => actions.policy('letItRide', v as 'ask' | 'bank' | 'ride')}
      />,
    );
  }
  if (policyRows.length > 0) {
    blocks.push(<div className="rail__block" key="pol"><div className="rail__title">Defaults</div>{policyRows}</div>);
  }

  if (blocks.length === 0) return null;
  return <div className="rail">{blocks}</div>;
}

function PolicyRow({ label, options, value, onPick }: {
  label: string;
  options: [string, string][];
  value: string;
  onPick: (v: string) => void;
}): JSX.Element {
  return (
    <div className="rail__policy">
      <span className="rail__policylabel">{label}</span>
      <span className="rail__row">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            className={`chip${value === v ? ' chip--on' : ''}`}
            onClick={() => onPick(v)}
          >
            {text}
          </button>
        ))}
      </span>
    </div>
  );
}

export type { Face };
