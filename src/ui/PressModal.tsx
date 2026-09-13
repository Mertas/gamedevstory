// PLAN-30: пресса о вышедшей игре — десять карточек одна за другой (журнал, критик, оценка, текст).
// Решения босса: ~4 секунды на карточку (успеть прочитать), клик — следующая, «Пропустить всё»,
// пауза на время показа, с автопилотом — короткий предохранитель. Тексты приходят из генерации
// (фолбэки уже в сейве), карточки перечитывают состояние и подхватывают готовые.
import { useEffect, useRef, useState } from 'react';
import { setSpeed, useAutopilot, useGameSelector, useSpeed } from './store';
import { CRITICS } from '../core/data/critics';
import { pressVerdict } from '../shared/rules';

const SEEN_KEY = 'gds-press-seen';
const INTRO_MS = 3000; // вступление: за это время обычно прилетают LLM-тексты
const CARD_MS = 4000; // решение босса: ~4 с на карточку
const AUTOPILOT_MS = 15000; // с включённым автопилотом долго театр не держим

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function PressModal() {
  const game = useGameSelector((g) => g);
  const autopilot = useAutopilot();
  const speed = useSpeed();
  const [seen, setSeen] = useState<Set<string>>(loadSeen);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [step, setStep] = useState(-1); // -1 вступление, 0..9 карточки, 10 итог
  const speedBefore = useRef(1);

  const g = game.activeGame;
  const released = g && g.phase === 'released' && g.score !== null ? g : null;
  const key = released ? `${released.name}#${released.releaseWeek}` : null;
  const fresh = released !== null && released.releaseWeek !== null && game.week - released.releaseWeek <= 3;

  // Триггер: свежий релиз, который ещё не показывали
  useEffect(() => {
    if (!openKey && key && fresh && !seen.has(key)) {
      setOpenKey(key);
      setStep(-1);
    }
  }, [key, fresh, openKey, seen]);

  // Пауза на время показа; после — вернуть прежнюю скорость
  useEffect(() => {
    if (!openKey) return;
    speedBefore.current = Math.max(1, speed);
    setSpeed(0);
    return () => setSpeed(speedBefore.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  // Автосмена: вступление и карточки; итог ждёт клика
  useEffect(() => {
    if (openKey === null || step >= CRITICS.length) return;
    const t = setTimeout(() => setStep((s) => s + 1), step < 0 ? INTRO_MS : CARD_MS);
    return () => clearTimeout(t);
  }, [openKey, step]);

  // Автопилот: общий предохранитель
  useEffect(() => {
    if (!openKey || !autopilot) return;
    const t = setTimeout(() => finish(), AUTOPILOT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, autopilot]);

  const finish = () => {
    if (openKey) {
      setSeen((prev) => {
        const next = new Set(prev).add(openKey);
        try {
          localStorage.setItem(SEEN_KEY, JSON.stringify([...next]));
        } catch {
          /* noop */
        }
        return next;
      });
    }
    setOpenKey(null);
    setStep(-1);
  };

  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'Enter' || e.key === ' ') setStep((s) => Math.min(CRITICS.length, s + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  if (!openKey || !released || step > CRITICS.length) return null;
  const next = () => setStep((s) => Math.min(CRITICS.length, s + 1));
  const total = released.judgeScores.length;
  return (
    <div className="press-overlay" onClick={next} role="dialog" aria-label="Пресса об игре">
      {step < 0 && (
        <div className="press-card press-intro" key="intro" onClick={(e) => e.stopPropagation()}>
          <div className="press-mag">📰 Пресса о «{released.name}»</div>
          <div className="press-wait">Критики расходятся по редакциям…</div>
        </div>
      )}
      {step >= 0 && step < total && (
        <div className="press-card" key={`card-${step}`} onClick={(e) => e.stopPropagation()}>
          <div className="press-mag">
            <span className="press-mag-name">{CRITICS[step]?.magazine ?? 'Пресса'}</span>
            <span className="press-step">
              {step + 1} / {total}
            </span>
          </div>
          <div className="press-row">
            <div className="press-face">🗞️</div>
            <div className="press-who">
              <b>{CRITICS[step]?.name ?? 'Критик'}</b>
              <span className="press-badge" data-score={released.judgeScores[step] ?? 0}>
                {released.judgeScores[step] ?? 0}/10
              </span>
            </div>
          </div>
          <div className="press-text">{released.reviewMessages[step] ?? '…'}</div>
          <div className="press-hint">клик — дальше</div>
        </div>
      )}
      {step >= total && (
        <div className="press-card press-final" key="final" onClick={(e) => e.stopPropagation()}>
          <div className="press-mag">📰 Итог прессы</div>
          <div className="press-total">«{released.name}» — {released.score}/100</div>
          <div className="press-verdict">{pressVerdict(released.score ?? 0)}</div>
          {(released.score ?? 0) >= 80 && <div className="press-record">🏆 {pressVerdict(released.score ?? 0).split('!')[0]}!</div>}
          <button className="w95-btn press-ok" onClick={finish}>
            Ок
          </button>
        </div>
      )}
      {step < CRITICS.length && (
        <button
          className="press-skip"
          onClick={(e) => {
            e.stopPropagation();
            setStep(CRITICS.length);
          }}
        >
          Пропустить всё ›
        </button>
      )}
    </div>
  );
}
