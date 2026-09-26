import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import './styles.css';
import './botanical.css';

const el = document.getElementById('root');
if (!el) throw new Error('missing #root');
createRoot(el).render(<App />);
