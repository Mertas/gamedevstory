// MessageBox в стиле Win95.
// v1.18.1: информационные попапы (обучение, уровни, происшествия, сводки) закрываются кликом
// по окну — в стиле карточек прессы (клик/Enter/Space/Esc). Выборные попапы (улучшение, Gamedex)
// и «Выпустить игру» кликом не закрываются: клик не должен принимать решение за игрока.
import { useEffect, useState } from 'react';
import { useMessageBox, closeMessageBox, type MessageBoxData } from './store';

export function MessageBox() {
  const mb = useMessageBox();
  const clickToClose = mb?.clickToClose === true;

  // клавиши как у прессы: Enter/Space/Esc — то же, что клик (не мешаем вводу текста)
  useEffect(() => {
    if (!mb || !clickToClose) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        closeMessageBox();
        mb.buttons[0]?.onClick();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mb, clickToClose]);

  if (!mb) return null;
  // PLAN-46: попап шага квеста — большая сцена с арт-баннером (разметка ниже)
  if (mb.art) return <QuestBox mb={mb} />;
  // клик по окну = нажать единственную кнопку (обычно «Ок»)
  const press = clickToClose
    ? () => {
        closeMessageBox();
        mb.buttons[0]?.onClick();
      }
    : undefined;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div
        className="w95-window focused"
        style={{ position: 'relative', width: 380, height: 'auto', zIndex: 20001, cursor: clickToClose ? 'pointer' : undefined }}
        onClick={press}
      >
        <div className="w95-titlebar"><span className="w95-title">{mb.title}</span></div>
        <div className="w95-body w95-panel" style={{ padding: 14 }}>
        {mb.body ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{mb.body}</div>
        ) : (
          <div className="w95-row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>⚠️</span>
            <div style={{ flex: 1, whiteSpace: 'pre-wrap', paddingTop: 4 }}>{mb.text}</div>
          </div>
        )}
          <div
            className="w95-row"
            style={{ justifyContent: 'center', marginTop: 14, gap: 8, flexWrap: 'wrap' }}
            onClick={(e) => e.stopPropagation()}
          >
            {mb.buttons.map((b, i) => (
              <button
                key={b.label}
                className="w95-btn"
                style={{ minWidth: 90, maxWidth: '100%', whiteSpace: 'normal', lineHeight: 1.35 }}
                data-autopilot={i === 0 ? mb.autopilotTarget : undefined}
                disabled={b.disabled}
                onClick={() => { closeMessageBox(); b.onClick(); }}
              >
                {b.label}
              </button>
            ))}
          </div>
          {clickToClose && <div className="press-hint">клик — закрыть</div>}
        </div>
      </div>
    </div>
  );
}

// PLAN-46 (v1.44.0): большой попап шага квеста/арки — арт-баннер 16:9 во всю ширину окна,
// фолбэк-плитка с эмодзи (пока картинка не сгенерирована), акцентная полоса, текст и кнопки.
// Кнопки/evKey/автопилот — как у обычного попапа: механика решения не менялась.
function QuestBox({ mb }: { mb: MessageBoxData }) {
  const art = mb.art!;
  const [imgOk, setImgOk] = useState(true);
  const [faceOk, setFaceOk] = useState(true);
  useEffect(() => setImgOk(true), [art.src]);
  useEffect(() => setFaceOk(true), [art.face?.src]);
  const accent = art.accent ?? '#4a6fa5';
  return (
    <div className="w95-quest-overlay">
      <div className="w95-window focused w95-quest">
        <div className="w95-titlebar"><span className="w95-title">{mb.title}</span></div>
        <div className="w95-quest-art">
          {imgOk ? (
            <img src={art.src} alt="" draggable={false} onError={() => setImgOk(false)} />
          ) : (
            <div
              className="w95-quest-fallback"
              style={{ background: `radial-gradient(130% 150% at 50% 12%, ${accent}59, #0d1526 72%)` }}
            >
              <span>{art.emoji ?? '📜'}</span>
            </div>
          )}
          {art.face && (
            <div className="w95-quest-face" title={art.face.title}>
              {faceOk ? (
                <img src={art.face.src} alt="" draggable={false} onError={() => setFaceOk(false)} />
              ) : (
                <span className="fem">{art.face.emoji ?? '🎭'}</span>
              )}
            </div>
          )}
        </div>
        <div className="w95-quest-stripe" style={{ background: accent }} />
        <div className="w95-quest-text">
          {mb.body ?? <div style={{ whiteSpace: 'pre-wrap' }}>{mb.text}</div>}
        </div>
        <div className="w95-quest-btns">
          {mb.buttons.map((b, i) => (
            <button
              key={b.label}
              className="w95-btn"
              style={{ minWidth: 90, maxWidth: '100%', whiteSpace: 'normal', lineHeight: 1.35 }}
              data-autopilot={i === 0 ? mb.autopilotTarget : undefined}
              disabled={b.disabled}
              onClick={() => { closeMessageBox(); b.onClick(); }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
