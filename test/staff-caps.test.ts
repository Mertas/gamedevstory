// PLAN-41: пороги статов сотрудников (caps). Обучение масштабируется от порога и не может
// его превысить; пороги растут при левелапе и (первом) входе в профессию; стат, залитый до
// порога, при событии даёт рост этого порога ×CAP_MAX_BONUS («×10»). Отпуск и автотренировка.
// Ключевой тест — «ПОЛНЫЙ ПРОХОД»: прогон по всем 8 профессиям до Lv5 с заливом до порогов
// на каждом уровне даёт максимальный стат ≈ 10 000 (калибровка баланса).
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/core/config';
import { changeCareer, levelUpStaff, trainStaff, trainToMax } from '../src/core/systems/progression';
import { makeStaffFromData, restStaff, tickRest } from '../src/core/systems/staff';
import { newGame } from '../src/core/engine';
import { createRng } from '../src/core/rng';
import { TRAININGS } from '../src/core/data/db';
import type { CareerId } from '../src/core/data/schema';
import { capInit, effTrainDelta, trainScale } from '../src/shared/train';

const rng = () => createRng(4242);

function gameWithStaff() {
  const g = newGame(7);
  g.research = 1_000_000;
  g.money = 1_000_000;
  g.officeLevel = 3;
  return g;
}

const findTraining = (pred: (t: (typeof TRAININGS)[number]) => boolean) => {
  const t = TRAININGS.find(pred);
  if (!t) throw new Error('нет подходящей тренировки в данных');
  return t;
};

describe('PLAN-41: пороги статов (caps)', () => {
  it('стартовые пороги — свои у каждого: max(стат×2, стат+10)', () => {
    const st = makeStaffFromData('john-gameson')!;
    expect(st.caps).toEqual(capInit(st.stats));
    expect(st.caps.scenario).toBe(48); // 24 × 2
    expect(st.caps.program).toBe(13); // max(3×2, 3+10)
    expect(st.history).toEqual([]);
    expect(st.restDays).toBe(0);
  });

  it('обучение: прирост ×floor(порог/100) и обрезка о порог', () => {
    const g = gameWithStaff();
    const s = g.staff[0]!;
    s.caps = { program: 1000, scenario: 1000, graphics: 1000, sound: 1000 };
    s.stats = { program: 500, scenario: 500, graphics: 500, sound: 500 };
    s.power = 100;
    const tP = findTraining((t) => (t.program ?? 0) > 0);
    expect(trainScale(1000)).toBe(10);
    expect(trainScale(400)).toBe(4);
    expect(effTrainDelta(tP.program!, 1000)).toBe(tP.program! * 10);
    const before = s.stats.program;
    const res = trainStaff(g, s.id, tP.id, rng());
    expect(res.ok).toBe(true);
    const delta = s.stats.program - before;
    expect([tP.program! * 10, tP.program! * 30]).toContain(delta); // обычный или супер ×3
    // обрезка о порог: 999 + любой прирост → ровно 1000
    s.stats.program = 999;
    trainStaff(g, s.id, tP.id, rng());
    expect(s.stats.program).toBe(1000);
    // агрегат обучения записан
    expect(s.trainCount[String(tP.id)]!.n).toBeGreaterThanOrEqual(2);
  });

  it('левелап: залитые до порога статы растут ×10, незалитые — базово', () => {
    const g = gameWithStaff();
    const s = g.staff[0]!; // Newb, coder Lv1
    s.caps = { program: 100, scenario: 50, graphics: 50, sound: 50 };
    s.stats = { program: 100, scenario: 40, graphics: 50, sound: 50 }; // сценарий НЕ залит
    const res = levelUpStaff(g, s.id, rng());
    expect(res.ok).toBe(true);
    // coder: веса P40 Sc15 G20 So15
    expect(s.caps.program).toBe(100 + 40 * CONFIG.CAP_MAX_BONUS); // 500
    expect(s.caps.scenario).toBe(50 + 15); // не залит → базово
    expect(s.caps.graphics).toBe(50 + 20 * CONFIG.CAP_MAX_BONUS);
    expect(s.caps.sound).toBe(50 + 15 * CONFIG.CAP_MAX_BONUS);
    expect(s.history.some((h) => h.kind === 'levelup')).toBe(true);
  });

  it('смена профессии: статы тянутся к профилю (вверх/вниз), пороги растут ×10 — только при первом входе', () => {
    const g = gameWithStaff();
    const s = g.staff[0]!;
    s.caps = { program: 100, scenario: 100, graphics: 100, sound: 100 };
    s.stats = { program: 100, scenario: 100, graphics: 100, sound: 100 };
    const res = changeCareer(g, s.id, 'writer'); // fresh: shift Sc×1.15, P×0.9; веса Sc40 P15…
    expect(res.ok).toBe(true);
    expect(s.stats.scenario).toBe(115); // 100 × 1.15
    expect(s.stats.program).toBe(90); // 100 × 0.9
    expect(s.caps.scenario).toBe(100 + Math.round(40 * CONFIG.CAP_CHANGE_MULT * CONFIG.CAP_MAX_BONUS)); // +600
    expect(s.caps.program).toBe(100 + Math.round(15 * CONFIG.CAP_CHANGE_MULT * CONFIG.CAP_MAX_BONUS)); // +225
    expect(s.careers.writer).toBe(1); // новичок в профессии — с Lv1 (можно качать)
    // возврат в профессию — без бонусов (иначе «ферма» туда-обратно)
    changeCareer(g, s.id, 'coder'); // coder уже Lv1 — просто переключение
    const capsBefore = { ...s.caps };
    changeCareer(g, s.id, 'writer'); // writer уже Lv1 — знаком
    expect(s.caps).toEqual(capsBefore);
    expect(s.history.filter((h) => h.kind === 'career').length).toBe(3);
  });

  it('отпуск: 7 дней и POWER полностью; обучение в отпуске запрещено', () => {
    const g = gameWithStaff();
    const s = g.staff[0]!;
    s.power = 2;
    expect(restStaff(g, s.id).ok).toBe(true);
    expect(s.restDays).toBe(CONFIG.REST_DAYS);
    const tP = findTraining((t) => (t.program ?? 0) > 0);
    expect(trainStaff(g, s.id, tP.id, rng()).ok).toBe(false); // в отпуске
    expect(trainToMax(g, s.id, rng()).ok).toBe(false);
    for (let i = 0; i < CONFIG.REST_DAYS; i++) tickRest(g);
    expect(s.restDays).toBe(0);
    expect(s.power).toBe(s.maxPower);
    expect(s.history.some((h) => h.kind === 'back')).toBe(true);
    // повторно отправить нельзя при полном POWER
    expect(restStaff(g, s.id).ok).toBe(false);
  });

  it('автотренировка: заливает до порогов и останавливается', () => {
    const g = gameWithStaff();
    const s = g.staff[0]!;
    s.caps = { program: 200, scenario: 200, graphics: 200, sound: 200 };
    s.stats = { program: 0, scenario: 0, graphics: 0, sound: 0 };
    let calls = 0;
    while (calls < 100) {
      s.power = 500;
      if (!trainToMax(g, s.id, rng()).ok) break;
      calls += 1;
    }
    expect(s.stats.program).toBe(200);
    expect(s.stats.scenario).toBe(200);
    expect(s.stats.graphics).toBe(200);
    expect(s.stats.sound).toBe(200);
    // ещё раз — «нечего тренировать»
    s.power = 500;
    expect(trainToMax(g, s.id, rng()).ok).toBe(false);
    expect(Object.keys(s.trainCount).length).toBeGreaterThan(0);
  });

  it('ПОЛНЫЙ ПРОХОД: все 8 профессий до Lv5 с заливом до порогов → макс. стат ≈ 10 000', () => {
    const g = newGame(7);
    g.research = 1e9;
    g.money = 1e9;
    g.officeLevel = 3;
    const s = g.staff[0]!; // Newb Ownerton — стартует кодером Lv1
    const fill = () => {
      let guard = 0;
      while (guard < 500) {
        s.power = 1e6;
        if (!trainToMax(g, s.id, rng()).ok) break;
        guard += 1;
      }
    };
    const order: CareerId[] = ['coder', 'writer', 'director', 'designer', 'sound', 'producer', 'hw', 'hacker'];
    for (const c of order) {
      if (c !== s.activeCareer) {
        fill(); // залито по максимуму перед сменой → пороги ×10
        expect(changeCareer(g, s.id, c).ok).toBe(true);
      }
      while ((s.careers[c] ?? 0) < 5) {
        fill();
        expect(levelUpStaff(g, s.id, rng()).ok).toBe(true);
      }
    }
    fill();
    const maxStat = Math.max(s.stats.program, s.stats.scenario, s.stats.graphics, s.stats.sound);
    console.log('ПОЛНЫЙ ПРОХОД:', JSON.stringify(s.stats), '| caps:', JSON.stringify(s.caps), '| max:', maxStat);
    expect(maxStat).toBeGreaterThan(8500);
    expect(maxStat).toBeLessThan(12000);
    // статы всегда ≤ порогов
    for (const k of ['program', 'scenario', 'graphics', 'sound'] as const) {
      expect(s.stats[k]).toBeLessThanOrEqual(s.caps[k]);
    }
    // все профессии прокачаны до Lv5
    for (const c of order) expect(s.careers[c]).toBe(5);
  });
});
