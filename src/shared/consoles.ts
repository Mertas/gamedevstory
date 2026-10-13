// ─── Общее для движка и UI: даты консолей, пороги событийных консолей, столы своей консоли ───
import { CONFIG } from '../core/config';

// Календарь игры: 1 апреля 1985 = день 1; год = 365 дней; месяцы апрель..март.
export const MONTH_OFFSETS = [0, 30, 61, 91, 122, 153, 183, 214, 244, 275, 306, 334];

/** [год, месяц (1=апрель), день] → абсолютный игровой день. */
export function dateToDay(date: [number, number, number]): number {
  return (date[0] - 1) * CONFIG.YEAR_LENGTH + (MONTH_OFFSETS[date[1] - 1] ?? 0) + date[2];
}

/** Пороги событийных консолей (единый источник для движка и окна «Железо»). */
export const EVENT_CONSOLE_REQ: Record<string, { grand: number; units?: number }> = {
  'jupiter-512': { grand: CONFIG.GRAND_CONSOLE_JUPITER },
  gamejohn: { grand: CONFIG.GRAND_CONSOLE_GAMEJOHN, units: CONFIG.GAMEJOHN_UNITS_K },
};

// ─── аудит-51 05-P3-1: локализация имён консолей (plan/11 §2 — пародийные клоны) ───
export const CONSOLE_RU: Record<string, string> = {
  'pc-game': 'ПК',
  'microx-sx': 'Микрокс-СХ',
  exodus: 'МегаВолна',
  ies: 'Фамикон-8',
  'game-kid': 'Карманник',
  'play-gear': 'Карманник-Цвет',
  'pcc-fqx': 'ПК-Эф',
  neongeon: 'НеоНеон',
  'game-swan': 'Лебедь-1',
  'super-ies': 'СуперТендо',
  'virtual-kid': 'Виртуал-очки',
  playstatus: 'ПлейСтейд',
  playdion: 'ПлейДиск',
  uranus: 'Сатурн-2',
  'game-box': 'КубоБокс',
  'mini-status': 'МиниПлей',
  'intendro-dm': 'Тендо-ДС',
  'playstatus-2': 'ПлейСтейд-2',
  'microx-480': 'Микрокс-480',
  whoops: 'Вжух',
  'harpo-drive': 'ХарпоДрайв',
  'play-popo-x': 'ПлейПопо-Икс',
  'jupiter-512': 'Марсоход-512',
  gamejohn: 'ТронЗов',
};

/** Имя консоли по-русски; неизвестный id — запасное имя (как в контенте). */
export function consoleRu(id: string, fallback: string): string {
  return CONSOLE_RU[id] ?? fallback;
}

// ─── своя консоль: компоненты — единый источник для движка (списание) и формы (смета) ───
export const OWN_CONSOLE_TYPES = [
  { id: 'console', label: 'Стационарная', cost: 6000 },
  { id: 'portable', label: 'Портативная', cost: 4000 },
] as const;

export const OWN_CONSOLE_CPUS = [
  { id: '16-bit', label: '16-бит чип', cost: 1000, hw: 1 },
  { id: '32-bit', label: '32-бит чип', cost: 10000, hw: 1 },
  { id: '64-bit', label: '64-бит чип', cost: 50000, hw: 1 },
  { id: 'potato-chip', label: 'Чип «Картошка»', cost: 90000, hw: 4 },
] as const;

export const OWN_CONSOLE_MEDIA = [
  { id: 'cartridge', label: 'Картридж', cost: 3000, hw: 1 },
  { id: 'cd', label: 'CD-ROM', cost: 5000, hw: 1 },
  { id: 'dvd', label: 'DVD-ROM', cost: 15000, hw: 1 },
  { id: 'bd', label: 'BD-ROM', cost: 35000, hw: 1 },
  { id: 'punch-cards', label: 'Перфокарты', cost: 93999.9, hw: 6 },
] as const;

/** Срок разработки своей консоли в днях: базовый + надбавка за «индекс» чипа и носителя. */
export function ownConsoleDays(cpuIdx: number, mediaIdx: number): number {
  return (CONFIG.OWN_CONSOLE_WEEKS_BASE + (cpuIdx + mediaIdx) * CONFIG.OWN_CONSOLE_WEEKS_PER_INDEX) * 7;
}

// ─── своя консоль: сила платформы от компонентов (решение игрока 27.09: «сила зависит от вложений») ───
/** Множитель своей консоли: ×8 (16-бит + картридж) … ×29 (Картошка + Перфокарты). */
export function ownConsoleCostMult(cpuIdx: number, mediaIdx: number): number {
  return 8 + 3 * (cpuIdx + mediaIdx);
}

/** Множитель по id компонентов; старые сейвы без них — базовая сборка (×8). */
export function ownConsoleMult(cpu?: string, media?: string): number {
  const ci = OWN_CONSOLE_CPUS.findIndex((c) => c.id === cpu);
  const mi = OWN_CONSOLE_MEDIA.findIndex((m) => m.id === media);
  if (ci < 0 || mi < 0) return ownConsoleCostMult(0, 0);
  return ownConsoleCostMult(ci, mi);
}

/** Стартовая база своей консоли: фанаты студии покупают её (фанаты/25, без потолка — решение игрока 27.09). */
export function ownConsoleStartBase(fans: number): number {
  return Math.floor(fans / 25);
}
