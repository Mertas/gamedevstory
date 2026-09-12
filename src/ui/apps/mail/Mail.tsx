// ─── Почта: письма фанатов (текст пишет LLM на сервере; заготовка — пока не доставлено) ───
import { useEffect, useRef } from 'react';
import { dateLabel } from '../../../shared/meta';
import { useWinState, useWindows } from '../../wm';
import { useGame } from '../../store';
import { score100 } from '../../../shared/rules';

export function MailApp() {
  const game = useGame();
  const wm = useWindows();
  const { wins } = useWinState();
  const mail = game.mail ?? [];
  const mailOpen = wins.some((w) => w.id === 'mail' && !w.minimized && !w.closed);
  const prevLen = useRef(0);
  // новое письмо при закрытом окне — подсветка кнопки в таскбаре (снимется при открытии)
  useEffect(() => {
    if (mail.length > prevLen.current && !mailOpen) wm.flash('mail');
    prevLen.current = mail.length;
  }, [mail.length, mailOpen, wm]);

  if (mail.length === 0) {
    return (
      <div className="w95-panel" style={{ height: '100%' }}>
        <div className="w95-hint">Писем пока нет. Выпускайте игры — фанаты пишут после релизов!</div>
      </div>
    );
  }
  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      {[...mail].reverse().map((l) => {
        const emoji = l.sentiment === 'love' ? '💌' : l.sentiment === 'hate' ? '💔' : '✉️';
        const effect = l.fansDelta === 0
          ? ''
          : l.fansDelta > 0
            ? ` · фанаты +${l.fansDelta}`
            : ` · фанаты ${l.fansDelta}`;
        return (
          <div key={l.id} className="w95-mail-letter">
            <div className="w95-mail-head">
              {emoji} <b>{l.fanName}</b> — о «{l.gameName}» ({score100(l.score)}/100)
              <span className="w95-hint"> · {dateLabel(l.week)}{effect}</span>
            </div>
            <div className="w95-mail-text">{l.text || 'Письмо ещё пишется…'}</div>
          </div>
        );
      })}
    </div>
  );
}
