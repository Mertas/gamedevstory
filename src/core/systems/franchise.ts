// PLAN-52 M1/M2: франшизы, сила бренда и мерч (медиа-империя).
// Идея: игра с оценкой 80+ — это франшиза; сиквелы и забвение двигают силу бренда;
// линии мерча (по эпохам: фигурки → плюш → футболки → карточки) дают пассив от фанатов;
// с 1996-го по карточной линии раз в квартал вскрывается пак коллекционных карточек.
// Слой над базовым циклом — формулы продаж и разработки не трогает.
import { CONFIG } from '../config';
import { log } from '../log';
import { comboKey } from '../../shared/rank';
import type { Rng } from '../rng';
import type {
  ActionResult,
  CardRarity,
  Franchise,
  GameState,
  MerchBudgetId,
  MerchLineId,
} from '../types';

/** источник записи о релизе (GameRecord подходит) — всё, что нужно франшизе */
export interface FranchiseSource {
  name: string;
  genreId: string;
  typeId: string;
  score: number;
  releaseWeek: number;
}

const clampBrand = (v: number) => Math.max(0, Math.min(100, v));

/** Календарный год работы студии: 1 апреля 1985 — год 1 (по нему открываются эпохи). */
export function studioYear(state: GameState): number {
  return 1985 + Math.floor((state.week - 1) / CONFIG.YEAR_LENGTH);
}

/**
 * Применить релиз к карте франшиз. Новый сильный релиз рождает франшизу; повтор комбо —
 * сиквел (успех растит бренд, провал — рушит). Возвращает 'born' для лога.
 * Экспортируется для миграции: старые сейвы пересобираются этим же путём.
 */
export function applyFranchiseRelease(map: Record<string, Franchise>, rec: FranchiseSource): 'born' | 'updated' | null {
  const key = comboKey(rec.genreId, rec.typeId);
  const f = map[key];
  if (!f) {
    // франшизу рожают только сильные игры; слабее — «крепкий продукт», проходят мимо
    if (rec.score < CONFIG.FRANCHISE_MIN_SCORE) return null;
    map[key] = {
      name: rec.name,
      genreId: rec.genreId,
      typeId: rec.typeId,
      brand: rec.score,
      bornWeek: rec.releaseWeek,
      lastReleaseWeek: rec.releaseWeek,
      releases: [{ name: rec.name, week: rec.releaseWeek, score: rec.score }],
      merch: null,
      decayed: 0,
    };
    return 'born';
  }
  f.releases.push({ name: rec.name, week: rec.releaseWeek, score: rec.score });
  if (rec.releaseWeek >= f.lastReleaseWeek) f.lastReleaseWeek = rec.releaseWeek;
  const d = rec.score - CONFIG.FRANCHISE_MIN_SCORE;
  f.brand = clampBrand(f.brand + (d >= 0 ? d * CONFIG.FRANCHISE_BRAND_GAIN : d * CONFIG.FRANCHISE_BRAND_LOSS));
  f.decayed = 0; // свежий релиз сбрасывает счётчик забвения
  return 'updated';
}

/** Сейв без франшиз (старые партии и миграция v19): вывести их из архива игр целиком. */
export function buildFranchises(state: GameState): Record<string, Franchise> {
  const out: Record<string, Franchise> = {};
  // история хранится в порядке выхода игр — сиквелы ложатся на живую карту
  for (const h of state.history) applyFranchiseRelease(out, h);
  return out;
}

/** Релиз игры игрока (зовётся из releaseGame после записи в history). */
export function onGameReleased(state: GameState, rec: FranchiseSource): void {
  // страховка для партий без миграции (тесты, ручные state): собрать из архива до записи
  state.franchises ??= buildFranchises(state);
  const res = applyFranchiseRelease(state.franchises, rec);
  if (res === 'born') {
    log(state, `«${rec.name}» стала франшизой — фанаты ждут продолжения!`);
  }
}

/** Ежедневно: забвение — −1 к бренду за каждые 52 недели без релиза франшизы. */
export function tickFranchises(state: GameState): void {
  const map = state.franchises;
  if (!map) return;
  for (const f of Object.values(map)) {
    // PLAN-52 M2b: эфир сериала освежает серию — забвение идёт от последнего показа
    const idle = state.week - Math.max(f.lastReleaseWeek, f.lastShowWeek ?? 0);
    const fullYears = Math.floor(idle / CONFIG.YEAR_LENGTH);
    while (f.decayed < fullYears) {
      f.decayed += 1;
      f.brand = clampBrand(f.brand - CONFIG.FRANCHISE_IDLE_DECAY);
    }
  }
}

// ─── PLAN-52 M2: линии мерча ───

/** Доступна ли линия по эпохе (календарному году студии). */
export function merchLineUnlocked(state: GameState, line: MerchLineId): boolean {
  return studioYear(state) >= CONFIG.MERCH_LINES[line].unlockYear;
}

/** Сколько линий мерча можно держать одновременно: по офису, после финала партии — восемь. */
export function merchSlots(state: GameState): number {
  if (state.finale) return CONFIG.MERCH_SLOTS_FINALE;
  return CONFIG.MERCH_SLOTS_BY_OFFICE[state.officeLevel - 1] ?? 2;
}

/** Сколько линий мерча уже в работе. */
export function activeMerchLines(state: GameState): number {
  let n = 0;
  for (const f of Object.values(state.franchises ?? {})) if (f.merch) n += 1;
  return n;
}

/** Цена запуска линии с учётом вложений (K). */
export function merchStartCost(line: MerchLineId, budget: MerchBudgetId): number {
  return Math.round(CONFIG.MERCH_LINES[line].cost * CONFIG.MERCH_BUDGETS[budget].costMult);
}

/** Оценка дохода линии за неделю (K, чистыми) — общая формула запущенной и будущей линии. */
export function merchWeeklyEst(fans: number, brand: number, line: MerchLineId, budget: MerchBudgetId): number {
  const l = CONFIG.MERCH_LINES[line];
  const b = CONFIG.MERCH_BUDGETS[budget];
  const gross = (fans / CONFIG.MERCH_FANS_DIV) * (brand / CONFIG.MERCH_BRAND_DIV) * l.mult * b.incomeMult;
  return gross - l.upkeepPerDay * 7;
}

/** Доход линии за неделю (K, чистыми — содержание вычтено). */
export function merchWeekly(f: Franchise, fans: number): number {
  if (!f.merch) return 0;
  return merchWeeklyEst(fans, f.brand, f.merch.line, f.merch.budget);
}

/** Мерч: чистый доход за день от всех запущенных линий (K; с содержанием). */
export function merchDailyNet(state: GameState): number {
  const map = state.franchises;
  if (!map) return 0;
  let net = 0;
  for (const f of Object.values(map)) {
    if (!f.merch) continue;
    const line = CONFIG.MERCH_LINES[f.merch.line];
    const bud = CONFIG.MERCH_BUDGETS[f.merch.budget];
    const week = (state.fans / CONFIG.MERCH_FANS_DIV) * (f.brand / CONFIG.MERCH_BRAND_DIV) * line.mult * bud.incomeMult;
    net += week / 7;
    net -= line.upkeepPerDay;
  }
  return net;
}

/** Ежедневно: начислить чистый доход линий мерча (тихо — виден в кассе и «Империи»). */
export function tickMerch(state: GameState): void {
  const net = merchDailyNet(state);
  if (net !== 0) state.money += net;
}

/** Действие «Империи»: запустить линию мерча (тип + вложения) или остановить текущую. */
export function toggleMerch(
  state: GameState,
  key: string,
  line: MerchLineId = 'figures',
  budget: MerchBudgetId = 'norm',
): ActionResult {
  const f = state.franchises?.[key];
  if (!f) return { ok: false, error: 'Нет такой франшизы' };
  if (f.merch) {
    f.merch = null;
    f.brand = clampBrand(f.brand + CONFIG.MERCH_BRAND_ON_STOP);
    log(state, `Линия мерча «${f.name}» остановлена — фанаты поскучают`);
    return { ok: true };
  }
  if (f.brand < CONFIG.MERCH_MIN_BRAND) {
    return { ok: false, error: `Бренд слабоват: для линии нужно ${CONFIG.MERCH_MIN_BRAND}+` };
  }
  const def = CONFIG.MERCH_LINES[line];
  if (!merchLineUnlocked(state, line)) {
    return { ok: false, error: `«${def.name}» появятся в ${def.unlockYear}-м — время ещё не пришло` };
  }
  const slots = merchSlots(state);
  if (activeMerchLines(state) >= slots) {
    return { ok: false, error: `Все линии заняты (${slots}) — сначала остановите другую` };
  }
  const cost = merchStartCost(line, budget);
  if (state.money < cost) {
    return { ok: false, error: `Не хватает на запуск (нужно ${cost}K)` };
  }
  state.money -= cost;
  f.merch = { startedWeek: state.week, line, budget };
  f.brand = clampBrand(f.brand + CONFIG.MERCH_BUDGETS[budget].brandOnStart);
  log(state, `«${f.name}»: линия «${def.name}» пошла в магазины!`);
  return { ok: true };
}

// ─── PLAN-52 M2: паки коллекционных карточек (по линии «карточки», с 1996) ───

/** Строка таблицы пака по броску: полосы сверху вниз (сумма шансов = 1). */
type CardPackRow = (typeof CONFIG.CARD_PACK_TABLE)[number];

function rollCard(rng: Rng): CardPackRow {
  const r = rng.next();
  let acc = 0;
  for (const row of CONFIG.CARD_PACK_TABLE) {
    acc += row.chance;
    if (r < acc) return row;
  }
  // сумма полос = 1 — сюда не попадаем; ветка нужна только типам
  return { rarity: 'common', chance: 0.7, fansPct: 0.01, fansMin: 120, brand: 0 };
}

/** Через сколько недель будет доступен новый пак (0 — можно вскрывать сейчас). */
export function cardPackWait(state: GameState): number {
  const lastWeek = state.cards?.lastWeek ?? -9999;
  return Math.max(0, lastWeek + CONFIG.CARD_PACK_COOLDOWN - state.week);
}

/** Действие «Империи»: вскрыть пак карточек по франшизе с активной линией карточек. */
export function openCardPack(state: GameState, key: string, rng: Rng): ActionResult {
  const f = state.franchises?.[key];
  if (!f) return { ok: false, error: 'Нет такой франшизы' };
  if (f.merch?.line !== 'cards') {
    return { ok: false, error: 'Паки вскрывают по франшизе с линией коллекционных карточек' };
  }
  const wait = cardPackWait(state);
  if (wait > 0) return { ok: false, error: `Свежие паки будут через ${wait} нед.` };
  if (state.money < CONFIG.CARD_PACK_COST) {
    return { ok: false, error: `Не хватает на пак (нужно ${CONFIG.CARD_PACK_COST}K)` };
  }
  state.money -= CONFIG.CARD_PACK_COST;

  const cards: { rarity: CardRarity; name: string }[] = [];
  let gained = 0;
  let brand = 0;
  for (let i = 0; i < CONFIG.CARD_PACK_SIZE; i++) {
    const row = rollCard(rng);
    const rarity = row.rarity as CardRarity;
    // на карте — игра серии (случайная из вышедших): у коллекции есть имена
    const rel = f.releases.length > 0 ? f.releases[rng.int(0, f.releases.length - 1)] : undefined;
    cards.push({ rarity, name: rel?.name ?? f.name });
    gained += Math.max(Math.round(state.fans * row.fansPct), row.fansMin);
    brand += row.brand;
  }
  state.fans += gained;
  f.brand = clampBrand(f.brand + brand);
  state.cards = state.cards ?? { lastWeek: -9999, last: null };
  state.cards.lastWeek = state.week;
  state.cards.last = { week: state.week, franchiseKey: key, cards, fansGained: gained, brandGained: brand, acked: false };

  const legends = cards.filter((c) => c.rarity === 'legend').length;
  if (legends > 0) {
    log(state, `«${f.name}»: в паке ЛЕГЕНДАРНАЯ карта! Мем ушёл в народ — +${gained} фанатов`);
  } else {
    log(state, `«${f.name}»: пак карточек вскрыт — +${gained} фанатов`);
  }
  return { ok: true };
}

/** Мини-окно вскрытия просмотрено — второй раз не показываем. */
export function ackCardPack(state: GameState): void {
  if (state.cards?.last) state.cards.last.acked = true;
}
