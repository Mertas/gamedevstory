// PLAN-30: пресса о вышедшей игре — десять карточек одна за другой (журнал, критик, оценка, текст).
// Решения босса: ~4 секунды на карточку (успеть прочитать), клик — следующая, «Пропустить всё»,
// пауза на время показа, с автопилотом — короткий предохранитель. Тексты приходят из генерации
// (фолбэки уже в сейве), карточки перечитывают состояние и подхватывают готовые.
import { useEffect, useRef, useState } from 'react';
import { setSpeed, useAutopilot, useGameSelector, useSpeed } from './store';
import { CRITICS } from '../core/data/critics';
import { pressVerdict } from '../shared/rules';
import { beatsRecord, recordKey, studioRecords, type RecordEntry } from '../shared/records';

const SEEN_KEY = 'gds-press-seen';
const INTRO_MS = 3000; // вступление: за это время обычно прилетают LLM-тексты
const CARD_MS = 4000; // решение босса: ~4 с на карточку
const FINAL_MS = 10000; // с автопилотом итог закрывается сам через 10 секунд
const FINAL_LIMIT_MS = 60000; // без автопилота — минутный предохранитель, чтобы игра не стояла вечно

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

  // Источник — последняя запись архива: оценки/отзывы живут в ней, даже когда проект сменился
  const lastRec = game.history[game.history.length - 1] ?? null;
  const lastKey =
    lastRec && (lastRec.judgeScores?.length ?? 0) > 0 ? `${lastRec.name}#${lastRec.releaseWeek}` : null;
  // запись показа (по ключу) — LLM-тексты подхватываются на лету; length — для таймеров
  const rec = openKey ? game.history.find((h) => `${h.name}#${h.releaseWeek}` === openKey) ?? null : null;
  const total = rec?.judgeScores?.length ?? 0;

  // Показываем прессу последнего релиза, если её ещё не показывали. Окна «свежести» нет:
  // при быстром темпе игровые дни летят так, что окно превращалось в секунды.
  useEffect(() => {
    if (!openKey && lastKey && !seen.has(lastKey)) {
      setOpenKey(lastKey);
      setStep(-1);
    }
  }, [lastKey, openKey, seen]);


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
    if (openKey === null || total === 0 || step >= total) return;
    const t = setTimeout(() => setStep((s) => s + 1), step < 0 ? INTRO_MS : CARD_MS);
    return () => clearTimeout(t);
  }, [openKey, step]);

  // Предохранитель ТОЛЬКО на итоговой карточке: показ карточек никогда не обрываем
  useEffect(() => {
    if (!openKey || step < total) return;
    const t = setTimeout(() => finish(), autopilot ? FINAL_MS : FINAL_LIMIT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, autopilot, step, total]);

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
      else if (e.key === 'Enter' || e.key === ' ') setStep((s) => Math.min(total, s + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  if (!openKey || !rec || step > (rec.judgeScores?.length ?? 0)) return null;
  const scores = rec.judgeScores ?? [];
  const texts = rec.reviewMessages ?? [];
  const score = rec.score ?? 0;
  const next = () => setStep((s) => Math.min(total, s + 1));
  // Книга рекордов: сравниваем эту игру с остальными (себя исключаем)
  const a = rec.attrs ?? ({ fun: 0, creativity: 0, graphics: 0, sound: 0 } as NonNullable<typeof rec.attrs>);
  const recs = studioRecords(game.history, recordKey(rec));
  const topContrib = Object.entries(rec.contrib ?? {}).sort((x, y) => y[1] - x[1])[0];
  const recRows: Array<{ label: string; value: number; text: string; best: RecordEntry | null; low?: boolean }> = [
    { label: 'Программирование', value: a.fun ?? 0, text: `${Math.round(a.fun ?? 0)}`, best: recs.dirs.fun },
    { label: 'Сценарий', value: a.creativity ?? 0, text: `${Math.round(a.creativity ?? 0)}`, best: recs.dirs.creativity },
    { label: 'Графика', value: a.graphics ?? 0, text: `${Math.round(a.graphics ?? 0)}`, best: recs.dirs.graphics },
    { label: 'Звук', value: a.sound ?? 0, text: `${Math.round(a.sound ?? 0)}`, best: recs.dirs.sound },
    {
      label: 'Сумма направлений',
      value: Math.round(a.fun ?? 0) + Math.round(a.creativity ?? 0) + Math.round(a.graphics ?? 0) + Math.round(a.sound ?? 0),
      text: `${Math.round(a.fun ?? 0) + Math.round(a.creativity ?? 0) + Math.round(a.graphics ?? 0) + Math.round(a.sound ?? 0)}`,
      best: recs.sum,
    },
    ...(rec.bugsTotal != null
      ? [{ label: 'Багов за разработку', value: rec.bugsTotal, text: `${rec.bugsTotal}`, best: recs.bugs, low: true }]
      : []),
    {
      label: 'Лучший вклад',
      value: topContrib ? Math.round(topContrib[1]) : 0,
      text: topContrib ? `${topContrib[0]} ${Math.round(topContrib[1])}` : '—',
      best: recs.contrib ? { value: recs.contrib.value, game: recs.contrib.game } : null,
    },
  ];
  return (
    <div className="press-overlay" onClick={next} role="dialog" aria-label="Пресса об игре">
      {step < 0 && (
        <div className="press-card press-intro" key="intro" onClick={next}>
          <div className="press-mag">📰 Пресса о «{rec.name}»</div>
          <div className="press-wait">Критики расходятся по редакциям…</div>
        </div>
      )}
      {step >= 0 && step < total && (
        <div className="press-card" key={`card-${step}`} onClick={next}>
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
              <span className="press-badge" data-score={scores[step] ?? 0}>
                {scores[step] ?? 0}/10
              </span>
            </div>
          </div>
          <div className="press-text">{texts[step] ?? '…'}</div>
          <div className="press-hint">клик — дальше</div>
        </div>
      )}
      {step >= total && (
        <div className="press-card press-final" key="final" onClick={(e) => e.stopPropagation()}>
          <div className="press-mag">📰 Итог прессы</div>
          <div className="press-total">«{rec.name}» — {score}/100</div>
          <div className="press-verdict">{pressVerdict(score)}</div>
          <div className="press-scores">Оценки журналов: {scores.join(' · ')}</div>
          <div className="press-records">
            {recRows.map((r) => {
              const fresh = beatsRecord(r.value, r.best, r.low ? 'low' : 'high');
              return (
                <div className="press-rec-row" key={r.label}>
                  <span className="press-rec-label">{r.label}</span>
                  <span className="press-rec-value">{r.text}</span>
                  <span className={fresh ? 'press-new' : 'press-rec-best'}>
                    {fresh
                      ? '🏆 рекорд!'
                      : r.best
                        ? `· ${r.low ? 'минимум' : 'рекорд'} ${r.best.value}${r.best.game === rec.name ? '' : ` («${r.best.game}»)`}`
                        : ''}
                  </span>
                </div>
              );
            })}
          </div>
          <button className="w95-btn press-ok" onClick={finish}>
            Ок
          </button>
        </div>
      )}
    </div>
  );
}
