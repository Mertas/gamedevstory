// PLAN-18: новая игра — название студии и двое сотрудников из начального пула.
import { Fragment, useEffect, useState } from 'react';
import { apiCreateSave, apiPool, type PoolStaff } from './api';
import { CAREER_LABELS } from '../shared/careers';

const ROLE_EMOJI: Record<string, string> = {
  coder: '💻', writer: '✍️', designer: '🎨', sound: '🔊',
  director: '🎬', producer: '💼', hw: '🔧', hacker: '🕶️',
};

// порядок статов одинаков во всех карточках — цифры сравниваются глазами
const STATS: Array<[keyof PoolStaff['stats'], string]> = [
  ['program', 'Код'], ['scenario', 'Сюжет'], ['graphics', 'Графика'], ['sound', 'Звук'],
];

/** Полоски статов: 40 — практический максимум одиночного стата у кандидата. */
const STAT_MAX = 40;

function bestStat(s: PoolStaff): keyof PoolStaff['stats'] {
  return STATS.reduce((a, b) => (s.stats[b[0]] > s.stats[a[0]] ? b : a))[0];
}

/** Варианты для кнопки «Придумать название» — чтобы не начинать все партии одинаково. */
const NAME_IDEAS = ['Пиксель-Плюс', 'Байт и К°', 'Софт-Сарай', 'Хитрая Лиса', 'Полный Ноль', 'Тёплый Ламповый', 'Game Dev Studio'];

export function NewGameForm({ onClose }: { onClose?: () => void }) {
  const [pool, setPool] = useState<PoolStaff[] | null>(null);
  const [name, setName] = useState('Game Dev Studio');
  const [picked, setPicked] = useState<string[]>([]);
  const [warn, setWarn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void apiPool().then(setPool).catch(() => setError('Не удалось получить начальный пул сотрудников'));
  }, []);

  const toggle = (id: string): void => {
    // функциональный апдейтер: два быстрых клика не теряют первый выбор (был устаревший стейт)
    setPicked((p) => {
      if (p.includes(id)) {
        setWarn('');
        return p.filter((x) => x !== id);
      }
      if (p.length >= 2) {
        setWarn('В команде уже двое — снимите галочку с кого-нибудь.');
        return p;
      }
      setWarn('');
      return [...p, id];
    });
  };

  async function start(): Promise<void> {
    if (busy || picked.length !== 2) return;
    setBusy(true);
    setError('');
    try {
      const r = await apiCreateSave(name.trim(), picked);
      if (!r.ok) {
        setError(r.error ?? 'Не удалось создать партию');
        return;
      }
      location.hash = '#play';
      location.reload();
    } catch {
      setError('Сервер недоступен — запустите: pnpm server');
    } finally {
      setBusy(false);
    }
  }

  const chosen = (pool ?? []).filter((s) => picked.includes(s.id));
  const ready = name.trim().length > 0 && picked.length === 2 && !busy;
  const payroll = chosen.reduce((sum, s) => sum + s.salary, 0);

  return (
    <div className="w95-form">
      <div className="w95-form-row">
        <label>Название студии</label>
        <input className="w95-input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="w95-btn" style={{ flex: 'none' }}
          title="Подставить случайное название"
          onClick={() => setName(NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)] ?? 'Game Dev Studio')}>
          🎲 Случайно
        </button>
      </div>

      <div className="w95-caption">
        <span>Стартовая команда</span>
        <span className="w95-hint">отметьте двоих кликом (полоска — от 0 до {STAT_MAX})</span>
        <div style={{ flex: 1 }} />
        <span className={picked.length === 2 ? 'w95-pick-count' : 'w95-hint'}>выбрано {picked.length}/2</span>
      </div>

      {!pool && !error && <div className="w95-note">⏳ Загружаю сотрудников…</div>}
      <div className="w95-pick-row">
        {(pool ?? []).map((s) => {
          const on = picked.includes(s.id);
          const best = bestStat(s);
          return (
            <div
              key={s.id}
              tabIndex={0}
              className={`w95-staff-card w95-pick-card${on ? ' selected' : ''}`}
              onClick={() => toggle(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle(s.id);
                }
              }}
            >
              <div className="w95-staff-avatar">{ROLE_EMOJI[s.activeCareer] ?? '👤'}</div>
              <div className="w95-pick-head">
                <span className="w95-pick-box">{on ? '✓' : ''}</span>
                <span className="w95-staff-name" style={{ flex: 1 }}>{s.name}</span>
              </div>
              <div className="w95-staff-sub">{CAREER_LABELS[s.activeCareer] ?? s.activeCareer}</div>
              <div className="w95-pick-stats">
                {STATS.map(([k, label]) => (
                  <Fragment key={k}>
                    <span>{label}</span>
                    <span className="w95-pick-bar">
                      <div style={{ width: `${Math.min(100, Math.round((s.stats[k] / STAT_MAX) * 100))}%` }} />
                    </span>
                    <span className={`num${k === best ? ' hi' : ''}`}>{s.stats[k]}</span>
                  </Fragment>
                ))}
              </div>
              <div className="w95-staff-sub" style={{ marginTop: 4 }}>{s.salary}K/год</div>
            </div>
          );
        })}
      </div>

      {/* характер сотрудника не показываем: пусть будет загадкой (и в API его нет) */}
      <div className="w95-note">
        {warn && <span className="w95-pick-warn">⚠️ {warn}</span>}
      </div>

      <div className="w95-pick-foot">
        {chosen.length === 0 && <span className="w95-hint">Отметьте двоих — с них начнётся студия.</span>}
        {chosen.length === 1 && <span className="w95-hint">Осталось отметить одного.</span>}
        {chosen.length === 2 && (
          <span>
            Состав: {chosen.map((s, i) => (
              <Fragment key={s.id}>{i > 0 ? ' + ' : ''}<b>{s.name}</b></Fragment>
            ))}
            <span className="w95-pick-strong">
              · сильные стороны: {chosen.map((s) => STATS.find(([k]) => k === bestStat(s))?.[1]).join(', ')}
              {' '}· зарплата {payroll}K в год
            </span>
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button className="w95-btn" disabled={!ready} onClick={() => void start()}
          title={picked.length !== 2 ? 'Сначала отметьте двоих сотрудников' : 'Начать партию'}>
          {busy ? '…' : `▶ Начать игру (${picked.length}/2)`}
        </button>
        {onClose && <button className="w95-btn" onClick={onClose}>Отмена</button>}
      </div>
      {error && <div style={{ color: '#a00' }}>⚠️ {error}</div>}
    </div>
  );
}
