// Менеджер окон Win95: состояние окон, z-order, фокус, мигание.
import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react';

export interface WinState {
  id: string;
  x: number; y: number; w: number; h: number;
  minimized: boolean;
  maximized: boolean;
  z: number;
  flash: boolean;
}

interface WmApi {
  wins: WinState[];
  /** id активного окна (клик по пустому месту стола снимает фокус со всех) */
  activeId: string | null;
  open(id: string): void;
  close(id: string): void;
  focus(id: string): void;
  blur(): void;
  minimize(id: string): void;
  toggleMax(id: string): void;
  move(id: string, x: number, y: number): void;
  resize(id: string, w: number, h: number): void;
  setRect(id: string, x: number, y: number, w: number, h: number): void;
  flash(id: string): void;
  unflash(id: string): void;
}

const WmCtx = createContext<WmApi | null>(null);

let zCounter = 10;

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [wins, setWins] = useState<WinState[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const patch = useCallback((id: string, fn: (w: WinState) => WinState) => {
    setWins((ws) => ws.map((w) => (w.id === id ? fn(w) : w)));
  }, []);

  // запомненные геометрии окон (размер+позиция переживают закрытие приложения)
  const memory = useRef(new Map<string, { x: number; y: number; w: number; h: number }>());

  const api = useMemo<WmApi>(() => ({
    wins,
    activeId,
    open(id) {
      setActiveId(id);
      setWins((ws) => {
        if (ws.some((w) => w.id === id)) {
          return ws.map((w) => (w.id === id ? { ...w, minimized: false, z: ++zCounter } : w));
        }
        const n = ws.length;
        const mem = memory.current.get(id);
        const vw = window.innerWidth;
        const vh = window.innerHeight - 30;
        const geo = mem && mem.w >= 240 && mem.h >= 150 && mem.x >= 0 && mem.y >= 0 && mem.x + mem.w <= vw + 20
          ? { ...mem }
          : { x: 40 + (n % 6) * 28, y: 30 + (n % 5) * 24, w: 560, h: 400 };
        return [...ws, {
          id,
          x: Math.max(0, Math.min(geo.x, vw - 240)),
          y: Math.max(0, Math.min(geo.y, vh - 60)),
          w: geo.w,
          h: geo.h,
          minimized: false,
          maximized: false,
          z: ++zCounter,
          flash: false,
        }];
      });
    },
    close(id) {
      setActiveId((cur: string | null) => (cur === id ? null : cur));
      setWins((ws) => {
        const w = ws.find((x) => x.id === id);
        if (w && !w.maximized) memory.current.set(id, { x: w.x, y: w.y, w: w.w, h: w.h });
        return ws.filter((x) => x.id !== id);
      });
    },
    focus(id) {
      setActiveId(id);
      patch(id, (w) => ({ ...w, z: ++zCounter, flash: false }));
    },
    blur() {
      setActiveId(null);
    },
    minimize(id) {
      setActiveId((cur: string | null) => (cur === id ? null : cur));
      patch(id, (w) => ({ ...w, minimized: true }));
    },
    toggleMax(id) {
      // разворот на весь экран поднимает окно поверх остальных (и оно активно)
      setActiveId(id);
      patch(id, (w) => (w.maximized ? { ...w, maximized: false } : { ...w, maximized: true, z: ++zCounter }));
    },
    move(id, x, y) {
      patch(id, (w) => ({ ...w, x, y }));
    },
    resize(id, width, height) {
      patch(id, (w) => ({ ...w, w: Math.max(240, width), h: Math.max(140, height) }));
    },
    setRect(id, x, y, width, height) {
      patch(id, (w) => ({ ...w, x, y, w: width, h: height }));
    },
    flash(id) {
      patch(id, (w) => ({ ...w, flash: true }));
    },
    unflash(id) {
      patch(id, (w) => ({ ...w, flash: false }));
    },
  }), [wins, activeId, patch]);

  return <WmCtx.Provider value={api}>{children}</WmCtx.Provider>;
}

export function useWindows(): WmApi {
  const ctx = useContext(WmCtx);
  if (!ctx) throw new Error('useWindows вне WindowManagerProvider');
  return ctx;
}
