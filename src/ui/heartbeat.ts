// M5.5: «пульс» для фоновой вкладки. requestAnimationFrame в скрытой вкладке не тикает,
// таймеры троттлятся (а после пяти минут — до одного раза в минуту). Аудио-поток не троттлится,
// пока звучит контекст: AudioWorklet шлёт тик ≈12 раз в секунду — на нём оживает движок
// разработки, и музыка в фоне идёт тем же ходом, что в активной вкладке.
let node: AudioWorkletNode | null = null;
let started = false;
let lastAt = 0;
const subs = new Set<() => void>();

/** подключить пульс к контексту (зовётся при создании AudioContext игры) */
export function initHeartbeat(ctx: AudioContext): void {
  if (started || typeof ctx.audioWorklet === 'undefined') return;
  started = true;
  void ctx.audioWorklet
    .addModule('/gds-heartbeat.js')
    .then(() => {
      const n = new AudioWorkletNode(ctx, 'gds-heartbeat');
      const silent = ctx.createGain();
      silent.gain.value = 0; // звука не даёт — только держит поток активным
      n.connect(silent);
      silent.connect(ctx.destination);
      n.port.onmessage = () => {
        lastAt = performance.now();
        for (const fn of subs) fn();
      };
      node = n;
    })
    .catch(() => undefined);
}

/** подписка на тики пульса (возвращает отписку) */
export function onHeartbeat(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** пульс жив: тикал не позже ~1.5 секунды назад */
export function heartbeatAlive(): boolean {
  return !!node && performance.now() - lastAt < 1500;
}

// для живых проверок в браузере
if (typeof window !== 'undefined') {
  (window as unknown as { __gdsHeartbeat?: unknown }).__gdsHeartbeat = {
    ready: () => !!node,
    alive: heartbeatAlive,
    last: () => lastAt,
  };
}
