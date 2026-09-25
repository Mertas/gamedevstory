// PLAN-39: врезка мини-игры на 50% разработки. Модалка поверх стола, кнопки пропуска НЕТ:
// команда сыграла — результат (0–100 %) уезжает на сервер, эффект (PR) считает движок.
// Содержимое — песочница E:/MY/gds-minigames в embed-режиме (в dev отдаёт vite-плагин /lab/).
import { useEffect, useState } from 'react';
import { actionResolveMinigame, useAutopilot, useGame, useSnapshot } from './store';
import { sfx } from './sfx';
import { MINIGAME_DEFS, minigameEmbedUrl, minigameOutcome } from '../shared/minigames';

export function MinigameModal() {
  const snap = useSnapshot();
  const autopilot = useAutopilot();
  const game = useGame();
  const ev = game.pendingEvent;
  const active = ev?.type === 'minigame' ? ev : null;
  const gameId = active?.gameId ?? '';
  // ключ этого показа: результат из iframe принимаем только пока событие то же самое
  const evKey = active ? `${gameId}:${game.week}:${game.studioName}` : '';
  const [res, setRes] = useState<{ key: string; pct: number; rank: string } | null>(null);

  useEffect(() => {
    if (!active) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; type?: string; pct?: number; rank?: string } | null;
      if (!d || d.source !== 'gds-mg' || d.type !== 'done') return;
      setRes({
        key: evKey,
        pct: Math.max(0, Math.min(100, Math.round(Number(d.pct) || 0))),
        rank: String(d.rank ?? ''),
      });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [active, evKey]);

  // Автопилот игру не играет — сервер закроет событие сам, модалку не показываем.
  if (!active || !gameId || autopilot || snap.sessionLost) return null;
  const def = MINIGAME_DEFS[gameId];
  const title = def?.title ?? gameId;
  const done = res && res.key === evKey ? res : null;
  const out = done ? minigameOutcome(done.pct) : null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 21000, background: 'rgba(0,0,0,.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div className="w95-window focused" style={{ position: 'relative', width: 730, height: 'auto', zIndex: 21001 }}>
        <div className="w95-titlebar">
          <span className="w95-title">🎮 МИНИ-ИГРА — {title}</span>
        </div>
        <div className="w95-body w95-panel" style={{ padding: 10 }}>
          {!done ? (
            <>
              <div className="w95-hint" style={{ marginBottom: 6 }}>
                Пауза разработки: команда зовёт сыграть. Пропуска нет — доведи партию до конца.
              </div>
              <iframe
                title={`Мини-игра «${title}»`}
                src={minigameEmbedUrl('/lab/', gameId, sfx.soundLevel !== 'off')}
                style={{
                  width: 704, height: 562, border: '2px inset #c0c0c0', background: '#c0c0c0',
                  display: 'block', margin: '0 auto',
                }}
              />
            </>
          ) : (
            <div style={{ padding: '12px 8px' }}>
              <div style={{ fontSize: 15, marginBottom: 6 }}>
                Результат: <b>{done.pct}%</b>
                {done.rank ? <> · звание: <b>{done.rank}</b></> : null}
              </div>
              <div className="w95-hint" style={{ marginBottom: 10 }}>{out?.note ?? ''}</div>
              <button className="w95-btn" style={{ minWidth: 150 }} onClick={() => actionResolveMinigame(done.pct)}>
                Продолжить разработку
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
