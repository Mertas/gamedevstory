// SRV-06: клиентская очередь исходящих. Клик, сделанный в окне обрыва WS, не теряется:
// сообщение ждёт в очереди до подтверждения сервером (action_result с тем же seq)
// либо истекает по TTL (тогда о потере сообщаем тостом).
export interface OutboxItem {
  seq: number;
  data: string; // уже сериализованное сообщение (внутри — sid/seq)
  at: number; // время постановки, мс
}

export const OUTBOX_TTL_MS = 15_000; // дольше не повторяем: картинка на экране уже устарела
const OUTBOX_MAX = 200;

export class Outbox {
  private items: OutboxItem[] = [];

  constructor(
    private readonly ttlMs: number = OUTBOX_TTL_MS,
    private readonly max: number = OUTBOX_MAX,
  ) {}

  /** поставить в очередь до ack; при переполнении вытесняются самые старые */
  push(seq: number, data: string, now = Date.now()): void {
    while (this.items.length >= this.max) this.items.shift();
    this.items.push({ seq, data, at: now });
  }

  /** ack сервера: seq доставлен — убрать из очереди */
  ack(seq: number): void {
    const i = this.items.findIndex((x) => x.seq === seq);
    if (i >= 0) this.items.splice(i, 1);
  }

  /**
   * (пере)подключение: вернуть к отправке всё, что не старше TTL;
   * устаревшее считается потерянным и покидает очередь.
   */
  drain(now = Date.now()): { ready: OutboxItem[]; dropped: number } {
    const ready: OutboxItem[] = [];
    let dropped = 0;
    for (const it of this.items) {
      if (now - it.at > this.ttlMs) dropped++;
      else ready.push(it);
    }
    this.items = ready.slice(); // до ack элементы остаются в очереди
    return { ready, dropped };
  }

  /** фоновая уборка: ack так и не пришёл (старый сервер / долгая потеря) — не копим вечно */
  prune(now = Date.now()): number {
    const before = this.items.length;
    this.items = this.items.filter((x) => now - x.at <= this.ttlMs);
    return before - this.items.length;
  }

  /** сервер перезапустился — прошлые клики неактуальны (состояние перечитано из сейва) */
  clear(): void {
    this.items = [];
  }

  get size(): number {
    return this.items.length;
  }
}
