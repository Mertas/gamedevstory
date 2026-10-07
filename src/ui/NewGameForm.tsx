// PLAN-18 + PLAN-48: новая игра — мастер из 5 шагов (студия → герой ×3 → партнёр).
// v1.45.1: экраны разбиты, чтобы всё не висело на одной странице; навигация свободная.
import { Fragment, useEffect, useState, useRef } from 'react';
import { apiCreateSave, apiDifficulties, apiPool, type DifficultyOption, type PoolStaff } from './api';
import { CAREER_LABELS } from '../shared/careers';
import {
  HERO_CAREERS, HERO_CHARACTERS, HERO_POINTS, HERO_SALARY, HERO_STAT_CAP, avatarGender, heroNameIdeasFor,
  PLAYER_AVATARS, sanitizeHeroStats,
} from '../shared/hero';
import { STAT_KEYS, type StatKey } from '../shared/train';
import { AV, StaffAvatar } from './StaffAvatar';
import { fmtK } from '../shared/nums';
import type { CareerId } from '../core/data/schema';

const ROLE_EMOJI: Record<string, string> = {
  coder: '💻', writer: '✍️', designer: '🎨', sound: '🔊',
  director: '🎬', producer: '💼', hw: '🔧', hacker: '🕶️',
};

// порядок статов одинаков во всех карточках — цифры сравниваются глазами
const STATS: Array<[StatKey, string]> = [
  ['program', 'Код'], ['scenario', 'Сюжет'], ['graphics', 'Графика'], ['sound', 'Звук'],
];

/** Полоски статов: 40 — практический максимум одиночного стата у кандидата. */
const STAT_MAX = 40;

/** PLAN-48 (v1.45.1): шаги мастера новой игры. */
const STEPS = ['Студия', 'Герой', 'Навыки', 'Характер', 'Партнёр'] as const;

function bestStat(s: PoolStaff): StatKey {
  return STATS.reduce((a, b) => (s.stats[b[0]] > s.stats[a[0]] ? b : a))[0];
}

/** Варианты для кнопки «Придумать название» — чтобы не начинать все партии одинаково. */
const NAME_IDEAS = [
  'Пиксель-Плюс', 'Байт и К°', 'Софт-Сарай', 'Хитрая Лиса', 'Полный Ноль', 'Тёплый Ламповый',
  'Кофе и Код', 'Ща Пофиксим', 'Баг как Фича', 'Синий Экран', 'Три Полигона', 'Ночная Сборка',
  'Пыльный Картридж', 'Стопка Дискет', 'Финальный Босс', 'Сейв перед Боссом', 'Кот и Компилятор',
  'Вечный Ранний Доступ', 'Ноль Багов', 'Ретро-Чердак', 'Хитрый Хитбокс', 'Полтора Программиста',
  'Сонный Геймдиз', 'Глючный Гений', 'Красная Кнопка', 'Левел-Ап', 'Нуб и Про', 'Ржавый Робот',
  'Геймплей в Тапках', 'Тайный Левел', 'Двойной Прыжок', 'Game Dev Studio',
];

/** PLAN-48: имя героя по кнопке 🎲 — локальный список (без LLM). */
const randomHeroName = (g: 'M' | 'F'): string => {
  const list = heroNameIdeasFor(g);
  return list[Math.floor(Math.random() * list.length)] ?? 'Артём Пикселев';
};

export function NewGameForm({ onClose }: { onClose?: () => void }) {
  const [step, setStep] = useState(0);
  const [pool, setPool] = useState<PoolStaff[] | null>(null);
  const [name, setName] = useState('Game Dev Studio');
  // SER-25: имя студии предлагает GigaChat (кнопка «Случайно» — тоже LLM; на провале — локальный список)
  const [nameBusy, setNameBusy] = useState(false);
  const nameTouched = useRef(false);
  // SER-25: уже показанные названия — уходят в запрос skip-ом, чтобы GigaChat не повторялся
  const rolledNames = useRef<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // M6: уровень сложности — выбирается тут и сохраняется в партии
  const [levels, setLevels] = useState<DifficultyOption[]>([]);
  const [difficulty, setDifficulty] = useState('normal');

  // ── PLAN-48: главный герой (игрок) ──
  const [heroName, setHeroName] = useState(() => randomHeroName(avatarGender(PLAYER_AVATARS[0]!)));
  const [heroAvatar, setHeroAvatar] = useState(PLAYER_AVATARS[0]!); // по умолчанию всегда выбрана первая
  const [heroStats, setHeroStats] = useState<Record<StatKey, number>>({ program: 10, scenario: 10, graphics: 10, sound: 10 });
  const [heroCareer, setHeroCareer] = useState<CareerId>(HERO_CAREERS[0]!);
  const [charIdx, setCharIdx] = useState(0);
  const [charCustom, setCharCustom] = useState(HERO_CHARACTERS[0]?.persona ?? ''); // v1.54.8: пример вписан сразу
  // ── PLAN-48: партнёр и доля ──
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [share, setShare] = useState(10);

  useEffect(() => {
    void apiPool().then(setPool).catch(() => setError('Не удалось получить начальный пул сотрудников'));
    void apiDifficulties().then(setLevels).catch(() => setLevels([]));
  }, []);

  async function start(): Promise<void> {
    if (busy || !ready || !partner) return;
    setBusy(true);
    setError('');
    try {
      const r = await apiCreateSave({
        studioName: name.trim(),
        difficulty,
        hero: { name: heroNameTrim, avatarId: heroAvatar, stats: sanitizeHeroStats(heroStats), career: heroCareer, persona },
        partnerId: partner.id,
        partnerPct: share,
      });
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
    const used = rolledNames.current;
    const fresh = NAME_IDEAS.filter((n) => !used.includes(n));
    const pool = fresh.length > 0 ? fresh : NAME_IDEAS;
    const local = pool[Math.floor(Math.random() * pool.length)] ?? 'Game Dev Studio';
    try {
      const skip = used.slice(-60);
      const qs = skip.length > 0 ? `?skip=${encodeURIComponent(skip.join('|'))}` : '';
      const r = await fetch(`/api/studio-name${qs}`);
      const j = (await r.json()) as { ok?: boolean; name?: string };
      const next = j?.ok && j.name ? j.name : local;
      used.push(next);
      setName((cur) => (force || !nameTouched.current ? next : cur));
    } catch {
      used.push(local);
      setName((cur) => (force || !nameTouched.current ? local : cur));
    } finally {
      setNameBusy(false);
    }
  };
  useEffect(() => {
    void rollName(false); // при открытии формы имя студии приходит от GigaChat
  }, []);

  // ── PLAN-48: производные значения героя и партнёра ──
  const statSum = STAT_KEYS.reduce((a, k) => a + heroStats[k], 0);
  const left = HERO_POINTS - statSum;
  const bump = (k: StatKey, d: number): void =>
    setHeroStats((s) => {
      const sum = STAT_KEYS.reduce((a, x) => a + s[x], 0);
      if (d > 0 && (s[k] >= HERO_STAT_CAP || sum >= HERO_POINTS)) return s;
      if (d < 0 && s[k] <= 0) return s;
      return { ...s, [k]: s[k] + d };
    });
  const customChar = charCustom.trim();
  const char = HERO_CHARACTERS[charIdx]!;
  const persona = customChar.length > 0 ? customChar : char.persona;

  const partner = (pool ?? []).find((p) => p.id === partnerId) ?? null;

  const heroNameTrim = heroName.trim();
  const nameTaken = (pool ?? []).some((p) => p.name === heroNameTrim) || heroNameTrim === 'Система';
  const nameOk = heroNameTrim.length > 0 && !nameTaken;
  const statsOk = statSum === HERO_POINTS;
  const ready = name.trim().length > 0 && nameOk && statsOk && !!partner && !busy;

  const pick = (id: string): void => setPartnerId((p) => (p === id ? null : id));

  const footerHint =
    step === 0
      ? (name.trim().length > 0 ? <>Перегенерировать название: кнопка <b>🎲 Случайно</b>.</> : 'Впишите название студии.')
      : step === 1
        ? (nameOk ? 'Имя свободно. Аватарки — из набора игрока.' : nameTaken ? 'Имя занято сотрудником — придумайте другое.' : 'Впишите имя героя.')
        : step === 2
          ? (statsOk ? `Все ${HERO_POINTS} очков распределены ✓.` : `Осталось очков: ${left} из ${HERO_POINTS} (кап — ${HERO_STAT_CAP} на навык).`)
          : step === 3
            ? <>Характер: <b>{customChar && customChar !== char.persona ? 'свой вариант' : char.label}</b>.</>
            : !nameOk
              ? 'Впишите имя героя (без совпадений с командой).'
              : !statsOk
                ? `Распределите ровно ${HERO_POINTS} очков навыков (сейчас ${statSum}).`
                : partner
                  ? <>Состав: <b>{heroNameTrim}</b> ({CAREER_LABELS[heroCareer]}) + <b>{partner.name}</b> · доля {share}% · зарплата {fmtK(HERO_SALARY + partner.salary)} в год</>
                  : 'Выберите партнёра из пула.';

  return (
    <div className="w95-form">
      {step === 0 && (
        <>
          <div className="w95-caption">
            <span>Шаг {step + 1} из {STEPS.length} — студия</span>
            <span className="w95-hint">название и сложность партии</span>
          </div>
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
        </>
      )}

      {step === 1 && (
        <>
          <div className="w95-caption">
            <span>Шаг {step + 1} из {STEPS.length} — герой: имя и аватарка</span>
            <span className="w95-hint">это вы: вечный сотрудник, уволить себя нельзя</span>
          </div>
          <div className="w95-hero">
            <div className="w95-form-row" style={{ marginBottom: 10 }}>
              <label>Имя</label>
              <input
                className="w95-input"
                maxLength={24}
                placeholder="Как вас зовут?"
                value={heroName}
                onChange={(e) => setHeroName(e.target.value)}
              />
              <button className="w95-btn" style={{ flex: 'none' }} title="Случайное имя" onClick={() => setHeroName(randomHeroName(avatarGender(heroAvatar)))}>🎲</button>
            </div>
            <div className="w95-form-row">
              <div style={{ flex: 1 }}>
                <div className="w95-hero-ava">
                  <div className="w95-hero-grid">
                    {PLAYER_AVATARS.map((av) => (
                      <button
                        key={av}
                        className={`w95-hero-ic${heroAvatar === av ? ' picked' : ''}`}
                        title={av}
                        onClick={() => setHeroAvatar(av)}
                      >
                        <StaffAvatar staff={{ id: av, avatarId: av }} variant="256_d8" fallback={<span style={{ fontSize: 15 }}>👤</span>} />
                      </button>
                    ))}
                  </div>
                  <div className="w95-hero-big">
                    <StaffAvatar
                      staff={{ id: heroAvatar, avatarId: heroAvatar }}
                      variant={AV.newGameBig}
                      fallback={<span style={{ fontSize: 64 }}>👤</span>}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="w95-caption">
            <span>Шаг {step + 1} из {STEPS.length} — герой: навыки и профессия</span>
            <span className="w95-hint">{HERO_POINTS} очков, кап {HERO_STAT_CAP} на навык</span>
          </div>
          <div className="w95-hero">
            <div className="w95-form-row">
              <div style={{ flex: 1 }}>
                <div className="w95-hero-stats">
                  {STATS.map(([k, label]) => (
                    <div key={k} className="w95-stat-row">
                      <span className="w95-stat-label">{label}</span>
                      <button className="w95-btn w95-stat-btn" disabled={heroStats[k] <= 0} onClick={() => bump(k, -1)}>−</button>
                      <span className="w95-stat-val">{heroStats[k]}</span>
                      <button className="w95-btn w95-stat-btn" disabled={heroStats[k] >= HERO_STAT_CAP || left <= 0} onClick={() => bump(k, 1)}>+</button>
                      <div className="w95-stat-bar"><div style={{ width: `${Math.round((heroStats[k] / HERO_STAT_CAP) * 100)}%` }} /></div>
                    </div>
                  ))}
                </div>
                <div className={left === 0 ? 'w95-pick-count' : 'w95-hint'} style={{ marginTop: 8 }}>
                  {left === 0 ? 'Все 40 очков распределены ✓' : `Осталось очков: ${left} из ${HERO_POINTS} (кап на навык — ${HERO_STAT_CAP})`}
                </div>
              </div>
            </div>
            <div className="w95-form-row" style={{ marginTop: 12 }}>
              <label>Профессия</label>
              <div className="w95-row" style={{ gap: 4, flexWrap: 'wrap', flex: 1 }}>
                {HERO_CAREERS.map((c) => (
                  <button key={c} className={`w95-btn${heroCareer === c ? ' active' : ''}`} onClick={() => setHeroCareer(c)}>
                    {heroCareer === c ? '● ' : '○ '}{ROLE_EMOJI[c] ?? ''} {CAREER_LABELS[c] ?? c} Lv1
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div className="w95-caption">
            <span>Шаг {step + 1} из {STEPS.length} — герой: характер</span>
            <span className="w95-hint">10 на выбор или свой текст</span>
          </div>
          <div className="w95-hero">
            <div className="w95-form-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div className="w95-row" style={{ gap: 6, alignItems: 'baseline', marginBottom: 6 }}>
                  <b style={{ flex: 'none' }}>{char.label}</b>
                  <button
                    className="w95-btn"
                    style={{ flex: 'none' }}
                    title="Следующий характер"
                    onClick={() => { const n = (charIdx + 1) % HERO_CHARACTERS.length; setCharIdx(n); setCharCustom(HERO_CHARACTERS[n]?.persona ?? ''); }}
                  >
                    Следующий ▸
                  </button>
                </div>
                {/* v1.54.8: пример сразу в textarea — можно тут же править (ред. владельца) */}
                <textarea
                  className="w95-input"
                  style={{ width: '100%', minHeight: 84, resize: 'vertical' }}
                  rows={3}
                  maxLength={200}
                  placeholder="…или впишите свой характер"
                  value={charCustom}
                  onChange={(e) => setCharCustom(e.target.value)}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {step === 4 && (
        <>
          <div className="w95-caption">
            <span>Шаг {step + 1} из {STEPS.length} — партнёр</span>
            <span className="w95-hint">с кем открываете компанию: клик — выбор, слайдер — доля (0–20%)</span>
          </div>

          {/* мини-итог героя — чтобы на последнем шаге видеть, кого приводишь в компанию */}
          <div className="w95-row" style={{ gap: 8, alignItems: 'center', margin: '2px 0 4px' }}>
            <StaffAvatar staff={{ id: heroAvatar, avatarId: heroAvatar }} variant={AV.newGame} size={36} fallback={<span style={{ fontSize: 20 }}>👤</span>} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div><b>{heroNameTrim || 'Герой'}</b> · {CAREER_LABELS[heroCareer] ?? heroCareer} Lv1</div>
              <div className="w95-hint">
                Код {heroStats.program} · Сюжет {heroStats.scenario} · Графика {heroStats.graphics} · Звук {heroStats.sound}
                {' · '}характер: {customChar && customChar !== char.persona ? 'свой вариант' : char.label}
              </div>
            </div>
          </div>

          {!pool && !error && <div className="w95-note">⏳ Загружаю сотрудников…</div>}
          <div className="w95-pick-row">
            {(pool ?? []).map((s) => {
              const on = partnerId === s.id;
              const best = bestStat(s);
              return (
                <div
                  key={s.id}
                  tabIndex={0}
                  className={`w95-staff-card w95-pick-card${on ? ' selected' : ''}`}
                  onClick={() => pick(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      pick(s.id);
                    }
                  }}
                >
                  <span className="w95-pick-box w95-pick-check">{on ? '✓' : ''}</span>
                  <div className="w95-pick-ava">
                    <StaffAvatar staff={s} variant={AV.newGame} fallback={<span style={{ fontSize: 56 }}>{ROLE_EMOJI[s.activeCareer] ?? '👤'}</span>} />
                  </div>
                  <div className="w95-pick-name">{s.name}</div>
                  <div className="w95-staff-sub" style={{ textAlign: 'center' }}>{CAREER_LABELS[s.activeCareer] ?? s.activeCareer} · {s.salary}K/год</div>
                  <div className="w95-pick-stats">
                    {STATS.map(([k, label]) => (
                      <Fragment key={k}>
                        <span>{label}</span>
                        <span className="w95-pick-bar">
                          <div style={{ width: `${Math.min(100, Math.round(((s.stats[k] + (on ? share : 0)) / STAT_MAX) * 100))}%` }} />
                        </span>
                        <span className={`num${k === best ? ' hi' : ''}`}>
                          {s.stats[k]}{on && share > 0 ? <span style={{ color: '#1a7a1a' }}> +{share}</span> : null}
                        </span>
                      </Fragment>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="w95-partner-share">
            <div className="w95-form-row">
              <label>Доля партнёра</label>
              <input
                type="range"
                min={0}
                max={20}
                step={1}
                className="w95-range"
                value={share}
                disabled={!partner}
                onChange={(e) => setShare(Number(e.target.value))}
              />
              <b style={{ flex: 'none', width: 36, textAlign: 'right' }}>{share}%</b>
            </div>
            {partner ? (
              <div className="w95-hint" style={{ marginBottom: 4 }}>
                Бонус партнёра: +{share} ко всем навыкам
                (Код {partner.stats.program + share} · Сюжет {partner.stats.scenario + share} · Графика {partner.stats.graphics + share} · Звук {partner.stats.sound + share}).
              </div>
            ) : (
              <div className="w95-hint" style={{ marginBottom: 4 }}>Выберите партнёра — покажу бонус к навыкам.</div>
            )}
          </div>
        </>
      )}

      <div className="w95-note">
        {nameTaken && <span className="w95-pick-warn">⚠️ Имя героя совпадает с именем сотрудника — придумайте другое.</span>}
      </div>

      <div className="w95-pick-foot">
        <span className="w95-hint" style={{ flex: 1, minWidth: 170 }}>{footerHint}</span>
        <button className="w95-btn" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>← Назад</button>
        {step < STEPS.length - 1 ? (
          <button className="w95-btn" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>Далее →</button>
        ) : (
          <button
            className="w95-btn"
            disabled={!ready}
            onClick={() => void start()}
            title={ready ? 'Начать партию' : 'Заполните шаги мастера — подсказка слева'}
          >
            {busy ? '…' : '▶ Начать игру'}
          </button>
        )}
        {onClose && <button className="w95-btn" onClick={onClose}>Отмена</button>}
      </div>
      {error && <div style={{ color: '#a00' }}>⚠️ {error}</div>}
    </div>
  );
}
