// PLAN-18: начальное меню игрока — список сохранений (как список файлов), новая игра, смена пользователя.
import { useEffect, useState } from 'react';
import { apiDeleteSave, apiLoadSave, apiLogout, apiSaves, type MeInfo, type SaveInfo } from './api';
import { NewGameForm } from './NewGameForm';
import { dateLabel } from '../shared/meta';

/** «12 июня 1987 · неделя 71 · изменено 11 сент., 22:01» */
function saveMeta(s: SaveInfo): string {
  const when = new Date(s.updated).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `${dateLabel(s.week)} · неделя ${s.week} · касса ${Math.round(s.money)}K · изменено ${when}`;
}

export function StartScreen({ me }: { me: MeInfo }) {
  const [saves, setSaves] = useState<SaveInfo[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = (keepSel = false): void => {
    void apiSaves()
      .then((list) => {
        setSaves(list);
        setError('');
        setSel((cur) => (keepSel && cur !== null && list.some((s) => s.id === cur) ? cur : (list[0]?.id ?? null)));
      })
      .catch(() => setError('Не удалось получить список сохранений — сервер недоступен?'));
  };
  // ВАЖНО: именно вызов — `useEffect(() => refresh, [])` возвращал функцию и список не грузился
  useEffect(() => { refresh(); }, []);

  async function open(id: number): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await apiLoadSave(id);
      if (!r.ok) setError(r.error ?? 'Не удалось загрузить сохранение');
      else {
        location.hash = '#play';
        location.reload();
      }
    } catch {
      setError('Сервер недоступен — запустите: pnpm server');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number, studioName: string): Promise<void> {
    if (!confirm(`Удалить сохранение «${studioName}»? Это навсегда.`)) return;
    setBusy(true);
    const r = await apiDeleteSave(id);
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'Не удалось удалить сохранение');
    else refresh();
  }

  const selected = (saves ?? []).find((s) => s.id === sel) ?? null;

  return (
    <div className="w95-desktop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="w95-window focused" style={{ position: 'relative', width: creating ? 700 : 620, zIndex: 10 }}>
        <div className="w95-title">🖥️ Студия игрока {me.login}</div>
        <div className="w95-body" style={{ padding: 12 }}>
          {creating ? (
            <NewGameForm onClose={() => { setCreating(false); refresh(); }} />
          ) : (
            <div className="w95-form">
              <div className="w95-caption">
                <span>Мои сохранения</span>
                <span className="w95-hint">партии в базе, у каждого игрока свои</span>
              </div>

              <div className="w95-saves">
                {saves === null && !error && <div className="w95-saves-empty">⏳ Загружаю список…</div>}
                {saves?.length === 0 && <div className="w95-saves-empty">Сохранений нет — начните новую игру.</div>}
                {(saves ?? []).map((s) => (
                  <div
                    key={s.id}
                    className={`w95-saves-row${sel === s.id ? ' sel' : ''}`}
                    onClick={() => setSel(s.id)}
                    onDoubleClick={() => void open(s.id)}
                  >
                    <span className="ico">🏢</span>
                    <span style={{ flex: 1 }}>
                      <b>{s.studioName}</b>
                      {s.active && ' ▶'}
                      <div className="w95-hint">{saveMeta(s)}</div>
                    </span>
                  </div>
                ))}
              </div>

              {error && <div style={{ color: '#a00' }}>⚠️ {error}</div>}

              <div className="w95-pick-foot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <div className="w95-row">
                  <button className="w95-btn" disabled={!selected || busy} onClick={() => selected && void open(selected.id)}>
                    {selected?.active ? '▶ Продолжить' : '📂 Загрузить'}
                  </button>
                  <button className="w95-btn" disabled={!selected || busy}
                    onClick={() => selected && void remove(selected.id, selected.studioName)}>
                    🗑 Удалить
                  </button>
                  <span className="w95-grow" />
                  <span className="w95-hint">двойной клик — открыть</span>
                </div>
                <div className="w95-row" style={{ justifyContent: 'flex-end' }}>
                  <button className="w95-btn" onClick={() => setCreating(true)}>🆕 Новая игра</button>
                  <button className="w95-btn" onClick={() => refresh(true)}>🔄 Обновить</button>
                  <button className="w95-btn" onClick={() => void apiLogout().then(() => location.reload())}>🚪 Сменить пользователя</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
