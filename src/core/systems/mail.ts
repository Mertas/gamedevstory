import { score100 } from '../../shared/rules';
// Письма фанатов (M5): после релиза в окне LETTER_WINDOW_DAYS приходит письмо (шанс в день).
// Тон — по оценке игры (≥25 любовь, ≤19 гнев, иначе нейтрально); эффект ±фанаты [Н].
// Движок пишет текст-заготовку; сервер (game.ts) заменяет его письмом LLM (поле llm).
import { CONFIG } from '../config';
import { genreById } from '../data/db';
import { log } from '../log';
import type { Rng } from '../rng';
import type { FanLetter, FanLetterStyle, GameState } from '../types';

const FAN_NAMES_M = [
  'Алексей', 'Дмитрий', 'Сергей', 'Игорь', 'Максим', 'Артём', 'Никита', 'Павел', 'Роман',
  'Виктор', 'Олег', 'Кирилл', 'Илья', 'Егор', 'Глеб', 'Тимур', 'Марк', 'Лев', 'Степан', 'Фёдор',
];
const FAN_NAMES_F = [
  'Анна', 'Ольга', 'Елена', 'Наталья', 'Ирина', 'Светлана', 'Мария', 'Дарья', 'Екатерина',
  'Ксения', 'Полина', 'Алиса', 'Вера', 'Татьяна', 'Юлия', 'Анастасия', 'Софья', 'Виктория',
  'Марина', 'Людмила',
];

// 4 тона письма (10.09.2026): раньше все письма сходились к трём шаблонам «Дорогие разработчики! Я просто…» —
// теперь стиль разный (восторг / ностальгия / разбор / идеи), с разными зачинами, длиной и конкретикой.
const STYLE_POOLS: Record<FanLetter['sentiment'], FanLetterStyle[]> = {
  love: ['delight', 'nostalgia'],
  neutral: ['ideas'],
  hate: ['rant'],
};

// заготовки, пока LLM не написал письмо (и как запасной текст без GigaChat)
const FALLBACK: Record<FanLetterStyle, string[]> = {
  delight: [
    'Не могу молчать: «{game}» — это {score}/40 и лучшие выходные за год! Как вам это удалось?!',
    'Купил «{game}» в пятницу — не спал до утра! {score}/40 заслуженно, когда сиквел?',
    '«{game}» — {score}/40! Играли с друзьями до рассвета, давно так не смеялись. Спасибо!',
  ],
  nostalgia: [
    'Помню ваши игры ещё с первых картриджей. «{game}» ({score}/40) — тёплое возвращение в детство, спасибо.',
    'Ваши игры со мной с детства, и «{game}» — {score}/40 — достойное продолжение традиции. Не теряйте себя!',
  ],
  rant: [
    'И это «{game}»? {score}/40 — ещё много! Баги на каждом шагу, куда ушли деньги?',
    'Я требую объяснений: «{game}» ({score}/40) — шаг назад. Обещали больше. Так нельзя.',
  ],
  ideas: [
    'Прошёл «{game}» ({score}/40). Сделайте в сиквеле редактор уровней — сообщество оценит.',
    'К «{game}» ({score}/40) есть идея: добавьте кооператив и режим испытаний. А что дальше делаете?',
  ],
};

function fallbackText(rng: Rng, style: FanLetterStyle, gameName: string, score: number): string {
  const pool = FALLBACK[style];
  const t = pool[rng.int(0, pool.length - 1)] ?? pool[0]!;
  return t.replace('{game}', gameName).replace('{score}', String(score100(score)));
}

// одно письмо за тик (return после первого сработавшего шанса)
export function tickFanLetters(state: GameState, rng: Rng): void {
  for (const game of state.released) {
    if (game.ended || game.releaseWeek === null) continue;
    if (state.week - game.releaseWeek >= CONFIG.LETTER_WINDOW_DAYS) continue;
    if (!rng.chance(CONFIG.LETTER_CHANCE)) continue;
    const score = game.score ?? 20;
    const sentiment: FanLetter['sentiment'] = score >= 25 ? 'love' : score <= 19 ? 'hate' : 'neutral';
    const poolS = STYLE_POOLS[sentiment];
    const style = poolS[rng.int(0, poolS.length - 1)] ?? 'ideas';
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
      style,
      genre: genreById(game.genreId)?.name,
      fansDelta: delta,
      text: fallbackText(rng, style, game.name, score),
      llm: false,
    };
    state.mail.push(letter);
    if (state.mail.length > CONFIG.LETTER_CAP) state.mail.splice(0, state.mail.length - CONFIG.LETTER_CAP);
    const emoji = sentiment === 'love' ? '💌' : sentiment === 'hate' ? '💔' : '✉️';
    log(state, `${emoji} Письмо от ${fanName} о «${game.name}»${delta !== 0 ? ` (фанаты ${delta > 0 ? '+' : ''}${delta})` : ''}`);
    return;
  }
}
