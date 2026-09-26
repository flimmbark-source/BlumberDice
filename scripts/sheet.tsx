import { createRoot } from 'react-dom/client';
import { NODES_BY_ID } from '../src/engine/nodes.ts';
import { describeNode } from '../src/engine/tree.ts';
import '../src/styles.css';
import '../src/botanical.css';

const IDS = ['ct_prepared', 'br_arrange', 'key_loaded', 'ct_hold', 'ct_seal'];
const STATUS = ['available', 'locked', 'allocated', 'unaffordable'] as const;

createRoot(document.getElementById('root')!).render(
  <div style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 320px)',
    gap: 18,
    padding: 20,
    background: '#ead8ad',
    minHeight: '100vh',
  }}>
    {IDS.map((id, i) => {
      const node = NODES_BY_ID.get(id)!;
      const score = node.costs.score ?? 0;
      const meta = node.costs.meta ?? 0;

      return (
        <article
          key={id}
          style={{
            minHeight: 200,
            padding: 18,
            border: '1px solid rgba(49,55,42,.44)',
            borderRadius: '18px 8px 16px 9px',
            background: '#f3e6c3',
            color: '#24231d',
            boxShadow: '4px 6px 0 rgba(85,68,38,.08)',
            fontFamily: 'Georgia, "Times New Roman", serif',
          }}
        >
          <div style={{
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '.12em',
            color: '#75643d',
            marginBottom: 8,
          }}>
            {STATUS[i % STATUS.length]}
          </div>

          <h2 style={{ margin: '0 0 8px', fontSize: 26 }}>{node.name}</h2>

          <div style={{ marginBottom: 14, color: '#5e5b4c' }}>
            {node.nodeType}
          </div>

          <p style={{ lineHeight: 1.45, margin: '0 0 18px' }}>
            {describeNode(node, 'A')}
          </p>

          <div style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            borderTop: '1px solid rgba(49,55,42,.22)',
            paddingTop: 12,
            fontWeight: 700,
          }}>
            {score > 0 && <span>Score {score.toLocaleString()}</span>}
            {meta > 0 && <span>Meta {meta.toLocaleString()}</span>}
          </div>
        </article>
      );
    })}
  </div>,
);
