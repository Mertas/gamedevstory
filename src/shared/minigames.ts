// PLAN-39: мини-игры во врезке на 50% разработки — общая таблица клиента и сервера.
// Ротация и настройки сняты с песочницы босса (E:/MY/gds-minigames, 25.09.2026).
// Живёт в shared, потому что нужно и UI (модалка с iframe), и серверу (мешок, сводки).

export const MINIGAME_ROTATION = ['g001', 'g101', 'g102', 'g104'] as const;
export type MinigameId = (typeof MINIGAME_ROTATION)[number];

export interface MinigameDef {
  /** человеческое имя для модалки и журнала */
  title: string;
  /** ключ стора песочницы, куда лёг бы пресет при ручной игре (в embed НЕ пишется) */
  storeKey: string;
  params: Record<string, unknown>;
}

export const MINIGAME_DEFS: Record<string, MinigameDef> = {
  g001: {
    title: 'Найди баг',
    storeKey: 'mg-lab-params-v3',
    params: { rate: 0.9, lines: 12, diff: 'mix', rounds: 3, base: 30, tFast: 1, tSlow: 10, mist: 3, penalty: 15 },
  },
  g101: {
    title: 'Дорисуй спрайт',
    storeKey: 'mg-lab-sprite-v1',
    params: { time: 15, colors: 1, rounds: 3, hint: false },
  },
  g102: {
    title: 'Подбери цвет',
    storeKey: 'mg-lab-color-v1',
    params: { rounds: 3, strict: 4, fine: 'mixed' },
  },
  g104: {
    title: 'Хитбокс монстра',
    storeKey: 'mg-store-g104',
    params: { rounds: 3, time: 30, grid: 1 },
  },
};

export function minigameTitle(id: string): string {
  return MINIGAME_DEFS[id]?.title ?? id;
}

/** Максимальный штраф шкалы — он же цена досрочного закрытия партии (босс, 25.09). */
export const MINIGAME_MAX_PENALTY = -2;

/** PLAN-39: эффект мини-игры. ≥70% → +3 PR; 40–69% → без изменений; <40% → −2 PR (пол — 0). */
export function minigameOutcome(pct: number): { pr: number; note: string } {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  if (p >= 70) return { pr: 3, note: '+3 PR — пресса заметила' };
  if (p >= 40) return { pr: 0, note: 'без изменений' };
  return { pr: MINIGAME_MAX_PENALTY, note: '−2 PR — провал заметили' };
}

/** PLAN-39: партию закрыли досрочно — максимальный штраф, без скидок за прогресс. */
export function minigameClosedOutcome(): { pr: number; note: string } {
  return { pr: MINIGAME_MAX_PENALTY, note: 'максимальный штраф: −2 PR' };
}

// ─── мешок без повторов (аккаунт, user_flags['mg_bag']) ───

export interface MinigameBag {
  /** остаток текущего круга (все четыре игры по разу) */
  q: string[];
  /** последняя выданная — на стыке кругов подряд не повторяем */
  last: string | null;
}

/**
 * Следующая игра из мешка: внутри круга повторов нет; когда круг кончился — новый,
 * и его первая игра не совпадает с последней выданной. rand() ∈ [0,1) — для тестов.
 */
export function drawMinigame(bag: MinigameBag, rand: () => number): { id: string; bag: MinigameBag } {
  let q = bag.q.filter((id) => (MINIGAME_ROTATION as readonly string[]).includes(id as MinigameId));
  if (q.length === 0) {
    q = [...MINIGAME_ROTATION];
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [q[i], q[j]] = [q[j]!, q[i]!];
    }
    if (q.length > 1 && q[0] === bag.last) [q[0], q[1]] = [q[1]!, q[0]!];
  }
  const id = q[0]!;
  return { id, bag: { q: q.slice(1), last: id } };
}

// ─── embed-ссылка песочницы ───

/** base64url(JSON карты «ключ стора → пресет») для query `p=`. UTF-8-safe, работает в браузере и Node. */
export function encodeMinigameParams(id: string): string {
  const def = MINIGAME_DEFS[id];
  const json = JSON.stringify(def && def.storeKey ? { [def.storeKey]: def.params } : {});
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Ссылка на песочницу в embed-режиме (см. plan/39 «Архитектура»):
 * `/lab/?embed=1&g=<id>&p=<base64url>&snd=0|1` — параметры пресета и глушение звука.
 */
export function minigameEmbedUrl(base: string, id: string, snd: boolean): string {
  return `${base}?embed=1&g=${encodeURIComponent(id)}&p=${encodeMinigameParams(id)}&snd=${snd ? 1 : 0}`;
}

// ─── сводка аккаунта (PLAN-39/40) ───

export interface AccountTotals {
  /** релизов за всю историю аккаунта (все сейвы) */
  releases: number;
  /** победа: хотя бы одна игра взяла 100/100 у десяти критиков */
  victory: boolean;
}

/** Считает релизы и победу по сейвам игрока (структурный минимум от GameState — для тестов). */
export function accountTotalsFromGames(
  games: Array<{
    history?: Array<{ score?: number | null }>;
    released?: Array<{ score?: number | null }>;
  }>,
): AccountTotals {
  let releases = 0;
  let victory = false;
  for (const g of games) {
    const hist = g.history ?? [];
    releases += hist.length;
    if (!victory) {
      victory = hist.some((r) => (r.score ?? 0) >= 100) || (g.released ?? []).some((r) => (r.score ?? 0) >= 100);
    }
  }
  return { releases, victory };
}
