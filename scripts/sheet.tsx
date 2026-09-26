import { createRoot } from 'react-dom/client';
import { NodePopup } from '../src/ui/TreeView.tsx';
import { NODES_BY_ID } from '../src/engine/nodes.ts';
import '../src/styles.css';

const IDS = ['hr_floor','hr_nogoback','vl_quick','vl_splinter','vl_secondwind',
  'vl_cycle','jp_longodds','jp_hotstreak','jp_stake','jp_ride',
  'jp_oneinsix','jp_pressure','pt_repeat','pt_doubles','pt_memory',
  'ct_second','ct_reserve','ct_flip','ct_seal','ct_prepared',
  'key_loaded','br_arrange','ad_counterweight','ad_crossing','ad_duality',
  'br_hedge','br_afterimage','ct_hold','vl_handful','hr_upper'];

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
