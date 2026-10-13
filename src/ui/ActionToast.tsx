// SRV-17 + аудит-51 03-P3-14: тост ошибок — окно-сообщение в стиле Win95 (как MessageBox).
// Помнит предыдущую ошибку («Ранее: …»), ~8 с, при наведении — пауза, клик — скрыть сразу.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useActionError, useActionErrorHistory, useActionErrorVer } from './store';

const TOAST_MS = 8000;
const RESUME_MS = 2500; // сколько держать после ухода мыши, если показ стоял на паузе

export function ActionToast() {
  const err = useActionError();
  const ver = useActionErrorVer();
  const history = useActionErrorHistory();
  const [shown, setShown] = useState<{ text: string; prev?: string } | null>(null);
  const hovered = useRef(false);
  const timer = useRef<number | null>(null);
  const clear = useCallback((): void => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  useEffect(() => {
    if (!err) {
      setShown(null);
      return;
    }
    setShown({ text: err, prev: history.filter((t) => t !== err).at(-1) });
    clear();
    // пауза при наведении: пока игрок читает, не исчезает
    if (!hovered.current) timer.current = window.setTimeout(() => setShown(null), TOAST_MS);
    return clear;
  }, [err, ver, history, clear]);
  if (!shown) return null;
  const close = (): void => {
    clear();
    setShown(null);
  };
  const onEnter = (): void => {
    hovered.current = true;
    clear();
  };
  const onLeave = (): void => {
    hovered.current = false;
    clear();
    timer.current = window.setTimeout(() => setShown(null), RESUME_MS);
  };
  return (
    <div
      className="w95-toast"
      role="alert"
      title="Закрыть"
      onClick={close}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="w95-titlebar">
        <span className="w95-toast-tbar-ico">⚠</span>
        <span className="w95-title">Ошибка</span>
        <button className="w95-btn w95-tbtn" onClick={close}>✕</button>
      </div>
      <div className="w95-toast-client">
        <div className="w95-toast-big w95-toast-big-err">⛔</div>
        <div className="w95-toast-text">
          {shown.text}
          {shown.prev && <div className="w95-hint" style={{ marginTop: 6 }}>Ранее: {shown.prev}</div>}
        </div>
      </div>
    </div>
  );
}
