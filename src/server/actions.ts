// SRV-22 (Ф3, шаг 2): ActionDispatcher — обработка действий клиента.
// Вынесено из game.ts; GameServer.handle() делегирует сюда.
// SessionHost — контракт сессии: публичные «внутренности» GameServer (намеренно, ради этого модуля).
import { CONFIG } from '../core/config';
import { applyDifficulty, isDifficultyId } from '../core/difficulty';
import { genreById, typeById } from '../core/data/db';
import {
  applyCareerManualAction, buyLicenseAction, buyAdAction, buyBoosterAction, buyCareerManualAction, buyDeadBullAction,
  dismissSalesmanAction, fireAction, searchAction, hireFromSearchAction, introSeenAction, levelUpAction, moveOfficeAction, newGame,
  partnerBuyoutAction, partnerRentAction,
  releaseAction, resolveBoostAction, resolveEventAction, resolveFinaleAction, resolveGamedexAction, resolveMinigameAction, resolveSagaAction, resolveStoryAction, startOwnConsoleAction, startProjectAction,
  takeContractAction, trainAction, applyBoosterAction, restStaffAction, trainToMaxAction,
} from '../core/engine';
import { consoleDataFor } from '../core/systems/dev';
import type { GamedexOption, GameState } from '../core/types';
import { sanitizeUi } from './ui-state';
import { resetChat, type ChatState } from '../shared/chat';
import type { AutopilotPlan } from '../shared/autopilot';
import type { ClientAction } from './game';
import { score100 } from '../shared/rules';
import { gform } from '../shared/gender';

// аудит 09.09 (SRV-01): скорость — конечное число в [0..MAX_SPEED]; иначе Math.round(1000/v)=0 → тик каждую 1 мс
export const MAX_SPEED = 8;

// аудит-51 02-P2-8: лимит реплик игрока в чате — каждая запускает LLM-серию ответов команды
const chatMsgTimes = new WeakMap<object, number[]>();

/** результат действия клиента (action_result + попапы) */
export type ActionOutcome = { ok: boolean; error?: string; popup?: { title: string; text: string } };

/** Всё, что диспетчеру нужно от сессии (GameServer подходит структурно). */
let autopilotLogSink: ((entry: Record<string, unknown>) => void) | null = null;
/** PLAN-26: куда писать журнал промахов автопилота (задаёт слой api.ts → UserService). */
export function setAutopilotLogSink(fn: ((entry: Record<string, unknown>) => void) | null): void {
  autopilotLogSink = fn;
}

export function writeAutopilotLog(entry: Record<string, unknown>): void {
  autopilotLogSink?.(entry);
}

export interface SessionHost {
  /** PLAN-30: тексты критиков после релиза (опционально — тесты обходятся без LLM) */
  generatePress?(force?: boolean): void;
  game: GameState;
  chat: ChatState;
  speed: number;
  autopilotOn: boolean;
  /** PLAN-40: победа аккаунта (100/100) — авторежим открыт */
  victory: boolean;
  /** SER-27: время последнего «печатает» (панель разговоров) */
  lastTypingAt: number;
  lastAction: { ok: boolean; error?: string } | null;
  pendingPlan: AutopilotPlan | null;
  decidedThisIdle: boolean;
  mailShownId: number;
  run(res: ActionOutcome): void;
  /** PLAN-39/40: релиз — счётчики аккаунта и возможная победа (100/100) */
  noteRelease(score: number): void;
  emit(): void;
  /** PLAN-45: состояние заменено целиком (новая партия) — клиентам полный снапшот */
  syncInvalidate(): void;
  pushSystem(text: string): void;
  generatePhase(phase: string, extra?: Record<string, unknown>, openingFor?: string): Promise<void>;
  runStory(msg: { genreId: string; typeId: string; reqId?: number }): Promise<void>;
  queuePlayerMessage(text: string): void;
  startAutopilot(): void;
  stopAutopilot(silent: boolean): void;
  startTicker(): void;
  setSpeed(v: number): void;
  resetSession(): void;
  saveNow(): void;
  /** PLAN-25: клиент отыграл хореографию политики (клики применили действия) */
  autopilotStepsDone(): void;
}

/** Диспетчер действий клиента: маршрутизация в core-экшены + эффекты сессии. */
export function dispatchClientAction(s: SessionHost, msg: ClientAction): void {
  s.lastAction = null;
  // кнопка «Отдать управление»: ручное включение (таймаут простоя убран — сам не включается)
  if (msg.type === 'set_autopilot') {
    // PLAN-40: авторежим — награда за победу; до неё кнопки нет (и сервер отказывает)
    if (msg.on && !s.victory) {
      s.lastAction = { ok: false, error: 'Авторежим открывается победой: выпустите игру на 100/100' };
      s.emit();
      return;
    }
    if (msg.on) s.startAutopilot();
    else if (s.autopilotOn) s.stopAutopilot(false);
    s.emit();
    return;
  }
  // автопилот (plan/14): любое действие БОССА выключает авторежим; действия виртуальной
  // мыши помечены autopilot:true и не выключают. take_control — с реакцией чата.
  // PLAN-24: set_ui (фон/раскладка окон) — тоже не «действие босса»: перетаскивание окна не должно сбивать автопилот
  if (!msg.autopilot && msg.type !== 'get_state' && msg.type !== 'set_speed' && msg.type !== 'set_ui' && msg.type !== 'autopilot_done' && msg.type !== 'autopilot_log' && msg.type !== 'user_typing') { // SRV-15: пауза/скорость — не «действие босса» (plan/14)
    if (s.autopilotOn) s.stopAutopilot(msg.type !== 'take_control');
  }
  if (msg.type === 'take_control') {
    s.emit();
    return;
  }
  if (msg.type === 'user_typing') {
    // SER-27: печатает игрок — просто отметка времени, игру не трогаем
    s.lastTypingAt = Date.now();
    return;
  }
  switch (msg.type) {
    case 'set_speed': {
      // SRV-01: без валидации v=0/NaN/1e9 превращался в тик каждую 1 мс и уносил партию
      const v = msg.v;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_SPEED) {
        s.lastAction = { ok: false, error: `некорректная скорость: ${String(v)}` };
        return;
      }
      s.speed = v;
      s.startTicker();
      s.emit();
      return;
    }
    case 'autopilot_log': {
      // PLAN-26: промах автопилота — просто в журнал, игру не трогаем
      if (msg.entry && typeof msg.entry === 'object') autopilotLogSink?.(msg.entry as Record<string, unknown>);
      return;
    }
    case 'autopilot_done': {
      s.autopilotStepsDone();
      return;
    }
    case 'set_ui': {
      // PLAN-24: вид рабочего стола хранится в сейве, поэтому пишем сразу (не ждём автосейва)
      s.game.ui = sanitizeUi(msg.ui, s.game.ui);
      s.saveNow(); // PLAN-24: раскладка меняется часто — сохраняем сразу, чтобы не потерять при закрытии
      s.emit();
      return;
    }
    case 'new_game': {
      // аудит-51 01-P3-6: как в sessions.create/load — уровень применяется до newGame и пишется в партию
      const diff = isDifficultyId(s.game.difficulty) ? s.game.difficulty : 'normal';
      applyDifficulty(diff);
      s.game = newGame(Math.floor(Math.random() * 99991) + 1);
      s.game.difficulty = diff;
      s.chat = resetChat();
      s.resetSession(); // SRV-09: ответы старой партии не должны прилетать в новую
      s.mailShownId = 0;
      s.syncInvalidate(); // PLAN-45: партия заменена целиком — клиентам полный снапшот
      s.setSpeed(1); // BUG-01: новая партия — чистый старт на 1× (паузу от авторежима не наследуем)
      s.saveNow();
      return;
    }
    case 'start_project': {
      const res = startProjectAction(s.game, msg.input);
      s.run(res);
      if (res.ok) {
        s.pendingPlan = null; // клик «Начать» (или таймаут) — план применён
        // M8: снимок обсуждения — карточка игры в архиве покажет, как команда решила её делать
        const recent = s.chat.msgs.slice(-10).map((m) => ({ author: m.author, text: m.text.slice(0, 300), week: m.week }));
        if (s.game.activeGame && recent.length > 0) s.game.activeGame.decisionChat = recent;
        s.pushSystem('📦 Проект стартовал: разработка началась');
        void s.generatePhase('kickoff');
        s.saveNow(); // SRV-08: дорогое действие — сразу на диск
      }
      s.emit();
      return;
    }
    case 'release': {
      const res = releaseAction(s.game);
      s.run(res);
      if (res.ok) {
        if (s.autopilotOn) s.decidedThisIdle = false; // следующую игру снова решает чат
        const g = s.game.history[s.game.history.length - 1];
        s.noteRelease(g?.score ?? 0); // PLAN-39/40: счётчики аккаунта, победа 100/100
        s.pushSystem(`🚀 Релиз! ${g ? `Рецензии: ${score100(g.score)}/100${g.score >= CONFIG.HALL_OF_FAME ? ' — ЗАЛ СЛАВЫ!' : ''}` : ''}`);
        // 11.09: в факты реакции — человеческие подписи: имя игры и жанр × тип (units в чате
        // форматируются в «241K»); без них модель считала релиз 40/40 «куцым» (диагноз по игре)
        const rg = g ? genreById(g.genreId) : undefined;
        const rt = g ? typeById(g.typeId) : undefined;
        const rc = g ? consoleDataFor(s.game, g.consoleId) : undefined;
        void s.generatePhase('release', {
          score: g?.score ?? 0,
          units: g?.units ?? 0,
          name: g?.name ?? '',
          genre: rg?.ru ?? rg?.name ?? g?.genreId ?? '',
          type: rt?.nameRu ?? rt?.name ?? g?.typeId ?? '',
          console: rc?.name ?? g?.consoleId ?? '',
        });
        void s.generatePress?.(true); // PLAN-30: тексты 10 критиков (фолбэки уже в сейве)
        s.saveNow(); // SRV-08: дорогое действие — сразу на диск
      }
      s.emit();
      return;
    }
    case 'search': {
      // M7: платный поиск — деньги списываются сразу, список живёт в сейве
      const res = searchAction(s.game, msg.method);
      s.run(res);
      if (res.ok) s.saveNow();
      s.emit();
      return;
    }
    case 'hire': {
      const res = hireFromSearchAction(s.game, msg.staffId);
      s.run(res);
      if (res.ok) s.saveNow(); // SRV-08: найм оплачен — сохраняем сразу
      // новичок представляется в чате
      if (res.ok && res.staffId) {
        const hired = s.game.staff.find((x) => x.id === res.staffId);
        if (hired) void s.generatePhase('hire', { hireName: hired.name }, hired.name);
      }
      s.emit();
      return;
    }
    case 'fire':
      s.run(fireAction(s.game, msg.staffId));
      s.emit();
      return;
    case 'partner_buyout':
      // PLAN-48: расставание с партнёром — выкуп доли (D% кассы разом)
      s.run(partnerBuyoutAction(s.game));
      s.emit();
      return;
    case 'partner_rent':
      // PLAN-48: расставание с партнёром — рента (D/4 % продаж игр навсегда)
      s.run(partnerRentAction(s.game));
      s.emit();
      return;
    case 'buy_license': {
      const res = buyLicenseAction(s.game, msg.consoleId);
      s.run(res);
      if (res.ok) {
        s.pushSystem('🔑 Куплена лицензия на консоль');
        s.saveNow(); // SRV-08: дорогое действие — сразу на диск
      }
      s.emit();
      return;
    }
    case 'resolve_boost': {
      const ev = s.game.pendingEvent;
      const res = resolveBoostAction(s.game, msg.accept, msg.amount ?? (ev?.type === 'boost' ? ev.cost : undefined));
      s.run(res);
      // чат должен знать РЕАЛЬНЫЙ результат: смотрим outcome события-результата
      const outcome = s.game.pendingEvent?.type === 'boost_result' ? s.game.pendingEvent.outcome : undefined;
      if (ev?.type === 'boost' && msg.accept) {
        s.pushSystem('💪 Улучшение применено');
        if (outcome) void s.generatePhase('boost', { outcome });
      }
      s.emit();
      return;
    }
    case 'resolve_salesman':
      dismissSalesmanAction(s.game);
      s.emit();
      return;
    case 'resolve_gamedex': {
      // SRV-18: option приходит из сети — сверяем со списком стендов, а не кастуем вслепую
      if (!(msg.option in CONFIG.GAMEDEX_OPTIONS)) {
        s.lastAction = { ok: false, error: `Неизвестный стенд: ${String(msg.option)}` };
        s.emit();
        return;
      }
      s.run(resolveGamedexAction(s.game, msg.option as GamedexOption));
      s.emit(); // SRV-10: на паузе без emit() клиент не видел снятие события
      return;
    }
    case 'resolve_minigame': {
      // PLAN-39: результат врезки или досрочное закрытие (максимальный штраф) — считает движок
      s.run(resolveMinigameAction(s.game, Number(msg.pct) || 0, msg.closed === true));
      s.emit();
      return;
    }
    case 'resolve_story': {
      // PLAN-44: выбор в сюжетной арке — вариант сверяет движок (список опций в STORY_ARCS)
      s.run(resolveStoryAction(s.game, String(msg.option ?? '')));
      s.emit(); // SRV-10: на паузе без emit() клиент не видел снятие события
      return;
    }
    case 'resolve_saga': {
      // PLAN-49: выбор в главе саги — вариант сверяет движок (узлы в SAGA_NODES)
      s.run(resolveSagaAction(s.game, String(msg.option ?? '')));
      s.emit(); // SRV-10: на паузе без emit() клиент не видел снятие события
      return;
    }
    case 'resolve_finale': {
      // аудит-51 05-P2-6: «Играть дальше» на экране итогов — снять попап, партия продолжается
      s.run(resolveFinaleAction(s.game));
      s.emit();
      return;
    }
    case 'intro_done': {
      // аудит-51 P1-11: игрок закрыл приветствие новой партии — больше не показываем
      introSeenAction(s.game);
      s.emit();
      return;
    }
    case 'resolve_event':
      resolveEventAction(s.game);
      s.emit();
      return;
    case 'generate_story':
      s.runStory(msg);
      return;
    case 'get_state':
      s.emit();
      return;
    // M3
    case 'level_up':
      s.run(levelUpAction(s.game, msg.staffId));
      s.emit();
      return;
    case 'train':
      s.run(trainAction(s.game, msg.staffId, msg.trainingId));
      s.emit();
      return;
    // PLAN-41: окно сотрудника — отпуск и автотренировка до порогов
    case 'rest_staff': {
      const res = restStaffAction(s.game, msg.staffId);
      s.run(res);
      if (res.ok) {
        const rested = s.game.staff.find((x) => x.id === msg.staffId);
        if (rested) s.pushSystem(`🧳 ${rested.name} ${gform('ушёл/ушла', rested.gender)} в отпуск — через ${CONFIG.REST_DAYS} дн. вернётся с полным POWER`);
      }
      s.emit();
      return;
    }
    case 'train_to_max':
      s.run(trainToMaxAction(s.game, msg.staffId));
      s.emit();
      return;
    // игрок пишет в чат → команда отвечает серией реплик (по одной, по очереди)
    case 'chat_message': {
      // аудит-51 02-P2-8: не чаще 6 сообщений/мин — серия ответов команды это LLM-нагрузка
      const nowTs = Date.now();
      const times = (chatMsgTimes.get(s) ?? []).filter((t) => nowTs - t < 60_000);
      if (times.length >= 6) {
        s.pushSystem('Команда не успевает отвечать — подождите минуту.');
        s.emit();
        return;
      }
      times.push(nowTs);
      chatMsgTimes.set(s, times);
      const text = msg.text.trim().slice(0, 400);
      if (text.length >= 2) {
        if (s.game.staff.length === 0) {
          s.pushSystem('Пока некому отвечать — наймите первого сотрудника в окне «Найм».');
        } else {
          // PLAN-48: игрок подписан именем ГГ (не «Вы»); у старых партий имя не задано — «Вы»
          const author = s.game.staff.find((x) => x.hero)?.name ?? 'Вы';
          s.chat.msgs.push({ week: s.game.week, author, avatar: '', text, trigger: 'week' });
          s.queuePlayerMessage(text); // SRV-11: FIFO — все вопросы будут отвечены
        }
      }
      s.emit();
      return;
    }
    case 'buy_booster': {
      const res = buyBoosterAction(s.game, msg.booster);
      s.run(res);
      if (res.ok) s.pushSystem(`🧪 Куплен бустер (${msg.booster}) — примените в окне «Код»`);
      s.emit();
      return;
    }
    case 'use_booster':
      s.run(applyBoosterAction(s.game, msg.staffId, msg.booster));
      s.emit();
      return;
    case 'buy_dead_bull':
      s.run(buyDeadBullAction(s.game, msg.staffId));
      s.emit();
      return;
    case 'buy_career_manual':
      s.run(buyCareerManualAction(s.game));
      s.emit();
      return;
    case 'apply_career_manual':
      s.run(applyCareerManualAction(s.game, msg.staffId, msg.target));
      s.emit();
      return;
    case 'move_office': {
      const res = moveOfficeAction(s.game);
      s.run(res);
      if (res.ok) s.saveNow(); // SRV-08: дорогое действие — сразу на диск
      s.emit();
      return;
    }
    // M4
    case 'buy_ad':
      s.run(buyAdAction(s.game, msg.adId));
      s.emit();
      return;
    case 'take_contract':
      s.run(takeContractAction(s.game, msg.contractId, msg.staffIds));
      s.emit();
      return;
    case 'start_own_console': {
      const res = startOwnConsoleAction(s.game, msg.name, msg.kind, msg.cpu, msg.media);
      s.run(res);
      if (res.ok) s.saveNow(); // SRV-08: дорогое действие — сразу на диск
      s.emit();
      return;
    }
    default: {
      // SRV-18: сообщение неизвестного типа не глотаем молча — клиент получит ошибку
      const t = (msg as { type?: string }).type;
      s.lastAction = { ok: false, error: `Неизвестное действие: ${String(t)}` };
      s.emit();
      return;
    }
  }
}
