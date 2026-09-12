// Окно Win95: заголовок, drag, свернуть/развернуть/закрыть.
// Ресайз за все края и углы — единая реализация (8 направлений), окно
// не выходит за пределы рабочего стола, действуют мин. размеры.
// UI-02/03: memo + фокус через пропс (не через контекст состояния) + rAF-коалесинг
// move/resize — mousemove 60+ Гц превращается в один setRect на кадр.
import { memo, useEffect, useRef, type ComponentType } from 'react';
import type { WinState } from './wm';
import { useWindows } from './wm';

export const WIN_MIN_W = 240;
export const WIN_MIN_H = 140;

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const RESIZE_DIRS: ResizeDir[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

export const Window95 = memo(function Window95({ win, title, icon, iconUrl, focused, component: Body }: {
  win: WinState; title: string; icon?: string; iconUrl?: string; focused?: boolean; component: ComponentType;
}) {
  const wm = useWindows();
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  // UI-03: коалесинг через requestAnimationFrame — не чаще одного апдейта на кадр
  const rafRef = useRef(0);
  const pendingMove = useRef<{ x: number; y: number } | null>(null);
  const pendingRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const flush = () => {
    rafRef.current = 0;
    const m = pendingMove.current;
    pendingMove.current = null;
    if (m) wm.move(win.id, m.x, m.y);
    const r = pendingRect.current;
    pendingRect.current = null;
    if (r) wm.setRect(win.id, r.x, r.y, r.w, r.h);
  };
  const schedule = () => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(flush);
  };
  // при размонтировании не оставляем висящий кадр
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  function onTitleDown(e: React.MouseEvent) {
    wm.focus(win.id);
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
    const move = (ev: MouseEvent) => {
      if (!drag.current) return;
      // аудит 05.09: клэмп как при ресайзе/открытии — окно не уходит за правый/нижний край
      const vw = window.innerWidth;
      const vh = window.innerHeight - 30; // рабочая область над таскбаром
      const x = Math.max(-200, Math.min(ev.clientX - drag.current.dx, vw - 240));
      const y = Math.max(0, Math.min(ev.clientY - drag.current.dy, vh - 60));
      pendingMove.current = { x, y };
      schedule();
    };
    const up = () => {
      drag.current = null;
      // догоняем последнюю позицию сразу, без ожидания кадра
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      flush();
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  // ─── ресайз за край/угол (единый код для всех направлений) ───
  const rs = useRef<{
    dir: ResizeDir; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number;
  } | null>(null);

  function onResizeStart(dir: ResizeDir) {
    return (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      wm.focus(win.id);
      rs.current = {
        dir, sx: e.clientX, sy: e.clientY,
        ox: win.x, oy: win.y, ow: win.w, oh: win.h,
      };
      const move = (ev: MouseEvent) => {
        const r = rs.current;
        if (!r) return;
        const dx = ev.clientX - r.sx;
        const dy = ev.clientY - r.sy;
        // рабочая область: во весь экран, над панелью задач
        const vw = window.innerWidth;
        const vh = window.innerHeight - 30;
        let { x, y, w, h } = { x: r.ox, y: r.oy, w: r.ow, h: r.oh };
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
        if (r.dir.includes('e')) w = clamp(Math.round(r.ow + dx), WIN_MIN_W, vw - x);
        if (r.dir.includes('s')) h = clamp(Math.round(r.oh + dy), WIN_MIN_H, vh - y);
        if (r.dir.includes('w')) {
          const nw = clamp(Math.round(r.ow - dx), WIN_MIN_W, x + r.ow);
          x += r.ow - nw;
          w = nw;
        }
        if (r.dir.includes('n')) {
          const nh = clamp(Math.round(r.oh - dy), WIN_MIN_H, y + r.oh);
          y += r.oh - nh;
          h = nh;
        }
        pendingRect.current = { x, y, w, h };
        schedule();
      };
      const up = () => {
        rs.current = null;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        flush();
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    };
  }

  // аудит 05.09: сворачивание НЕ размонтирует детей (display:none вместо return null) —
  // иначе визард и формы теряют всё локальное состояние
  return (
    <div
      data-app={win.id}
      className={`w95-window ${focused ? 'focused' : ''} ${win.maximized ? 'maximized' : ''}`}
      style={{
        left: win.x,
        top: win.y,
        width: win.maximized ? undefined : win.w,
        height: win.maximized ? undefined : win.h,
        zIndex: win.z,
        display: win.minimized || win.closed ? 'none' : undefined,
      }}
      onMouseDown={() => wm.focus(win.id)}
    >
      <div className="w95-titlebar" onMouseDown={onTitleDown}>
        {iconUrl ? (
          <img className="w95-title-ic" src={iconUrl} alt="" draggable={false} />
        ) : (
          <span style={{ width: 16, textAlign: 'center' }}>{icon}</span>
        )}
        <span className="w95-title">{title}</span>
        <button
          className="w95-btn w95-tbtn"
          title="Свернуть"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => wm.minimize(win.id)}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="1" y="7.2" width="8" height="1.6" fill="#000" />
          </svg>
        </button>
        <button
          className="w95-btn w95-tbtn"
          title={win.maximized ? 'Восстановить' : 'Развернуть'}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => wm.toggleMax(win.id)}
        >
          {win.maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="2.8" y="0.8" width="6.2" height="6.2" fill="none" stroke="#000" strokeWidth="1.4" />
              <rect x="0.6" y="3" width="6.2" height="6.2" fill="#c0c0c0" stroke="#000" strokeWidth="1.4" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <rect x="1.2" y="1.2" width="7.6" height="7.6" fill="none" stroke="#000" strokeWidth="1.5" />
            </svg>
          )}
        </button>
        <button
          className="w95-btn w95-tbtn"
          title="Закрыть"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => wm.close(win.id)}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1.6 1.6 L8.4 8.4 M8.4 1.6 L1.6 8.4" stroke="#000" strokeWidth="1.6" />
          </svg>
        </button>
      </div>
      <div className="w95-body"><Body /></div>
      {!win.maximized && RESIZE_DIRS.map((d) => (
        <div key={d} className={`w95-rs w95-rs-${d}`} onMouseDown={onResizeStart(d)} />
      ))}
    </div>
  );
});
