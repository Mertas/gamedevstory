// Точка входа UI: подключение к серверу, события (буст/продавец) через MessageBox, рабочий стол.
import { useEffect, useState } from 'react';
import { Desktop } from './Desktop';
import { MessageBox } from './MessageBox';
import { MinigameModal } from './MinigameModal';
import { ActionToast } from './ActionToast';
import { LevelToast } from './LevelToast';
import {
  actionDismissSalesman, actionRelease, actionResolveBoost, actionResolveEvent, actionResolveGamedex, actionResolveStory, clearDismissedEvKey,
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
import { sfx } from './sfx';
import { SalesWidget } from './SalesWidget';
import { PressModal } from './PressModal';
import { genreById } from '../shared/meta';
import { fmtK } from '../shared/nums';
import { STORY_ARCS } from '../shared/storylines';

/** Тело попапа буста (28.09): живой компонент — слайдер, шанс и «Принять» обновляются локально,
 *  обновления состояния не пересоздают попап (из-за этого слайдер «замирал», и приём слал 0 PR). */
function BoostOfferBody({ proposalStaffId, baseCost }: { proposalStaffId: string; baseCost: number }) {
  const snap = useSnapshot();
  const research = Math.floor(snap.game?.research ?? 0);
  const maxAmount = Math.max(1, research);
  const minAmount = Math.min(Math.max(1, baseCost), maxAmount);
  const [amount, setAmount] = useState<number | null>(null); // null — базовая ставка (= предложение)
  const value = Math.min(Math.max(amount ?? minAmount, minAmount), maxAmount);
  const staff = snap.game?.staff.find((s) => s.id === proposalStaffId);
  const sum = staff ? staff.stats.program + staff.stats.scenario + staff.stats.graphics + staff.stats.sound : 0;
  const chance = Math.min(
    CONFIG.BOOST_SUCCESS_CAP,
    Math.max(0.15, CONFIG.BOOST_SUCCESS_BASE + (value - baseCost) * CONFIG.BOOST_RATE_PER_PR + sum / CONFIG.BOOST_SUCCESS_STAT_DIV),
  );
  const gainLo = Math.max(1, Math.round(sum * CONFIG.BOOST_GAIN_PCT[0]));
  const gainHi = Math.max(gainLo, Math.round(sum * CONFIG.BOOST_GAIN_PCT[1]));
  if (research < baseCost) {
    return (
      <div>
        💡 {staff?.name ?? 'Сотрудник'} предлагает улучшить игру (база {baseCost} PR), но в казне
        исследований не хватает: есть {research}. Откажитесь — случай вернётся в другой разработке.
      </div>
    );
  }
  return (
    <div>
      <div>💡 {staff?.name ?? 'Сотрудник'} предлагает улучшить игру (база {baseCost} PR).</div>
      <div style={{ marginTop: 6 }}>
        Вложить: <b>{value}</b> PR (есть {research})
      </div>
      <input
        type="range" min={minAmount} max={maxAmount} step={1}
        value={value}
        onChange={(e) => setAmount(Number(e.target.value))}
        style={{ width: '100%', marginTop: 2 }}
      />
      <div style={{ marginTop: 2 }}>
        Шанс успеха: <b>{Math.round(chance * 100)}%</b>
        {' '}<span className="w95-hint">успех: +{gainLo}..{gainHi} очков (10–15% характеристик автора) · провал: +20..30 багов</span>
      </div>
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
        <button
          className="w95-btn" style={{ minWidth: 130 }}
          data-autopilot="mb-accept"
          onClick={() => { closeMessageBox(); actionResolveBoost(true, value); }}
        >
          Принять ({value} PR)
        </button>
      </div>
    </div>
  );
}

// следим за событиями, требующими решения игрока
function EventWatcher() {
  const snap = useSnapshot();
  const ev = snap.game?.pendingEvent;
  const mb = useMessageBox();
  useEffect(() => {
    if (!ev) {
      // аудит 05.09: событие снято сервером — закрыть любой оставшийся попап (например,
      // «Не участвовать» в Gamedex не закрывал попап локально, и он висел навсегда)
      closeMessageBox();
      clearDismissedEvKey();
      return;
    }
    // обновления состояния (кадры-диффы) не пересоздают открытый попап — кнопки под курсором
    // не должны исчезать; закрытый при потерянном клике возвращает локальный таймер (store.ts)
    const evKey = JSON.stringify(ev);
    // клик уже сделан: попап закрыт локально, событие ещё висит — НЕ переоткрывать (баг «два
    // клика»); но если за 3с событие не ушло — клик потерян, возвращаем попап (обрыв WS)
    const d = evDismissed();
    if (d && d.key === evKey && Date.now() - d.at < EV_DISMISS_MS) return;
    if (d && d.key !== evKey) clearDismissedEvKey(); // пришло другое событие — сброс
    if (mb && mb.evKey === evKey) return;
    const popup = (d: Omit<MessageBoxData, 'evKey'>) => showMessageBox(Object.assign(d, { evKey }));
    if (ev.type === 'boost') {
      // 28.09: тело — живой компонент. Слайдер держит состояние сам (раньше boostAmount жил в
      // EventWatcher, попап не пересобирался из-за evKey-пульса — слайдер «замирал» на 0, и
      // «Принять (0 PR)» слало нулевую ставку).
      popup({
        title: 'Предложение улучшить игру',
        body: <BoostOfferBody proposalStaffId={ev.staffId} baseCost={ev.cost} />,
        buttons: [
          { label: 'Отклонить', onClick: () => actionResolveBoost(false) },
        ],
      });
    }
    if (ev.type === 'salesman') {
      popup({
        title: 'Продавец Тыквенных Продуктов',
        autopilotTarget: 'mb-ok',
        clickToClose: true, // v1.18.1: просто уведомление
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
                    {o.label} — {fmtK(o.cost)} (не хватает {fmtK(o.cost - money)})
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
    if (ev.type === 'story') {
      // PLAN-44: сюжетная арка — текст шага из контента ({name}, {genre}), выбор кнопками
      const arcState = snap.game?.story?.arcs?.[ev.arcId];
      const stepData = STORY_ARCS[ev.arcId]?.steps?.[ev.step - 1];
      // v1.40: у процедурного квеста контент лежит в состоянии (gen) — рендерим как обычный шаг
      const content = arcState?.gen ?? stepData;
      if (content) {
        const name = arcState?.staffName ?? 'Сотрудник';
        const name2 = arcState?.staffName2 ?? 'Коллега';
        const genreRu = arcState?.genreId && snap.meta ? (genreById(snap.meta, arcState.genreId)?.ru ?? '') : '';
        const sub = (s: string) =>
          s.replace(/\{name2\}/g, name2).replace(/\{name\}/g, name).replace(/\{genre\}/g, genreRu);
        const money = snap.game?.money ?? 0;
        const opts = content.options.filter((o) => o.cost == null || money >= o.cost);
        popup({
          title: sub(content.title),
          autopilotTarget: 'mb-ok',
          body: (
            <div style={{ lineHeight: 1.45 }}>{sub(content.text)}</div>
          ),
          buttons: opts.map((o) => ({
            label: sub(o.label),
            onClick: () => { closeMessageBox(); actionResolveStory(o.id); },
          })),
        });
      }
    }
    if (ev.type === 'disaster') {
      popup({
        title: 'Происшествие в студии!',
        autopilotTarget: 'mb-ok',
        clickToClose: true, // v1.18.1: сводка — клик закрывает
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
        clickToClose: true, // v1.18.1: сводка — клик закрывает
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
        clickToClose: true, // v1.18.1: обучение/уровни и прочие сводки — клик закрывает
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
      // PLAN-30: попап «Оценки критиков» больше не нужен — оценки, вклады и рекорды в модалке прессы.
      // SER-23: закрываем как действие автопилота — иначе сервер решит, что вернулся босс.
      actionResolveEvent(true);
      return;
    }
  }, [ev, snap.game, mb]);
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

  // M4: звук — делегированные клики на ВСЕХ экранах (стартовый, стол, окна);
  // первый настоящий жест пользователя будит AudioContext (политика автоплея).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !(e.target instanceof Element)) return;
      if (e.target.closest('.w95-mi')) sfx.menuTick();
      else if (e.target.closest('button, .w95-btn, .w95-d-icon, .w95-pick-ic, .w95-bg-item, .w95-fx-row')) sfx.click();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);

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
      <MinigameModal />
      <SalesWidget />
      <PressModal />
      <UpdateNotice />
      <div className="w95-toasts">
        <ActionToast />
        <LevelToast />
      </div>
    </WindowManagerProvider>
  );
}
