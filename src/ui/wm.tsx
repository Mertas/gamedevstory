// Менеджер окон Win95: состояние окон, z-order, фокус, мигание.
// UI-02: методы стабильны (контекст НЕ пересоздаётся при move/resize) — окна не
// ререндерятся всем списком; состояние окон живёт в отдельном контексте, а Window95
// получает своё окно пропсом и мемоизирован, поэтому двигается только оно.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';

import { actionSetUi, useGameSelector } from './store';
import { sfx } from './sfx';
import { WIN_Z_BASE, WIN_Z_CAP, packWinZ } from './winz';

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

let zCounter = WIN_Z_BASE;

/** Перед поднятием окна: при переполнении счётчика сжать слои окон (см. winz.ts). */
function prepZ(ws: WinState[]): WinState[] {
  if (zCounter < WIN_Z_CAP) return ws;
  const { wins, next } = packWinZ(ws);
  zCounter = next;
  return wins;
}

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [wins, setWins] = useState<WinState[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // PLAN-24: раскладка окон — часть сейва. Открытие сейва перезагружает страницу, поэтому
  // «поднять окна один раз за сессию» = «поднять их для этого сейва».
  const savedWins = useGameSelector((g) => g.ui?.windows);
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    // Desktop монтируется только с загруженным сейвом, поэтому первый прогон эффекта — это «сейв поднят».
    // Флаг ставим всегда, иначе в НОВОЙ партии (окон в сейве ещё нет) раскладка не сохранялась бы вовсе.
    seeded.current = true;
    if (!savedWins || savedWins.length === 0) return; // окон в сейве нет — стол пустой, как и был
    // v1.47.9: слои из сейва перенумеровываются в 10..N — накопленный за тысячи кликов z
    // (вплоть до 9834) перекрывал Webamp (8998), панель задач (9000) и меню «Пуск» (9500)
    const { wins: packed, next } = packWinZ(savedWins.map((w) => ({ ...w, flash: false })));
    zCounter = next;
    setWins(packed);
  }, [savedWins]);

  // изменения раскладки уходят в сейв с задержкой: перетаскивание окна — это десятки событий
  useEffect(() => {
    if (!seeded.current) return;
    const t = window.setTimeout(() => {
      actionSetUi({
        windows: wins.map(({ id, x, y, w, h, minimized, maximized, closed, z }) => ({ id, x, y, w, h, minimized, maximized, closed, z })),
      });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [wins]);

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
      sfx.openWindow(); // M4: звук открытия окна (дух Win95)
      setActiveId(id);
      setWins((ws) => {
        const base = prepZ(ws);
        if (base.some((w) => w.id === id)) {
          // UI-07: открытие возвращает ту же инстанцию — состояние (визард/формы) сохраняется
          return base.map((w) => (w.id === id ? { ...w, minimized: false, closed: false, flash: false, z: ++zCounter } : w));
        }
        // UI-07: закрытые окна не занимают позиции каскада новых окон
        const n = base.filter((x) => !x.closed).length;
        const mem = memory.current.get(id);
        const vw = window.innerWidth;
        const vh = window.innerHeight - 30;
        const geo = mem && mem.w >= 240 && mem.h >= 150 && mem.x >= 0 && mem.y >= 0 && mem.x + mem.w <= vw + 20
          ? { ...mem }
          : { x: 40 + (n % 6) * 28, y: 30 + (n % 5) * 24, w: 560, h: 400 };
        return [...base, {
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
      sfx.closeWindow(); // M4: звук закрытия окна
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
      setWins((ws) => {
        const cur = ws.find((w) => w.id === id);
        if (!cur) return ws;
        if (cur.z === zCounter && !cur.flash) return ws; // окно уже поверх — счётчик не крутим
        const base = prepZ(ws);
        return base.map((w) => (w.id === id ? { ...w, z: ++zCounter, flash: false } : w));
      });
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
      setWins((ws) => {
        const cur = ws.find((w) => w.id === id);
        if (!cur) return ws;
        if (cur.maximized) return ws.map((w) => (w.id === id ? { ...w, maximized: false } : w));
        const base = prepZ(ws);
        return base.map((w) => (w.id === id ? { ...w, maximized: true, z: ++zCounter } : w));
      });
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
