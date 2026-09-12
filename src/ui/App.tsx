// Точка входа UI: подключение к серверу, события (буст/продавец) через MessageBox, рабочий стол.
import { useEffect, useState } from 'react';
import { Desktop } from './Desktop';
import { MessageBox } from './MessageBox';
import { ActionToast } from './ActionToast';
import { LevelToast } from './LevelToast';
import {
  actionDismissSalesman, actionRelease, actionResolveBoost, actionResolveEvent, actionResolveGamedex, clearDismissedEvKey,
  closeMessageBox, evDismissed, EV_DISMISS_MS, showMessageBox, startSession, stopSession,
  useMessageBox, useSnapshot, type MessageBoxData,
} from './store';
import { WindowManagerProvider } from './wm';
import { CONFIG } from '../core/config';
import { AuthScreen } from './AuthScreen';
import { StartScreen } from './StartScreen';
import { apiMe, type Features, type MeInfo } from './api';
import { setOwner } from './owner';
import { UpdateNotice } from './UpdateNotice';
import { SalesWidget } from './SalesWidget';

// следим за событиями, требующими решения игрока
function EventWatcher() {
  const snap = useSnapshot();
  const ev = snap.game?.pendingEvent;
  // ставка улучшения (PR) — выбирается слайдером
  const [boostAmount, setBoostAmount] = useState(0);
  const mb = useMessageBox();
  useEffect(() => {
    if (!ev) {
      setBoostAmount(0);
      // аудит 05.09: событие снято сервером — закрыть любой оставшийся попап (например,
      // «Не участвовать» в Gamedex не закрывал попап локально, и он висел навсегда)
      closeMessageBox();
      clearDismissedEvKey();
      return;
    }
    // сервер шлёт state-пульс, пока событие висит: тот же попап не пересоздаём (кнопки под
    // курсором не должны исчезать), а закрытый (клик потерян из-за обрыва WS) — возвращаем
    const evKey = JSON.stringify(ev);
    // клик уже сделан: попап закрыт локально, событие ещё висит — НЕ переоткрывать (баг «два
    // клика»); но если за 3с событие не ушло — клик потерян, возвращаем попап (обрыв WS)
    const d = evDismissed();
    if (d && d.key === evKey && Date.now() - d.at < EV_DISMISS_MS) return;
    if (d && d.key !== evKey) clearDismissedEvKey(); // пришло другое событие — сброс
    if (mb && mb.evKey === evKey) return;
    const popup = (d: Omit<MessageBoxData, 'evKey'>) => showMessageBox(Object.assign(d, { evKey }));
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
      popup({
        title: 'Предложение улучшить игру',
        autopilotTarget: 'mb-accept',
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
      popup({
        title: 'Продавец Тыквенных Продуктов',
        autopilotTarget: 'mb-ok',
        text: '🛒 Продавец пришёл в офис! Бустеры, Dead Bull и Руководство по смене профессии — во вкладке «Продавец» окна «Найм».',
        buttons: [
          { label: 'Заглянуть', onClick: () => actionDismissSalesman() },
        ],
      });
    }
    if (ev.type === 'gamedex') {
      const money = snap.game?.money ?? 0;
      const opts = Object.entries(CONFIG.GAMEDEX_OPTIONS).filter(([id]) => id !== 'none');
      popup({
        title: '🎪 Gamedex — летняя выставка',
        autopilotTarget: 'mb-none',
        body: (
          <div>
            <div>Стенд даст известность (стартовый fame <b>следующей</b> игры) и фанатов. Повтор того же стенда подряд — вдвое слабее.</div>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {opts.map(([id, o]) =>
                money >= o.cost ? (
                  <button key={id} className="w95-btn" style={{ textAlign: 'left' }} onClick={() => { closeMessageBox(); actionResolveGamedex(id); }}>
                    {o.label} — {o.cost}K&nbsp;&nbsp;(известность +{o.fame}, фанаты +{o.fans})
                  </button>
                ) : (
                  <div key={id} style={{ color: 'GrayText', fontSize: 12 }}>
                    {o.label} — {o.cost}K (не хватает {o.cost - money}K)
                  </div>
                ),
              )}
            </div>
          </div>
        ),
        buttons: [
          { label: 'Не участвовать', onClick: () => actionResolveGamedex('none') },
        ],
      });
    }
    if (ev.type === 'disaster') {
      popup({
        title: 'Происшествие в студии!',
        autopilotTarget: 'mb-ok',
        text: ev.text,
        buttons: [
          { label: 'Ок', onClick: () => actionResolveEvent() },
        ],
      });
    }
    if (ev.type === 'boost_result') {
      popup({
        title: 'Результат улучшения',
        autopilotTarget: 'mb-ok',
        text: ev.text,
        buttons: [
          { label: 'Ок', onClick: () => actionResolveEvent() },
        ],
      });
    }
    if (ev.type === 'info') {
      popup({
        title: ev.title,
        autopilotTarget: 'mb-ok',
        text: ev.text,
        buttons: [
          { label: 'Ок', onClick: () => actionResolveEvent() },
        ],
      });
    }
    if (ev.type === 'ready_to_release') {
      popup({
        title: 'Игра готова к выпуску!',
        autopilotTarget: 'mb-release',
        text: ev.text,
        buttons: [
          { label: '🚀 Выпустить игру', onClick: () => actionRelease() },
        ],
      });
    }
    if (ev.type === 'release_result') {
      popup({
        title: 'Оценки критиков',
        autopilotTarget: 'mb-ok',
        text: ev.text,
        buttons: [
          { label: 'Ок', onClick: () => actionResolveEvent() },
        ],
      });
    }
  }, [ev, snap.game, boostAmount, mb]);
  return null;
}

/** Окно ожидания (вход/партия грузятся) — тот же вид, что и раньше. */
function Boot({ text }: { text: string }) {
  return (
    <div className="w95-desktop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="w95-window focused" style={{ position: 'relative', width: 360, zIndex: 10 }}>
        <div className="w95-title">Game Dev Studio</div>
        <div className="w95-body" style={{ padding: 12 }}>
          <div>{text}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * PLAN-18: экраны — вход → начальное меню (сохранения игрока) → партия.
 * Соединение с игровой сессией открывается только в партии.
 */
export function App() {
  const snap = useSnapshot();
  const [me, setMe] = useState<MeInfo | null | undefined>(undefined);
  // после «Новая игра»/«Загрузить» страница перезагружается с #play — сразу входим в партию
  const [screen, setScreen] = useState<'launcher' | 'game'>(() => (location.hash === '#play' ? 'game' : 'launcher'));

  const [features, setFeatures] = useState<Features>({ passwordReset: false, inviteRequired: true });

  useEffect(() => {
    void apiMe().then((s) => {
      setMe(s.user);
      setFeatures(s.features);
      setOwner(Boolean(s.user?.admin)); // окно «Инвайты» — только владельцу студии
    });
  }, []);

  useEffect(() => {
    if (me && screen === 'game') startSession();
    else stopSession();
  }, [me, screen]);

  // сервер отказал (партия не загружена — например, сервер перезапущен): назад в начальное меню
  useEffect(() => {
    if (snap.sessionLost && screen === 'game') exitToLauncher();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.sessionLost, screen]);

  function exitToLauncher(): void {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    stopSession();
    setScreen('launcher');
  }

  if (me === undefined) return <Boot text="⏳ Загрузка…" />;
  if (me === null) return <AuthScreen features={features} />;
  if (screen === 'launcher') {
    return (
      <>
        <StartScreen me={me} />
        <UpdateNotice />
      </>
    );
  }
  if (!snap.game || !snap.meta) {
    return (
      <Boot
        text={
          snap.connected
            ? '⏳ Загрузка партии…'
            : location.hostname === 'localhost' || location.hostname === '127.0.0.1'
              ? '🔌 Нет связи с сервером. Запустите: pnpm server'
              : '🔌 Нет связи с сервером — переподключаюсь…'
        }
      />
    );
  }
  return (
    <WindowManagerProvider>
      <EventWatcher />
      <Desktop onExit={exitToLauncher} />
      <MessageBox />
      <SalesWidget />
      <UpdateNotice />
      <div className="w95-toasts">
        <ActionToast />
        <LevelToast />
      </div>
    </WindowManagerProvider>
  );
}
