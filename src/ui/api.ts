// PLAN-18/19: REST-клиент начального окна (вход, сохранения, инвайты, начальный пул).
// Cookie сессии — same-origin, уходит автоматически.
export interface MeInfo {
  id: number;
  login: string;
  email: string | null;
  /** владелец студии: видит окно «Инвайты» */
  admin: boolean;
}

/** Что включено на этом сервере (публичный режим выключает сброс пароля — plan/19). */
export interface Features {
  passwordReset: boolean;
  inviteRequired: boolean;
}

export interface SessionInfo {
  user: MeInfo | null;
  features: Features;
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

export interface InviteInfo {
  code: string;
  note: string | null;
  created: number;
  /** логин того, кто использовал код; null — свободен */
  usedBy: string | null;
  usedAt: number | null;
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

/** PLAN-22: профиль игрока — уровень = число открытых комбо. */
export interface ProfileInfo {
  ok: boolean;
  count: number;
  rank: { icon: string; name: string; why: string; from: number };
  next: { icon: string; name: string; from: number; need: number } | null;
  combos: string[];
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

/** PLAN-22: профиль (уровень, звание, открытые комбо). */
export async function apiProfile(): Promise<ProfileInfo> {
  return call<ProfileInfo>('/api/profile');
}

/** Сессия: пользователь (или null) + возможности сервера. */
export async function apiMe(): Promise<SessionInfo> {
  try {
    const d = await call<{ user: MeInfo | null; features: Features }>('/api/auth/me');
    return {
      user: d.user ?? null,
      features: d.features ?? { passwordReset: false, inviteRequired: true },
    };
  } catch {
    return { user: null, features: { passwordReset: false, inviteRequired: true } };
  }
}

export const apiLogin = (login: string, password: string) => call<{ user?: MeInfo }>('/api/auth/login', { login, password });
export const apiRegister = (login: string, password: string, email: string, invite: string) =>
  call<{ user?: MeInfo }>('/api/auth/register', { login, password, email, invite });
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

// ─── инвайты (только владелец; сервер отвечает 403 остальным) ───

export async function apiInvites(): Promise<InviteInfo[]> {
  const d = await call<{ invites: InviteInfo[] }>('/api/invites');
  return d.invites ?? [];
}
export async function apiCreateInvites(note: string, count: number): Promise<{ ok: boolean; error?: string; invites: InviteInfo[] }> {
  const d = await call<{ invites: InviteInfo[] }>('/api/invites', { note, count });
  return { ok: d.ok, error: d.error, invites: d.invites ?? [] };
}
export const apiRevokeInvite = (code: string) => call<Record<string, never>>(`/api/invites/${encodeURIComponent(code)}`, undefined, 'DELETE');
