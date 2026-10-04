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

  it('мини-карточка кандидата: клик в найме показывает профессии (28.09)', () => {
    const search = read('../src/ui/apps/hire/SearchTab.tsx');
    const mini = read('../src/ui/StaffMiniCard.tsx');
    expect(search).toContain('data-autopilot={`hire-row-${c.id}`}'); // строка кандидата кликабельна
    expect(search).toContain('StaffMiniCard');
    expect(mini).toContain('data-autopilot="hire-minicard"');
    expect(mini).toContain('CAREER_ORDER'); // профессии — обязательная часть карточки
    expect(mini).toContain('w95-career-chip');
  });

  it('справка: содержание + статья, разделы из двух частей (28.09, v1.36.0)', () => {
    const help = read('../src/ui/apps/help/Help.tsx');
    const a = read('../src/ui/apps/help/sections-a.tsx');
    const b = read('../src/ui/apps/help/sections-b.tsx');
    expect(help).toContain('data-autopilot="help-nav"');
    expect(help).toContain('data-autopilot={`help-section-${open.id}`}');
    expect(help).toContain('SECTIONS_A');
    expect(help).toContain('SECTIONS_B');
    expect(a).toContain("id: 'careers'");
    expect(b).toContain("id: 'awards'");
    expect(a + b).toContain('Тренировать до максимума');
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
    // PLAN-25: методы найма кликабельны и с якорем — от метода зависит список кандидатов
    expect(search).toContain('data-autopilot={`hire-method-${m}`}');
    // M7: поиск — отдельная платная кнопка (список кандидатов без него не появится)
    expect(search).toContain('data-autopilot="hire-search"');
    expect(office).toContain('data-autopilot="office-move"');
    expect(salesman).toContain('data-autopilot={`booster-${b.id}`}');
    expect(marketing).toContain('data-autopilot={`ad-${a.id}`}');
    expect(hardware).toContain('data-autopilot={`lic-${c.id}`}');
    // M8: форма своей консоли — с якорями (смета/срок живут в shared/consoles)
    const ownConsole = read('../src/ui/apps/market/OwnConsole.tsx');
    expect(ownConsole).toContain('data-autopilot="own-console-start"');
    expect(ownConsole).toContain('data-autopilot="own-console-cpu"');
    expect(ownConsole).toContain('data-autopilot="own-console-media"');
    expect(dev).toContain('data-autopilot="booster-staff"');
    expect(dev).toContain('data-autopilot={`booster-use-${t}`}');
    // курсор: «витринное» нажатие без повторного клика, выбор в select, скоуп по вкладкам окна
    expect(cursor).toContain('cosmetic = false');
    expect(cursor).toContain('selectValue');
    expect(cursor).toContain('[data-autopilot^=');
    // кнопки попапов прыгают вперёд очереди (иначе таймаут 2.6с закроет попап раньше мыши)
    expect(storeSrc).toContain("startsWith('mb-')");
  });

  it('PLAN-46: попап шага квеста — арт-баннер, фолбэк и автопилот-кнопки', () => {
    const box = read('../src/ui/MessageBox.tsx');
    const art = read('../src/ui/questArt.ts');
    const app = read('../src/ui/App.tsx');
    expect(box).toContain('w95-quest-art');      // баннер 16:9 во всю ширину окна
    expect(box).toContain('w95-quest-fallback'); // пока картинки нет — плитка с эмодзи
    expect(box).toContain('data-autopilot={i === 0 ? mb.autopilotTarget : undefined}');
    expect(art).toContain('quests/');            // файлы public/quests/<key>.png
    expect(art).toContain('burnout:');           // тема арки — в карте
    expect(art).toContain('${arcId}-s${step}');  // ключ арки: arcId-s<step> (ветки эпилогов)
    expect(app).toContain('art: questArt(ev.arcId, ev.step, arcState?.gen)');
  });

  it('PLAN-48: главный герой и партнёр — DOM-контракт', () => {
    const form = read('../src/ui/NewGameForm.tsx');
    const storeSrc = read('../src/ui/store.ts');
    const team = read('../src/ui/apps/staff/TeamTab.tsx');
    const staffWin = read('../src/ui/apps/staff/StaffWindow.tsx');
    const chat = read('../src/ui/apps/ChatApp.tsx');
    expect(form).toContain('HERO_CHARACTERS');   // 10 характеров — обязательный шаг героя
    expect(form).toContain('PLAYER_AVATARS');    // сетка 20 аватарок игрока
    expect(form).toContain('hero-grid');
    expect(form).toContain('Далее →');           // v1.45.2: шаги листаются «Назад/Далее», счётчик в заголовке
    expect(form).toContain("'Партнёр'");         // последний шаг — выбор партнёра
    expect(storeSrc).toContain("'partner_buyout'"); // два варианта расставания живут в экшенах
    expect(storeSrc).toContain("'partner_rent'");
    expect(team).toContain('st.hero');           // у ГГ нет кнопки «Уволить»
    expect(team).toContain('staffWinId');        // партнёр: кнопка ведёт в его окно
    expect(staffWin).toContain('actionPartnerBuyout');
    expect(staffWin).toContain('actionPartnerRent');
    expect(chat).toContain("g.staff.find((s) => s.hero)?.name ?? 'Вы'"); // подпись игрока = имя ГГ
  });
});
