// PLAN-22: тост нового уровня — окно-сообщение в стиле Win95 (шапка с иконкой и ✕,
// серый клиент с крупной иконкой звания). Висит дольше обычного: тут имя и цитата о заслуге.
// v1.43: тот же тост показывает системные заметки (приход продавца) — SysNotice из store.
import { useEffect, useRef, useState } from 'react';
import { useLevelNotice, useSysNotice } from './store';
import type { LevelNotice } from '../shared/rank';

const TOAST_MS = 9000;

interface ToastView { title: string; icon: string; head?: string; text: string }

export function LevelToast() {
  const notice = useLevelNotice();
  const sys = useSysNotice();
  const [shown, setShown] = useState<ToastView | null>(null);
  const lastNotice = useRef<LevelNotice | null>(null);
  const lastSys = useRef<unknown>(null);
  useEffect(() => {
    // показываем самый свежий источник; если оба сразу — заметка перекрывает уровень
    let view: ToastView | null = null;
    if (notice && notice !== lastNotice.current) {
      lastNotice.current = notice;
      view = { title: notice.title, icon: notice.icon, head: notice.name, text: notice.text };
    }
    if (sys && sys !== lastSys.current) {
      lastSys.current = sys;
      view = { title: sys.title, icon: sys.icon, head: sys.head, text: sys.text };
    }
    if (!view) return;
    setShown(view);
    const t = window.setTimeout(() => setShown(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [notice, sys]);
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
          <div className="w95-toast-head">{shown.head}</div>
          <div className="w95-toast-text">{shown.text}</div>
        </div>
      </div>
    </div>
  );
}
