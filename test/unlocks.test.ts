// P1-9 аудита-51: матчинг тренингов (канонический id ↔ записи-имена старых сейвов)
// и санити-порядок: trainings.id (1..15) ↔ TRAINING_IDS (schema).
import { describe, expect, it } from 'vitest';
import { hasTraining, isUnlocked } from '../src/shared/rules';
import { TRAININGS } from '../src/core/data/db';
import { TRAINING_IDS } from '../src/core/data/schema';
import type { GameState } from '../src/core/types';

describe('матчинг тренингов (P1-9 аудита-51)', () => {
  it('канонический id матчится напрямую', () => {
    expect(hasTraining(['stroll'], 'stroll')).toBe(true);
    expect(hasTraining(['stroll'], 'reading')).toBe(false);
  });

  it('записи-имена старых сейвов («散歩 walk») матчатся по английской части', () => {
    expect(hasTraining(['散歩 walk'], 'stroll')).toBe(true);
    expect(hasTraining(['読書 reading'], 'reading')).toBe(true);
    expect(hasTraining(['映画鑑賞 movies'], 'movie')).toBe(true);
    expect(hasTraining(['アニメ鑑賞 anime'], 'anime')).toBe(true);
    expect(hasTraining(['ゲームで遊ぶ games'], 'game')).toBe(true);
    expect(hasTraining(['ジョギング jogging'], 'jogging')).toBe(true);
    expect(hasTraining(['パチンコ pachinko'], 'pinball')).toBe(true);
    expect(hasTraining(['瞑想 meditation'], 'meditate')).toBe(true);
    expect(hasTraining(['音楽ライブ live music'], 'concert')).toBe(true);
    expect(hasTraining(['ネットサーフィン surfing'], 'netsurf')).toBe(true);
    expect(hasTraining(['科学博物館 museum'], 'museum')).toBe(true);
    expect(hasTraining(['大学で勉強 university'], 'college')).toBe(true);
    expect(hasTraining(['研究所 lab'], 'lab')).toBe(true);
    expect(hasTraining(['国内旅行 domestic trip'], 'shorttrip')).toBe(true);
    expect(hasTraining(['海外旅行 overseas trip'], 'longtrip')).toBe(true);
  });

  it('все 15 тренингов БД матчатся со своим каноническим id (порядок id ↔ TrainingId)', () => {
    expect(TRAININGS.length).toBe(TRAINING_IDS.length);
    for (const t of TRAININGS) {
      const canon = TRAINING_IDS[t.id - 1];
      expect(canon, `тренинг ${t.id}`).toBeTruthy();
      expect(hasTraining([t.name], canon!), `имя БД «${t.name}» → ${canon}`).toBe(true);
    }
  });

  it('null/пустой тренинг открыт всегда; пустой список — закрыто', () => {
    expect(hasTraining([], null)).toBe(true);
    expect(hasTraining(undefined, null)).toBe(true);
    expect(hasTraining([], 'stroll')).toBe(false);
  });

  it('isUnlocked: тренинг по канону и по старой записи; чужая — закрыто', () => {
    const g = {
      staff: [{ careers: { writer: 2 } }],
      unlockedTrainings: ['読書 reading'],
      openedCombos: [],
    } as unknown as GameState;
    expect(isUnlocked(g, 'writer', 2, 'reading')).toBe(true);
    expect(isUnlocked(g, 'writer', 2, 'stroll')).toBe(false);
    expect(isUnlocked(g, 'writer', 2, null)).toBe(true);
    (g.unlockedTrainings as string[]).push('stroll');
    expect(isUnlocked(g, 'writer', 2, 'stroll')).toBe(true);
  });
});
