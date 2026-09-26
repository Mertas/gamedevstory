// PLAN-18: начальное меню игрока — список сохранений (как список файлов), новая игра, смена пользователя.
import { useEffect, useState } from 'react';
import { apiDeleteSave, apiLoadSave, apiLogout, apiPurgeProgress, apiSaves, type MeInfo, type SaveInfo } from './api';
import { NewGameForm } from './NewGameForm';
import { dateLabel } from '../shared/meta';
import { useProfile } from './profile';
import { VersionStamp } from './VersionStamp';
import { fmtK } from '../shared/nums';

/** «12 июня 1987 · неделя 71 · касса 81K · сложность: сложная · изменено …» */
function saveMeta(s: SaveInfo): string {
  const when = new Date(s.updated).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const lvl = s.difficulty === 'easy' ? 'лёгкая' : s.difficulty === 'hard' ? 'сложная' : 'обычная';
  return `${dateLabel(s.week)} · неделя ${s.week} · касса ${fmtK(s.money)} · ${lvl} · изменено ${when}`;
}

export function StartScreen({ me }: { me: MeInfo }) {
  const [saves, setSaves] = useState<SaveInfo[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** «Удалить весь прогресс» — второй клик подтверждает (первый «взводит» кнопку на 5 с). */
  const [purgeArm, setPurgeArm] = useState(false);
  // PLAN-22: профиль = уровень игрока (число открытых комбо) и звание по порогам
  const pr = useProfile();
  const done = pr ? pr.count - pr.rank.from : 0;
  const span = pr?.next ? Math.max(1, pr.next.from - pr.rank.from) : 1;
  const blocks = Math.min(20, Math.max(0, Math.round((done / span) * 20)));

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

  // PLAN-18+: «Удалить весь прогресс» — все сохранения и достижения аккаунта; в два шага, без возврата.
  async function purge(): Promise<void> {
    if (busy) return;
    if (!purgeArm) {
      setPurgeArm(true);
      window.setTimeout(() => setPurgeArm(false), 5000);
      return;
    }
    setPurgeArm(false);
    setBusy(true);
    setError('');
    const r = await apiPurgeProgress();
    if (!r.ok) {
      setBusy(false);
      setError(r.error ?? 'Не удалось удалить прогресс');
      return;
    }
    location.reload(); // профиль и список перезагрузятся уже пустыми
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
              {/* PLAN-22: карточка уровня — открытые комбо, звание реального разработчика и прогресс */}
              <div className="w95-bevel-out" style={{ padding: 8, marginBottom: 10, display: 'flex', gap: 10 }}>
                <div style={{ fontSize: 32, lineHeight: '32px', width: 40, textAlign: 'center' }} title="Звание">
                  {pr?.rank.icon ?? '🥚'}
                </div>
                <div style={{ flex: 1 }}>
                  <div>
                    <b>{pr?.rank.name ?? 'Загрузка профиля…'}</b>{' '}
                    <span className="w95-hint">— твой уровень разработчика</span>
                  </div>
                  <div className="w95-hint" style={{ marginTop: 2 }}>
                    Открыто комбо: <b>{pr?.count ?? 0}</b>
                    {pr?.next
                      ? <> · до звания «{pr.next.icon} {pr.next.name}» ещё <b>{pr.next.need}</b></>
                      : pr ? <> · выше только легенды индустрии</> : null}
                  </div>
                  <div className="w95-bevel-in" style={{ height: 14, padding: 2, marginTop: 4 }}>
                    <div style={{ display: 'flex', gap: 1, height: '100%' }}>
                      {Array.from({ length: 20 }, (_, i) => (
                        <div key={i} style={{ flex: 1, background: i < blocks ? '#000080' : 'transparent' }} />
                      ))}
                    </div>
                  </div>
                  <div className="w95-hint" style={{ marginTop: 5 }}>
                    {pr?.rank.why ?? 'Сыграйте первую игру — и узнаете, на кого вы уже похожи.'}
                  </div>
                </div>
              </div>
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
                <div className="w95-row">
                  <button
                    className={`w95-btn${purgeArm ? ' active' : ''}`}
                    disabled={busy}
                    title="Убрать ВСЕ сохранения и достижения аккаунта — навсегда"
                    onClick={() => void purge()}
                  >
                    {purgeArm ? '❓ Точно? Всё исчезнет' : '🧨 Удалить весь прогресс'}
                  </button>
                  <span className="w95-grow" />
                  <button className="w95-btn" onClick={() => setCreating(true)}>🆕 Новая игра</button>
                  <button className="w95-btn" onClick={() => refresh(true)}>🔄 Обновить</button>
                  <button className="w95-btn" onClick={() => void apiLogout().then(() => location.reload())}>🚪 Сменить пользователя</button>
                </div>
                <VersionStamp />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
