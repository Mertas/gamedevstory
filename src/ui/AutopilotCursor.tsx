// Виртуальная мышь автопилота (plan/14): играет шаги хореографии от сервера.
// Очередь опрашивается интервалом (никаких гонок с React-cleanup):
// - open: настоящее открытие окна через wm
// - plan: МЫШЬ ПРОХОДИТ визард «Код» по-настоящему: открывает все шаги-вкладки и
//   нажимает кнопки выбора (консоль/жанр/тип/режим — радио; направление — кнопки ±
//   до значения плана; роли — вкладки + карточки сотрудников); финал — «Начать»
//   (реальный onClick → реальное действие с флагом autopilot:true)
// - click: курсор летит к [data-autopilot=target] и нажимает кнопку
import { useEffect, useRef, useState } from 'react';
import { takeAutopilotStep, useAutopilot } from './store';
import type { AutopilotPlan, AutopilotStep } from '../shared/autopilot';
import { useWindows } from './wm';

const FLY_MS = 800; // дальний полёт
const FLY_QUICK_MS = 300; // короткие перелёты внутри окна
const PRESS_MS = 200;
const PAUSE_MS = 500; // после дальних кликов
const PAUSE_QUICK_MS = 220; // после кликов внутри визарда
const DIR_AXES = ['cute', 'realism', 'approach', 'niche', 'simple', 'innovation', 'world', 'polish'];
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export function AutopilotCursor() {
  const wm = useRef(useWindows());
  const busyRef = useRef(false);
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
    const findTarget = async (target: string, timeoutMs: number): Promise<HTMLElement | null> => {
      const started = performance.now();
      for (;;) {
        const el = document.querySelector<HTMLElement>(`[data-autopilot="${target}"]`);
        if (el && el.getClientRects().length > 0) return el;
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

    /** нажать элемент: волна + утопление + настоящий клик */
    const press = async (el: HTMLElement, quick: boolean): Promise<void> => {
      const r = el.getBoundingClientRect();
      setPressing(true);
      setRipple({ x: r.left + r.width / 2, y: r.top + r.height / 2, id: Date.now() });
      el.classList.add('w95-autopilot-press');
      await sleep(PRESS_MS);
      el.classList.remove('w95-autopilot-press');
      setPressing(false);
      window.setTimeout(() => setRipple(null), 700);
      const g = globalThis as { __gdsAutopilot?: boolean };
      g.__gdsAutopilot = true;
      try {
        el.click();
      } finally {
        window.setTimeout(() => { g.__gdsAutopilot = false; }, 0);
      }
      await sleep(quick ? PAUSE_QUICK_MS : PAUSE_MS);
    };

    /** полёт + клик по [data-autopilot=target]; false — элемент не найден */
    const clickTarget = async (target: string, quick = true): Promise<boolean> => {
      const el = await findTarget(target, 2500);
      if (!el) return false;
      await flyTo(el, quick);
      await press(el, quick);
      return true;
    };

    /** клик по карточке сотрудника: контракт с StaffCard — data-staff-id на корне карточки.
     * Ищем ВИДИМУЮ карточку в окне мастера: тот же сотрудник может быть и в окне «Найм». */
    const clickCard = async (staffId: string): Promise<void> => {
      const started = performance.now();
      const wizardScope = (): ParentNode => {
        const anchor = document.querySelector<HTMLElement>('[data-autopilot="wiz-step-6"]');
        return anchor?.closest<HTMLElement>('.w95-window') ?? document;
      };
      for (;;) {
        for (const el of wizardScope().querySelectorAll<HTMLElement>(`[data-staff-id="${staffId}"]`)) {
          const card = el.closest<HTMLElement>('.w95-staff-card');
          if (card && card.getClientRects().length > 0) {
            await flyTo(card, true);
            await press(card, true);
            return;
          }
        }
        if (performance.now() - started >= 2000) return;
        await sleep(120);
      }
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
      // направление: сначала обнулить все оси (визард стартует с lastDirection), потом + до плана
      for (const ax of DIR_AXES) {
        for (let guard = 0; guard < 12; guard++) {
          if (readDirValue(ax) <= 0) break;
          await clickTarget(`wiz-dir-${ax}-minus`);
        }
      }
      for (const ax of DIR_AXES) {
        const want = Math.max(0, Math.round(plan.direction[ax] ?? 0));
        for (let i = 0; i < want; i++) await clickTarget(`wiz-dir-${ax}-plus`);
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
      // название и сюжет: мышь жмёт «Сгенерировать» и ЖДЁТ ответ GigaChat (title заполнен)
      setLabel('Генерирую название и сюжет');
      const titleInput = () =>
        document.querySelector<HTMLInputElement>('input[placeholder*="Название игры"]');
      if (!(titleInput()?.value ?? '').trim()) {
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
        setLabel(`Открываю ${step.app}`);
        wm.current.open(step.app);
        await sleep(500);
        return;
      }
      if (step.kind === 'plan') {
        await wizardShow(step.plan);
        return;
      }
      setLabel(step.label);
      await clickTarget(step.target, false);
    };

    const iv = window.setInterval(() => {
      if (busyRef.current) return;
      if (!autoRef.current) return; // SRV-16: после «Взять управление» очередь не доигрываем
      const step = takeAutopilotStep();
      if (!step) return;
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
