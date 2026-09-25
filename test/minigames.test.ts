// PLAN-39/40: мини-игры во врезке (эффекты, мешок ротации, триггер на 50%) и открываемые
// функции (сводка аккаунта, пороги скоростей, видимость приложений).
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CONFIG } from '../src/core/config';
import { newGame, resolveMinigameAction, skipMinigame, startProjectAction } from '../src/core/engine';
import { devTick } from '../src/core/systems/dev';
import { createRng } from '../src/core/rng';
import { autopilotProjectInput } from '../src/core/sim/policy';
import {
  accountTotalsFromGames, drawMinigame, minigameOutcome, minigameTitle,
} from '../src/shared/minigames';
import { isAppVisible, speedOptions } from '../src/shared/unlocks';
import { UserService } from '../src/server/users';
import type { GameState } from '../src/core/types';

// сужение свойства pendingEvent не сбрасывается вызовом функций — читаем через helper
function pendingType(g: GameState): string | null {
  return g.pendingEvent?.type ?? null;
}

describe('PLAN-39: эффекты мини-игры', () => {
  it('пороги: ≥70 → +3 PR, 40–69 → 0, <40 → −2 PR', () => {
    expect(minigameOutcome(100).pr).toBe(3);
    expect(minigameOutcome(70).pr).toBe(3);
    expect(minigameOutcome(69).pr).toBe(0);
    expect(minigameOutcome(40).pr).toBe(0);
    expect(minigameOutcome(39).pr).toBe(-2);
    expect(minigameOutcome(0).pr).toBe(-2);
  });

  it('резолв применяет PR и закрывает событие; пол — 0', () => {
    const g = newGame(7);
    g.research = 10;
    g.pendingEvent = { type: 'minigame', gameId: 'g001' };
    expect(resolveMinigameAction(g, 86).ok).toBe(true);
    expect(g.research).toBe(13);
    expect(g.pendingEvent).toBeNull();
    expect(g.log.some((l) => l.text.includes(minigameTitle('g001')))).toBe(true);

    g.research = 1;
    g.pendingEvent = { type: 'minigame', gameId: 'g104' };
    resolveMinigameAction(g, 10);
    expect(g.research).toBe(0); // штраф не уводит в минус
  });

  it('без висящего события — отказ', () => {
    const g = newGame(7);
    expect(resolveMinigameAction(g, 50).ok).toBe(false);
  });

  it('автопилот закрывает нейтрально — PR не меняется', () => {
    const g = newGame(7);
    g.research = 5;
    g.pendingEvent = { type: 'minigame', gameId: 'g101' };
    skipMinigame(g, 'автопилот');
    expect(g.pendingEvent).toBeNull();
    expect(g.research).toBe(5);
    expect(g.log.some((l) => l.text.includes('пропущена'))).toBe(true);
  });
});

describe('PLAN-39: мешок ротации без повторов', () => {
  it('круг — все четыре по разу; на стыке кругов подряд не повторяется', () => {
    let bag = { q: [] as string[], last: null as string | null };
    const seen: string[] = [];
    const rand = () => 0.42;
    for (let i = 0; i < 8; i++) {
      const d = drawMinigame(bag, rand);
      bag = d.bag;
      seen.push(d.id);
    }
    expect(new Set(seen.slice(0, 4)).size).toBe(4);
    expect(new Set(seen.slice(4, 8)).size).toBe(4);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
  });
});

describe('PLAN-39: триггер на 50% разработки', () => {
  it('событие появляется один раз и не раньше половины', () => {
    const g = newGame(3);
    const input = autopilotProjectInput(g);
    expect(input).not.toBeNull();
    expect(startProjectAction(g, input!).ok).toBe(true);
    const ag = g.activeGame!;
    // первый день — фаза «предложение», потом разработка
    devTick(g, createRng(10));
    expect(ag.phase).toBe('dev');
    ag.boostOffered = true; // милстоун 25% в этом сценарии уже позади — не мешает
    const half = Math.ceil(CONFIG.DEV_DAYS * CONFIG.MODE[ag.mode].time * 0.5);

    // чуть раньше половины — мини-игры ещё нет
    g.week = ag.weekStarted + half - 2;
    devTick(g, createRng(11));
    expect(g.activeGame!.mg50 ?? false).toBe(false);
    expect(pendingType(g)).not.toBe('minigame');

    // на половине — появилось (день свободен: прочие события закрываем заранее)
    g.pendingEvent = null;
    g.week = ag.weekStarted + half + 1;
    devTick(g, createRng(12));
    expect(pendingType(g)).toBe('minigame');
    expect(g.activeGame!.mg50).toBe(true);

    // второй день — повтора нет
    resolveMinigameAction(g, 55);
    devTick(g, createRng(13));
    expect(pendingType(g)).not.toBe('minigame');
  });
});

describe('PLAN-40: сводка аккаунта, скорости, видимость приложений', () => {
  it('релизы суммируются по сейвам; победа — любой 100/100', () => {
    const t1 = accountTotalsFromGames([
      { history: [{ score: 88 }, { score: 100 }], released: [] },
      { history: [{ score: 40 }], released: [{ score: null }] },
    ]);
    expect(t1.releases).toBe(3);
    expect(t1.victory).toBe(true);
    expect(accountTotalsFromGames([{ history: [{ score: 99 }] }]).victory).toBe(false);
  });

  it('скорости: ×2 после 100-го релиза, ×4/×8 — после 500-го; база пауза/½/1×', () => {
    expect(speedOptions(0)).toEqual([0, 0.5, 1]);
    expect(speedOptions(99)).toEqual([0, 0.5, 1]);
    expect(speedOptions(100)).toEqual([0, 0.5, 1, 2]);
    expect(speedOptions(499)).toEqual([0, 0.5, 1, 2]);
    expect(speedOptions(500)).toEqual([0, 0.5, 1, 2, 4, 8]);
  });

  it('Архив/Журналы/Почта — после 1-го релиза; Контракты — по офису; Маркетинг — сразу', () => {
    const ctx = { saveReleases: 0, accountReleases: 0, victory: false, officeLevel: 1, contractOffices: [1, 2, 3] };
    expect(isAppVisible('archive', ctx)).toBe(false);
    expect(isAppVisible('magazines', ctx)).toBe(false);
    expect(isAppVisible('mail', ctx)).toBe(false);
    expect(isAppVisible('marketing', ctx)).toBe(true);
    expect(isAppVisible('contracts', ctx)).toBe(true); // первый заказ доступен уже с офиса 1
    expect(isAppVisible('archive', { ...ctx, saveReleases: 1 })).toBe(true);
    expect(isAppVisible('contracts', { ...ctx, officeLevel: 0, contractOffices: [2] })).toBe(false);
  });
});

describe('PLAN-39: мешок мини-игр в БД аккаунта', () => {
  it('nextMinigameId: не повторяется до конца круга и на стыке', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gds-mg-'));
    try {
      const u = new UserService(path.join(dir, 'users.db'));
      u.register('Tester', '12345678');
      const tok = u.login('Tester', '12345678');
      const uid = u.userByToken(tok.ok ? tok.token : '')!.id;
      const ids: string[] = [];
      for (let i = 0; i < 9; i++) ids.push(u.nextMinigameId(uid));
      expect(new Set(ids.slice(0, 4)).size).toBe(4);
      expect(new Set(ids.slice(4, 8)).size).toBe(4);
      for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
      u.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
