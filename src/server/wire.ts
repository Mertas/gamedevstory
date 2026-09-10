// SRV-06: защита от дублей на стыке переподключений. Клиент нумерует исходящие (seq) и
// помечает сессию страницы (sid); после обрыва он повторяет недоставленные действия —
// те, что сервер уже обработал (ack потерялся вместе с сокетом), отсекаются здесь.
export interface SeqGuard {
  /**
   * 'dup' — сообщение уже обрабатывалось (повтор при реконнекте: только повторный ack);
   * 'process' — новое сообщение; 'no-seq' — без меток (старый клиент / служебное).
   */
  check(sid: string | null, seq: number | undefined): 'process' | 'dup' | 'no-seq';
}

export function createSeqGuard(): SeqGuard {
  let curSid: string | null = null;
  let curSeq = 0;
  return {
    check(sid, seq) {
      if (!sid || seq === undefined) return 'no-seq';
      if (sid === curSid && seq <= curSeq) return 'dup';
      curSid = sid;
      curSeq = seq;
      return 'process';
    },
  };
}
