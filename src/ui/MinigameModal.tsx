// PLAN-39 (v0.59): врезка мини-игры на 50% разработки — монитор «SONNY», внутри — игра.
// Всё управление (закрытие со штрафом, экран итога, «Продолжить») живёт В САМОЙ игре
// (embed-обвязка песочницы); модалка — только корпус и мост сообщений:
//   игра → родителю: done{pct,rank} | close | continue;  родитель → игре: result{note}.
import { useEffect, useRef, useState } from 'react';
import { actionCloseMinigame, actionResolveMinigame, useAutopilot, useGame, useSnapshot } from './store';
import { sfx } from './sfx';
import { MINIGAME_DEFS, minigameEmbedUrl, minigameOutcome } from '../shared/minigames';
import { SONNY_SCREEN, SonnyMonitor } from './SonnyMonitor';

/** Итог показа: 'done' (сыграна, ждём «Продолжить») или 'close' (закрыта досрочно). */
interface Result {
  key: string;
  pct: number;
  closed: boolean;
}

export function MinigameModal() {
  const snap = useSnapshot();
  const autopilot = useAutopilot();
  const game = useGame();
  const ev = game.pendingEvent;
  const active = ev?.type === 'minigame' ? ev : null;
  const gameId = active?.gameId ?? '';
  // ключ этого показа: сообщения принимаем, пока событие то же самое
  const evKey = active ? `${gameId}:${game.week}:${game.studioName}` : '';
  const resRef = useRef<Result | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  // аудит-51 хвост P0-3: врезка может не загрузиться (нет /lab, сеть) — из модалки нужен выход,
  // иначе событие держит партию вечно. Кнопка — всегда; подсказка — если onLoad так и не пришёл.
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameStale, setFrameStale] = useState(false);

  useEffect(() => {
    resRef.current = null;
    setFrameLoaded(false);
    setFrameStale(false);
    if (!evKey) return;
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { source?: string; type?: string; pct?: number } | null;
      if (!d || d.source !== 'gds-mg') return;
      if (d.type === 'done') {
        const pct = Math.max(0, Math.min(100, Math.round(Number(d.pct) || 0)));
        resRef.current = { key: evKey, pct, closed: false };
        // текст эффекта для экрана итога считает родитель и шлёт внутрь игры
        const note = minigameOutcome(pct).note;
        frameRef.current?.contentWindow?.postMessage({ source: 'gds', type: 'result', note }, '*');
      } else if (d.type === 'close') {
        resRef.current = { key: evKey, pct: 0, closed: true };
      } else if (d.type === 'continue') {
        const r = resRef.current;
        if (!r || r.key !== evKey) return;
        resRef.current = null; // защита от двойного клика «Продолжить»
        if (r.closed) actionCloseMinigame();
        else actionResolveMinigame(r.pct);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [evKey]);

  // врезка не отозвалась загрузкой за 12 с — показываем подсказку (кнопка выхода есть всегда)
  useEffect(() => {
    if (!evKey) return;
    const t = window.setTimeout(() => setFrameStale(true), 12000);
    return () => window.clearTimeout(t);
  }, [evKey]);

  // Автопилот игру не играет — сервер закроет событие сам, модалку не показываем.
  if (!active || !gameId || autopilot || snap.sessionLost) return null;
  const def = MINIGAME_DEFS[gameId];
  const title = def?.title ?? gameId;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 21000, background: 'rgba(0,0,0,.45)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <SonnyMonitor title={title}>
        <iframe
          ref={frameRef}
          title={`Мини-игра «${title}»`}
          src={minigameEmbedUrl('/lab/', gameId, sfx.soundLevel !== 'off')}
          scrolling="no"
          style={{
            width: SONNY_SCREEN.w, height: SONNY_SCREEN.h, border: 0, display: 'block',
            background: '#000', borderRadius: 10,
          }}
          onLoad={() => setFrameLoaded(true)}
          onError={() => setFrameStale(true)}
        />
      </SonnyMonitor>
      <div style={{ marginTop: 10, textAlign: 'center' }}>
        {!frameLoaded && frameStale && (
          <div style={{ color: '#ffe9a8', fontSize: 12, marginBottom: 4 }}>Похоже, врезка не загрузилась — можно закрыть досрочно.</div>
        )}
        <button
          className="w95-btn"
          style={{ fontSize: 11, padding: '2px 10px' }}
          onClick={() => {
            // аудит-51 хвост P0-3: аварийный выход; уже сыгранный результат важнее штрафа
            const r = resRef.current;
            if (r && r.key === evKey && !r.closed) { resRef.current = null; actionResolveMinigame(r.pct); }
            else actionCloseMinigame();
          }}
        >
          Закрыть досрочно (штраф −2 PR)
        </button>
      </div>
    </div>
  );
}
