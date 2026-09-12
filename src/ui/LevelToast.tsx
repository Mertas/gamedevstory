// PLAN-22: тост нового уровня. Свой канал (не ошибки): показывается на каждом новом комбо,
// а при переходе через порог несёт и звание — реального разработчика с его заслугой.
import { useEffect, useState } from 'react';
import { useLevelNotice } from './store';

const TOAST_MS = 9000; // дольше обычного: тут две строки, в том числе цитата о звании

export function LevelToast() {
  const notice = useLevelNotice();
  const [shown, setShown] = useState<{ title: string; text: string } | null>(null);
  useEffect(() => {
    if (!notice) {
      setShown(null);
      return;
    }
    setShown(notice);
    const t = window.setTimeout(() => setShown(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [notice]);
  if (!shown) return null;
  return (
    <div className="w95-toast w95-toast-level" role="status" title="Закрыть" onClick={() => setShown(null)}>
      <div className="w95-toast-bar">{shown.title}</div>
      <div className="w95-toast-body">{shown.text}</div>
    </div>
  );
}
