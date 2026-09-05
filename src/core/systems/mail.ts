// Письма фанатов (M5): после релиза в окне LETTER_WINDOW_DAYS приходит письмо (шанс в день).
// Тон — по оценке игры (≥25 любовь, ≤19 гнев, иначе нейтрально); эффект ±фанаты [Н].
// Движок пишет текст-заготовку; сервер (game.ts) заменяет его письмом LLM (поле llm).
import { CONFIG } from '../config';
import { log } from '../log';
import type { Rng } from '../rng';
import type { FanLetter, GameState } from '../types';

export const FAN_NAMES_M = [
  'Алексей', 'Дмитрий', 'Сергей', 'Игорь', 'Максим', 'Артём', 'Никита', 'Павел', 'Роман',
  'Виктор', 'Олег', 'Кирилл', 'Илья', 'Егор', 'Глеб', 'Тимур', 'Марк', 'Лев', 'Степан', 'Фёдор',
];
export const FAN_NAMES_F = [
  'Анна', 'Ольга', 'Елена', 'Наталья', 'Ирина', 'Светлана', 'Мария', 'Дарья', 'Екатерина',
  'Ксения', 'Полина', 'Алиса', 'Вера', 'Татьяна', 'Юлия', 'Анастасия', 'Софья', 'Виктория',
  'Марина', 'Людмила',
];

// заготовки, пока LLM не написал письмо (и как запасной текст без GigaChat)
const FALLBACK: Record<FanLetter['sentiment'], string[]> = {
  love: [
    'Здравствуйте! Прошёл «{game}» — это восторг! Спасибо за {score}/40. Когда сиквел?',
    'Привет! «{game}» — лучшая покупка года. Прошли всей семьёй, {score}/40 заслуженно!',
  ],
  neutral: [
    'Здравствуйте. Играл в «{game}» — {score}/40, вполне неплохо. Жду следующую игру.',
    'Привет! «{game}» прошёл до конца ({score}/40). Есть идеи, что улучшить в сиквеле.',
  ],
  hate: [
    'Это возмутительно! «{game}» ({score}/40) — пустая трата денег. Баги на каждом шагу!',
    'Верните деньги за «{game}»! {score}/40 — даже это слишком много.',
  ],
};

function fallbackText(rng: Rng, sentiment: FanLetter['sentiment'], gameName: string, score: number): string {
  const pool = FALLBACK[sentiment];
  const t = pool[rng.int(0, pool.length - 1)] ?? pool[0]!;
  return t.replace('{game}', gameName).replace('{score}', String(score));
}

// одно письмо за тик (return после первого сработавшего шанса)
export function tickFanLetters(state: GameState, rng: Rng): void {
  for (const game of state.released) {
    if (game.ended || game.releaseWeek === null) continue;
    if (state.week - game.releaseWeek >= CONFIG.LETTER_WINDOW_DAYS) continue;
    if (!rng.chance(CONFIG.LETTER_CHANCE)) continue;
    const score = game.score ?? 20;
    const sentiment: FanLetter['sentiment'] = score >= 25 ? 'love' : score <= 19 ? 'hate' : 'neutral';
    const female = rng.chance(0.5);
    const names = female ? FAN_NAMES_F : FAN_NAMES_M;
    const fanName = names[rng.int(0, names.length - 1)]!;
    let delta = 0;
    if (sentiment === 'love') delta = rng.int(CONFIG.LETTER_LOVE_MIN, CONFIG.LETTER_LOVE_MAX);
    else if (sentiment === 'hate') delta = -rng.int(CONFIG.LETTER_HATE_MIN, CONFIG.LETTER_HATE_MAX);
    state.fans = Math.max(0, state.fans + delta);
    state.mailId += 1;
    const letter: FanLetter = {
      id: state.mailId,
      week: state.week,
      year: state.year,
      gameName: game.name,
      score,
      fanName,
      gender: female ? 'F' : 'M',
      sentiment,
      fansDelta: delta,
      text: fallbackText(rng, sentiment, game.name, score),
      llm: false,
    };
    state.mail.push(letter);
    if (state.mail.length > CONFIG.LETTER_CAP) state.mail.splice(0, state.mail.length - CONFIG.LETTER_CAP);
    const emoji = sentiment === 'love' ? '💌' : sentiment === 'hate' ? '💔' : '✉️';
    log(state, `${emoji} Письмо от ${fanName} о «${game.name}»${delta !== 0 ? ` (фанаты ${delta > 0 ? '+' : ''}${delta})` : ''}`);
    return;
  }
}
