/**
 * Версия игры и метка сборки (plan/23_Версионирование.md).
 *
 * Единственный источник версии — package.json: сборка инжектит его через vite define.
 * Схема MAJOR.MINOR.PATCH: MAJOR — несовместимые сохранения, MINOR — новые механики, PATCH — правки.
 * Подпись показывается в низу рабочего стола, на экране входа и на выборе сохранения.
 */
declare const __APP_VERSION__: string | undefined;
declare const __BUILD_DATE__: string | undefined;
declare const __COMMIT_AT__: string | undefined;

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
export const BUILD_DATE: string = typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : '';
/** PLAN-33: дата и время последнего коммита (в деплое её передаёт post-receive). */
export const COMMIT_AT: string = typeof __COMMIT_AT__ === 'string' ? __COMMIT_AT__ : '';

/** Подпись для угла экрана: «v1.0.0 · 12.09.2026 14:03» (время последнего коммита). */
export function versionLabel(): string {
  const stamp = COMMIT_AT || (BUILD_DATE ? BUILD_DATE.split('-').reverse().join('.') : '');
  return 'v' + APP_VERSION + (stamp ? ' · ' + stamp : '');
}

/** Подробная подпись для подсказки. */
export function versionTitle(): string {
  return 'Game Dev Story ' + versionLabel() + '. MAJOR — несовместимые сохранения, MINOR — новые механики, PATCH — правки.';
}
