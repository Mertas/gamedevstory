// SRV-17: тост ошибок действий. Раньше ошибку видел только визард (CodeApp) — ошибки найма,
// событий, сейвов и потерянных при обрыве действий молчали. Автоскрытие ~5 с, клик — скрыть сразу.
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
  return (
    <div className="w95-toast" role="alert" title="Закрыть" onClick={() => setShown(null)}>
      <div className="w95-toast-bar">⚠ Ошибка</div>
      <div className="w95-toast-body">{shown}</div>
    </div>
  );
}
