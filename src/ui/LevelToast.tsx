// PLAN-22: тост нового уровня — окно-сообщение в стиле Win95 (шапка с иконкой и ✕,
// серый клиент с крупной иконкой звания). Висит дольше обычного: тут имя и цитата о заслуге.
import { useEffect, useState } from 'react';
import { useLevelNotice } from './store';
import type { LevelNotice } from '../shared/rank';

const TOAST_MS = 9000;

export function LevelToast() {
  const notice = useLevelNotice();
  const [shown, setShown] = useState<LevelNotice | null>(null);
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
  const close = (): void => setShown(null);
  return (
    <div className="w95-toast" role="status" title="Закрыть" onClick={close}>
      <div className="w95-titlebar">
        <span className="w95-toast-tbar-ico">🎖️</span>
        <span className="w95-title">{shown.title}</span>
        <button className="w95-btn w95-tbtn" onClick={close}>✕</button>
      </div>
      <div className="w95-toast-client">
        <div className="w95-toast-big">{shown.icon}</div>
        <div>
          <div className="w95-toast-head">{shown.name}</div>
          <div className="w95-toast-text">{shown.text}</div>
        </div>
      </div>
    </div>
  );
}
