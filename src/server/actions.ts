// SRV-22 (Ф3, шаг 2): ActionDispatcher — обработка действий клиента.
// Вынесено из game.ts; GameServer.handle() делегирует сюда.
// SessionHost — контракт сессии: публичные «внутренности» GameServer (намеренно, ради этого модуля).
import { CONFIG } from '../core/config';
import { consoleById, genreById, typeById } from '../core/data/db';
import {
  buyLicenseAction, buyAdAction, buyBoosterAction, buyCareerManualAction, buyDeadBullAction,
  changeCareerAction, dismissSalesmanAction, fireAction, searchAction, hireFromSearchAction, levelUpAction, moveOfficeAction, newGame,
  releaseAction, resolveBoostAction, resolveEventAction, resolveGamedexAction, startOwnConsoleAction, startProjectAction,
  takeContractAction, trainAction, applyBoosterAction,
} from '../core/engine';
import type { GamedexOption, GameState } from '../core/types';
import { sanitizeUi } from './ui-state';
import { resetChat, type ChatState } from '../shared/chat';
import type { AutopilotPlan } from '../shared/autopilot';
import type { ClientAction } from './game';
import { score100 } from '../shared/rules';

// аудит 09.09 (SRV-01): скорость — конечное число в [0..MAX_SPEED]; иначе Math.round(1000/v)=0 → тик каждую 1 мс
export const MAX_SPEED = 8;

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
  /** SER-27: время последнего «печатает» (панель разговоров) */
  lastTypingAt: number;
  lastAction: { ok: boolean; error?: string } | null;
  pendingPlan: AutopilotPlan | null;
  decidedThisIdle: boolean;
  mailShownId: number;
  run(res: ActionOutcome): void;
  emit(): void;
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
      s.game = newGame(Math.floor(Math.random() * 99991) + 1);
      s.chat = resetChat();
      s.resetSession(); // SRV-09: ответы старой партии не должны прилетать в новую
      s.setSpeed(1); // BUG-01: новая партия — чистый старт на 1× (паузу от авторежима не наследуем)
      s.mailShownId = 0;
      s.saveNow();
      s.emit();
      return;
    }
    case 'start_project': {
      const res = startProjectAction(s.game, msg.input);
      s.run(res);
      if (res.ok) {
        s.pendingPlan = null; // клик «Начать» (или таймаут) — план применён
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
        s.pushSystem(`🚀 Релиз! ${g ? `Рецензии: ${score100(g.score)}/100${g.score >= CONFIG.HALL_OF_FAME ? ' — ЗАЛ СЛАВЫ!' : ''}` : ''}`);
        // 11.09: в факты реакции — человеческие подписи: имя игры и жанр × тип (units в чате
        // форматируются в «241K»); без них модель считала релиз 40/40 «куцым» (диагноз по игре)
        const rg = g ? genreById(g.genreId) : undefined;
        const rt = g ? typeById(g.typeId) : undefined;
        const rc = g ? consoleById(g.consoleId) : undefined;
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
    // игрок пишет в чат → команда отвечает серией реплик (по одной, по очереди)
    case 'chat_message': {
      const text = msg.text.trim().slice(0, 400);
      if (text.length >= 2) {
        if (s.game.staff.length === 0) {
          s.pushSystem('Пока некому отвечать — наймите первого сотрудника в окне «Найм».');
        } else {
          s.chat.msgs.push({ week: s.game.week, author: 'Вы', avatar: '', text, trigger: 'week' });
          s.queuePlayerMessage(text); // SRV-11: FIFO — все вопросы будут отвечены
        }
      }
      s.emit();
      return;
    }
    case 'change_career':
      s.run(changeCareerAction(s.game, msg.staffId, msg.target));
      s.emit();
      return;
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
      s.run(buyCareerManualAction(s.game, msg.staffId, msg.target));
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
