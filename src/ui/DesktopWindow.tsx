import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

let nextZ = 20;

type SavedWindow = {
  left?: number;
  top?: number;
  minimized?: boolean;
};

export function DesktopWindow({
  id,
  title,
  children,
  defaultStyle,
  className = '',
}: {
  id: string;
  title: string;
  children: ReactNode;
  defaultStyle: CSSProperties;
  className?: string;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    dx: number;
    dy: number;
    parentLeft: number;
    parentTop: number;
    maxX: number;
    maxY: number;
  } | null>(null);

  const saved = readSaved(id);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(
    saved.left !== undefined && saved.top !== undefined
      ? { left: saved.left, top: saved.top }
      : null,
  );
  const [minimized, setMinimized] = useState(saved.minimized ?? false);
  const [z, setZ] = useState(() => ++nextZ);

  useEffect(() => {
    const state: SavedWindow = {
      ...(position ?? {}),
      minimized,
    };
    try {
      localStorage.setItem(storageKey(id), JSON.stringify(state));
    } catch {
      // Layout persistence is optional; the game remains usable without it.
    }
  }, [id, minimized, position]);

  const raise = (): void => setZ(++nextZ);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;

    raise();
    const rect = el.getBoundingClientRect();
    const p = parent.getBoundingClientRect();
    drag.current = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      parentLeft: p.left,
      parentTop: p.top,
      maxX: Math.max(0, p.width - rect.width),
      maxY: Math.max(0, p.height - 32),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const d = drag.current;
    if (!d) return;
    setPosition({
      left: clamp(e.clientX - d.parentLeft - d.dx, 0, d.maxX),
      top: clamp(e.clientY - d.parentTop - d.dy, 0, d.maxY),
    });
  };

  const stopDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const style: CSSProperties = {
    ...defaultStyle,
    ...(position ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' } : {}),
    zIndex: z,
  };

  return (
    <section
      ref={ref}
      className={`desktop-window ${minimized ? 'desktop-window--minimized ' : ''}${className}`}
      style={style}
      onPointerDown={raise}
    >
      <div
        className="desktop-window__bar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <span className="desktop-window__title">{title}</span>
        <button
          type="button"
          className="desktop-window__minimize"
          aria-label={minimized ? `Restore ${title}` : `Minimize ${title}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setMinimized((v) => !v)}
        >
          {minimized ? '□' : '—'}
        </button>
      </div>
      {!minimized && <div className="desktop-window__body">{children}</div>}
    </section>
  );
}

function storageKey(id: string): string {
  return `blumberdice.window.${id}`;
}

function readSaved(id: string): SavedWindow {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey(id));
    return raw ? JSON.parse(raw) as SavedWindow : {};
  } catch {
    return {};
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
