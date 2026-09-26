import { actions } from './store.ts';
import { MiniDie } from './Die.tsx';
import type { Decision } from '../engine/game.ts';
import type { Face } from '../engine/types.ts';

/**
 * The only place the game stops and waits for the player. Every prompt states
 * the mechanical consequence and nothing more.
 */
export function DecisionBar({ decision }: { decision: Decision }): JSX.Element {
  switch (decision.kind) {
    case 'loadedChoice':
      return (
        <div className="decision">
          <div className="decision__label">Choose which result resolves</div>
          <div className="decision__row">
            {decision.options.map((f, i) => (
              <button
                key={i}
                type="button"
                className="decision__die"
                onClick={() => actions.decide({ kind: 'loadedChoice', index: i })}
              >
                <MiniDie face={f} />
                <span>{f}</span>
              </button>
            ))}
          </div>
        </div>
      );

    case 'hold':
      return (
        <div className="decision">
          <div className="decision__label">
            Rolled {decision.face}
            {decision.reactive && decision.heldOptions.length > 0
              ? ' — resolve, store, or swap in a held result'
              : decision.canStore ? ' — resolve or store it' : ' — swap in a held result'}
          </div>
          <div className="decision__row">
            <button type="button" className="btn" onClick={() => actions.decide({ kind: 'hold', action: 'resolve' })}>
              Resolve {decision.face}
            </button>
            {decision.canStore && (
              <button type="button" className="btn btn--ghost" onClick={() => actions.decide({ kind: 'hold', action: 'store' })}>
                Store (does not resolve)
              </button>
            )}
            {decision.heldOptions.map((f, i) => (
              <button
                key={i}
                type="button"
                className="btn btn--ghost"
                onClick={() => actions.decide({ kind: 'hold', action: 'resolve', swapIndex: i })}
              >
                Swap in {f}
              </button>
            ))}
          </div>
        </div>
      );

    case 'flip':
      return (
        <div className="decision">
          <div className="decision__label">Replace {decision.face} with {decision.flipped}?</div>
          <div className="decision__row">
            <button type="button" className="btn" onClick={() => actions.decide({ kind: 'flip', flip: true })}>
              Flip to {decision.flipped}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => actions.decide({ kind: 'flip', flip: false })}>
              Keep {decision.face}
            </button>
          </div>
        </div>
      );

    case 'letItRide':
      return (
        <div className="decision decision--hot">
          <div className="decision__label">{decision.amount} Score is unbanked</div>
          <div className="decision__row">
            <button type="button" className="btn" onClick={() => actions.decide({ kind: 'letItRide', ride: false })}>
              Bank {decision.amount}
            </button>
            <button type="button" className="btn btn--risk" onClick={() => actions.decide({ kind: 'letItRide', ride: true })}>
              Ride it — next roll must be a 6 for {decision.amount * 3}
            </button>
          </div>
        </div>
      );
  }
}

export function faceLabel(f: Face): string {
  return String(f);
}
