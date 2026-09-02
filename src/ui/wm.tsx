// Менеджер окон Win95: состояние окон, z-order, фокус, мигание.
import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
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
  open(id: string): void;
  close(id: string): void;
  focus(id: string): void;
  minimize(id: string): void;
  toggleMax(id: string): void;
  move(id: string, x: number, y: number): void;
  resize(id: string, w: number, h: number): void;
  flash(id: string): void;
  unflash(id: string): void;
}

const WmCtx = createContext<WmApi | null>(null);

let zCounter = 10;

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [wins, setWins] = useState<WinState[]>([]);

  const patch = useCallback((id: string, fn: (w: WinState) => WinState) => {
    setWins((ws) => ws.map((w) => (w.id === id ? fn(w) : w)));
  }, []);

  const api = useMemo<WmApi>(() => ({
    wins,
    open(id) {
      setWins((ws) => {
        if (ws.some((w) => w.id === id)) {
          return ws.map((w) => (w.id === id ? { ...w, minimized: false, z: ++zCounter } : w));
        }
        const n = ws.length;
        return [...ws, {
          id,
          x: 40 + (n % 6) * 28,
          y: 30 + (n % 5) * 24,
          w: 560,
          h: 400,
          minimized: false,
          maximized: false,
          z: ++zCounter,
          flash: false,
        }];
      });
    },
    close(id) {
      setWins((ws) => ws.filter((w) => w.id !== id));
    },
    focus(id) {
      patch(id, (w) => ({ ...w, z: ++zCounter, flash: false }));
    },
    minimize(id) {
      patch(id, (w) => ({ ...w, minimized: true }));
    },
    toggleMax(id) {
      patch(id, (w) => ({ ...w, maximized: !w.maximized }));
    },
    move(id, x, y) {
      patch(id, (w) => ({ ...w, x, y }));
    },
    resize(id, width, height) {
      patch(id, (w) => ({ ...w, w: Math.max(240, width), h: Math.max(140, height) }));
    },
    flash(id) {
      patch(id, (w) => ({ ...w, flash: true }));
    },
    unflash(id) {
      patch(id, (w) => ({ ...w, flash: false }));
    },
  }), [wins, patch]);

  return <WmCtx.Provider value={api}>{children}</WmCtx.Provider>;
}

export function useWindows(): WmApi {
  const ctx = useContext(WmCtx);
  if (!ctx) throw new Error('useWindows вне WindowManagerProvider');
  return ctx;
}
