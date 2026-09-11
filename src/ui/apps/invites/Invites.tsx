// PLAN-19: окно «Инвайты» — владелец студии выдаёт одноразовые коды для регистрации.
// Видят окно только владельцы; сервер сам отвечает 403 остальным (это лишь интерфейс).
import { useEffect, useState } from 'react';
import { apiCreateInvites, apiInvites, apiRevokeInvite, type InviteInfo } from '../../api';

/** «11 сент., 22:40» */
function when(ms: number): string {
  return new Date(ms).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function InvitesApp() {
  const [list, setList] = useState<InviteInfo[] | null>(null);
  const [fresh, setFresh] = useState<InviteInfo[]>([]);
  const [note, setNote] = useState('');
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const refresh = (): void => {
    void apiInvites()
      .then((l) => { setList(l); setError(''); })
      .catch(() => setError('Не удалось получить список — сервер недоступен?'));
  };
  useEffect(() => { refresh(); }, []);

  async function create(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await apiCreateInvites(note.trim(), count);
      if (!r.ok) setError(r.error ?? 'Не удалось создать код');
      else {
        setFresh(r.invites);
        setNote('');
        refresh();
      }
    } catch {
      setError('Сервер недоступен — запустите: pnpm server');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(code: string): Promise<void> {
    if (!confirm(`Отозвать код ${code}?`)) return;
    const r = await apiRevokeInvite(code);
    if (!r.ok) setError(r.error ?? 'Не удалось отозвать');
    else refresh();
  }

  function copy(code: string): void {
    void navigator.clipboard?.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied((c) => (c === code ? '' : c)), 1500);
  }

  const free = (list ?? []).filter((i) => !i.usedBy).length;

  return (
    <div className="w95-panel" style={{ overflowY: 'auto', height: '100%' }}>
      <b>Инвайты</b>
      <div className="w95-hint">
        Регистрация без кода закрыта. Код одноразовый — сгорает, когда друг зарегистрируется.
      </div>

      <div className="w95-caption"><span>Новый код</span></div>
      <div className="w95-form-row">
        <label>Кому</label>
        <input className="w95-input" value={note} placeholder="Витя" maxLength={40}
          onChange={(e) => setNote(e.target.value)} />
        <select className="w95-input" style={{ flex: 'none', width: 64 }} value={count}
          onChange={(e) => setCount(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="w95-btn" disabled={busy} onClick={() => void create()}>
          {busy ? '…' : '🎟️ Создать'}
        </button>
      </div>

      {fresh.length > 0 && (
        <div className="w95-panel" style={{ background: '#ffffcc', border: '1px solid var(--w95-dark)' }}>
          <b>Свежие коды — отправь другу:</b>
          {fresh.map((i) => (
            <div key={i.code} className="w95-row">
              <b style={{ letterSpacing: 1 }}>{i.code}</b>
              <button className="w95-btn" onClick={() => copy(i.code)}>
                {copied === i.code ? '✅ скопировано' : '📋 Копировать'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="w95-caption">
        <span>Выданные коды</span>
        <span className="w95-hint">свободных: {free} · всего: {(list ?? []).length}</span>
      </div>
      {list === null && !error && <div className="w95-hint">⏳ Загружаю…</div>}
      {list?.length === 0 && <div className="w95-hint">Кодов ещё нет — создайте первый.</div>}
      {(list ?? []).length > 0 && (
        <table className="w95-table">
          <tbody>
            {list!.map((i) => (
              <tr key={i.code} style={{ opacity: i.usedBy ? 0.65 : 1 }}>
                <td><b>{i.code}</b></td>
                <td>{i.note ?? '—'}</td>
                <td>
                  {i.usedBy
                    ? <span className="w95-hint">использован: {i.usedBy}{i.usedAt ? `, ${when(i.usedAt)}` : ''}</span>
                    : <span style={{ color: '#060' }}>свободен</span>}
                </td>
                <td>
                  {!i.usedBy && (
                    <button className="w95-btn" onClick={() => void revoke(i.code)}>Отозвать</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && <div style={{ color: '#a00' }}>⚠️ {error}</div>}
      <div className="w95-hint">
        Код выдаётся только отсюда: сервер проверяет права владельца, обычным игрокам окна не видно.
      </div>
    </div>
  );
}
