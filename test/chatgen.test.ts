// Промпт решения автопилота: упор направления выбирает LLM — по жанру/типу и обсуждению
// команды в чате, а не по пришпиленному примеру (иначе каждый проект «упор: доступность+полировка»).
import { describe, expect, it } from 'vitest';
import { buildDecisionPrompt } from '../src/server/chatgen';

const ctx = {
  team: 'John (proposal Lv1, id:john)',
  money: 400,
  research: 10,
  office: 1,
  genres: 'puzzle="Пазл"',
  types: 'reverse="Реверси"',
  combos: 'Пазл × Реверси = S (~390K)',
  consoles: 'pc-game="PC Game"',
  directionPoints: 12,
};

function promptText(discussion?: string): string {
  return buildDecisionPrompt(ctx, discussion).map((m) => m.content).join('\n');
}

describe('buildDecisionPrompt: упор решает чат', () => {
  it('передаёт обсуждение команды и бюджет направления из партии', () => {
    const text = promptText('John: делаем упор на нишевость и инновации\nNewb: согласен, ниша наше всё');
    expect(text).toContain('Обсуждение команды');
    expect(text).toContain('John: делаем упор на нишевость и инновации');
    expect(text).toContain('сумма не больше 12');
    expect(text).toContain('Очки направления: 12');
    expect(text).toContain('УПОР в направлении выбери сам');
  });

  it('пример ответа не пришпиливает доступность/полировку (старый источник «одних и тех же осей»)', () => {
    const text = promptText();
    expect(text).not.toContain('"approach":5');
    expect(text).not.toContain('"polish":5');
    expect(text).toContain('НЕ копируй его');
  });

  it('без обсуждения промпт остаётся валидным (решение до чата / пустой чат)', () => {
    const text = promptText();
    expect(text).not.toContain('Обсуждение команды');
    expect(text).toContain('"direction"');
  });
});
