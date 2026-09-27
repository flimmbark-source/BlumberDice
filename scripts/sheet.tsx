import { createRoot } from 'react-dom/client';
import { createGame, type GameState } from '../src/engine/game.ts';
import { NODES_BY_ID } from '../src/engine/nodes.ts';
import { SelectedUpgrade } from '../src/ui/SelectedUpgrade.tsx';
import '../src/styles.css';

/**
 * A contact sheet of upgrade cards, for eyeballing the whole vocabulary of
 * node copy at once. See the README's node-copy house style.
 *
 * The card is whatever the inspector renders, in the chrome the inspector
 * renders in, so what this sheet shows is what the game shows. It used to
 * mount a `NodePopup` that floated over the web; that component is gone —
 * a docked panel replaced it — and the import kept `npm run dev` printing a
 * scan failure on every start.
 */

const IDS = ['ct_prepared', 'br_arrange', 'key_loaded', 'ct_hold', 'ct_seal'];

/** The four ways a card can read, in the order the sheet walks them. */
const STATES = ['available', 'locked', 'allocated', 'unaffordable'] as const;
type CardState = typeof STATES[number];

/**
 * A game just rich enough to put one node into one state.
 *
 * The inspector derives the state from the game rather than taking it as a
 * prop, which is the point: a card on this sheet cannot claim a state the
 * rules would not produce.
 */
function stateFor(id: string, want: CardState): GameState {
  const s = createGame();
  const node = NODES_BY_ID.get(id)!;
  // Nothing on a reference sheet should be hidden behind progression.
  s.discovered = ['frameworkB'];
  s.score = 100_000;
  s.meta = 100_000;

  if (want !== 'locked') s.allocated.push(...node.prerequisites.slice(0, 1));
  if (want === 'allocated') s.allocated.push(id);
  if (want === 'unaffordable') { s.score = 0; s.meta = 0; }
  return s;
}

createRoot(document.getElementById('root')!).render(
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 340px)', gap: 18, padding: 20 }}>
    {IDS.map((id, i) => {
      const want = STATES[i % STATES.length];
      return (
        <section key={id} className="desktop-window" style={{ position: 'relative', height: 420 }}>
          <div className="desktop-window__bar">
            <span className="desktop-window__title">{want}</span>
          </div>
          <div className="desktop-window__body">
            <SelectedUpgrade s={stateFor(id, want)} nodeId={id} onReveal={() => {}} embedded />
          </div>
        </section>
      );
    })}
  </div>,
);
