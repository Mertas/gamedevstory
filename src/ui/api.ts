// PLAN-18: REST-клиент начального окна (вход, сохранения, начальный пул).
// Cookie сессии — same-origin, уходит автоматически.
export interface MeInfo {
  id: number;
  login: string;
  email: string | null;
}

export interface SaveInfo {
  id: number;
  studioName: string;
  created: number;
  updated: number;
  week: number;
  year: number;
  money: number;
  active: boolean;
}

export interface PoolStaff {
  id: string;
  name: string;
  gender: string;
  salary: number;
  hireFee: number;
  stats: { program: number; scenario: number; graphics: number; sound: number };
  activeCareer: string;
}

export interface Result {
  ok: boolean;
  error?: string;
}

async function call<T>(url: string, body?: unknown, method?: string): Promise<T & Result> {
  const res = await fetch(url, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    return (await res.json()) as T & Result;
  } catch {
    return { ok: false, error: `Сервер ответил ${res.status}` } as T & Result;
  }
}

/** Пользователь по cookie сессии; null — не вошёл. */
export async function apiMe(): Promise<MeInfo | null> {
  try {
    const d = await call<{ user: MeInfo | null }>('/api/auth/me');
    return d.user ?? null;
  } catch {
    return null;
  }
}

export const apiLogin = (login: string, password: string) => call<{ user?: MeInfo }>('/api/auth/login', { login, password });
export const apiRegister = (login: string, password: string, email: string) =>
  call<{ user?: MeInfo }>('/api/auth/register', { login, password, email });
export const apiResetRequest = (login: string) => call<{ devCode?: string }>('/api/auth/reset-request', { login });
export const apiResetConfirm = (login: string, code: string, password: string) =>
  call<{ user?: MeInfo }>('/api/auth/reset-confirm', { login, code, password });
export const apiLogout = () => call<Record<string, never>>('/api/auth/logout', {});

/** Сохранения игрока (свежие — сверху). */
export async function apiSaves(): Promise<SaveInfo[]> {
  const d = await call<{ saves: SaveInfo[] }>('/api/saves');
  return d.saves ?? [];
}
export const apiCreateSave = (studioName: string, staffIds: string[]) => call<{ id?: number }>('/api/saves', { studioName, staffIds });
export const apiLoadSave = (id: number) => call<{ id?: number }>(`/api/saves/${id}/load`, {});
export const apiDeleteSave = (id: number) => call<Record<string, never>>(`/api/saves/${id}`, undefined, 'DELETE');

/** Начальный пул сотрудников («Initially available») — из него стартовая пара. */
export async function apiPool(): Promise<PoolStaff[]> {
  const d = await call<{ staff: PoolStaff[] }>('/api/pool');
  return d.staff ?? [];
}
