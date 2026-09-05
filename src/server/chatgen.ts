// Промпты чата разработчиков + парсинг ответа LLM (JSON {"messages":[...]}).
// Порт extractJsonObject из LLMKing/src/server/llm.ts.

interface LlmMessage { role: 'system' | 'user'; content: string }

const SYSTEM_PROMPT = `Ты — корпоративный чат игровой студии. Сотрудники обсуждают текущий проект.
Правила:
- Пиши ТОЛЬКО на русском, реплики 1–2 предложения, живой корпоративный тон с лёгким юмором.
- Характеры по профессиям: программист — ироничный мемолог, любит сроки и рефакторинг; сценарист — пафосный, говорит о «мирах» и «сюжетных дугах»; дизайнер — эстет, переживает за пиксели; звукорежиссёр — перфекционист, слышит «шум» везде; директор — коротко и по делу, про дедлайны; продюсер — про бюджет и продажи; хардвер-инженер — про «железо» и мегагерцы; хакер — загадочный.
- ЛИЧНОСТИ из строки «Личности:» в контексте — ВАЖНЕЕ характеров по профессиям: строго следуй им (стиль, лексика, манера речи).
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
  player: 'Босс студии написал в чат: «%TEXT%». Живо ответьте ему в своём стиле — по делу (совет, отчёт, мнение, шутка). Если разговор продолжится — пусть отвечают разные сотрудники по очереди, развивая тему и реагируя друг на друга.',
  fanmail: 'Студия получила письмо от фаната (текст: «%TEXT%»). Один сотрудник открывает обсуждение: живо отреагируйте на письмо сообразно его тону (восторг/недовольство/сдержанно) — ответьте фанату или обсудите с командой, в своём стиле, по делу.',
};

// персональные личности сотрудников приходят из контентной БД (research/04 → personalities
// → STAFF.persona → buildContext в game.ts) — ВАЖНЕЕ характеров по профессиям.
// ПРИМЕЧАНИЕ: GigaChat модерирует жёсткий мат (отказ) — используем мягкую грубость (проверено).

// письмо фаната: текст пишет LLM (движок дал заготовку; GigaChat-модерирует мат — hate без мата)
export function buildLetterPrompt(letter: {
  fanName: string; gender: 'M' | 'F'; sentiment: 'love' | 'neutral' | 'hate';
  gameName: string; score: number; year: number;
}): LlmMessage[] {
  const genderWord = letter.gender === 'F' ? 'женщина' : 'мужчина';
  const tone = letter.sentiment === 'love'
    ? 'восторженное и благодарное, эмоции через край, но искренне'
    : letter.sentiment === 'hate'
      ? 'раздражённое и разочарованное: конкретные претензии, сарказм и ирония, НО без мата и грубостей (письмо приличное, но злое)'
      : 'сдержанно-доброжелательное, с парой дельных замечаний';
  return [
    {
      role: 'system',
      content:
        `Ты — обычный игрок (${genderWord}) в ${letter.year}-м году игровой индустрии, эпоха 8/16-бит. ` +
        `Напиши письмо в игровую студию от первого лица о только что вышедшей игре. Тон: ${tone}. ` +
        'Правила: только текст письма, 2–4 предложения, без подписи в конце (имя и так известно), ' +
        'без markdown, без кавычек-обёртки вокруг всего письма, не упоминай, что ты ИИ.',
    },
    {
      role: 'user',
      content: `Игра: «${letter.gameName}», оценка критиков ${letter.score}/40. Письмо от ${letter.fanName}.`,
    },
  ];
}

export function buildMessages(phase: string, context: Record<string, unknown>, replyTo?: string, openingFor?: string): LlmMessage[] {
  const staff = (context.staff as Array<{ id?: string; name: string; career: string; stats: { program: number; scenario: number; graphics: number; sound: number }; persona?: string | null }>) ?? [];
  const project = context.project as Record<string, unknown> | null;
  const facts = (context.facts ?? {}) as Record<string, unknown>;

  const teamLine = staff.map((s) => `${s.name} (${s.career}, П${s.stats.program}/С${s.stats.scenario}/Г${s.stats.graphics}/З${s.stats.sound})`).join('; ');

  const personasLine = staff
    .filter((s) => s.persona)
    .map((s) => `${s.name} — ${s.persona}`)
    .join('; ');
  const personas = personasLine ? `Личности: ${personasLine}` : '';

  const projectLine = project
    ? `Проект: ${String(project.genre)} × ${String(project.type)} на ${String(project.console)} (режим ${String(project.mode)}, комбо ${String(project.combo)}, прогресс ${String(project.progress)}%, багов ${String(project.bugs)}, очки: ${String(project.points)})` +
      (project.name ? `\nНазвание игры: ${String(project.name)}` : '') +
      (project.plot ? `\nСюжет игры: ${String(project.plot)}` : '')
    : 'Проект: —';

  const factsLine = Object.keys(facts).length ? `Факты события: ${JSON.stringify(facts)}` : '';

  const replyBlock = replyTo
    ? `Последняя реплика: «${replyTo.slice(0, 400)}»`
    : openingFor
      ? `Новичок ${openingFor} только что присоединился к команде. Пусть именно ${openingFor} представится (кто он, что будет делать), в своём стиле.`
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
        personas,
        projectLine,
        factsLine,
        `Деньги: ${String(context.money)}K, фанаты: ${String(context.fans)}, PR: ${String(context.research)}.`,
        replyBlock,
        replyTo
          ? 'Верни JSON {"message":{"author":"Имя сотрудника","text":"реплика"}} — ТОЛЬКО ОДНО сообщение: один сотрудник живо отвечает на последнюю реплику (лучше не автор последнего сообщения).'
          : 'Верни JSON {"message":{"author":"Имя сотрудника","text":"реплика"}} — ТОЛЬКО ОДНО сообщение: один сотрудник открывает обсуждение.',
        'author — строго одно из имён сотрудников из списка. Без пояснений и markdown.',
      ].filter(Boolean).join('\n'),
    },
  ];
}

/** Разобрать одиночный ответ {"message":{"author":"...","text":"..."}} */
export function parseSingleMessage(text: string): { author: string; text: string } | null {
  const json = extractJsonObject(text) as Record<string, unknown> | null;
  const m = json?.message as Record<string, unknown> | undefined;
  if (m && typeof m.author === 'string' && typeof m.text === 'string' && m.text.trim().length > 0) {
    return { author: m.author, text: m.text.trim() };
  }
  // фолбэк: первый элемент messages
  const arr = Array.isArray(json?.messages) ? (json.messages as Record<string, unknown>[]) : [];
  if (arr[0] && typeof arr[0].author === 'string' && typeof arr[0].text === 'string') {
    return { author: arr[0].author, text: arr[0].text.trim() };
  }
  return null;
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
