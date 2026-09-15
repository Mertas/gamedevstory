// GDS: «пульс» с аудиопотока — не троттлится в фоновой вкладке.
// AudioWorkletProcessor крутится на аудио-потоке и шлёт тик главному потоку
// (вместо requestAnimationFrame, который в скрытой вкладке молчит).
// Тик ≈ каждые 27×128 сэмплов ≈ 78 мс при 44.1 кГц — «честные» ~12 кадров/с.
class GdsHeartbeat extends AudioWorkletProcessor {
  constructor() {
    super();
    this._n = 0;
  }
  process() {
    this._n++;
    if (this._n >= 27) {
      this._n = 0;
      this.port.postMessage(1);
    }
    return true; // живём, пока подключены
  }
}

registerProcessor('gds-heartbeat', GdsHeartbeat);
