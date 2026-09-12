// SRV-17: тост ошибок действий — теперь окно-сообщение в стиле Win95 (как MessageBox:
// шапка с ✕ и красная иконка в теле). Автоскрытие ~5 с, клик — скрыть сразу.
import { useEffect, useState } from 'react';
import { useActionError, useActionErrorVer } from './store';

const TOAST_MS = 5000;

export function ActionToast() {
  const err = useActionError();
  const ver = useActionErrorVer();
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!err) {
      setShown(null);
      return;
    }
    setShown(err);
    // ver в зависимостях: повторный тот же текст (2-й клик по той же кнопке) тоже продлевает тост
    const t = window.setTimeout(() => setShown(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [err, ver]);
  if (!shown) return null;
  const close = (): void => setShown(null);
  return (
    <div className="w95-toast" role="alert" title="Закрыть" onClick={close}>
      <div className="w95-titlebar">
        <span className="w95-toast-tbar-ico">⚠</span>
        <span className="w95-title">Ошибка</span>
        <button className="w95-btn w95-tbtn" onClick={close}>✕</button>
      </div>
      <div className="w95-toast-client">
        <div className="w95-toast-big w95-toast-big-err">⛔</div>
        <div className="w95-toast-text">{shown}</div>
      </div>
    </div>
  );
}
