// PLAN-52 M1: франшизы и сила бренда + минимальный мерч (медиа-империя, этап 1).
// Идея: игра с оценкой 80+ — это франшиза; сиквелы и забвение двигают силу бренда;
// запущенная линия мерча даёт пассив от фанатов. Слой над базовым циклом — формулы
// продаж и разработки не трогает.
import { CONFIG } from '../config';
import { log } from '../log';
import { comboKey } from '../../shared/rank';
import type { ActionResult, Franchise, GameState } from '../types';

/** источник записи о релизе (GameRecord подходит) — всё, что нужно франшизе */
export interface FranchiseSource {
  name: string;
  genreId: string;
  typeId: string;
  score: number;
  releaseWeek: number;
}

const clampBrand = (v: number) => Math.max(0, Math.min(100, v));

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
    const idle = state.week - f.lastReleaseWeek;
    const fullYears = Math.floor(idle / CONFIG.YEAR_LENGTH);
    while (f.decayed < fullYears) {
      f.decayed += 1;
      f.brand = clampBrand(f.brand - CONFIG.FRANCHISE_IDLE_DECAY);
    }
  }
}

/** Мерч: чистый доход за день от всех запущенных линий (K; с содержанием). */
export function merchDailyNet(state: GameState): number {
  const map = state.franchises;
  if (!map) return 0;
  let net = 0;
  for (const f of Object.values(map)) {
    if (!f.merch) continue;
    net += (state.fans / CONFIG.MERCH_FANS_DIV) * (f.brand / CONFIG.MERCH_BRAND_DIV) / 7; // K/нед → в день
    net -= CONFIG.MERCH_UPKEEP_PER_DAY;
  }
  return net;
}

/** Ежедневно: начислить чистый доход линий мерча (тихо — виден в кассе и «Империи»). */
export function tickMerch(state: GameState): void {
  const net = merchDailyNet(state);
  if (net !== 0) state.money += net;
}

/** Мерч: доход линии конкретной франшизы за неделю (K; для UI). */
export function merchWeekly(f: Franchise, fans: number): number {
  return (fans / CONFIG.MERCH_FANS_DIV) * (f.brand / CONFIG.MERCH_BRAND_DIV) - CONFIG.MERCH_UPKEEP_PER_DAY * 7;
}

/** Действие «Империи»: запустить/остановить линию мерча на франшизе. */
export function toggleMerch(state: GameState, key: string): ActionResult {
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
  if (state.money < CONFIG.MERCH_START_COST) {
    return { ok: false, error: `Не хватает на запуск (нужно ${CONFIG.MERCH_START_COST}K)` };
  }
  state.money -= CONFIG.MERCH_START_COST;
  f.merch = { startedWeek: state.week, line: 'figures' };
  f.brand = clampBrand(f.brand + CONFIG.MERCH_BRAND_ON_START);
  log(state, `Линия мерча «${f.name}»: фигурки пошли в магазины!`);
  return { ok: true };
}
