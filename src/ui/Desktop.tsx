// Рабочий стол + панель задач + меню «Пуск».
import { useEffect, useRef, useState } from 'react';
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
  // Winamp (Webamp) — не wm-окно: свой слой; waHidden = свёрнут в трей
  const [waOpen, setWaOpen] = useState(false);
  const [waHidden, setWaHidden] = useState(false);
  const openWinamp = () => { setWaOpen(true); setWaHidden(false); };

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
    <div className="w95-desktop" onMouseDown={() => setStartOpen(false)}>
      <div className="w95-desktop-icons">
        {APP_DEFS.map((a) => (
          <div key={a.id} className="w95-d-icon" onDoubleClick={() => wm.open(a.id)}>
            <span style={{ fontSize: 30 }}>{a.icon}</span>
            <span>{a.title}</span>
          </div>
        ))}
        <div className="w95-d-icon" onDoubleClick={openWinamp}>
          <span style={{ fontSize: 30 }}>🎵</span>
          <span>Winamp</span>
        </div>
      </div>

      {wm.wins.map((w) => {
        const def = APP_DEFS.find((a) => a.id === w.id);
        if (!def) return null;
        const C = def.component;
        return (
          <Window95 key={w.id} win={w} title={def.title} icon={def.icon}>
            <C />
          </Window95>
        );
      })}

      {waOpen && <WebampLayer visible={!waHidden} onHidden={() => setWaHidden(true)} />}

      {/* панель задач */}
      <div className="w95-taskbar" onMouseDown={(e) => e.stopPropagation()}>
        <button className="w95-btn w95-start-btn" onClick={() => setStartOpen((v) => !v)}>
          <span>🪟</span> Пуск
        </button>

        {wm.wins.map((w) => {
          const def = APP_DEFS.find((a) => a.id === w.id);
          const isActive = !w.minimized && w.z === Math.max(...wm.wins.map((x) => x.z));
          return (
            <button
              key={w.id}
              className={`w95-btn w95-task-btn ${isActive ? 'active' : ''} ${w.flash ? 'flash' : ''}`}
              onClick={() => {
                wm.unflash(w.id);
                if (w.minimized) wm.open(w.id);
                else if (isActive) wm.minimize(w.id);
                else wm.focus(w.id);
              }}
            >
              {def?.icon} {def?.title}
            </button>
          );
        })}
        {waOpen && (
          <button
            className={`w95-btn w95-task-btn ${waHidden ? '' : 'active'}`}
            onClick={() => setWaHidden((v) => !v)}
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
