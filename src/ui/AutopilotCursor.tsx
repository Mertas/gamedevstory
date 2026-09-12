// Виртуальная мышь автопилота (plan/14): играет шаги хореографии от сервера.
// Очередь опрашивается интервалом (никаких гонок с React-cleanup):
// - open: настоящее открытие окна через wm
// - plan: МЫШЬ ПРОХОДИТ визард «Код» по-настоящему: открывает все шаги-вкладки и
//   нажимает кнопки выбора (консоль/жанр/тип/режим — радио; направление — кнопки ±
//   до значения плана; роли — вкладки + карточки сотрудников); финал — «Начать»
//   (реальный onClick → реальное действие с флагом autopilot:true)
// - click: курсор летит к [data-autopilot=target] и нажимает кнопку
import { useEffect, useRef, useState } from 'react';
import { takeAutopilotStep, useAutopilot, actionAutopilotDone } from './store';
import { planDirClicks, type AutopilotPlan, type AutopilotStep } from '../shared/autopilot';
import { useWindows } from './wm';

const FLY_MS = 800; // дальний полёт
const FLY_QUICK_MS = 300; // короткие перелёты внутри окна
const PRESS_MS = 200;
const PAUSE_MS = 500; // после дальних кликов
const PAUSE_QUICK_MS = 220; // после кликов внутри визарда
const DIR_AXES = ['cute', 'realism', 'approach', 'niche', 'simple', 'innovation', 'world', 'polish'];
/** человекочитаемые названия окон для ярлыка мыши */
const APP_TITLES: Record<string, string> = {
  chat: 'Чат', code: 'Код', hire: 'Найм', marketing: 'Маркетинг', hardware: 'Железо',
  research: 'Исследования', archive: 'Архив', magazines: 'Журналы', contracts: 'Контракты',
  mail: 'Почта', help: 'Справка',
};
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export function AutopilotCursor() {
  const wm = useRef(useWindows());
  const busyRef = useRef(false);
  const playedRef = useRef(0); // PLAN-25: сколько шагов сыграно с последнего сигнала серверу
  // SRV-16: флаг автопилота в ref — интервал и хореография проверяют его без пересоздания эффекта
  const autopilot = useAutopilot();
  const autoRef = useRef(autopilot);
  autoRef.current = autopilot;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [label, setLabel] = useState('');
  const [pressing, setPressing] = useState(false);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  // эффект клика: волна в точке нажатия (+ сжатие курсора в стиле)
  const [ripple, setRipple] = useState<{ x: number; y: number; id: number } | null>(null);

  useEffect(() => {
    /** PLAN-25: элемент есть в DOM, но его окно свёрнуто/закрыто (display:none) — разворачиваем окно
     *  по заголовку. Без этого кнопки «Нанять»/«Уволить»/тренинга формально недостижимы. */
    const awakeWindow = (el: HTMLElement): boolean => {
      const win = el.closest('.w95-window');
      const title = win?.querySelector('.w95-title')?.textContent?.trim();
      const app = title ? Object.entries(APP_TITLES).find(([, t]) => t === title)?.[0] : undefined;
      if (!app) return false;
      wm.current.open(app);
      return true;
    };

    const findTarget = async (target: string, timeoutMs: number): Promise<HTMLElement | null> => {
      const started = performance.now();
      let recovered = false;
      for (;;) {
        const el = document.querySelector<HTMLElement>(`[data-autopilot="${target}"]`);
        if (el && el.getClientRects().length > 0) return el;
        // PLAN-25: цель есть в DOM, но её окно свёрнуто/закрыто (display:none) — разворачиваем окно
        // и ищем снова. Иначе кнопки «Нанять»/«Уволить»/тренинга формально недостижимы.
        if (!recovered && el) recovered = awakeWindow(el);
        if (performance.now() - started >= timeoutMs) return null;
        await sleep(120);
      }
    };

    const flyTo = (el: HTMLElement, quick: boolean): Promise<void> => {
      const r = el.getBoundingClientRect();
      const to = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const from = posRef.current ?? { x: to.x - 100, y: to.y - 50 };
      return new Promise((resolve) => {
        const t0 = performance.now();
        const dur = quick ? FLY_QUICK_MS : FLY_MS;
        const frame = (now: number): void => {
          const t = Math.min(1, (now - t0) / dur);
          const ease = 1 - Math.pow(1 - t, 3);
          const p = { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease };
          posRef.current = p;
          setPos(p);
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
    };

    /** нажать элемент: волна + утопление + настоящий клик.
     *  cosmetic — «витринное» нажатие действий политики: действие уже применено сервером,
     *  повторный клик применил бы его второй раз — жмём только визуально. */
    const press = async (el: HTMLElement, quick: boolean, cosmetic = false): Promise<void> => {
      const r = el.getBoundingClientRect();
      setPressing(true);
      setRipple({ x: r.left + r.width / 2, y: r.top + r.height / 2, id: Date.now() });
      el.classList.add('w95-autopilot-press');
      await sleep(PRESS_MS);
      el.classList.remove('w95-autopilot-press');
      setPressing(false);
      window.setTimeout(() => setRipple(null), 700);
      if (!cosmetic) {
        const g = globalThis as { __gdsAutopilot?: boolean };
        g.__gdsAutopilot = true;
        try {
          el.click();
        } finally {
          window.setTimeout(() => { g.__gdsAutopilot = false; }, 0);
        }
      }
      await sleep(quick ? PAUSE_QUICK_MS : PAUSE_MS);
    };

    /** полёт + клик по [data-autopilot=target]; false — элемент не найден */
    const clickTarget = async (target: string, quick = true, cosmetic = false): Promise<boolean> => {
      const el = await findTarget(target, cosmetic ? 1500 : 2500);
      if (!el) return false;
      // PLAN-25: цель может быть ниже прокрутки окна — подводим её к видимой зоне
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      await flyTo(el, quick);
      await press(el, quick, cosmetic);
      return true;
    };

    /** клик по карточке сотрудника: контракт с StaffCard — data-staff-id на корне карточки. */
    const clickCardIn = async (scope: () => ParentNode, staffId: string, timeoutMs: number): Promise<void> => {
      const started = performance.now();
      let recovered = false;
      for (;;) {
        for (const el of scope().querySelectorAll<HTMLElement>(`[data-staff-id="${staffId}"]`)) {
          const card = el.closest<HTMLElement>('.w95-staff-card');
          if (card && card.getClientRects().length > 0) {
            await flyTo(card, true);
            await press(card, true);
            return;
          }
        }
        if (!recovered) {
          const any = scope().querySelector<HTMLElement>(`[data-staff-id="${staffId}"]`);
          if (any) recovered = awakeWindow(any);
        }
        if (performance.now() - started >= timeoutMs) return;
        await sleep(120);
      }
    };
    /** скоуп окна мастера («Код»): тот же сотрудник может быть и в окне «Найм» */
    const wizardScope = (): ParentNode => {
      const anchor = document.querySelector<HTMLElement>('[data-autopilot="wiz-step-6"]');
      return anchor?.closest<HTMLElement>('.w95-window') ?? document;
    };
    const clickCard = (staffId: string): Promise<void> => clickCardIn(wizardScope, staffId, 2000);
    /** скоуп окна приложения по якорям его вкладок (шаг card: выбор сотрудника в «Найме») */
    const appScope = (app: string): ParentNode => {
      const anchor = document.querySelector<HTMLElement>(`[data-autopilot^="${app}-tab-"]`);
      return anchor?.closest<HTMLElement>('.w95-window') ?? document;
    };
    /** выбрать значение в <select> (React-совместимо: нативный setter + bubbling change) */
    const selectValue = async (target: string, value: string): Promise<void> => {
      const el = await findTarget(target, 2000);
      if (!(el instanceof HTMLSelectElement)) return;
      await flyTo(el, true);
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (setter) setter.call(el, value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(300);
    };

    const readDirValue = (ax: string): number => {
      const el = document.querySelector<HTMLElement>(`[data-autopilot-dir-value="${ax}"]`);
      const v = Number(el?.textContent ?? '0');
      return Number.isFinite(v) ? v : 0;
    };

    /** шоу: мышь сама заполняет визард по плану (реальные клики) */
    const wizardShow = async (plan: AutopilotPlan): Promise<void> => {
      const stopped = (): boolean => !autoRef.current; // SRV-03/16: прерывание на любом шаге
      setLabel('Заполняю мастер проекта');
      if (stopped()) return;
      await clickTarget('wiz-step-1');
      if (stopped()) return;
      await clickTarget(`wiz-console-${plan.consoleId}`);
      await clickTarget('wiz-step-2');
      await clickTarget(`wiz-genre-${plan.genreId}`);
      await clickTarget('wiz-step-3');
      await clickTarget(`wiz-type-${plan.typeId}`);
      await clickTarget('wiz-step-4');
      await clickTarget(`wiz-mode-${plan.mode}`);
      await clickTarget('wiz-step-5');
      // направление: дельта-клики от прошлого проекта (визард стартует с lastDirection) до плана.
      // Порядок и число кликов считает planDirClicks (сначала «−», потом «+»); совпало — кликов нет.
      const curDir: Record<string, number> = {};
      for (const ax of DIR_AXES) curDir[ax] = readDirValue(ax);
      for (const { axis, sign } of planDirClicks(curDir, plan.direction, DIR_AXES)) {
        await clickTarget(`wiz-dir-${axis}-${sign > 0 ? 'plus' : 'minus'}`);
      }
      await clickTarget('wiz-step-6');
      const rolePlan: Array<[string, string | undefined]> = [
        ['proposal', plan.proposalStaffId],
        ['program', plan.assignments.program[0]],
        ['graphics', plan.assignments.graphics[0]],
        ['sound', plan.assignments.sound[0]],
        ['debug', plan.assignments.debug[0]],
      ];
      for (const [role, staffId] of rolePlan) {
        if (!staffId) continue;
        await clickTarget(`wiz-role-${role}`);
        await clickCard(staffId);
      }
      if (stopped()) return;
      await clickTarget('wiz-step-7');
      // название и сюжет: команда придумала их в решении — «печатаем» как есть (16).
      // Не придумала — прежнее поведение: жмём «Сгенерировать» и ждём GigaChat.
      const titleInput = () =>
        document.querySelector<HTMLInputElement>('input[placeholder*="Название игры"]');
      const plotInput = () =>
        document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="Краткий сюжет"]');
      const typeInto = async (el: HTMLInputElement | HTMLTextAreaElement | null, value: string): Promise<void> => {
        if (!el || !value) return;
        await flyTo(el, true);
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(PAUSE_QUICK_MS);
      };
      if ((plan.name ?? '').trim() || (plan.plot ?? '').trim()) {
        setLabel('Печатаю придуманное командой');
        await typeInto(plotInput(), (plan.plot ?? '').trim());
        await typeInto(titleInput(), (plan.name ?? '').trim());
      } else if (!(titleInput()?.value ?? '').trim()) {
        setLabel('Генерирую название и сюжет');
        await clickTarget('wiz-story-gen');
        const started = performance.now();
        for (;;) {
          if (stopped()) return;
          if ((titleInput()?.value ?? '').trim()) break;
          if (performance.now() - started >= 25000) break; // LLM не ответил — стартуем без названия
          await sleep(500);
        }
      }
      if (stopped()) return; // финальный клик «Начать» — только если босс не вернулся
      setLabel('Начинаю разработку');
      await clickTarget('wizard-start', false); // финальный дальний клик
    };

    const playStep = async (step: AutopilotStep): Promise<void> => {
      if (!autoRef.current) return; // SRV-16: босс вернул управление — шаг не играем
      if (step.kind === 'open') {
        setLabel(`Открываю «${APP_TITLES[step.app] ?? step.app}»`);
        wm.current.open(step.app);
        await sleep(500);
        return;
      }
      if (step.kind === 'plan') {
        await wizardShow(step.plan);
        return;
      }
      if (step.kind === 'card') {
        setLabel(step.label ?? 'Выбираю сотрудника');
        await clickCardIn(() => appScope(step.app), step.staffId, 1500);
        return;
      }
      if (step.kind === 'select') {
        setLabel(step.label ?? 'Выбираю значение');
        await selectValue(step.target, step.value);
        return;
      }
      setLabel(step.label);
      const ok = await clickTarget(step.target, step.quick === true, step.cosmetic === true);
      // PLAN-25: молчаливый пропуск цели хуже видимой жалобы — по ней сразу ясно, какой кнопки нет
      if (!ok) setLabel(`⚠️ Кнопка не появилась: ${step.label ?? ''} [${step.target}]`);
    };

    const iv = window.setInterval(() => {
      if (busyRef.current) return;
      if (!autoRef.current) return; // SRV-16: после «Взять управление» очередь не доигрываем
      const step = takeAutopilotStep();
      if (!step) {
        // PLAN-25: очередь опустела после сыгранных шагов — сообщаем серверу, что откат не нужен
        if (playedRef.current > 0) {
          playedRef.current = 0;
          actionAutopilotDone();
        }
        return;
      }
      playedRef.current += 1;
      busyRef.current = true;
      void playStep(step).finally(() => {
        busyRef.current = false;
      });
    }, 180);
    return () => window.clearInterval(iv);
  }, []);

  return (
    <div style={{ position: 'fixed', left: 0, top: 0, zIndex: 30001, pointerEvents: 'none' }}>
      {ripple && (
        <span
          key={ripple.id}
          className="w95-autopilot-ripple"
          style={{ left: ripple.x - 22, top: ripple.y - 22 }}
        />
      )}
      {pos && (
        <div
          style={{
            position: 'fixed',
            left: pos.x - 4,
            top: pos.y - 2,
            fontSize: 22,
            transform: pressing ? 'scale(0.85)' : undefined,
            transition: 'transform .08s',
            filter: 'drop-shadow(1px 1px 0 #000)',
          }}
        >
          🖱️
        </div>
      )}
      {label && (
        <div
          className="w95-autopilot-label"
          style={{ position: 'fixed', left: (pos?.x ?? 40) + 20, top: (pos?.y ?? 40) - 14 }}
        >
          🤖 {label}
        </div>
      )}
    </div>
  );
}
