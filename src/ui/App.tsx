// Точка входа UI: подключение к серверу, события (буст/продавец) через MessageBox, рабочий стол.
import { useEffect, useState } from 'react';
import { Desktop } from './Desktop';
import { MessageBox } from './MessageBox';
import {
  actionDismissSalesman, actionRelease, actionResolveBoost, actionResolveEvent, showMessageBox, useSnapshot,
} from './store';
import { WindowManagerProvider } from './wm';
import { CONFIG } from '../core/config';

// следим за событиями, требующими решения игрока
function EventWatcher() {
  const snap = useSnapshot();
  const ev = snap.game?.pendingEvent;
  // ставка улучшения (PR) — выбирается слайдером
  const [boostAmount, setBoostAmount] = useState(0);
  useEffect(() => {
    if (!ev) {
      setBoostAmount(0);
      return;
    }
    if (ev.type === 'boost') {
      const staff = snap.game?.staff.find((s) => s.id === ev.staffId);
      setBoostAmount((a) => (a === 0 ? ev.cost : a)); // не сбрасываем выбор игрока
      const research = snap.game?.research ?? 0;
      const max = Math.max(1, Math.floor(research));
      const sum = staff ? staff.stats.program + staff.stats.scenario + staff.stats.graphics + staff.stats.sound : 0;
      const chance = (amount: number) => Math.min(
        CONFIG.BOOST_SUCCESS_CAP,
        Math.max(0.15, CONFIG.BOOST_SUCCESS_BASE + (amount - ev.cost) * CONFIG.BOOST_RATE_PER_PR + sum / CONFIG.BOOST_SUCCESS_STAT_DIV),
      );
      showMessageBox({
        title: 'Предложение улучшить игру',
        body: (
          <div>
            <div>💡 {staff?.name ?? 'Сотрудник'} предлагает улучшить игру (база {ev.cost} PR).</div>
            <div style={{ marginTop: 6 }}>
              Вложить: <b>{Math.min(boostAmount, max)}</b> PR (есть {Math.floor(research)})
            </div>
            <input
              type="range" min={1} max={max} step={1}
              value={Math.min(boostAmount, max)}
              onChange={(e) => setBoostAmount(Number(e.target.value))}
              style={{ width: '100%', marginTop: 2 }}
            />
            <div style={{ marginTop: 2 }}>
              Шанс успеха: <b>{Math.round(chance(Math.min(boostAmount, max)) * 100)}%</b>
              {' '}<span className="w95-hint">успех: +25..50 очков · провал: +20..30 багов</span>
            </div>
          </div>
        ),
        buttons: [
          { label: `Принять (${Math.min(boostAmount, max)} PR)`, onClick: () => actionResolveBoost(true, Math.min(boostAmount, max)) },
          { label: 'Отклонить', onClick: () => actionResolveBoost(false) },
        ],
      });
    }
    if (ev.type === 'salesman') {
      showMessageBox({
        title: 'Продавец Тыквенных Продуктов',
        text: '🛒 Продавец пришёл в офис! Бустеры, Dead Bull и Руководство по смене профессии — во вкладке «Продавец» окна «Найм».',
        buttons: [
          { label: 'Заглянуть', onClick: () => actionDismissSalesman() },
        ],
      });
    }
    if (ev.type === 'disaster') {
      showMessageBox({
        title: 'Происшествие в студии!',
        text: ev.text,
        buttons: [
          { label: 'Ок', onClick: () => actionResolveEvent() },
        ],
      });
    }
    if (ev.type === 'boost_result') {
      showMessageBox({
        title: 'Результат улучшения',
        text: ev.text,
        buttons: [
          { label: 'Ок', onClick: () => actionResolveEvent() },
        ],
      });
    }
    if (ev.type === 'ready_to_release') {
      showMessageBox({
        title: 'Игра готова к выпуску!',
        text: ev.text,
        buttons: [
          { label: '🚀 Выпустить игру', onClick: () => actionRelease() },
        ],
      });
    }
    if (ev.type === 'release_result') {
      showMessageBox({
        title: 'Оценки критиков',
        text: ev.text,
        buttons: [
          { label: 'Ок', onClick: () => actionResolveEvent() },
        ],
      });
    }
  }, [ev, snap.game, boostAmount]);
  return null;
}

export function App() {
  const snap = useSnapshot();
  if (!snap.game || !snap.meta) {
    return (
      <div className="w95-desktop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="w95-window focused" style={{ position: 'relative', width: 360, zIndex: 10 }}>
          <div className="w95-title">Game Dev Studio</div>
          <div className="w95-body" style={{ padding: 12 }}>
            {snap.connected
              ? <div>🖥️ Сервер недоступен. Запустите: pnpm server</div>
              : <div>⏳ Подключение к серверу…</div>}
          </div>
        </div>
      </div>
    );
  }
  return (
    <WindowManagerProvider>
      <EventWatcher />
      <Desktop />
      <MessageBox />
    </WindowManagerProvider>
  );
}
