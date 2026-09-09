// Приложение «Чат»: лента корпоративного чата + ввод сообщений игроку.
import { useEffect, useRef, useState } from 'react';
import { useChat, useGameSelector, actionChatMessage } from '../store';
import { typingName } from '../../shared/chat';

export function ChatApp() {
  const chat = useChat();
  const listRef = useRef<HTMLDivElement>(null);
  // UI-01: подписки точечные — ререндер только при смене «печатает…»/аватара
  const typing = useGameSelector((g) => typingName(g, chat));
  const typingAvatar = useGameSelector((g) => (typing ? g.staff.find((s) => s.name === typing)?.avatar ?? '' : ''));
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.msgs.length, typing]);

  const send = () => {
    const t = draft.trim();
    if (t.length < 2) return;
    actionChatMessage(t);
    setDraft('');
  };

  return (
    <div className="w95-chat">
      <div ref={listRef} className="w95-scroll" style={{ flex: 1 }}>
        {chat.msgs.map((m, i) => (
          <div key={i} className={`w95-chat-msg ${m.system ? 'system' : ''} ${m.author === 'Вы' ? 'self' : ''}`}>
            {m.avatar ? (
              <img className="w95-avatar" src={m.avatar} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="w95-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{m.author === 'Вы' ? '🕹️' : '💬'}</div>
            )}
            <div style={{ flex: 1 }}>
              <div className="w95-cname">{m.author}</div>
              <div className="w95-ctext">{m.text}</div>
            </div>
          </div>
        ))}
        {typing && (
          <div className="w95-chat-typing">
            <img className="w95-avatar" style={{ width: 20, height: 20, verticalAlign: 'middle', marginRight: 6 }} src={typingAvatar} alt="" />
            {typing} печатает…
          </div>
        )}
        {chat.msgs.length === 0 && !typing && (
          <div className="w95-hint" style={{ padding: 12 }}>
            Чат пуст. Запустите новый проект в окне «Код» — команда начнёт обсуждать разработку.
          </div>
        )}
      </div>
      <div className="w95-chat-input">
        <input
          className="w95-input"
          style={{ flex: 1 }}
          value={draft}
          maxLength={400}
          placeholder="Написать команде…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
        />
        <button className="w95-btn" onClick={send}>Отправить</button>
      </div>
    </div>
  );
}
