// Приложение «Чат»: лента корпоративного чата разработчиков.
import { useEffect, useRef } from 'react';
import { useChat, useGame } from '../store';
import { typingName } from '../../shared/chat';

export function ChatApp() {
  const game = useGame();
  const chat = useChat();
  const listRef = useRef<HTMLDivElement>(null);
  const typing = typingName(game, chat);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.msgs.length, typing]);

  return (
    <div className="w95-chat">
      <div ref={listRef} className="w95-scroll" style={{ flex: 1 }}>
        {chat.msgs.map((m, i) => (
          <div key={i} className={`w95-chat-msg ${m.system ? 'system' : ''}`}>
            {m.avatar ? (
              <img className="w95-avatar" src={m.avatar} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="w95-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💬</div>
            )}
            <div style={{ flex: 1 }}>
              <div className="w95-cname">{m.author}</div>
              <div className="w95-ctext">{m.text}</div>
            </div>
          </div>
        ))}
        {typing && (
          <div className="w95-chat-typing">
            <img className="w95-avatar" style={{ width: 20, height: 20, verticalAlign: 'middle', marginRight: 6 }} src={game.staff.find((s) => s.name === typing)?.avatar ?? ''} alt="" />
            {typing} печатает…
          </div>
        )}
        {chat.msgs.length === 0 && !typing && (
          <div className="w95-hint" style={{ padding: 12 }}>
            Чат пуст. Запустите новый проект в окне «Код» — команда начнёт обсуждать разработку.
          </div>
        )}
      </div>
    </div>
  );
}
