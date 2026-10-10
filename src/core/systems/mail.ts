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
    'Не могу молчать: «{game}» — это {score}/100 и лучшие выходные за год! Как вам это удалось?!',
    'Купил «{game}» в пятницу — не спал до утра! {score}/100 заслуженно, когда сиквел?',
    '«{game}» — {score}/100! Играли с друзьями до рассвета, давно так не смеялись. Спасибо!',
  ],
  nostalgia: [
    'Помню ваши игры ещё с первых картриджей. «{game}» ({score}/100) — тёплое возвращение в детство, спасибо.',
    'Ваши игры со мной с детства, и «{game}» — {score}/100 — достойное продолжение традиции. Не теряйте себя!',
  ],
  rant: [
    'И это «{game}»? {score}/100 — ещё много! Баги на каждом шагу, куда ушли деньги?',
    'Я требую объяснений: «{game}» ({score}/100) — шаг назад. Обещали больше. Так нельзя.',
  ],
  ideas: [
    'Прошёл «{game}» ({score}/100). Сделайте в сиквеле редактор уровней — сообщество оценит.',
    'К «{game}» ({score}/100) есть идея: добавьте кооператив и режим испытаний. А что дальше делаете?',
  ],
};

function fallbackText(rng: Rng, style: FanLetterStyle, gameName: string, score: number): string {
  const pool = FALLBACK[style];
  const t = pool[rng.int(0, pool.length - 1)] ?? pool[0]!;
  return t.replace('{game}', gameName).replace('{score}', String(score100(score)));
}

// одно письмо за тик (return после первого сработавшего шанса)
export function tickFanLetters(state: GameState, rng: Rng): void {
  // аудит-51 05-P2-6: письмо двадцатилетия — один раз, веха «история продолжается»
  if (!state.anniversary20 && state.week >= 20 * CONFIG.YEAR_LENGTH) {
    state.anniversary20 = true;
    const female = rng.chance(0.5);
    const names = female ? FAN_NAMES_F : FAN_NAMES_M;
    const fanName = names[rng.int(0, names.length - 1)]!;
    state.mailId += 1;
    state.mail.push({
      id: state.mailId,
      week: state.week,
      year: state.year,
      gameName: '',
      score: 0,
      fanName,
      gender: female ? 'F' : 'M',
      sentiment: 'love',
      fansDelta: 0,
      kind: 'anniversary',
      // текст написан заранее (llm: true) — сервер публикует его как есть, без реакции команды
      text:
        'Двадцать лет — красивая цифра, и у неё есть секрет: студии столько не живут. ' +
        'Живыми остаются те, у кого есть история, — а у вас она есть. Я слежу за вами с самых ' +
        'первых картриджей и никуда не собираюсь: пусть у этой истории будет продолжение. ' +
        'С двадцатилетием, студия.',
      llm: true,
    });
    if (state.mail.length > CONFIG.LETTER_CAP) state.mail.splice(0, state.mail.length - CONFIG.LETTER_CAP);
    log(state, `✉️ Письмо двадцатилетия от ${fanName}`);
    return;
  }
  for (const game of state.released) {
    if (game.ended || game.releaseWeek === null) continue;
    if (state.week - game.releaseWeek >= CONFIG.LETTER_WINDOW_DAYS) continue;
    if (!rng.chance(CONFIG.LETTER_CHANCE)) continue;
    const score = game.score ?? 20;
    // P1 аудита-51: score уже /100 (PLAN-30) — раньше сравнение шло с /40-порогами, и все письма были «восторгом»
    const sentiment: FanLetter['sentiment'] = score >= 75 ? 'love' : score <= 45 ? 'hate' : 'neutral';
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
