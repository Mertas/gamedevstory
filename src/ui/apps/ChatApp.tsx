// Приложение «Чат»: лента корпоративного чата + ввод сообщений игроку.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useChat, useGameSelector, actionChatMessage, actionTyping } from '../store';
import { fmtCopies } from '../../shared/sales-stats';
import { typingName } from '../../shared/chat';

/**
 * PLAN-28: аватар автора в чате. Сообщения несут только имя и «случайную» иконку из сейва
 * (`m.avatar`, она зашита при старте партии) — персональную (avatars/<staffId>.png) находим
 * по имени в текущей команде: она свежее и совпадает с карточками найма. Цепочка:
 * персональная → иконка из сообщения → эмодзи.
 */
function ChatAvatar({ name, legacy, size = 48 }: { name: string; legacy?: string; size?: number }) {
  const id = useGameSelector((g) => g.staff.find((s) => s.name === name)?.id ?? '');
  const [stage, setStage] = useState(0); // 0 — персональная, 1 — из сообщения, 2 — эмодзи
  const src = stage === 0 && id ? `avatars/${id}.png` : stage <= 1 && legacy ? legacy : '';
  if (!src) {
    return (
      <div className="w95-avatar" style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size > 24 ? 16 : 12 }}>
        {name === 'Вы' ? '🕹️' : '💬'}
      </div>
    );
  }
  return (
    <img
      className="w95-avatar"
      style={{ width: size, height: size, verticalAlign: 'middle' }}
      src={src}
      alt=""
      onError={() => setStage((s) => (s === 0 && legacy ? 1 : 2))}
    />
  );
}

interface RosterUser {
  userId: number;
  login: string;
  studio: string;
  updated: number;
  status: 'online' | 'away' | 'offline' | 'typing';
  lastGame: { name: string; score: number; units: number } | null;
}

const STATUS_ICON: Record<RosterUser['status'], string> = { online: '🟢', away: '🟡', offline: '⚪', typing: '✏️' };
const STATUS_TEXT: Record<RosterUser['status'], string> = { online: 'онлайн', away: 'отошёл', offline: 'офлайн', typing: 'печатает' };

export function ChatApp() {
  const chat = useChat();
  const listRef = useRef<HTMLDivElement>(null);
  // UI-01: подписки точечные — ререндер только при смене «печатает…»/аватара
  const typing = useGameSelector((g) => typingName(g, chat));
  const typingAvatar = useGameSelector((g) => (typing ? g.staff.find((s) => s.name === typing)?.avatar ?? '' : ''));
  const [draft, setDraft] = useState('');
  // SER-27: панель «Разговоры» — команда + все зарегистрированные игроки со статусами
  const [roster, setRoster] = useState<RosterUser[] | null>(null);
  const [view, setView] = useState<'team' | number>('team');
  const typeSentRef = useRef(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch('/api/roster')
        .then((r) => (r.ok ? (r.json() as Promise<{ ok?: boolean; rows?: RosterUser[] }>) : null))
        .then((j) => {
          if (alive && j?.ok && j.rows) setRoster(j.rows);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  const pick = typeof view === 'number' ? (roster?.find((u) => u.userId === view) ?? null) : null;
  // SER-24: в ленте — последние 100 сообщений; если есть более старые, вверху ленты (внутри
  // прокрутки) появляется кнопка подгрузки ещё сотни.
  const [limit, setLimit] = useState(100);
  const keepRef = useRef<number | null>(null); // позиция просмотра при подгрузке старых
  const from = Math.max(0, chat.msgs.length - limit);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.msgs.length, typing]);

  // подгрузка старых не должна «прыгать»: сдвигаем вид на высоту добавленного сверху
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || keepRef.current === null) return;
    el.scrollTop += el.scrollHeight - keepRef.current;
    keepRef.current = null;
  });

  const moreOlder = () => {
    const el = listRef.current;
    if (el) keepRef.current = el.scrollHeight;
    setLimit((v) => v + 100);
  };

  const send = () => {
    const t = draft.trim();
    if (t.length < 2) return;
    actionChatMessage(t);
    setDraft('');
  };

  return (
    <div className="w95-chat">
      <div className="chat-side">
        <div className={`chat-item ${view === 'team' ? 'active' : ''}`} onClick={() => setView('team')}>
          <span className="chat-dot">🎮</span>
          <div className="chat-item-body">
            <div className="chat-item-name">Команда студии</div>
            <div className="chat-sub">текущий разговор</div>
          </div>
        </div>
        <div className="chat-side-cap">Игроки</div>
        {(roster ?? []).map((u) => (
          <div key={u.userId} className={`chat-item ${view === u.userId ? 'active' : ''}`} onClick={() => setView(u.userId)}>
            <span className="chat-dot" title={STATUS_TEXT[u.status]}>
              {STATUS_ICON[u.status]}
            </span>
            <div className="chat-item-body">
              <div className="chat-item-name">{u.login}</div>
              <div className="chat-sub">{u.lastGame ? `${u.lastGame.name} · ${u.lastGame.score}/100` : u.studio || 'ещё без игр'}</div>
            </div>
          </div>
        ))}
        {!roster && <div className="chat-sub" style={{ padding: '4px 8px' }}>⏳ …</div>}
      </div>
      {view !== 'team' ? (
        <div className="chat-main chat-user-card">
          {pick ? (
            <>
              <div className="chat-card-name">
                {STATUS_ICON[pick.status]} {pick.login} — {STATUS_TEXT[pick.status]}
              </div>
              <div>Студия: <b>{pick.studio || '—'}</b></div>
              {pick.lastGame ? (
                <>
                  <div>Последняя игра: <b>{pick.lastGame.name}</b></div>
                  <div>Оценка прессы: <b>{pick.lastGame.score}/100</b></div>
                  <div>Продано: <b>{fmtCopies(pick.lastGame.units)} копий</b></div>
                </>
              ) : (
                <div>Игр пока нет.</div>
              )}
              <div className="chat-sub" style={{ marginTop: 8 }}>
                Личная переписка появится позже — пока можно только заглянуть.
              </div>
            </>
          ) : (
            <div className="chat-sub">Игрок не найден.</div>
          )}
        </div>
      ) : (
        <div className="chat-main">
          <div ref={listRef} className="w95-scroll" style={{ flex: 1 }}>
        {from > 0 && (
          <div className="w95-chat-more">
            <button className="w95-btn" onClick={moreOlder}>
              ⬆ Показать более старые
            </button>
          </div>
        )}
        {chat.msgs.slice(from).map((m, i) => (
          <div key={from + i} className={`w95-chat-msg ${m.system ? 'system' : ''} ${m.author === 'Вы' ? 'self' : ''}`}>
            <ChatAvatar name={m.author} legacy={m.avatar} />
            <div style={{ flex: 1 }}>
              <div className="w95-cname">{m.author}</div>
              <div className="w95-ctext">{m.text}</div>
            </div>
          </div>
        ))}
        {typing && (
          <div className="w95-chat-typing">
            <span style={{ marginRight: 6, display: 'inline-flex' }}>
              <ChatAvatar name={typing} legacy={typingAvatar} size={20} />
            </span>
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
          onChange={(e) => {
            setDraft(e.target.value);
            const now = Date.now();
            if (now - typeSentRef.current > 3000) {
              typeSentRef.current = now;
              actionTyping();
            }
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
        />
            <button className="w95-btn" onClick={send}>Отправить</button>
          </div>
        </div>
      )}
    </div>
  );
}
