import { createRoot } from 'react-dom/client';
import { NodePopup } from '../src/ui/TreeView.tsx';
import { NODES_BY_ID } from '../src/engine/nodes.ts';
import '../src/styles.css';

const IDS = ['hr_edge','hr_floor','hr_momentum','hr_climb','hr_nogoback',
  'vl_quick','vl_echo','vl_secondwind','vl_handful','jp_hotstreak',
  'jp_oneinsix','pt_repeat','pt_step','pt_alt','pt_doubles',
  'pt_run','pt_palindrome','pt_fullset','ct_second','ct_hold',
  'ct_flip','ct_seal','ct_prepared','key_loaded','ad_transition','ad_reflection',
  'jp_stake','br_hedge','ad_pendulum','ad_duality'];

const STATUS = ['available','locked','allocated','unaffordable'] as const;

createRoot(document.getElementById('root')!).render(
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 320px)', gap: 18, padding: 20 }}>
    {IDS.map((id, i) => {
      const node = NODES_BY_ID.get(id)!;
      return (
        <div key={id} style={{ position: 'relative', height: 200 }}>
          <NodePopup node={node} status={STATUS[i % 4]} framework="A"
            score={900} meta={100} anchor={{ x: 160, y: 0, radius: 0 }}
            size={{ w: 320, h: 200 }} />
        </div>
      );
    })}
  </div>,
);
