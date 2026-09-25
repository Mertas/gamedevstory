// PLAN-39: врезка мини-игры на 50% разработки. Модалка поверх стола.
// Пропуска нет, но партию можно ЗАКРЫТЬ — за максимальный штраф (см. minigameClosedOutcome).
// Закрытие двухшаговое: первый клик — предупреждение, второй — собственно выход со штрафом.
// Содержимое — песочница E:/MY/gds-minigames в embed-режиме (в dev отдаёт vite-плагин /lab/).
import { useEffect, useState } from 'react';
import { actionCloseMinigame, actionResolveMinigame, useAutopilot, useGame, useSnapshot } from './store';
import { sfx } from './sfx';
import {
  MINIGAME_DEFS, MINIGAME_MAX_PENALTY, minigameClosedOutcome, minigameEmbedUrl, minigameOutcome,
} from '../shared/minigames';

/** Итог показа: из iframe (postMessage) либо досрочное закрытие. */
type Result = { key: string; pct: number; rank: string; closed: boolean };

export function MinigameModal() {
  const snap = useSnapshot();
  const autopilot = useAutopilot();
  const game = useGame();
  const ev = game.pendingEvent;
  const active = ev?.type === 'minigame' ? ev : null;
  const gameId = active?.gameId ?? '';
  // ключ этого показа: результат из iframe принимаем только пока событие то же самое
  const evKey = active ? `${gameId}:${game.week}:${game.studioName}` : '';
  const [res, setRes] = useState<Result | null>(null);
  // двухшаговая кнопка закрытия: первый клик лишь предупреждает — случайный не штрафует
  const [ask, setAsk] = useState(false);

  useEffect(() => {
    if (!active) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; type?: string; pct?: number; rank?: string } | null;
      if (!d || d.source !== 'gds-mg' || d.type !== 'done') return;
      setRes({
        key: evKey,
        pct: Math.max(0, Math.min(100, Math.round(Number(d.pct) || 0))),
        rank: String(d.rank ?? ''),
        closed: false,
      });
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [active, evKey]);

  // новое событие — сбрасываем недожатое подтверждение закрытия
  useEffect(() => {
    setAsk(false);
  }, [evKey]);

  // Автопилот игру не играет — сервер закроет событие сам, модалку не показываем.
  if (!active || !gameId || autopilot || snap.sessionLost) return null;
  const def = MINIGAME_DEFS[gameId];
  const title = def?.title ?? gameId;
  const done = res && res.key === evKey ? res : null;
  const out = done ? (done.closed ? minigameClosedOutcome() : minigameOutcome(done.pct)) : null;
  const penalty = Math.abs(MINIGAME_MAX_PENALTY);

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
          {!done && (
            <button
              className="w95-btn"
              style={{ position: 'absolute', right: 6, top: 4, fontSize: 11, padding: '1px 8px' }}
              onClick={() => (ask ? setRes({ key: evKey, pct: 0, rank: '', closed: true }) : setAsk(true))}
            >
              {ask ? `ТОЧНО? Штраф −${penalty} PR` : '✕ Закрыть'}
            </button>
          )}
        </div>
        <div className="w95-body w95-panel" style={{ padding: 10 }}>
          {!done ? (
            <>
              <div className="w95-hint" style={{ marginBottom: 6 }}>
                Пауза разработки: команда зовёт сыграть. Пропуска нет; закрыть можно — но это
                максимальный штраф (−{penalty} PR).
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
                {done.closed ? (
                  <>Партия закрыта досрочно — результат не засчитан.</>
                ) : (
                  <>
                    Результат: <b>{done.pct}%</b>
                    {done.rank ? <> · звание: <b>{done.rank}</b></> : null}
                  </>
                )}
              </div>
              <div className="w95-hint" style={{ marginBottom: 10 }}>{out?.note ?? ''}</div>
              <button
                className="w95-btn"
                style={{ minWidth: 150 }}
                onClick={() => (done.closed ? actionCloseMinigame() : actionResolveMinigame(done.pct))}
              >
                Продолжить разработку
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
