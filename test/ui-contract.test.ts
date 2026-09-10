// DOM-контракт «автопилот ↔ карточка сотрудника» (jsdom в проекте нет — читаем исходники):
// курсор ищет карточку по data-staff-id на корне .w95-staff-card. Пропал атрибут —
// автопилот молча перестаёт назначать роли: «Команда» пустая, шаг 7 не открывается,
// проект стартует только по 120-секундному серверному таймауту.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const staffCard = read('../src/ui/StaffCard.tsx');
const cursor = read('../src/ui/AutopilotCursor.tsx');
// UI-08: визард вынесен из CodeApp.tsx в code/Wizard.tsx
const wizard = read('../src/ui/apps/code/Wizard.tsx');

describe('DOM-контракт автопилота и карточек', () => {
  it('StaffCard рендерит data-staff-id на корне .w95-staff-card', () => {
    expect(staffCard).toContain('data-staff-id={st.id}');
    expect(staffCard).toContain('w95-staff-card');
  });

  it('курсор ищет карточку по data-staff-id и берёт только видимую', () => {
    expect(cursor).toContain('[data-staff-id=');
    expect(cursor).toContain(".closest<HTMLElement>('.w95-staff-card')");
    expect(cursor).toContain('getClientRects().length > 0');
  });

  it('окно мастера опознаётся по якорю wiz-step-6 (скоуп поиска карточек)', () => {
    expect(cursor).toContain('[data-autopilot="wiz-step-6"]');
    expect(wizard).toContain('data-autopilot={`wiz-step-${s.id}`}');
  });
});
