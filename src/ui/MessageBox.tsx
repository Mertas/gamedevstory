// MessageBox в стиле Win95.
// v1.18.1: информационные попапы (обучение, уровни, происшествия, сводки) закрываются кликом
// по окну — в стиле карточек прессы (клик/Enter/Space/Esc). Выборные попапы (улучшение, Gamedex)
// и «Выпустить игру» кликом не закрываются: клик не должен принимать решение за игрока.
import { useEffect } from 'react';
import { useMessageBox, closeMessageBox } from './store';

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
