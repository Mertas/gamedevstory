// Виртуальная мышь автопилота (plan/14): играет шаги хореографии от сервера.
// Очередь опрашивается интервалом (никаких гонок с React-cleanup):
// - open: настоящее открытие окна через wm
// - plan: заполняет визард «Код» значениями решения (настоящее состояние формы)
// - click: курсор летит к [data-autopilot=target] и нажимает НАСТОЯЩУЮ кнопку
//   (реальный onClick → реальное действие с флагом autopilot:true)
import { useEffect, useRef, useState } from 'react';
import { setAutopilotPlan, takeAutopilotStep } from './store';
import type { AutopilotStep } from '../shared/autopilot';
import { useWindows } from './wm';

const FLY_MS = 800; // медленный полёт (просьба: «пусть мышка летает медленнее»)
const PRESS_MS = 220;
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

export function AutopilotCursor() {
  const wm = useRef(useWindows());
  const busyRef = useRef(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [label, setLabel] = useState('');
  const [pressing, setPressing] = useState(false);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  // эффект клика: волна в точке нажатия (+ сжатие курсора в стиле)
  const [ripple, setRipple] = useState<{ x: number; y: number; id: number } | null>(null);

  useEffect(() => {
    const playStep = async (step: AutopilotStep): Promise<void> => {
      if (step.kind === 'open') {
        setLabel(`Открываю ${step.app}`);
        wm.current.open(step.app);
        await sleep(500);
        return;
      }
      if (step.kind === 'plan') {
        setLabel('Заполняю мастер проекта');
        setAutopilotPlan(step.plan);
        await sleep(400);
        return;
      }
      // click
      setLabel(step.label);
      const el = await findTarget(step.target, 2500);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const tx = r.left + r.width / 2;
      const ty = r.top + r.height / 2;
      const from = posRef.current ?? { x: tx - 120, y: ty - 60 };
      await fly(from, { x: tx, y: ty });
      // «нажатие»: утопить кнопку, волна в точке клика, затем настоящий клик
      setPressing(true);
      setRipple({ x: tx, y: ty, id: Date.now() });
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
      await sleep(600);
    };

    const findTarget = async (target: string, timeoutMs: number): Promise<HTMLElement | null> => {
      const started = performance.now();
      for (;;) {
        const el = document.querySelector<HTMLElement>(`[data-autopilot="${target}"]`);
        if (el && el.getClientRects().length > 0) return el;
        if (performance.now() - started >= timeoutMs) return null;
        await sleep(120);
      }
    };

    const fly = (from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const frame = (now: number): void => {
          const t = Math.min(1, (now - t0) / FLY_MS);
          const ease = 1 - Math.pow(1 - t, 3);
          const p = { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease };
          posRef.current = p;
          setPos(p);
          if (t < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });

    const iv = window.setInterval(() => {
      if (busyRef.current) return;
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
