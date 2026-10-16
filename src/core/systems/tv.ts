// PLAN-52 M2b: телевидение — мультсериалы по франшизам.
// Каналы (5, эпохи 1991–2000) присылают предложение: сезон по сильной франшизе.
// Во время эфира: недельная ставка канала, волна фанатов, известность текущему проекту,
// но продажи игр режутся (каннибализация — фанаты у экранов). Финал: рейтинг решает
// бренд франшизы и большую волну фанатов. Эфир освежает серию — счётчик забвения идёт
// от последнего показа. Слой над базовым циклом — формулы разработки не трогает.
import { CONFIG } from '../config';
import { log } from '../log';
import type { Rng } from '../rng';
import type { ActionResult, GameState, TvOffer, TvShow } from '../types';
import { studioYear } from './franchise';

const clampBrand = (v: number) => Math.max(0, Math.min(100, v));

/** Каналы, вещающие в текущем году студии (эпохи — CONFIG.TV_CHANNELS). */
export function tvChannelsLive(state: GameState): string[] {
  const year = studioYear(state);
  return Object.entries(CONFIG.TV_CHANNELS)
    .filter(([, def]) => year >= def.sinceYear)
    .map(([id]) => id);
}

/** Сильнейшие франшизы, подходящие каналу (топ-3 по бренду — канал выбирает из них). */
function candidateFranchises(state: GameState, minBrand: number): string[] {
  return Object.entries(state.franchises ?? {})
    .filter(([, f]) => f.brand >= minBrand)
    .sort((a, b) => b[1].brand - a[1].brand)
    .slice(0, 3)
    .map(([key]) => key);
}

/** Канал и франшиза для предложения; null — подходящих нет. */
function rollOffer(state: GameState, rng: Rng): TvOffer | null {
  const live = tvChannelsLive(state)
    .map((id) => ({
      id,
      keys: candidateFranchises(state, Math.max(CONFIG.TV_CHANNELS[id as keyof typeof CONFIG.TV_CHANNELS].minBrand, CONFIG.TV_MIN_BRAND)),
    }))
    .filter((c) => c.keys.length > 0);
  if (!live.length) return null;
  const chan = live[rng.int(0, live.length - 1)]!;
  const key = chan.keys[rng.int(0, chan.keys.length - 1)]!;
  return { channelId: chan.id as TvOffer['channelId'], franchiseKey: key, week: state.week };
}

/** Ежедневно: эфир сезона, жизнь предложения и рождение новых (зовётся из тика после забвения). */
export function tickTv(state: GameState, rng: Rng): void {
  const tv = state.tv;
  if (!tv) return;

  // отложенные итоги сезона — показываем, когда освободится попап
  if (tv.pendingResult && !state.pendingEvent) {
    tv.pendingResult = false;
    state.pendingEvent = { type: 'tv', stage: 'result' };
  }

  // 1) эфир: ставка, фанаты, известность проекту, освежение франшизы
  if (tv.show) {
    const sh = tv.show;
    state.money += sh.rate / 7;
    state.fans += sh.fansPerWeek / 7;
    if (state.activeGame && state.activeGame.phase !== 'released') {
      state.activeGame.fame += CONFIG.TV_FAME_PER_WEEK / 7;
    }
    const f = state.franchises?.[sh.franchiseKey];
    if (f) f.lastShowWeek = state.week;
    sh.weeksLeft -= 1;
    if (sh.weeksLeft <= 0) finalizeShow(state, rng);
    return;
  }

  // 2) предложение: сгорает, если затянули (и попап снимаем, чтобы игра не застряла)
  if (tv.offer) {
    if (state.week - tv.offer.week > CONFIG.TV_OFFER_TTL) {
      const ch = CONFIG.TV_CHANNELS[tv.offer.channelId];
      tv.offer = null;
      if (state.pendingEvent?.type === 'tv') state.pendingEvent = null;
      log(state, `📺 «${ch.name}» не дождался ответа — вернутся позже`);
    }
    return;
  }

  // 3) новый оффер: раз в ~полтора-два года, только когда игра не ждёт решения игрока
  if (state.week < tv.nextOfferWeek || state.pendingEvent) return;
  const offer = rollOffer(state, rng);
  if (!offer) {
    tv.nextOfferWeek = state.week + 90; // подходящих франшиз нет — проверим позже
    return;
  }
  tv.offer = offer;
  tv.nextOfferWeek = state.week + CONFIG.TV_OFFER_GAP_MIN + rng.int(0, CONFIG.TV_OFFER_GAP_VAR);
  const ch = CONFIG.TV_CHANNELS[offer.channelId];
  const f = state.franchises?.[offer.franchiseKey];
  log(state, `📺 «${ch.name}» предлагает сериал по «${f?.name ?? '—'}»`);
  state.pendingEvent = { type: 'tv', stage: 'offer' };
}

/** Финал сезона: рейтинг решает бренд и волну фанатов (и премию канала за рейтинг). */
function finalizeShow(state: GameState, rng: Rng): void {
  const tv = state.tv!;
  const sh = tv.show!;
  const ch = CONFIG.TV_CHANNELS[sh.channelId];
  const f = state.franchises?.[sh.franchiseKey];
  const base = f?.brand ?? 40;
  const rating = Math.max(0, Math.min(100,
    Math.round(base - ch.hardness + rng.int(-CONFIG.TV_RATING_SPREAD, CONFIG.TV_RATING_SPREAD))));
  const outcome = rating >= 80 ? 'legend' : rating >= 60 ? 'hit' : rating >= 40 ? 'ok' : 'flop';
  const res = CONFIG.TV_RESULTS[outcome];
  if (f) f.brand = clampBrand(f.brand + res.brand);
  const seasonFans = Math.round((ch.fansPerWeek / 7) * sh.lengthDays);
  const wave = Math.round(seasonFans * res.fansMult);
  state.fans += wave;
  state.money += Math.round(sh.rate * res.premium);
  tv.lastResult = { channelId: sh.channelId, franchiseKey: sh.franchiseKey, name: sh.name, rating, outcome, week: state.week };
  tv.show = null;
  log(state, `📺 Финал «${sh.name}»: рейтинг ${rating}/100 — ${res.label} Бренд ${res.brand >= 0 ? '+' : ''}${res.brand}, фанатов +${wave}`);
  if (!state.pendingEvent) state.pendingEvent = { type: 'tv', stage: 'result' };
  else tv.pendingResult = true;
}

/** «Империя»/попап → «Принять»: сериал уходит в эфир. */
export function acceptTvOffer(state: GameState, rng: Rng): ActionResult {
  const tv = state.tv;
  const off = tv?.offer;
  if (!tv || !off) return { ok: false, error: 'Сейчас нет предложения канала' };
  const ch = CONFIG.TV_CHANNELS[off.channelId];
  const f = state.franchises?.[off.franchiseKey];
  if (!f) { tv.offer = null; return { ok: false, error: 'Франшиза уже вне игры' }; }
  const title = ch.titles[rng.int(0, ch.titles.length - 1)] ?? ch.titles[0]!;
  const show: TvShow = {
    channelId: off.channelId,
    franchiseKey: off.franchiseKey,
    name: `${f.name}: ${title}`,
    weeksLeft: ch.lengthWeeks * 7,
    lengthDays: ch.lengthWeeks * 7,
    rate: ch.rate,
    fansPerWeek: ch.fansPerWeek,
    startedWeek: state.week,
  };
  tv.show = show;
  tv.offer = null;
  f.lastShowWeek = state.week;
  f.decayed = 0; // эфир освежает серию: забвение начинается заново
  state.pendingEvent = null;
  log(state, `📺 «${ch.name}»: премьера «${show.name}» — ${ch.lengthWeeks} недель в эфире`);
  return { ok: true };
}

/** «Империя» → «Отклонить»: канал вернётся позже (срок перенесён ещё при оффере). */
export function declineTvOffer(state: GameState): void {
  const tv = state.tv;
  if (!tv?.offer) return;
  const ch = CONFIG.TV_CHANNELS[tv.offer.channelId];
  tv.offer = null;
  if (state.pendingEvent?.type === 'tv') state.pendingEvent = null;
  log(state, `📺 «${ch.name}»: предложение отклонено`);
}

/** Попап → «Позже»: предложение остаётся в «Империи», игра идёт дальше. */
export function deferTvOffer(state: GameState): void {
  if (state.pendingEvent?.type === 'tv') state.pendingEvent = null;
}

/** Попап итогов сезона → «Ок». */
export function resolveTvResult(state: GameState): void {
  if (state.pendingEvent?.type === 'tv') state.pendingEvent = null;
}
