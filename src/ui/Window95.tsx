// Окно Win95: заголовок, drag, свернуть/развернуть/закрыть, ресайз.
import { useRef, type ReactNode } from 'react';
import type { WinState } from './wm';
import { useWindows } from './wm';

export function Window95({ win, title, icon, children }: {
  win: WinState; title: string; icon: string; children: ReactNode;
}) {
  const wm = useWindows();
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const resize = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null);

  const focused = win.z === Math.max(...wm.wins.map((w) => w.z));

  function onTitleDown(e: React.MouseEvent) {
    wm.focus(win.id);
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
    const move = (ev: MouseEvent) => {
      if (!drag.current) return;
      wm.move(win.id, Math.max(-200, ev.clientX - drag.current.dx), Math.max(0, ev.clientY - drag.current.dy));
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function onResizeDown(e: React.MouseEvent) {
    e.stopPropagation();
    resize.current = { sx: e.clientX, sy: e.clientY, sw: win.w, sh: win.h };
    const move = (ev: MouseEvent) => {
      if (!resize.current) return;
      wm.resize(win.id, resize.current.sw + (ev.clientX - resize.current.sx), resize.current.sh + (ev.clientY - resize.current.sy));
    };
    const up = () => {
      resize.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  if (win.minimized) return null;

  return (
    <div
      className={`w95-window ${focused ? 'focused' : ''} ${win.maximized ? 'maximized' : ''}`}
      style={win.maximized ? undefined : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }}
      onMouseDown={() => wm.focus(win.id)}
    >
      <div className="w95-titlebar" onMouseDown={onTitleDown}>
        <span style={{ width: 16, textAlign: 'center' }}>{icon}</span>
        <span className="w95-title">{title}</span>
        <button className="w95-btn w95-tbtn" title="Свернуть" onMouseDown={(e) => { e.stopPropagation(); wm.minimize(win.id); }}>—</button>
        <button className="w95-btn w95-tbtn" title="Развернуть" onMouseDown={(e) => { e.stopPropagation(); wm.toggleMax(win.id); }}>□</button>
        <button className="w95-btn w95-tbtn" title="Закрыть" onMouseDown={(e) => { e.stopPropagation(); wm.close(win.id); }}>✕</button>
      </div>
      <div className="w95-body">{children}</div>
      {!win.maximized && <div className="w95-resize" onMouseDown={onResizeDown} />}
    </div>
  );
}
