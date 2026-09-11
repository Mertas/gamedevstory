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

  it('UI-07: закрытие окна сохраняет состояние (closed-флаг вместо размонтирования)', () => {
    const wmSrc = read('../src/ui/wm.tsx');
    const win95 = read('../src/ui/Window95.tsx');
    const deskSrc = read('../src/ui/Desktop.tsx');
    expect(wmSrc).toContain('closed: true');                  // close() помечает окно, а не удаляет
    expect(win95).toContain('win.minimized || win.closed');   // скрытие через display:none — компонент жив
    expect(deskSrc).toContain('if (w.closed) return null');   // таскбар не рисует закрытые окна
  });

  it('видимость автопилота: якоря действий политики и «витринное» нажатие (plan/14)', () => {
    const hire = read('../src/ui/apps/hire/HireApp.tsx');
    const team = read('../src/ui/apps/staff/TeamTab.tsx');
    const training = read('../src/ui/apps/hire/TrainingTab.tsx');
    const search = read('../src/ui/apps/hire/SearchTab.tsx');
    const office = read('../src/ui/apps/staff/OfficeMove.tsx');
    const salesman = read('../src/ui/apps/market/Salesman.tsx');
    const marketing = read('../src/ui/apps/market/Marketing.tsx');
    const hardware = read('../src/ui/apps/market/Hardware.tsx');
    const dev = read('../src/ui/apps/code/Dev.tsx');
    const storeSrc = read('../src/ui/store.ts');
    expect(hire).toContain('data-autopilot={`hire-tab-${id}`}');
    expect(team).toContain('data-autopilot={`lvl-${st.id}`}');
    expect(team).toContain('data-autopilot={`fire-${st.id}`}'); // AP-09: увольнение видно мыши
    expect(training).toContain('data-autopilot={`train-${t.id}`}');
    expect(search).toContain('data-autopilot={`hire-${c.id}`}');
    expect(office).toContain('data-autopilot="office-move"');
    expect(salesman).toContain('data-autopilot={`booster-${b.id}`}');
    expect(marketing).toContain('data-autopilot={`ad-${a.id}`}');
    expect(hardware).toContain('data-autopilot={`lic-${c.id}`}');
    expect(dev).toContain('data-autopilot="booster-staff"');
    expect(dev).toContain('data-autopilot={`booster-use-${t}`}');
    // курсор: «витринное» нажатие без повторного клика, выбор в select, скоуп по вкладкам окна
    expect(cursor).toContain('cosmetic = false');
    expect(cursor).toContain('selectValue');
    expect(cursor).toContain('[data-autopilot^=');
    // кнопки попапов прыгают вперёд очереди (иначе таймаут 2.6с закроет попап раньше мыши)
    expect(storeSrc).toContain("startsWith('mb-')");
  });
});
