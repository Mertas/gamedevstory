// Менеджер окон Win95: состояние окон, z-order, фокус, мигание.
// UI-02: методы стабильны (контекст НЕ пересоздаётся при move/resize) — окна не
// ререндерятся всем списком; состояние окон живёт в отдельном контексте, а Window95
// получает своё окно пропсом и мемоизирован, поэтому двигается только оно.
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
  /** UI-07: окно закрыто игроком, но компонент жив (display:none) — состояние переживает закрытие */
  closed: boolean;
}

interface WmApi {
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

interface WmState {
  wins: WinState[];
  /** id активного окна (клик по пустому месту стола снимает фокус со всех) */
  activeId: string | null;
}

const WmApiCtx = createContext<WmApi | null>(null);
const WmStateCtx = createContext<WmState>({ wins: [], activeId: null });

let zCounter = 10;

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [wins, setWins] = useState<WinState[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const patch = useCallback((id: string, fn: (w: WinState) => WinState) => {
    setWins((ws) => {
      let changed = false;
      const next = ws.map((w) => {
        if (w.id !== id) return w;
        const nw = fn(w);
        if (nw !== w) changed = true;
        return nw;
      });
      return changed ? next : ws; // без изменений — сохраняем ссылку (лишних ререндеров нет)
    });
  }, []);

  // запомненные геометрии окон (размер+позиция переживают закрытие приложения)
  const memory = useRef(new Map<string, { x: number; y: number; w: number; h: number }>());

  // UI-02: пустые зависимости — объект методов стабилен, move/resize его не пересоздают
  const api = useMemo<WmApi>(() => ({
    open(id) {
      setActiveId(id);
      setWins((ws) => {
        if (ws.some((w) => w.id === id)) {
          // UI-07: открытие возвращает ту же инстанцию — состояние (визард/формы) сохраняется
          return ws.map((w) => (w.id === id ? { ...w, minimized: false, closed: false, flash: false, z: ++zCounter } : w));
        }
        // UI-07: закрытые окна не занимают позиции каскада новых окон
        const n = ws.filter((x) => !x.closed).length;
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
          closed: false,
          z: ++zCounter,
          flash: false,
        }];
      });
    },
    close(id) {
      // UI-07: закрытие НЕ размонтирует окно — ставим closed (hidden), открытие вернёт состояние
      setActiveId((cur: string | null) => (cur === id ? null : cur));
      setWins((ws) => {
        const i = ws.findIndex((x) => x.id === id);
        const w = i >= 0 ? ws[i] : undefined;
        if (!w || w.closed) return ws;
        if (!w.maximized) memory.current.set(id, { x: w.x, y: w.y, w: w.w, h: w.h });
        const next = ws.slice();
        next[i] = { ...w, closed: true, flash: false };
        return next;
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
      patch(id, (w) => (w.minimized ? w : { ...w, minimized: true }));
    },
    toggleMax(id) {
      // разворот на весь экран поднимает окно поверх остальных (и оно активно)
      setActiveId(id);
      patch(id, (w) => (w.maximized ? { ...w, maximized: false } : { ...w, maximized: true, z: ++zCounter }));
    },
    move(id, x, y) {
      patch(id, (w) => (w.x === x && w.y === y ? w : { ...w, x, y }));
    },
    resize(id, width, height) {
      const nw = Math.max(240, width);
      const nh = Math.max(140, height);
      patch(id, (w) => (w.w === nw && w.h === nh ? w : { ...w, w: nw, h: nh }));
    },
    setRect(id, x, y, width, height) {
      patch(id, (w) => (w.x === x && w.y === y && w.w === width && w.h === height ? w : { ...w, x, y, w: width, h: height }));
    },
    flash(id) {
      patch(id, (w) => (w.flash ? w : { ...w, flash: true }));
    },
    unflash(id) {
      patch(id, (w) => (w.flash ? { ...w, flash: false } : w));
    },
  }), [patch]);

  const state = useMemo<WmState>(() => ({ wins, activeId }), [wins, activeId]);

  return (
    <WmApiCtx.Provider value={api}>
      <WmStateCtx.Provider value={state}>{children}</WmStateCtx.Provider>
    </WmApiCtx.Provider>
  );
}

/** стабильные методы окон (не меняются при move/resize — не вызывают ререндер) */
export function useWindows(): WmApi {
  const ctx = useContext(WmApiCtx);
  if (!ctx) throw new Error('useWindows вне WindowManagerProvider');
  return ctx;
}

/** состояние окон: список + активное окно (читают только рабочий стол и таскбар) */
export function useWinState(): WmState {
  return useContext(WmStateCtx);
}
