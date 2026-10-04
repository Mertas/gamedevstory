// Промпты чата разработчиков + парсинг ответа LLM (JSON {"messages":[...]}).
// Порт extractJsonObject из LLMKing/src/server/llm.ts.
import type { AutopilotPlan } from '../shared/autopilot';
import { formatUnits } from '../core/systems/market';
import { score100 } from '../shared/rules';

interface LlmMessage { role: 'system' | 'user'; content: string }

const SYSTEM_PROMPT = `Ты — корпоративный чат игровой студии. Сотрудники обсуждают текущий проект.
Правила:
- Пиши ТОЛЬКО на русском, реплики 1–2 предложения, живой корпоративный тон с лёгким юмором.
- Характеры по профессиям: программист — ироничный мемолог, любит сроки и рефакторинг; сценарист — пафосный, говорит о «мирах» и «сюжетных дугах»; дизайнер — эстет, переживает за пиксели; звукорежиссёр — перфекционист, слышит «шум» везде; директор — коротко и по делу, про дедлайны; продюсер — про бюджет и продажи; хардвер-инженер — про «железо» и мегагерцы; хакер — загадочный.
- ЛИЧНОСТИ из строки «Личности:» в контексте — ВАЖНЕЕ характеров по профессиям: строго следуй им (стиль, лексика, манера речи).
- Пол: у каждого в «Команде» указан пол (м — парень, ж — девушка; у босса — в строке «Босс:») — реплики строго в его роде: «я пошёл/пошла», «сказал/сказала», «сам/сама».
- Реплики должны отражать КОНКРЕТНЫЙ контекст проекта (жанр, тип, платформа, режим, баги, рецензии), а не общие фразы.
- Не упоминай, что ты ИИ. Не пиши от лица «всех». Не повторяй имена чаще раза.
- Ответь ТОЛЬКО JSON-массивом в виде: {"messages":[{"author":"Имя сотрудника","text":"реплика"}]}
- author — строго одно из имён из списка сотрудников в контексте. Не выдумывай сотрудников.
- Не более 8 сообщений, без пояснений и markdown вокруг JSON.`;

const PHASE_INSTRUCTIONS: Record<string, string> = {
  kickoff: 'Проект только что стартовал. Обсудите тему (жанр × тип) и платформу, распределение ролей, первые идеи и шутки про дедлайны.',
  alpha: 'Разработка на 40%. Программисты отчитываются о ядре, дизайнеры показывают графику, сценарист защищает сюжет. Первые проблемы.',
  beta: 'Разработка на 80%. Звук и полировка, финальные правки, страх перед багами, кто-то предлагает «ещё одну фичу».',
  debug: 'Игра готова, идёт отладка. Обсудите найденные баги (сколько их), кто виноват, когда выпускать.',
  release: 'Игра выпущена! Обсудите рецензии, продажи и планы на следующий проект.',
  boost: 'Событие в разработке: кто-то предложил улучшение (см. факты). Обсудите результат: получилось или провал.',
  player: 'Босс пишет в чат: «%TEXT%». Живо ответьте в своём стиле — по делу (совет, отчёт, мнение, шутка). Если разговор продолжится — пусть отвечают разные сотрудники по очереди, развивая тему и реагируя друг на друга.',
  fanmail: 'Студия получила письмо от фаната (текст: «%TEXT%»). Один сотрудник открывает обсуждение: живо отреагируйте на письмо сообразно его тону (восторг/недовольство/сдержанно) — ответьте фанату или обсудите с командой, в своём стиле, по делу.',
  boss_back: 'Босс снова у руля! Живо отреагируйте в своих характерах: кто-то радуется возвращению, кто-то делает вид, что всё это время усердно работал, кто-то недоволен, что самодеятельность кончилась.',
  idle: 'Затишье: в студии спокойный рабочий день, событий никаких. Одна короткая реплика — сотрудник вслух размышляет о текущем проекте или рабочих буднях (наблюдение, лёгкая шутка). Без обращения к боссу и без обсуждения решений.',
};

// персональные личности сотрудников приходят из контентной БД (research/04 → personalities
// → STAFF.persona → buildContext в game.ts) — ВАЖНЕЕ характеров по профессиям.
// ПРИМЕЧАНИЕ: GigaChat модерирует жёсткий мат (отказ) — используем мягкую грубость (проверено).

// письмо фаната: текст пишет LLM (движок дал заготовку и стиль; GigaChat модерирует мат — hate без мата).
// 4 тона (10.09.2026): восторг / ностальгия / разбор / идеи — разные зачины и длина, иначе все письма
// сходились к шаблону «Дорогие разработчики! Я просто…».
export type LetterStyle = 'delight' | 'nostalgia' | 'rant' | 'ideas';

const LETTER_STYLES: Record<LetterStyle, { tone: string; len: string; open: string; focus: string }> = {
  delight: {
    tone: 'восторженное, эмоции через край, искренне (восклицания уместны)',
    len: '2–4 предложения',
    open: 'зачин — прямо эмоция: «Не могу молчать!», «Как вы это сделали?!», момент из личной игры',
    focus: 'назови, что именно зацепило (механика, графика, музыка), упомяни оценку прессы, спроси про сиквел',
  },
  nostalgia: {
    tone: 'тёплое и ностальгическое, чуть сентиментальное',
    len: '3–6 предложений',
    open: 'зачин — воспоминание: «до сих пор помню», «вырос на ваших играх», история из детства',
    focus: 'сравни с прошлыми играми студии, скажи, что эта — достойное продолжение, попроси не терять дух студии',
  },
  rant: {
    tone: 'раздражённое и разочарованное: конкретные претензии и сарказм, НО без мата и грубостей',
    len: '3–5 предложений',
    open: 'зачин — сразу претензия или саркастичный вопрос, без приветствий',
    focus: 'перечисли 2–3 конкретных повода (баги, графика, цена, упрощение), сравни с конкурентами, потребуй патч',
  },
  ideas: {
    tone: 'сдержанно-доброжелательное, по делу',
    len: '3–6 предложений',
    open: 'зачин — предложение или вопрос: «а что если…», «почему бы не…», без шаблонных приветствий',
    focus: 'предложи 1–2 конкретные идеи (механика, режим, сиквел) и задай вопрос о разработке',
  },
};

function letterStyle(letter: { sentiment: 'love' | 'neutral' | 'hate'; style?: LetterStyle }): LetterStyle {
  if (letter.style) return letter.style;
  return letter.sentiment === 'love' ? 'delight' : letter.sentiment === 'hate' ? 'rant' : 'ideas';
}

export function buildLetterPrompt(letter: {
  fanName: string; gender: 'M' | 'F'; sentiment: 'love' | 'neutral' | 'hate';
  gameName: string; score: number; year: number; genre?: string; style?: LetterStyle;
}): LlmMessage[] {
  const genderWord = letter.gender === 'F' ? 'женщина' : 'мужчина';
  const st = LETTER_STYLES[letterStyle(letter)];
  const gameLine = `Игра: «${letter.gameName}»${letter.genre ? ` (жанр: ${letter.genre})` : ''}, оценка критиков ${score100(letter.score)}/100.`;
  return [
    {
      role: 'system',
      content:
        `Ты — обычный игрок (${genderWord}) в ${letter.year}-м году игровой индустрии, эпоха 8/16-бит. ` +
        `Напиши письмо в игровую студию от первого лица о только что вышедшей игре. Тон: ${st.tone}. ` +
        `Длина: ${st.len} — у разных писем она разная, не подгоняй под шаблон. ${st.open}. ` +
        `Конкретика: ${st.focus}. ` +
        'Правила: только текст письма, без подписи в конце (имя и так известно), без markdown, без кавычек-обёртки вокруг всего письма. ' +
        'НЕ начинай с «Дорогие разработчики», «Здравствуйте», «Я пишу вам»; не используй оборот «Я просто…»; ' +
        'каждое письмо уникально — варьируй формулировки, не копируй примеры дословно; не упоминай, что ты ИИ.',
    },
    {
      role: 'user',
      content: `${gameLine} Письмо от ${letter.fanName}.`,
    },
  ];
}

/** Опции промпта чата: память диалога, анти-повтор зачинов, ротация говорящих (10.09.2026). */
export interface ChatPromptOpts {
  /** отвечаем на эту реплику; не задано — открытие серии */
  replyTo?: string;
  /** открытие: именно этот сотрудник представляется (новичок) */
  openingFor?: string;
  /** реплики этого диалога — следующая реплика «видит» беседу (память треда) */
  history?: Array<{ author: string; text: string }>;
  /** зачины недавних реплик — НЕ повторять */
  recent?: string[];
  /** кто уже говорил в этом диалоге */
  spoken?: string[];
  /** кому стоит дать слово: молчуны, по возрастанию болтливости */
  suggest?: string[];
  /** жёсткая ротация: автором может быть ТОЛЬКО кто-то из suggest */
  hardRotate?: boolean;
}

export function buildMessages(phase: string, context: Record<string, unknown>, opts: ChatPromptOpts = {}): LlmMessage[] {
  const { replyTo, openingFor } = opts;
  const staff = (context.staff as Array<{ id?: string; name: string; gender?: 'M' | 'F'; career: string; stats: { program: number; scenario: number; graphics: number; sound: number }; persona?: string | null }>) ?? [];
  const project = context.project as Record<string, unknown> | null;
  const facts = (context.facts ?? {}) as Record<string, unknown>;

  const teamLine = staff.map((s) => `${s.name} (${s.career}, ${s.gender === 'F' ? 'ж' : 'м'}, П${s.stats.program}/С${s.stats.scenario}/Г${s.stats.graphics}/З${s.stats.sound})`).join('; ');

  const personasLine = staff
    .filter((s) => s.persona)
    .map((s) => `${s.name} — ${s.persona}`)
    .join('; ');
  const personas = personasLine ? `Личности: ${personasLine}` : '';
  // 11.10.2026: босс (герой) — имя и пол, чтобы команда говорила о нём в правильном роде
  const boss = (context.boss ?? null) as { name?: string; gender?: 'M' | 'F' } | null;
  const bossLine = boss && boss.name ? `Босс: ${boss.name} (${boss.gender === 'F' ? 'ж' : 'м'})` : '';

  const projectLine = project
    ? `Проект: ${String(project.genre)} × ${String(project.type)} на ${String(project.console)} (режим ${String(project.mode)}, комбо ${String(project.combo)}, прогресс ${String(project.progress)}%, багов ${String(project.bugs)}, очки: ${String(project.points)})` +
      (project.name ? `\nНазвание игры: ${String(project.name)}` : '') +
      (project.plot ? `\nСюжет игры: ${String(project.plot)}` : '')
    : 'Проект: —';

  // LLM-06(г): итоги релиза — человеческой строкой (score/units жили сырым JSON в «Факты события»)
  // 11.09: units в сейве — ТЫСЯЧИ копий (formulas.ts): «241» печаталось как «241 копия» и команда
  // решала, что релиз провалился (реальный 241K). Формат — как в игре: 241K / 2.50M.
  const releaseParts = phase === 'release'
    ? [
        ...(facts.score != null ? [`рецензии ${String(score100(Number(facts.score)))}/100`] : []),
        ...(facts.units != null && Number.isFinite(Number(facts.units)) ? [`продажи ${formatUnits(Number(facts.units))} копий`] : []),
      ]
    : [];
  // 11.09: реакция знает, ЧТО выпустили — имя и жанр × тип (как в «Истории студии» автопилота)
  const releaseSubject = phase === 'release' && facts.name
    ? `«${String(facts.name)}»${facts.genre ? ` (${[facts.genre, facts.type].filter(Boolean).join(' × ')}${facts.console ? `, ${String(facts.console)}` : ''})` : ''}`
    : '';
  const factsLine = Object.keys(facts).length
    ? releaseParts.length
      ? `Итоги релиза${releaseSubject ? ` игры ${releaseSubject}` : ''}: ${releaseParts.join(', ')}.`
      : `Факты события: ${JSON.stringify(facts)}`
    : '';

  // память диалога (10.09.2026): следующая реплика видит весь тред, а не только одну строку
  const historyBlock = opts.history?.length
    ? `Диалог до этого:\n${opts.history.map((h) => `${h.author}: «${h.text.slice(0, 220)}»`).join('\n')}`
    : '';
  // анти-повтор: раньше модель не видела своих фраз и зацикливала «Ёлки-палки» / «Да ладно тебе»
  const recentBlock = opts.recent?.length
    ? `Уже звучало в чате — НЕ повторяй эти зачины и шутки: ${opts.recent.map((r) => `«${r.trim()}»`).join('; ')}`
    : '';
  // ротация говорящих: слово получают молчуны, а не одни и те же двое
  const rotationBlock =
    opts.hardRotate && opts.suggest?.length
      ? [
          opts.spoken?.length ? `СТРОГО: ${opts.spoken.join(', ')} уже говорили в этом диалоге —` : 'СТРОГО:',
          `сейчас автором должен быть ТОЛЬКО один из: ${opts.suggest.join(', ')}.`,
        ].join(' ')
      : opts.spoken?.length || opts.suggest?.length
        ? [
            opts.spoken?.length ? `В диалоге уже говорили: ${opts.spoken.join(', ')}.` : '',
            opts.suggest?.length
              ? opts.spoken?.length
                ? `Дай слово тому, кто ещё НЕ говорил: ${opts.suggest.join(', ')}.`
                : `Слово лучше дать одному из: ${opts.suggest.join(', ')}.`
              : '',
            'Автор не отвечает на свою реплику и не говорит дважды подряд.',
          ].filter(Boolean).join(' ')
        : '';

  const replyBlock = replyTo
    ? `Последняя реплика: «${replyTo.slice(0, 400)}»`
    : openingFor
      ? `В команде новый сотрудник — ${openingFor}. Пусть именно ${openingFor} представится: расскажет о себе (кто и что будет делать) в своём стиле.`
      : `Задача: ${
          phase === 'player' || phase === 'fanmail'
            ? PHASE_INSTRUCTIONS[phase]!.replace('%TEXT%', String((facts.text ?? '').toString().slice(0, 300)))
            : PHASE_INSTRUCTIONS[phase] ?? 'Обычный рабочий день.'
        }`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `Год ${String(context.year)}, неделя ${String(context.week)}.`,
        `Команда: ${teamLine}`,
        bossLine,
        personas,
        projectLine,
        factsLine,
        `Деньги: ${String(context.money)}K, фанаты: ${String(context.fans)}, PR: ${String(context.research)}.`,
        historyBlock,
        recentBlock,
        replyBlock,
        rotationBlock,
        replyTo
          ? 'Верни JSON {"message":{"author":"Имя сотрудника","text":"реплика"}} — ТОЛЬКО ОДНО сообщение: один сотрудник живо отвечает, продолжая диалог (реагируй на суть последней реплики, не противоречь цифрам из «Факты события»).'
          : 'Верни JSON {"message":{"author":"Имя сотрудника","text":"реплика"}} — ТОЛЬКО ОДНО сообщение: один сотрудник открывает обсуждение.',
        'author — строго одно из имён сотрудников из списка. Без пояснений и markdown.',
      ].filter(Boolean).join('\n'),
    },
  ];
}

// ─── автопилот: решение «какую игру делать» (16): обсуждение и решение ОДНИМ ответом ───
// Команда сама спорит и решает: реплики, жанр/тип/платформа, упор, роли, название и описание.
// Без таблиц комбо/цен — решают как творческие люди (запрос: «обоснование не по механикам»).
export function buildDecisionPrompt(ctx: {
  team: string; money: number; research: number; office: number;
  genres: string; types: string; consoles: string; directionPoints: number;
  /** AP-05: удачное прошлое (зал славы) — можно сделать продолжение */ sequel?: string;
  /** AP-04: свежие письма фанатов — после разгрома жанр меняем */ fans?: string;
  /** 16: последние релизы студии — «история», человеческий мотив выбора */ history?: string;
  /** 16: прошлый проект — о чём команда помнит */ lastProject?: string;
}): LlmMessage[] {
  return [
    {
      role: 'system',
      content:
        'Ты — команда игровой студии (несколько сотрудников с разными характерами). Босс отдал команде управление, и она сама решает, какую игру делать дальше. ' +
        'Ответ — СТРОГО один JSON-объект: сначала живое обсуждение, потом решение. Схема: ' +
        '{"messages":[{"author":"Имя сотрудника","text":"реплика"}],"genreId":"...","typeId":"...","consoleId":"...","mode":"normal","direction":{"cute":0,"realism":0,"approach":0,"niche":0,"simple":0,"innovation":0,"world":0,"polish":0},"proposalStaffId":"...","assignments":{"program":[],"graphics":[],"sound":[],"debug":[]},"name":"название игры","plot":"1–3 предложения — о чём игра"}. ' +
        'Правила: ' +
        '- messages — 2–4 реплики РАЗНЫХ сотрудников (1–2 предложения), живой разговор: идеи, сомнения, шутки; в репликах команда сходится на жанре, типе, платформе и упоре, распределяет между собой роли (кто сценарий, кто программа, кто графика, кто звук, кто отладка) и придумывает название с описанием; author — строго имя из «Команды». В скобках у каждого указан пол (м/ж) — реплики строго в его роде («я пошёл/пошла», «сам/сама»). ' +
        '- Говорите как творческие люди: что хочется сделать, что просят фанаты, что у команды лучше получается, продолжение удачных игр, желание попробовать новое. НЕ упоминайте рейтинги, градации, проценты, цены и «выгодность» — это разговор людей, а не калькулятора. ' +
        `- Решение: genreId/typeId/consoleId — только id из списков; сценарист (proposalStaffId) обязателен и не входит в другие роли; у каждого сотрудника одна роль; mode: normal, speed, quality, research, budget; direction — целые 0..8, сумма РОВНО ${ctx.directionPoints} (весь пул в дело), 1–2 ведущие оси до 8; name — до 40 символов. ` +
        '- Без пояснений и markdown вокруг JSON.',
    },
    {
      role: 'user',
      content: [
        `Команда: ${ctx.team}`,
        `Деньги: ${ctx.money}K, PR: ${ctx.research}, офис: ${ctx.office}.`,
        `Жанры: ${ctx.genres}`,
        `Типы: ${ctx.types}`,
        `Доступные консоли: ${ctx.consoles}`,
        ctx.history ? `История студии (последние игры): ${ctx.history}.` : '',
        ctx.lastProject ? `Прошлый проект: ${ctx.lastProject}.` : '',
        ctx.sequel ? `Удачное прошлое (можно сделать продолжение): ${ctx.sequel}.` : '',
        ctx.fans ? `Письма фанатов (свежие): ${ctx.fans}. После разгрома этот жанр не повторяйте — сделайте другой; восторг — можно продолжить удачную линейку.` : '',
        `Очки направления: ${ctx.directionPoints} (сумма direction = ${ctx.directionPoints} — все очки в дело).`,
      ].filter(Boolean).join('\n'),
    },
  ];
}

/** Разбор единого ответа команды (16): план + реплики обсуждения (null — JSON не разобрался). */
export interface DecisionResult {
  plan: AutopilotPlan;
  messages: ChatReply[];
}
export function parseDecision(text: string): DecisionResult | null {
  const json = extractJsonObject(text);
  if (!json) return null;
  const direction = (json.direction ?? {}) as Record<string, unknown>;
  const dir: Record<string, number> = {};
  for (const k of ['cute', 'realism', 'approach', 'niche', 'simple', 'innovation', 'world', 'polish']) {
    const v = Number(direction[k] ?? 0);
    dir[k] = Number.isFinite(v) ? Math.max(0, Math.min(8, Math.round(v))) : 0;
  }
  const assignments = (json.assignments ?? {}) as Record<string, unknown>;
  const ids = (k: string): string[] => {
    const v = assignments[k];
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  };
  if (
    typeof json.genreId !== 'string' || typeof json.typeId !== 'string' ||
    typeof json.consoleId !== 'string' || typeof json.proposalStaffId !== 'string'
  ) return null;
  const mode = json.mode === 'speed' || json.mode === 'quality' || json.mode === 'research' || json.mode === 'budget' ? json.mode : 'normal';
  // реплики обсуждения — из того же ответа (состав авторов проверяет вызывающая сторона)
  const list = Array.isArray(json.messages) ? (json.messages as Record<string, unknown>[]) : [];
  const messages: ChatReply[] = [];
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const author = typeof r.author === 'string' ? r.author.trim() : '';
    const line = typeof r.text === 'string' ? r.text.trim() : '';
    if (author && line.length >= 4 && line.length <= 500) messages.push({ author, text: line });
  }
  // название ≤40 (поле мастера) и краткое описание; пустые — undefined (мастер сгенерирует сам)
  const name = typeof json.name === 'string' ? json.name.trim().slice(0, 40) : '';
  const plot = typeof json.plot === 'string' ? json.plot.trim().slice(0, 800) : '';
  return {
    plan: {
      genreId: json.genreId, typeId: json.typeId, consoleId: json.consoleId, mode,
      direction: dir,
      proposalStaffId: json.proposalStaffId,
      assignments: { program: ids('program'), graphics: ids('graphics'), sound: ids('sound'), debug: ids('debug') },
      name: name || undefined,
      plot: plot || undefined,
    },
    messages,
  };
}

/** Разобрать одиночный ответ {"message":{"author":"...","text":"..."}}.
 *  LLM-06(в): если модель ответила массивом messages (как просит системный промпт), берём
 *  первую ВАЛИДНУЮ реплику, а не молча arr[0]; при avoidAuthor пропускаем того, кто говорил
 *  последним — сотрудник не отвечает сам себе. */
export function parseSingleMessage(text: string, avoidAuthor?: string): { author: string; text: string } | null {
  const json = extractJsonObject(text) as Record<string, unknown> | null;
  const m = json?.message as Record<string, unknown> | undefined;
  if (m && typeof m.author === 'string' && typeof m.text === 'string' && m.text.trim().length > 0) {
    return { author: m.author, text: m.text.trim() };
  }
  // фолбэк: массив messages — первая валидная реплика (раньше без проверок брался arr[0]:
  // короткая/битая первая строка валила всю серию, хотя дальше были хорошие реплики)
  const arr = Array.isArray(json?.messages) ? (json.messages as Record<string, unknown>[]) : [];
  const valid = arr.filter(
    (r): r is { author: string; text: string } =>
      r !== null && r !== undefined && typeof r.author === 'string' && typeof r.text === 'string'
      && r.text.trim().length >= 4 && r.text.trim().length <= 500,
  );
  const pick = valid.find((r) => r.author.trim() !== avoidAuthor) ?? valid[0];
  return pick ? { author: pick.author.trim(), text: pick.text.trim() } : null;
}

/** Извлечь JSON-объект из текста ответа (съедает markdown-обёртки и мусор). */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  try {
    const p = JSON.parse(text) as unknown;
    if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>;
  } catch { /* дальше */ }
  const startIdx = text.indexOf('{');
  if (startIdx === -1) return null;
  let depth = 0, inString = false, escaped = false, endIdx = -1;
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]!;
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
    }
  }
  if (endIdx === -1) return null;
  try {
    const p = JSON.parse(text.slice(startIdx, endIdx + 1)) as unknown;
    if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>;
  } catch { /* null */ }
  return null;
}

export interface ChatReply { author: string; text: string }

/** Разобрать ответ LLM в реплики; авторы проверяются вызывающей стороной (по составу команды). */
export function parseChatResponse(raw: string): ChatReply[] {
  const obj = extractJsonObject(raw);
  if (!obj) return [];
  const list = obj.messages;
  if (!Array.isArray(list)) return [];
  const out: ChatReply[] = [];
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    const r = m as Record<string, unknown>;
    if (typeof r.author !== 'string' || typeof r.text !== 'string') continue;
    const author = r.author.trim();
    const text = r.text.trim();
    if (author && text.length >= 4 && text.length <= 500) out.push({ author, text });
  }
  return out;
}
