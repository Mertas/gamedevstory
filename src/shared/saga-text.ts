// PLAN-49 (Э1): тексты саги «Синяя Комета» для клиента — резолв абзацев (слоты, родовые пары,
// {Роль} → имя) и проверка условий вариантов. Чистый модуль: принимает структурный срез игры
// (SagaTextSource), поэтому им пользуются и движок (core/systems/saga.ts), и попап в браузере.
import { CONFIG } from '../core/config';
import { applyGenderSlots, type Gender } from './gender';
import type { SagaCond, SagaNode } from './saga-data';

/** Роли саги, которые берутся из штата (порядок раздачи — как в списке). */
export const SAGA_STAFF_ROLES = ['Скептик', 'Мечтатель', 'Технарь', 'Юрист', 'Финдир'] as const;

/** Минимальный срез игры, который нужен текстам и условиям: сага, штат, фанаты. */
export interface SagaTextSource {
  fans: number;
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
  };
}

function heroOf(src: SagaTextSource) {
  return src.staff.find((s) => s.hero);
}

function partnerOf(src: SagaTextSource) {
  return src.staff.find((s) => typeof s.partnerPct === 'number');
}

/** Условие варианта/вставки: флаг, отсутствие флага, порог фанатов, профессия героя. */
export function sagaCondOk(src: SagaTextSource, cond?: SagaCond): boolean {
  if (!cond) return true;
  if (cond.flag) return !!src.saga && src.saga.flags.includes(cond.flag);
  if (cond.notFlag) return !src.saga || !src.saga.flags.includes(cond.notFlag);
  if (cond.fansMin) return (src.fans ?? 0) >= CONFIG.SAGA.FANS_MIN;
  if (cond.heroJob) {
    const job = heroOf(src)?.activeCareer ?? null;
    const arr = Array.isArray(cond.heroJob) ? cond.heroJob : [cond.heroJob];
    return job != null && arr.includes(job);
  }
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
  const m = /^\s*\{([^{}]+)\}[^:«„]*:\s*[«„]/.exec(t);
  const speakerG = m ? genders[m[1]!.trim()] : undefined;
  t = applyGenderSlots(t, genders, speakerG ?? null);
  t = t.replace(/\{([^{}\/@]+)\}/g, (whole, key: string) => {
    const k = String(key).trim();
    return k in names ? names[k]! : whole;
  });
  return t;
}
