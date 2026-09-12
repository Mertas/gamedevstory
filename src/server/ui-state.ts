// PLAN-24: валидация вида рабочего стола, приходящего от клиента.
// Клиент — не доверенный источник: без зажима значений окно с координатой 1e9 или тысяча окон
// раздуют сейв и разъедутся по всем устройствам игрока.
import type { UiState, UiWindow } from '../core/types';

const MAX_WINDOWS = 40;
const MAX_ICONS = 60;
const MAX_ID = 40;
const MAX_WALLPAPER = 64;

function num(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null;
}

function oneWindow(raw: unknown): UiWindow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.slice(0, MAX_ID) : null;
  const x = num(o.x, -4000, 20000);
  const y = num(o.y, -4000, 20000);
  const w = num(o.w, 120, 4000);
  const h = num(o.h, 80, 4000);
  const z = num(o.z, 0, 1_000_000);
  if (!id || x === null || y === null || w === null || h === null || z === null) return null;
  return { id, x, y, w, h, z, minimized: Boolean(o.minimized), maximized: Boolean(o.maximized), closed: Boolean(o.closed) };
}

/** Наложить присланный клиентом ui на прежний: неизвестные поля игнорируем, значения зажимаем. */
export function sanitizeUi(raw: unknown, prev: UiState | undefined): UiState {
  const out: UiState = { ...(prev ?? {}) };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if ('wallpaper' in r) {
    out.wallpaper = typeof r.wallpaper === 'string' && r.wallpaper.length <= MAX_WALLPAPER ? r.wallpaper : null;
  }
  if (Array.isArray(r.windows)) {
    out.windows = r.windows
      .slice(0, MAX_WINDOWS)
      .map(oneWindow)
      .filter((w): w is UiWindow => w !== null);
  }
  if (r.icons && typeof r.icons === 'object' && !Array.isArray(r.icons)) {
    // ключи — id приложений: пропускаем только «похожие на id», координаты зажимаем
    const icons: Record<string, { x: number; y: number }> = {};
    for (const [k, v] of Object.entries(r.icons as Record<string, unknown>).slice(0, MAX_ICONS)) {
      if (k.length > MAX_ID || !/^[a-z0-9_-]+$/.test(k) || !v || typeof v !== 'object') continue;
      const o = v as Record<string, unknown>;
      const x = num(o.x, -2000, 20000);
      const y = num(o.y, -2000, 20000);
      if (x === null || y === null) continue;
      icons[k] = { x, y };
    }
    out.icons = icons;
  }
  return out;
}
