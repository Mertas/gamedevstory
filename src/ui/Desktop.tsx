// Рабочий стол + панель задач + меню «Пуск».
import { useEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from '../core/config';
import { Window95 } from './Window95';
import { useWindows } from './wm';
import { APP_DEFS } from './apps';
import { WebampLayer } from './WebampLayer';
import {
  exportSave, importSave, newGameAction, setSpeed, useChat, useGame, useSpeed,
} from './store';
import { typingName } from '../shared/chat';

// реальный календарь: 1 апреля 1985 = день 1
function monthName(w: number): string {
  const dayInYear = ((w - 1) % CONFIG.YEAR_LENGTH) + 1;
  const months = ['апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря', 'января', 'февраля', 'марта'];
  const offsets = [0, 30, 61, 91, 122, 153, 183, 214, 244, 275, 306, 334];
  const days = [30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 28, 31];
  for (let m = 0; m < 12; m++) {
    if (dayInYear <= (offsets[m] ?? 0) + (days[m] ?? 0)) {
      return `${dayInYear - (offsets[m] ?? 0)} ${months[m]}`;
    }
  }
  return '31 марта';
}

function gameDate(w: number): string {
  const year = Math.floor((w - 1) / CONFIG.YEAR_LENGTH) + 1985;
  const dayInYear = ((w - 1) % CONFIG.YEAR_LENGTH) + 1;
  return `${monthName(w)} ${year} г., день ${dayInYear}`;
}

export function Desktop() {
  const wm = useWindows();
  const game = useGame();
  const chat = useChat();
  const speed = useSpeed();
  const [startOpen, setStartOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Winamp (Webamp) — не wm-окно: свой слой; waHidden = свёрнут в трей; waZ — слой поверх окон или в фоне
  const [waOpen, setWaOpen] = useState(false);
  const [waHidden, setWaHidden] = useState(false);
  const [waZ, setWaZ] = useState(true); // true — Winamp поверх окон
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // клик вне меню рабочего стола — закрыть его
      if (ctxMenuRef.current && !t.closest('.w95-menu')) setCtxMenu(null);
      // фиксируем активность Winamp ДО этого клика (до любых ререндеров)
      winampWasActive.current = winampActiveRef.current;
      // клик по окнам Winamp — поднять слой; клик мимо (окна/рабочий стол) — опустить в фон.
      // Кнопку Winamp в таскбаре НЕ трогаем вообще — её полностью обрабатывает onClick
      if (t.closest('[data-wa-toggle]')) return;
      setWaZ(Boolean(t.closest('[data-wa-host]')));
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, []);
  // контекстное меню рабочего стола (правый клик по пустому месту)
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest('.w95-d-icon') || t.closest('.w95-menu') || !t.closest('.w95-desktop')) return;
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY });
    };
    document.addEventListener('contextmenu', onCtx, true);
    return () => document.removeEventListener('contextmenu', onCtx, true);
  }, []);

  const openWinamp = () => { setWaOpen(true); setWaHidden(false); setWaZ(true); };
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
  const [deskPos, setDeskPos] = useState<Record<string, { x: number; y: number }>>(() => { try { return JSON.parse(localStorage.getItem('gds-desk-pos') || '{}'); } catch { return {}; } });
  const [selIds, setSelIds] = useState<string[]>([]);
  const [selBox, setSelBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const boxRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const ctxMenuRef = useRef(ctxMenu);
  ctxMenuRef.current = ctxMenu;
  const dragRef = useRef<{ ids: string[]; start: { x: number; y: number }; bases: Record<string, { x: number; y: number }> } | null>(null);
  const [dragMap, setDragMap] = useState<Record<string, { x: number; y: number }> | null>(null);
  const snapOnRef = useRef(snapOn);
  snapOnRef.current = snapOn;

  useEffect(() => { try { localStorage.setItem('gds-desk-snap', snapOn ? '1' : '0'); } catch { /* */ } }, [snapOn]);
  useEffect(() => { try { localStorage.setItem('gds-desk-sort', deskSort); } catch { /* */ } }, [deskSort]);
  useEffect(() => { try { localStorage.setItem('gds-desk-pos', JSON.stringify(deskPos)); } catch { /* */ } }, [deskPos]);

  const deskItems = useMemo(() => {
    const items = APP_DEFS.map((d) => ({ id: d.id, title: d.title, icon: d.icon, kind: 'app', open: () => wm.open(d.id) }));
    items.push({ id: 'winamp', title: 'Winamp', icon: '🎵', kind: 'media', open: openWinamp });
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
      setDragMap(map);
    };
    const onUp = () => {
      const d = dragRef.current;
      if (d) {
        dragRef.current = null;
        setDragMap((map) => {
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
          return null; // dragMap — только на время перетаскивания
        });
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
      const win = wm.wins.find((w) => w.id === 'chat');
      if (win && !win.minimized && !(win.z === Math.max(...wm.wins.map((x) => x.z)))) wm.flash('chat');
      if (win?.minimized) wm.flash('chat');
    }
    lastCount.current = chat.msgs.length;
  }, [chat.msgs.length, wm, wm.wins]);

  const typing = typingName(game, chat);

  return (
    <div className="w95-desktop" onMouseDown={(e) => {
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
            <span style={{ fontSize: 30 }}>{it.icon}</span>
            <span>{it.title}</span>
          </div>
        ))}
        {selBox && <div className="w95-desk-box" style={{ left: selBox.x, top: selBox.y, width: selBox.w, height: selBox.h }} />}
      </div>

      {wm.wins.map((w) => {
        const def = APP_DEFS.find((a) => a.id === w.id);
        if (!def) return null;
        const C = def.component;
        return (
          <Window95 key={w.id} win={w} title={def.title} icon={def.icon} externalFocus={winampActive}>
            <C />
          </Window95>
        );
      })}

      {ctxMenu && (
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
        </div>
      )}

      {waOpen && <WebampLayer visible={!waHidden} zTop={waZ} onHidden={() => setWaHidden(true)} />}

      {/* панель задач */}
      <div className="w95-taskbar" onMouseDown={(e) => e.stopPropagation()}>
        <button
          className={`w95-btn w95-start-btn ${startOpen ? 'active' : ''}`}
          onClick={() => setStartOpen((v) => !v)}
        >
          <span>🪟</span> Пуск
        </button>

        {wm.wins.map((w) => {
          const def = APP_DEFS.find((a) => a.id === w.id);
          const isActive = !winampActive && !w.minimized && w.z === Math.max(...wm.wins.map((x) => x.z));
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
              {def?.icon} {def?.title}
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
            🎵 Winamp
          </button>
        )}

        <div className="w95-tray">
          {typing && <span className="w95-hint" style={{ color: '#000080' }}>{typing} печатает…</span>}
          <span className="w95-hint" style={{ marginRight: 6 }}>❤ {Math.round(game.fans)}</span>
          <span className="w95-hint" style={{ marginRight: 6 }}>🔬 {Math.round(game.research)} PR</span>
          <span className="w95-tray-money" style={{ fontWeight: 'bold', marginRight: 6 }}>💰 {Math.round(game.money)}K</span>
          <div className="w95-speed">
            {[0, 0.5, 1, 2, 4, 8].map((v) => (
              <button key={v} className={`w95-btn ${speed === v ? 'on pressed' : ''}`} onClick={() => setSpeed(v)}>
                {v === 0 ? '⏸' : v === 0.5 ? '½' : `${v}×`}
              </button>
            ))}
          </div>
          <div className="w95-tray-clock">
            {game.bankrupt ? 'БАНКРОТ' : gameDate(game.week)}
          </div>
        </div>
      </div>

      {/* Пуск */}
      {startOpen && (
        <div className="w95-menu" style={{ left: 2, bottom: 32 }} onMouseDown={(e) => e.stopPropagation()}>
          {APP_DEFS.map((a) => (
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
          <div className="w95-mi" onClick={() => { if (confirm('Начать новую игру? Текущий прогресс будет потерян.')) newGameAction(); setStartOpen(false); }}>🆕 Новая игра</div>
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
          r.onload = () => { void importSave(String(r.result ?? '')); };
          r.readAsText(f);
          e.target.value = '';
        }}
      />
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
    });
  }
}
