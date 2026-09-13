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
  unread?: number;
}

interface DmMsg {
  id: number;
  from: number;
  to: number;
  text: string;
  created: number;
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
  const [meId, setMeId] = useState(0);
  const [dm, setDm] = useState<DmMsg[] | null>(null);
  const [dmDraft, setDmDraft] = useState('');
  const dmRef = useRef<HTMLDivElement>(null);
  const dmLoadRef = useRef<() => void>(() => {}); // SER-28: мгновенное обновление после отправки
  const rosterLoadRef = useRef<() => void>(() => {}); // бейдж непрочитанного гаснет сразу после открытия
  const typeSentRef = useRef(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch('/api/roster')
        .then((r) => (r.ok ? (r.json() as Promise<{ ok?: boolean; rows?: RosterUser[]; me?: number }>) : null))
        .then((j) => {
          if (alive && j?.ok && j.rows) {
            setRoster(j.rows);
            if (typeof j.me === 'number') setMeId(j.me);
          }
        })
        .catch(() => {});
    };
    rosterLoadRef.current = load;
    load();
    const id = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  const pick = typeof view === 'number' ? (roster?.find((u) => u.userId === view) ?? null) : null;

  // SER-28: переписка с выбранным игроком (поллинг раз в 4 секунды, отметка прочтения на сервере)
  const peerId = typeof view === 'number' ? view : 0;
  useEffect(() => {
    if (!peerId) {
      setDm(null);
      return;
    }
    let alive = true;
    const load = () => {
      fetch(`/api/dm/${peerId}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ ok?: boolean; rows?: DmMsg[] }>) : null))
        .then((j) => {
          if (alive && j?.ok && j.rows) setDm(j.rows);
        })
        .catch(() => {});
    };
    dmLoadRef.current = load;
    rosterLoadRef.current(); // отметка прочтения уже ушла — обновим бейджи
    setDm(null);
    load();
    const id = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [peerId]);
  useEffect(() => {
    const el = dmRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dm?.length, peerId]);
  const sendDm = () => {
    const t = dmDraft.trim();
    if (t.length < 1 || !peerId) return;
    setDmDraft('');
    fetch(`/api/dm/${peerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: t }),
    })
      .then(() => dmLoadRef.current())
      .catch(() => {});
  };
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
            {u.unread ? <span className="chat-badge">{u.unread}</span> : null}
          </div>
        ))}
        {!roster && <div className="chat-sub" style={{ padding: '4px 8px' }}>⏳ …</div>}
      </div>
      {view !== 'team' ? (
        <div className="chat-main">
          {pick ? (
            <>
              <div className="chat-user-head">
                <div>
                  {STATUS_ICON[pick.status]} <b>{pick.login}</b> — {STATUS_TEXT[pick.status]}
                </div>
                <div className="chat-sub">
                  {pick.studio || '—'}
                  {pick.lastGame ? ` · ${pick.lastGame.name} · ${pick.lastGame.score}/100 · ${fmtCopies(pick.lastGame.units)} копий` : ' · ещё без игр'}
                </div>
              </div>
              <div ref={dmRef} className="w95-scroll dm-scroll" style={{ flex: 1 }}>
                {dm === null && <div className="w95-hint" style={{ padding: 10 }}>⏳ Загружаю переписку…</div>}
                {dm?.length === 0 && <div className="w95-hint" style={{ padding: 10 }}>Пока пусто — напиши первым.</div>}
                {(dm ?? []).map((m) => (
                  <div key={m.id} className={`dm-msg ${m.from === meId ? 'self' : ''}`}>
                    <div>
                      <span className="dm-name">{m.from === meId ? 'Вы' : pick.login}</span>
                      <span className="dm-when">
                        {new Date(m.created).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="dm-text">{m.text}</div>
                  </div>
                ))}
              </div>
              <div className="w95-chat-input">
                <input
                  className="w95-input"
                  style={{ flex: 1 }}
                  value={dmDraft}
                  maxLength={1000}
                  placeholder={`Написать ${pick.login}…`}
                  onChange={(e) => {
                    setDmDraft(e.target.value);
                    const now = Date.now();
                    if (now - typeSentRef.current > 3000) {
                      typeSentRef.current = now;
                      actionTyping();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendDm();
                  }}
                />
                <button className="w95-btn" onClick={sendDm}>
                  Отправить
                </button>
              </div>
            </>
          ) : (
            <div className="chat-sub" style={{ padding: 10 }}>Игрок не найден.</div>
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
