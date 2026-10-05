// PLAN-49 (Э1): тексты саги «Синяя Комета» для клиента — резолв абзацев (слоты, родовые пары,
// {Роль} → имя) и проверка условий вариантов. Чистый модуль: принимает структурный срез игры
// (SagaTextSource), поэтому им пользуются и движок (core/systems/saga.ts), и попап в браузере.
import { CONFIG } from '../core/config';
import { applyGenderSlots, type Gender } from './gender';
import type { SagaCond, SagaNode } from './saga-data';
/** Роли саги, которые берутся из штата (порядок раздачи — как в списке). */
export const SAGA_STAFF_ROLES = ['Скептик', 'Мечтатель', 'Технарь', 'Юрист', 'Финдир'] as const;

/** Минимальный срез игры, который нужен текстам и условиям: сага, штат, фанаты, деньги. */
export interface SagaTextSource {
  fans: number;
  /** день игры (для числовых подстановок Э3: «эпоха», «прошло») */
  week?: number;
  /** деньги студии, K (условия «касса тонка/полна»: moneyMax/moneyMin) */
  money?: number;
  staff: Array<{
    name: string;
    gender: Gender;
    hero?: boolean;
    activeCareer?: string;
    partnerPct?: number;
  }>;
  saga?: {
    flags: string[];
    roles?: Record<string, { name: string; gender: Gender }>;
    /** скрытые шкалы: noise, conscience, culture, biz */
    scales?: Record<string, number>;
    /** Э3: день старта саги и точка предыдущего показа — для {≈эпоха}/{≈прошло} */
    startWeek?: number;
    lastWeek?: number;
    lastGap?: number;
  };
}

function heroOf(src: SagaTextSource) {
  return src.staff.find((s) => s.hero);
}

function partnerOf(src: SagaTextSource) {
  return src.staff.find((s) => typeof s.partnerPct === 'number');
}

/** Условие варианта/вставки: флаг, отсутствие флага, порог фанатов, профессия героя,
 *  деньги (касса) и скрытые шкалы (ШУМ, СОВЕСТЬ). Все указанные ключи — логическое И. */
export function sagaCondOk(src: SagaTextSource, cond?: SagaCond): boolean {
  if (!cond) return true;
  if (cond.flag && !src.saga?.flags.includes(cond.flag)) return false;
  if (cond.notFlag && src.saga?.flags.includes(cond.notFlag)) return false;
  if (cond.notFlags?.length && cond.notFlags.some((f) => src.saga?.flags.includes(f))) return false;
  if (cond.flagsAll?.length && !cond.flagsAll.every((f) => src.saga?.flags.includes(f))) return false;
  if (cond.flagsAny?.length && !cond.flagsAny.some((f) => src.saga?.flags.includes(f))) return false;
  if (cond.flagsCount && (cond.flagsCount.any ?? []).filter((f) => src.saga?.flags.includes(f)).length < cond.flagsCount.min) return false;
  if (cond.fansMin && (src.fans ?? 0) < CONFIG.SAGA.FANS_MIN) return false;
  if (cond.heroJob) {
    const job = heroOf(src)?.activeCareer ?? null;
    const arr = Array.isArray(cond.heroJob) ? cond.heroJob : [cond.heroJob];
    if (job == null || !arr.includes(job)) return false;
  }
  const sc = src.saga?.scales ?? {};
  if (cond.moneyMin != null && (src.money ?? 0) < cond.moneyMin) return false;
  if (cond.moneyMax != null && (src.money ?? 0) > cond.moneyMax) return false;
  if (cond.noiseMin != null && (sc['noise'] ?? 0) < cond.noiseMin) return false;
  if (cond.noiseMax != null && (sc['noise'] ?? 0) > cond.noiseMax) return false;
  if (cond.conscienceMin != null && (sc['conscience'] ?? 0) < cond.conscienceMin) return false;
  if (cond.conscienceMax != null && (sc['conscience'] ?? 0) > cond.conscienceMax) return false;
  return true;
}

/** Имена и роды ролей для подстановки: роли штата, Герой, Партнёр. */
export function sagaNameMaps(src: SagaTextSource): {
  names: Record<string, string>;
  genders: Record<string, Gender>;
} {
  const names: Record<string, string> = {};
  const genders: Record<string, Gender> = {};
  const roles = src.saga?.roles ?? {};
  for (const role of SAGA_STAFF_ROLES) {
    const r = roles[role];
    names[role] = r?.name ?? 'Сотрудник';
    if (r) genders[role] = r.gender;
  }
  const hero = heroOf(src);
  names['Герой'] = hero?.name ?? 'Вы';
  if (hero) genders['Герой'] = hero.gender;
  const pRef = roles['Партнёр'];
  const pStaff = partnerOf(src);
  names['Партнёр'] = pRef?.name ?? pStaff?.name ?? 'Партнёр';
  const pg = pRef?.gender ?? pStaff?.gender;
  if (pg) genders['Партнёр'] = pg;
  return { names, genders };
}

/**
 * Резолв абзаца саги: слоты {key} → первый подходящий по условию фрагмент; родовые пары
 * (в т.ч. без @ — род говорящего в «{Роль}: …»); затем {Роль} → имя сотрудника.
 * Плейсхолдеры [N]/[СУММА] не трогаем (этап чисел, plan/49).
 */
export function sagaResolveText(text: string, node: SagaNode | undefined, src: SagaTextSource): string {
  const { names, genders } = sagaNameMaps(src);
  let t = text;
  if (node?.slots) {
    for (const [key, arr] of Object.entries(node.slots)) {
      const token = `{${key}}`;
      if (!t.includes(token)) continue;
      const v = arr.find((x) => !x.when || sagaCondOk(src, x.when));
      t = t.split(token).join(v?.text ?? '…');
    }
  }
  // Э3 (числа): {≈эпоха} — «коробке/истории» на момент главы (1983 + 40 лет к старту саги);
  // {≈прошло} — пауза от предыдущего показанного узла («Проходит N лет» в интерлюдиях);
  // {≈далее} — дней до следующей главы (пейсер) для «пророчеств» (S19/S20b).
  t = t.replace(/\{≈(эпоха|прошло|далее)\}/g, (_w, key: string) => {
    if (key === 'эпоха') {
      const wk = src.week ?? 0;
      const st = src.saga?.startWeek ?? wk;
      return ruYears(40 + Math.max(0, Math.round((wk - st) / 365)));
    }
    if (key === 'прошло') return ruYears(Math.max(0, Math.round((src.saga?.lastGap ?? 0) / 365)));
    const nxt = node?.choices?.[0]?.to;
    return nxt && sagaTopChapter(nxt) ? ruDays(sagaHoldDays(nxt)) : 'несколько дней';
  });
  const m = /^\s*\{([^{}]+)\}[^:«„]*:\s*[«„]/.exec(t);
  const speakerG = m ? genders[m[1]!.trim()] : undefined;
  t = applyGenderSlots(t, genders, speakerG ?? null);
  t = t.replace(/\{([^{}\/@]+)\}/g, (whole, key: string) => {
    const k = String(key).trim();
    return k in names ? names[k]! : whole;
  });
  return t;
}

/** «Крупная» глава верхнего уровня (S2, S5…): не под-узел (S1a, S6b). */
export function sagaTopChapter(id: string): boolean {
  return /^S\d+$/.test(id);
}

/** Интерлюдия между актами (i1–i4): большой скачок времени (Э3). */
export function sagaIsInterlude(id: string): boolean {
  return /^i\d+$/.test(id);
}

/** Пауза перед узлом, дней — детерминированно от id (единый источник для движка и текстов).
 *  Интерлюдии (i1–i5) целятся в канонные годы актов: пауза = цель − текущий день − пауза
 *  следующей главы (CONFIG.SAGA.HOLD_INT_ACTS): акты встают на 0/6/12/17/22/26 при любом темпе. */
export function sagaHoldDays(id: string, weekNow = 0): number {
  const spec = sagaIsInterlude(id) ? CONFIG.SAGA.HOLD_INT_ACTS[id] : undefined;
  if (spec) return Math.max(180, spec.at * 365 - weekNow - sagaHoldDays(spec.next));
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return CONFIG.SAGA.HOLD_MIN + (Math.abs(h) % CONFIG.SAGA.HOLD_SPAN);
}

/** Русское склонение с числом: ruPlural(5, 'год', 'года', 'лет') → «5 лет». */
function ruPlural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** «40 лет» / «41 год» — числовые подстановки Э3. */
export function ruYears(n: number): string {
  return ruPlural(n, 'год', 'года', 'лет');
}

/** «196 дней» / «181 день». */
export function ruDays(n: number): string {
  return ruPlural(n, 'день', 'дня', 'дней');
}
