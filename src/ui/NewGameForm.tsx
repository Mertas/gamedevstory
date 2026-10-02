// PLAN-18: новая игра — название студии и двое сотрудников из начального пула.
import { Fragment, useEffect, useState , useRef } from 'react';
import { apiCreateSave, apiDifficulties, apiPool, type DifficultyOption, type PoolStaff } from './api';
import { CAREER_LABELS } from '../shared/careers';
import { AV, StaffAvatar } from './StaffAvatar';
import { fmtK } from '../shared/nums';

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
  // SER-25: имя студии предлагает GigaChat (кнопка «Случайно» — тоже LLM; на провале — локальный список)
  const [nameBusy, setNameBusy] = useState(false);
  const nameTouched = useRef(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [warn, setWarn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // M6: уровень сложности — выбирается тут и сохраняется в партии
  const [levels, setLevels] = useState<DifficultyOption[]>([]);
  const [difficulty, setDifficulty] = useState('normal');

  useEffect(() => {
    void apiPool().then(setPool).catch(() => setError('Не удалось получить начальный пул сотрудников'));
    void apiDifficulties().then(setLevels).catch(() => setLevels([]));
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
      const r = await apiCreateSave(name.trim(), picked, difficulty);
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

  const rollName = async (force: boolean) => {
    if (!force && nameTouched.current) return; // игрок уже правил поле — не затираем LLM-ответом
    setNameBusy(true);
    const local = NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)] ?? 'Game Dev Studio';
    try {
      const r = await fetch('/api/studio-name');
      const j = (await r.json()) as { ok?: boolean; name?: string };
      setName((cur) => (j?.ok && j.name ? j.name : force || !nameTouched.current ? local : cur));
    } catch {
      setName((cur) => (force || !nameTouched.current ? local : cur));
    } finally {
      setNameBusy(false);
    }
  };
  useEffect(() => {
    void rollName(false); // при открытии формы имя студии приходит от GigaChat
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = (pool ?? []).filter((s) => picked.includes(s.id));
  const ready = name.trim().length > 0 && picked.length === 2 && !busy;
  const payroll = chosen.reduce((sum, s) => sum + s.salary, 0);

  return (
    <div className="w95-form">
      <div className="w95-form-row">
        <label>Название студии</label>
        <input
          className="w95-input"
          maxLength={40}
          value={name}
          onChange={(e) => {
            nameTouched.current = true;
            setName(e.target.value);
          }}
        />
        <button
          className="w95-btn"
          style={{ flex: 'none' }}
          title="Сгенерировать название студии (GigaChat)"
          disabled={nameBusy}
          onClick={() => {
            nameTouched.current = false;
            void rollName(true);
          }}
        >
          {nameBusy ? '🎲 …' : '🎲 Случайно'}
        </button>
      </div>

      <div className="w95-form-row">
        <label>Сложность</label>
        <div className="w95-row" style={{ gap: 4, flexWrap: 'wrap', flex: 1 }} data-autopilot="newgame-difficulty">
          {levels.map((l) => (
            <button
              key={l.id}
              className={`w95-btn${difficulty === l.id ? ' active' : ''}`}
              onClick={() => setDifficulty(l.id)}
              data-autopilot={`newgame-difficulty-${l.id}`}
            >
              {difficulty === l.id ? '● ' : '○ '}{l.label}
            </button>
          ))}
        </div>
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
              <span className="w95-pick-box w95-pick-check">{on ? '✓' : ''}</span>
              <div className="w95-pick-ava">
                <StaffAvatar staff={s} variant={AV.newGame} fallback={<span style={{ fontSize: 56 }}>{ROLE_EMOJI[s.activeCareer] ?? '👤'}</span>} />
              </div>
              <div className="w95-pick-name">{s.name}</div>
              <div className="w95-staff-sub" style={{ textAlign: 'center' }}>{CAREER_LABELS[s.activeCareer] ?? s.activeCareer}</div>
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
              <div className="w95-staff-sub" style={{ marginTop: 4, textAlign: 'center' }}>{s.salary}K/год</div>
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
              {' '}· зарплата {fmtK(payroll)} в год
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
