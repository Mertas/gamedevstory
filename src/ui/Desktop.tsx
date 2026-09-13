// Рабочий стол + панель задач + меню «Пуск».
import { useEffect, useMemo, useRef, useState } from 'react';
import { Window95 } from './Window95';
import { useWinState, useWindows } from './wm';
import { APP_DEFS } from './apps';
import { WebampLayer } from './WebampLayer';
import {
  actionSetAutopilot, actionSetUi, actionTakeControl, exportSave, importSave, setSpeed, showClientError,
  useAutopilot, useChat, useGame, useGameSelector, useSnapshot, useSpeed,
} from './store';
import { NewGameForm } from './NewGameForm';
import { typingName } from '../shared/chat';
import { dateLabel, dayInYear } from '../shared/meta';
import { AutopilotCursor } from './AutopilotCursor';
import { useOwner } from './owner';
import { VersionStamp } from './VersionStamp';
import { WALLPAPERS, readWallpaper, wallpaperById } from './wallpapers';
import { resolveFx } from '../shared/dev-anim';

/** M3.8 (plan/31 §9.8): уровни эффектов экрана разработки — «Эффекты экрана…» в ПКМ по столу. */
const FX_ROWS: Array<{ id: 'full' | 'mid' | 'min'; title: string; hint: string }> = [
  { id: 'full', title: 'Полно — вся вода', hint: 'капли, рябь, праздники, жизнь простоя (по умолчанию)' },
  { id: 'mid', title: 'Средне — без амбиента', hint: 'рабочая вода: капли и рябь; без сценок простоя, дождя и тряски' },
  { id: 'min', title: 'Минимум — сухо', hint: 'ничего не летит: числа и полоски сразу (для слабых машин)' },
];

/** M3.8: prefers-reduced-motion без падения там, где matchMedia нет (тесты/старые среды). */
function safeReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
import { fmtK } from '../shared/nums';

// все иконки win95-набора (public/icons/w95_1.png … w95_72.png) + логотип Winamp
const W95_ICONS = [...Array.from({ length: 72 }, (_, i) => `w95_${i + 1}.png`), 'winamp.png'];
// дефолтные иконки приложений (win95-набор; подобраны вручную)
const DEFAULT_ICONS: Record<string, string> = {
  code: 'w95_16.png', chat: 'w95_14.png', hire: 'w95_45.png', archive: 'w95_37.png',
  hardware: 'w95_12.png', research: 'w95_35.png', magazines: 'w95_60.png',
  marketing: 'w95_40.png', contracts: 'w95_39.png', mail: 'w95_17.png', help: 'w95_24.png',
  winamp: 'winamp.png',
};
const ICONS_KEY = 'gds-desk-icons';

export function Desktop({ onExit }: { onExit: () => void }) {
  const wm = useWindows();
  // план 19: «Инвайты» видит только владелец (в меню «Пуск» и на столе)
  const owner = useOwner();
  const apps = useMemo(() => (owner ? APP_DEFS : APP_DEFS.filter((a) => !a.adminOnly)), [owner]);
  const { wins, activeId } = useWinState();
  const wmRef = useRef(wm);
  wmRef.current = wm;
  const game = useGame();
  const chat = useChat();
  const speed = useSpeed();
  const autopilot = useAutopilot();
  const connected = useSnapshot().connected; // SRV-17: индикация обрыва связи (трей + баннер)
  const [startOpen, setStartOpen] = useState(false);
  const [newGameOpen, setNewGameOpen] = useState(false); // PLAN-18: новая игра — выбор студии и пары
  const startOpenRef = useRef(startOpen);
  startOpenRef.current = startOpen;
  const fileRef = useRef<HTMLInputElement>(null);
  // Winamp (Webamp) — не wm-окно: свой слой; waHidden = свёрнут в трей; waZ — слой поверх окон или в фоне
  const [waOpen, setWaOpen] = useState(false);
  const [waEverStarted, setWaEverStarted] = useState(false); // экземпляр Winamp создан хоть раз — живёт дальше (сохраняет окна/позиции)
  const [waHidden, setWaHidden] = useState(false);
  const [waZ, setWaZ] = useState(true); // true — Winamp поверх окон
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // клик вне меню рабочего стола — закрыть его
      if (ctxMenuRef.current && !t.closest('.w95-menu')) setCtxMenu(null);
      // клик вне меню «Пуск» и кнопки «Пуск» — закрыть меню «Пуск»
      if (startOpenRef.current && !t.closest('.w95-start-menu, .w95-start-btn')) setStartOpen(false);
      // фиксируем активность Winamp ДО этого клика (до любых ререндеров)
      winampWasActive.current = winampActiveRef.current;
      // клик по окнам Winamp — поднять слой; клик мимо (окна/рабочий стол) — опустить в фон.
      // Кнопку Winamp в таскбаре НЕ трогаем вообще — её полностью обрабатывает onClick
      if (t.closest('[data-wa-toggle]')) return;
      setWaZ(Boolean(t.closest('[data-wa-host]')));
      // клик вне окон, попапов и таск-кнопок приложений (рабочий стол, пустой таскбар,
      // кнопка «Пуск», трей) — снять фокус со всех окон. Кнопки приложений разрулит
      // их собственный onClick (фокус активному-свёртывание)
      if (!t.closest('.w95-window, .w95-menu, .w95-task-btn, [data-wa-host]')) {
        wmRef.current?.blur();
      }
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, []);
  // контекстное меню рабочего стола (правый клик по пустому месту)
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const iconEl = t.closest('.w95-d-icon') as HTMLElement | null;
      // ПКМ по иконке — меню иконки («Открыть», «Сменить иконку…»)
      if (iconEl) {
        const id = iconEl.dataset.deskId;
        if (!id) return;
        e.preventDefault();
        setSelIds([id]);
        setCtxMenu({ x: e.clientX, y: e.clientY, app: id });
        return;
      }
      // меню только на пустом месте рабочего стола: не на окнах,
      // панели задач, меню «Пуск»/попапах и не на окнах Winamp
      if (t.closest('.w95-menu') || t.closest('.w95-window')
        || t.closest('.w95-taskbar') || t.closest('[data-wa-host]') || !t.closest('.w95-desktop')) return;
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY });
    };
    document.addEventListener('contextmenu', onCtx, true);
    return () => document.removeEventListener('contextmenu', onCtx, true);
  }, []);

  const openWinamp = () => { setWaEverStarted(true); setWaOpen(true); setWaHidden(false); setWaZ(true); };
  // крестик Winamp: полное закрытие (как остальные окна); повторный запуск — по иконке
  const closeWinamp = () => { setWaOpen(false); setWaHidden(false); setWaZ(false); };
  // URL иконки приложения: выбранная игроком (localStorage) или дефолтная из кода
  const iconUrlFor = (appId: string): string | null => {
    const f = customIcons[appId] ?? DEFAULT_ICONS[appId];
    return f ? `/icons/${f}` : null;
  };
  // Winamp «активен» (держит фокус) — окна игры при этом неактивны (серые заголовки, кнопки выпуклые)
  const winampActive = waOpen && !waHidden && waZ;
  const winampActiveRef = useRef(winampActive);
  winampActiveRef.current = winampActive;
  // «был ли Winamp активен до этого клика» — фиксируется в document-capture (до ререндеров)
  const winampWasActive = useRef(winampActive);

  // ─── иконки рабочего стола: «выровнять по сетке» (галка), сортировка, позиции, drag ───
  const iconsRef = useRef<HTMLDivElement>(null);
  const [snapOn, setSnapOn] = useState<boolean>(() => { try { return localStorage.getItem('gds-desk-snap') === '1'; } catch { return false; } });
  const [deskSort, setDeskSort] = useState<'default' | 'name' | 'kind'>(() => { try { return (localStorage.getItem('gds-desk-sort') as 'default' | 'name' | 'kind') || 'default'; } catch { return 'default'; } });
  // PLAN-24: фон — часть сейва (game.ui.wallpaper), а не браузера: он должен ждать игрока везде
  const wallpaper = useGameSelector((g) => g.ui?.wallpaper ?? null);
  const gameUi = useGameSelector((g) => g.ui);
  const fxLevel = resolveFx(gameUi?.fx, safeReducedMotion());
  const [bgPick, setBgPick] = useState(false);
  const [fxPick, setFxPick] = useState(false);
  // PLAN-24: расстановка иконок — часть сейва (как фон и окна). Локально держим зеркало для перетаскивания.
  const savedIcons = useGameSelector((g) => g.ui?.icons);
  const [deskPos, setDeskPos] = useState<Record<string, { x: number; y: number }>>({});
  const iconsSeeded = useRef(false);
  const [selIds, setSelIds] = useState<string[]>([]);
  const [selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const boxRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; app?: string } | null>(null);
  const ctxMenuRef = useRef(ctxMenu);
  ctxMenuRef.current = ctxMenu;

  // иконки приложений, выбранные игроком (сменить иконку ПКМ по иконке)
  const [customIcons, setCustomIcons] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(ICONS_KEY) ?? '{}') as Record<string, string>; } catch { return {}; }
  });
  const [pickFor, setPickFor] = useState<string | null>(null); // для какого приложения открыт выбор иконки
  const setAppIcon = (appId: string, file: string) => {
    setCustomIcons((c) => {
      const next = { ...c, [appId]: file };
      try { localStorage.setItem(ICONS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };
  const dragRef = useRef<{ ids: string[]; start: { x: number; y: number }; bases: Record<string, { x: number; y: number }> } | null>(null);
  const [dragMap, setDragMap] = useState<Record<string, { x: number; y: number }> | null>(null);
  // UI-04: перетаскивание иконок — не чаще одного обновления на кадр (rAF-коалесинг)
  const dragRaf = useRef(0);
  const pendingDragMap = useRef<Record<string, { x: number; y: number }> | null>(null);
  const currentDragMap = useRef<Record<string, { x: number; y: number }> | null>(null);
  const scheduleDrag = (map: Record<string, { x: number; y: number }>) => {
    currentDragMap.current = map;
    pendingDragMap.current = map;
    if (!dragRaf.current) {
      dragRaf.current = requestAnimationFrame(() => {
        dragRaf.current = 0;
        const m = pendingDragMap.current;
        pendingDragMap.current = null;
        if (m) setDragMap(m);
      });
    }
  };
  const snapOnRef = useRef(snapOn);
  snapOnRef.current = snapOn;

  useEffect(() => { try { localStorage.setItem('gds-desk-snap', snapOn ? '1' : '0'); } catch { /* */ } }, [snapOn]);
  useEffect(() => { try { localStorage.setItem('gds-desk-sort', deskSort); } catch { /* */ } }, [deskSort]);
  // одноразовый перенос: до PLAN-24 фон жил в браузере, у прежних сейвов поля ui ещё нет
  const bgMigrated = useRef(false);
  useEffect(() => {
    if (bgMigrated.current || gameUi === undefined) return;
    bgMigrated.current = true;
    if (gameUi.wallpaper === undefined) {
      const stored = readWallpaper();
      if (stored) actionSetUi({ wallpaper: stored });
    }
  }, [gameUi]);
  // подъём расстановки из сейва; если её там ещё нет — одноразовый перенос из браузера
  useEffect(() => {
    if (iconsSeeded.current) return;
    iconsSeeded.current = true;
    if (savedIcons && Object.keys(savedIcons).length > 0) {
      setDeskPos(savedIcons);
      return;
    }
    try {
      const legacy = JSON.parse(localStorage.getItem('gds-desk-pos') || '{}') as Record<string, { x: number; y: number }>;
      if (legacy && Object.keys(legacy).length > 0) setDeskPos(legacy);
    } catch { /* мусор в localStorage — просто раскладываем по сетке */ }
  }, [savedIcons]);
  // изменения расстановки уходят в сейв с задержкой (перетаскивание — десятки событий)
  useEffect(() => {
    if (!iconsSeeded.current) return;
    const t = window.setTimeout(() => actionSetUi({ icons: deskPos }), 1200);
    return () => window.clearTimeout(t);
  }, [deskPos]);

  const deskItems = useMemo(() => {
    const items = apps.map((d) => ({ id: d.id, title: d.title, icon: d.icon, iconFile: DEFAULT_ICONS[d.id], kind: 'app', open: () => wm.open(d.id) }));
    items.push({ id: 'winamp', title: 'Winamp', icon: '🎵', iconFile: DEFAULT_ICONS.winamp, kind: 'media', open: openWinamp });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sortedIcons = useMemo(() => {
    const arr = [...deskItems];
    if (deskSort === 'name') arr.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    else if (deskSort === 'kind') arr.sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title, 'ru') : a.kind.localeCompare(b.kind)));
    return arr;
  }, [deskItems, deskSort]);

  // выровнять позиции по сетке (в порядке sortedIcons)
  const realign = () => {
    const cont = iconsRef.current;
    const rows = Math.max(1, Math.floor(((cont?.clientHeight ?? 600) - 40) / 82));
    const map: Record<string, { x: number; y: number }> = {};
    sortedIcons.forEach((it, i) => {
      map[it.id] = { x: 4 + Math.floor(i / rows) * 84, y: 4 + (i % rows) * 80 };
    });
    setDeskPos(map);
  };
  // сменили сортировку → расставить иконки по сетке в новом порядке
  const prevSort = useRef(deskSort);
  useEffect(() => {
    if (prevSort.current !== deskSort) realign();
    prevSort.current = deskSort;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskSort]);

  // базовая позиция иконки (сохранённая или ячейка по индексу)
  const rowsCount = () => Math.max(1, Math.floor(((iconsRef.current?.clientHeight ?? 600) - 40) / 82));
  const basePos = (id: string): { x: number; y: number } => {
    const p = deskPos[id];
    if (p) return p;
    const i = Math.max(0, sortedIcons.findIndex((it) => it.id === id));
    const rows = rowsCount();
    return { x: 4 + Math.floor(i / rows) * 84, y: 4 + (i % rows) * 80 };
  };

  // drag иконок (группы)
  const onIconDown = (e: React.MouseEvent, itemId: string) => {
    if (e.button !== 0) return;
    const cont = iconsRef.current;
    if (!cont) return;
    const r = cont.getBoundingClientRect();
    // выделение: Ctrl — добавить/убрать из группы; клик по иконке группы — тащим группу
    let ids: string[];
    if (e.ctrlKey || e.metaKey) {
      ids = selIds.includes(itemId) ? selIds.filter((x) => x !== itemId) : [...selIds, itemId];
    } else if (selIds.includes(itemId) && selIds.length > 1) {
      ids = selIds;
    } else {
      ids = [itemId];
    }
    setSelIds(ids);
    if (ids.length === 0) return;
    const bases: Record<string, { x: number; y: number }> = {};
    for (const id of ids) {
      const b = basePos(id);
      bases[id] = b;
    }
    dragRef.current = { ids, start: { x: e.clientX, y: e.clientY }, bases };
    const map: Record<string, { x: number; y: number }> = {};
    for (const id of ids) {
      const b = bases[id];
      if (b) map[id] = { ...b };
    }
    setDragMap(map);
    currentDragMap.current = map;
    void r;
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) {
        // растягивание рамки выделения — иконки выделяются живьём
        const b = boxRef.current;
        if (b) {
          b.x1 = e.clientX;
          b.y1 = e.clientY;
          const cont = iconsRef.current;
          if (!cont) return;
          const cr = cont.getBoundingClientRect();
          const bx = Math.min(b.x0, b.x1) - cr.left;
          const by = Math.min(b.y0, b.y1) - cr.top;
          const bw = Math.abs(b.x1 - b.x0);
          const bh = Math.abs(b.y1 - b.y0);
          setSelBox({ x: bx, y: by, w: bw, h: bh });
          // живьём: расширили — добавить, сузили — снять
          const ids: string[] = [];
          for (const el of Array.from(cont.children)) {
            const id = (el as HTMLElement).dataset.deskId;
            if (!id) continue;
            const ix = (el as HTMLElement).offsetLeft;
            const iy = (el as HTMLElement).offsetTop;
            const iw = (el as HTMLElement).offsetWidth;
            const ih = (el as HTMLElement).offsetHeight;
            if (ix < bx + bw && ix + iw > bx && iy < by + bh && iy + ih > by) ids.push(id);
          }
          setSelIds(ids);
        }
        return;
      }
      const cont = iconsRef.current;
      if (!cont) return;
      const r = cont.getBoundingClientRect();
      const dx = e.clientX - d.start.x;
      const dy = e.clientY - d.start.y;
      const map: Record<string, { x: number; y: number }> = {};
      for (const id of d.ids) {
        const b = d.bases[id] ?? { x: 4, y: 4 };
        map[id] = {
          x: Math.min(Math.max(b.x + dx, 0), Math.max(0, r.width - 80)),
          y: Math.min(Math.max(b.y + dy, 0), Math.max(0, r.height - 80)),
        };
      }
      scheduleDrag(map);
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d) {
        dragRef.current = null;
        if (dragRaf.current) {
          cancelAnimationFrame(dragRaf.current);
          dragRaf.current = 0;
        }
        const map = currentDragMap.current;
        currentDragMap.current = null;
        pendingDragMap.current = null;
        setDragMap(null);
        if (map) {
          const next = { ...map };
          if (snapOnRef.current) {
            // «выровнять по сетке»: после отпускания иконки встают в ближайшие ячейки
            for (const id of Object.keys(next)) {
              const cur = next[id];
              if (cur) {
                next[id] = {
                  x: 4 + Math.round(Math.max(0, cur.x - 4) / 84) * 84,
                  y: 4 + Math.round(Math.max(0, cur.y - 4) / 80) * 80,
                };
              }
            }
          }
          setDeskPos((p) => ({ ...p, ...next }));
        }
        return;
      }
      // выделение областью: отпустили — собрать иконки в прямоугольнике
      const b = boxRef.current;
      if (b) {
        boxRef.current = null;
        setSelBox(null);
        const cont = iconsRef.current;
        if (cont) {
          const x1 = Math.min(b.x0, b.x1);
          const y1 = Math.min(b.y0, b.y1);
          const w = Math.abs(b.x1 - b.x0);
          const h = Math.abs(b.y1 - b.y0);
          const cr = cont.getBoundingClientRect();
          const bx = x1 - cr.left;
          const by = y1 - cr.top;
          const ids: string[] = [];
          for (const el of Array.from(cont.children)) {
            const hh = el as HTMLElement;
            const id = hh.dataset.deskId;
            if (!id) continue;
            const ix = hh.offsetLeft;
            const iy = hh.offsetTop;
            if (ix < bx + w && ix + hh.offsetWidth > bx && iy < by + h && iy + hh.offsetHeight > by) ids.push(id);
          }
          if (ids.length) setSelIds(ids);
        }
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);
  const iconStyle = (it: { id: string }): React.CSSProperties => {
    const d = dragMap?.[it.id];
    if (d) return { position: 'absolute', left: d.x, top: d.y, zIndex: 5 };
    const p = basePos(it.id);
    return { position: 'absolute', left: p.x, top: p.y };
  };

  // мигание окна чата при новых сообщениях (если не в фокусе)
  const lastCount = useRef(chat.msgs.length);
  useEffect(() => {
    if (chat.msgs.length > lastCount.current) {
      const win = wins.find((w) => w.id === 'chat' && !w.closed);
      if (win && !win.minimized && !(win.z === Math.max(...wins.filter((x) => !x.closed).map((x) => x.z)))) wm.flash('chat');
      if (win?.minimized) wm.flash('chat');
    }
    lastCount.current = chat.msgs.length;
  }, [chat.msgs.length, wm, wins]);

  const typing = typingName(game, chat);

  const wp = wallpaperById(wallpaper);
  return (
    <div
      className="w95-desktop"
      style={wp ? { backgroundImage: `url(${wp.file})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      onMouseDown={(e) => {
      setStartOpen(false);
      // клик по свободному месту — снять выделение иконок
      const t = e.target as HTMLElement;
      if (!t.closest('.w95-d-icon') && !t.closest('.w95-menu') && !t.closest('.w95-window')) setSelIds([]);
    }}>
      <div className="w95-desktop-icons" ref={iconsRef} onMouseDown={(e) => {
        // выделение областью: зажать на пустом месте и растянуть
        if (!(e.target as HTMLElement).closest('.w95-d-icon')) {
          boxRef.current = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
        }
      }}>
        {sortedIcons.map((it) => (
          <div
            key={it.id}
            data-desk-id={it.id}
            className={`w95-d-icon ${selIds.includes(it.id) ? 'selected' : ''}`}
            style={iconStyle(it)}
            onDoubleClick={() => {
              // запуск приложения: выделение иконки снимается — фокус уходит окну
              setSelIds([]);
              it.open();
            }}
            onMouseDown={(e) => onIconDown(e, it.id)}
          >
            {customIcons[it.id] ?? it.iconFile ? (
              <img className="w95-ic" src={`/icons/${customIcons[it.id] ?? it.iconFile}`} alt="" draggable={false} />
            ) : (
              <span style={{ fontSize: 30 }}>{it.icon}</span>
            )}
            <span>{it.title}</span>
          </div>
        ))}
        {selBox && <div className="w95-desk-box" style={{ left: selBox.x, top: selBox.y, width: selBox.w, height: selBox.h }} />}
      </div>

      {wins.map((w) => {
        const def = apps.find((a) => a.id === w.id);
        if (!def) return null;
        // UI-01/02: контент — стабильная ссылка на компонент + memo(Window95):
        // ререндер Desktop (тик/снапшот/драг) не тянет за собой все окна
        return (
          <Window95
            key={w.id}
            win={w}
            title={def.title}
            icon={def.icon}
            iconUrl={iconUrlFor(w.id) ?? undefined}
            focused={!winampActive && activeId === w.id}
            component={def.component}
          />
        );
      })}

      {ctxMenu && ('app' in ctxMenu ? (
        <div className="w95-menu" style={{ left: ctxMenu.x, top: ctxMenu.y - 8 }}>
          <div className="w95-mi" onClick={() => {
            const it = sortedIcons.find((x) => x.id === ctxMenu.app);
            setCtxMenu(null);
            if (it) { setSelIds([]); it.open(); }
          }}>
            <span style={{ width: 16 }}>{''}</span>Открыть
          </div>
          <div className="w95-mi" onClick={() => { setPickFor(ctxMenu.app ?? null); setCtxMenu(null); }}>
            <span style={{ width: 16 }}>{''}</span>Сменить иконку…
          </div>
        </div>
      ) : (
        <div className="w95-menu" style={{ left: ctxMenu.x, top: ctxMenu.y - 8 }}>
          <div className="w95-mi" onClick={() => { realign(); setCtxMenu(null); }}>
            <span style={{ width: 16 }}>{''}</span>Упорядочить иконки
          </div>
          <div className="w95-mi" onClick={() => { setSnapOn(!snapOn); setCtxMenu(null); }}>
            <span style={{ width: 16 }}>{snapOn ? '✓' : ''}</span>Выровнять по сетке
          </div>
          <div className="w95-mi sep" />
          <div className="w95-mi" onClick={() => { setDeskSort('name'); setCtxMenu(null); }}>
            <span style={{ width: 16 }}>{deskSort === 'name' ? '✓' : ''}</span>Сортировать по имени
          </div>
          <div className="w95-mi" onClick={() => { setDeskSort('kind'); setCtxMenu(null); }}>
            <span style={{ width: 16 }}>{deskSort === 'kind' ? '✓' : ''}</span>Сортировать по типу
          </div>
          <div className="w95-mi" onClick={() => { setDeskSort('default'); setCtxMenu(null); }}>
            <span style={{ width: 16 }}>{deskSort === 'default' ? '✓' : ''}</span>Сортировать по порядку
          </div>
          <div className="w95-mi sep" />
          <div className="w95-mi" onClick={() => { setBgPick(true); setCtxMenu(null); }}>
            <span style={{ width: 16 }}>{wp ? '✓' : ''}</span>Сменить фон…
          </div>
          <div className="w95-mi" onClick={() => { setFxPick(true); setCtxMenu(null); }}>
            <span style={{ width: 16 }}>{''}</span>Эффекты экрана…
          </div>
        </div>
      ))}

      {/* PLAN-24: выбор обоев (ПКМ по столу → «Сменить фон…»). Выбор применяется сразу — живое превью */}
      {bgPick && (
        <div className="w95-modal" onClick={() => setBgPick(false)}>
          <div className="w95-modal-box" onClick={(e) => e.stopPropagation()}>
            <b style={{ marginBottom: 6 }}>Сменить фон рабочего стола</b>
            <div className="w95-bg-grid">
              <div
                className={'w95-bg-item' + (wallpaper === null ? ' picked' : '')}
                title="Обычный бирюзовый стол"
                onClick={() => actionSetUi({ wallpaper: null })}
              >
                <div className="w95-bg-plain">🎨</div>
                <span>Обычный (бирюза)</span>
              </div>
              {WALLPAPERS.map((w) => (
                <div
                  key={w.id}
                  className={'w95-bg-item' + (wallpaper === w.id ? ' picked' : '')}
                  title={w.title}
                  onClick={() => actionSetUi({ wallpaper: w.id })}
                >
                  <img src={w.thumb} alt="" draggable={false} />
                  <span>{w.title}</span>
                </div>
              ))}
            </div>
            <div className="w95-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="w95-btn" onClick={() => setBgPick(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {/* M3.8: эффекты экрана — мини/средне/полно (plan/31 §9.8); выбор хранится в сейве (game.ui.fx) */}
      {fxPick && (
        <div className="w95-modal" onClick={() => setFxPick(false)}>
          <div className="w95-modal-box" onClick={(e) => e.stopPropagation()}>
            <b style={{ marginBottom: 6 }}>Эффекты экрана</b>
            <div className="w95-fx-list">
              {FX_ROWS.map((row) => (
                <div
                  key={row.id}
                  className={'w95-fx-row' + (fxLevel === row.id ? ' picked' : '')}
                  onClick={() => actionSetUi({ fx: row.id })}
                >
                  <span className="w95-fx-check">{fxLevel === row.id ? '✓' : ''}</span>
                  <span>
                    <b>{row.title}</b>
                    <span className="w95-hint">{gameUi?.fx === undefined && fxLevel === row.id ? ' · авто' : ''}</span>
                    <div className="w95-hint">{row.hint}</div>
                  </span>
                </div>
              ))}
            </div>
            <div className="w95-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="w95-btn" onClick={() => setFxPick(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {/* выбор иконки приложения (ПКМ по иконке → «Сменить иконку…») */}
      {pickFor && (
        <div className="w95-modal" onClick={() => setPickFor(null)}>
          <div className="w95-modal-box" onClick={(e) => e.stopPropagation()}>
            <b style={{ marginBottom: 6 }}>
              Сменить иконку — {sortedIcons.find((x) => x.id === pickFor)?.title ?? pickFor}
            </b>
            <div className="w95-modal-grid">
              {W95_ICONS.map((f) => (
                <img
                  key={f}
                  src={`/icons/${f}`}
                  alt=""
                  draggable={false}
                  className={`w95-pick-ic ${(customIcons[pickFor] ?? DEFAULT_ICONS[pickFor]) === f ? 'picked' : ''}`}
                  onClick={() => setAppIcon(pickFor, f)}
                />
              ))}
            </div>
            <button className="w95-btn" style={{ marginTop: 8, alignSelf: 'flex-end' }} onClick={() => setPickFor(null)}>
              Готово
            </button>
          </div>
        </div>
      )}

      {waEverStarted && <WebampLayer open={waOpen} visible={!waHidden} zTop={waZ} onHidden={() => setWaHidden(true)} onExit={closeWinamp} />}

      {/* виртуальная мышь автопилота (plan/14) */}
      <AutopilotCursor />

      {/* панель задач */}
      <VersionStamp className="w95-desktop-version" />
      <div className="w95-taskbar" onMouseDown={(e) => e.stopPropagation()}>
        <button
          className={`w95-btn w95-start-btn ${startOpen ? 'active' : ''}`}
          onClick={() => setStartOpen((v) => !v)}
        >
          <img className="w95-start-logo" src="/icons/start-logo.svg" alt="" draggable={false} />
          <span>Пуск</span>
        </button>

        {wins.map((w) => {
          // UI-07: закрытые окна в таскбаре не показываем (состояние живёт скрыто)
          if (w.closed) return null;
          const def = apps.find((a) => a.id === w.id);
          const isActive = !winampActive && !w.minimized && activeId === w.id;
          return (
            <button
              key={w.id}
              className={`w95-btn w95-task-btn ${isActive ? 'active' : ''} ${w.flash ? 'flash' : ''}`}
              onClick={() => {
                wm.unflash(w.id);
                if (w.minimized) wm.open(w.id);
                else if (!winampWasActive.current && isActive) wm.minimize(w.id);
                else wm.focus(w.id);
              }}
            >
              {iconUrlFor(w.id) ? (
                <img className="w95-task-ic" src={iconUrlFor(w.id) ?? ''} alt="" draggable={false} />
              ) : (
                <span className="w95-task-emo">{def?.icon}</span>
              )}
              {def?.title}
            </button>
          );
        })}
        {waOpen && (
          <button
            data-wa-toggle
            className={`w95-btn w95-task-btn ${waHidden || !waZ ? '' : 'active'}`}
            onClick={() => {
              // как в Windows: свёрнут → развернуть; в фоне → поднять; активен → свернуть
              if (waHidden) { setWaHidden(false); setWaZ(true); }
              else if (!waZ) { setWaZ(true); }
              else { setWaHidden(true); }
            }}
          >
            <img className="w95-task-ic" src={iconUrlFor('winamp') ?? '/icons/winamp.png'} alt="" draggable={false} />
            Winamp
          </button>
        )}

        <div className="w95-tray">
          {!connected && (
            <span className="w95-noconn" title="Сервер недоступен — действия копятся и уйдут после переподключения">🔌 нет связи</span>
          )}
          <span className="w95-hint" style={{ marginRight: 8 }} title="Ваша студия (название выбрано при новой игре)">🏢 {game.studioName}</span>
          {typing && <span className="w95-hint" style={{ color: '#000080', marginRight: 6 }}>{typing} печатает…</span>}
          <button
            className="w95-btn"
            style={{ marginRight: 8, fontWeight: 'bold', ...(autopilot ? { color: '#c00000' } : {}) }}
            onClick={autopilot ? actionTakeControl : () => actionSetAutopilot(true)}
            title={autopilot
              ? 'Вернуть управление боссу — автопилот выключится'
              : 'Передать управление команде — она сама решит, что делать дальше'}
          >
            {autopilot ? '👤 Взять управление' : '🤖 Отдать управление'}
          </button>
          <span className="w95-hint" style={{ marginRight: 6 }}>❤ {Math.round(game.fans)}</span>
          <span className="w95-hint" style={{ marginRight: 6 }}>🔬 {Math.round(game.research)} PR</span>
          <span className="w95-tray-money" style={{ fontWeight: 'bold', marginRight: 6 }}>💰 {fmtK(game.money)}</span>
          <div className="w95-speed">
            {[0, 0.5, 1, 2, 4, 8].map((v) => (
              <button key={v} className={`w95-btn ${speed === v ? 'on pressed' : ''}`} onClick={() => setSpeed(v)}>
                {v === 0 ? '⏸' : v === 0.5 ? '½' : `${v}×`}
              </button>
            ))}
          </div>
          <div className="w95-tray-clock">
            {game.bankrupt ? 'БАНКРОТ' : `${dateLabel(game.week)}, день ${dayInYear(game.week)}`}
          </div>
        </div>
      </div>

      {/* SRV-17: обрыв связи — баннер поверх стола, пока не переподключимся */}
      {!connected && (
        <div className="w95-noconn-banner">🔌 Нет связи с сервером — переподключение…</div>
      )}

      {/* Пуск */}
      {startOpen && (
        <div className="w95-menu w95-start-menu" style={{ left: 2, bottom: 32 }} onMouseDown={(e) => e.stopPropagation()}>
          {apps.map((a) => (
            <div key={a.id} className="w95-mi" onClick={() => { wm.open(a.id); setStartOpen(false); }}>
              <span style={{ width: 18, textAlign: 'center' }}>{a.icon}</span> {a.title}
            </div>
          ))}
          <div className="w95-mi" onClick={() => { openWinamp(); setStartOpen(false); }}>
            <span style={{ width: 18, textAlign: 'center' }}>🎵</span> Winamp
          </div>
          <div className="w95-mi sep" />
          <div className="w95-mi" onClick={() => { saveToFile(); setStartOpen(false); }}>💾 Сохранить игру…</div>
          <div className="w95-mi" onClick={() => { fileRef.current?.click(); setStartOpen(false); }}>📂 Загрузить игру…</div>
          <div className="w95-mi sep" />
          <div className="w95-mi" onClick={() => { setNewGameOpen(true); setStartOpen(false); }}>🆕 Новая игра…</div>
          <div className="w95-mi sep" />
          <div className="w95-mi" onClick={() => { setSpeed(0); setStartOpen(false); onExit(); }}>🚪 Выход в начальное меню</div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            // SRV-19: отказ сервера/сеть — игрок видит причину, а не тишину
            void importSave(String(r.result ?? ''))
              .then((ok) => { if (!ok) showClientError('Файл не принят: это не сейв GameDevStory'); })
              .catch(() => showClientError('Загрузить не удалось: сервер недоступен'));
          };
          r.onerror = () => showClientError('Не удалось прочитать файл');
          r.readAsText(f);
          e.target.value = '';
        }}
      />

      {/* PLAN-18: новая игра — название студии и стартовая пара (партия создаётся в базе) */}
      {newGameOpen && (
        <div className="w95-modal-wrap" onMouseDown={(e) => e.stopPropagation()}>
          <div className="w95-window focused" style={{ position: 'relative', width: 700, zIndex: 901 }}>
            <div className="w95-title">🆕 Новая игра</div>
            <div className="w95-body" style={{ padding: 10 }}>
              <NewGameForm onClose={() => setNewGameOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function saveToFile() {
    void exportSave().then((json) => {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `gds-save-${game?.week ?? 0}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    // SRV-19: сервер недоступен — сообщаем, иначе кнопка «молчит»
    }).catch(() => showClientError('Сохранить не удалось: сервер недоступен'));
  }
}
