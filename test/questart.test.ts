// PLAN-46: ключи арт-баннеров квестов — файлы public/quests/<key>.png (LLMPics gds-quests).
import { describe, expect, it } from 'vitest';
import { questArt } from '../src/ui/questArt';
import { STORY_ARCS } from '../src/shared/storylines';

describe('арт шагов квестов', () => {
  it('процедурный квест — файл шаблона', () => {
    const art = questArt('quest', 1, { template: 'pirates' });
    expect(art.src).toBe('quests/pirates.png');
    expect(art.emoji).toBeTruthy();
    expect(art.accent).toMatch(/^#/);
  });

  it('арка — файл ветки «<arcId>-s<step>», у каждой ветки свой файл', () => {
    expect(questArt('burnout', 3).src).toBe('quests/burnout-s3.png');
    expect(questArt('offer', 2).src).toBe('quests/offer-s2.png');
  });

  it('полное покрытие: каждый шаг каждой арки получает ключ', () => {
    for (const [arcId, arc] of Object.entries(STORY_ARCS)) {
      for (let i = 1; i <= arc.steps.length; i++) {
        expect(questArt(arcId, i).src).toBe(`quests/${arcId}-s${i}.png`);
      }
      expect(questArt(arcId, 1).emoji).toBeTruthy();
    }
  });
});
