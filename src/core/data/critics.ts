// PLAN-30: пресса — 10 журналов и их критиков (шутливые отсылки к настоящим изданиям).
// Веса — вклад направления в оценку критика (fun/creativity/graphics/sound), как раньше JUDGE_WEIGHTS.
// Шкала: каждый критик ставит 3–10; десять критиков = итог 30–100. «По 2000 на направление» даёт
// сотку при обычном шуме (REVIEW_DIV = 892 подобран под это).
export interface CriticData {
  id: string;
  name: string;
  magazine: string;
  persona: string; // характер — для промпта LLM и текстов
  weights: { fun: number; creativity: number; graphics: number; sound: number };
}

export const CRITICS: CriticData[] = [
  {
    id: 'igromashka',
    name: 'Игорь Варнавкин',
    magazine: 'Игромашка',
    persona: 'ветеран игрожура, тёплый но требовательный; ругает за вторичность, хвалит за смелость',
    weights: { fun: 1.0, creativity: 0.7, graphics: 0.7, sound: 0.6 },
  },
  {
    id: 'strana-igor',
    name: 'Дмитрий Гоблинов',
    magazine: 'Страна Игорь',
    persona: 'острый на язык, язвительный; не терпит пустых игр и повторов',
    weights: { fun: 1.1, creativity: 0.9, graphics: 0.6, sound: 0.5 },
  },
  {
    id: 'navigator-dvora',
    name: 'Сеня Дворников',
    magazine: 'Навигатор Игрового Двора',
    persona: 'дворовый ретро-романтик; ценит глубину и чтобы «во дворе обсуждали»',
    weights: { fun: 0.9, creativity: 0.8, graphics: 0.5, sound: 0.7 },
  },
  {
    id: 'pysy-igry',
    name: 'Джефф Шторман',
    magazine: 'ПыСы Игры',
    persona: 'хардкорный борец за ПК-мастер-рейс; презирает компромиссы и консольную казуальщину',
    weights: { fun: 1.2, creativity: 0.5, graphics: 0.9, sound: 0.7 },
  },
  {
    id: 'drakosha',
    name: 'Ася Рысьева',
    magazine: 'Великий Дракоша',
    persona: 'душа инди и фэнтези; ищет чудеса и атмосферу, прощает технические огрехи',
    weights: { fun: 0.7, creativity: 1.2, graphics: 0.8, sound: 0.6 },
  },
  {
    id: 'lki',
    name: 'Валентин Десяткин',
    magazine: 'Лучшие Крутые Игры',
    persona: 'максималист и щедрый на десятки — но только если игра действительно цепляет',
    weights: { fun: 1.0, creativity: 0.8, graphics: 0.8, sound: 0.8 },
  },
  {
    id: 'peka-gamer',
    name: 'Гриша Тюнер',
    magazine: 'ПеКа Геймер',
    persona: 'фанат настроек, фпс и текстур; меряет игры разрешением и сглаживанием',
    weights: { fun: 0.8, creativity: 0.4, graphics: 1.3, sound: 0.8 },
  },
  {
    id: 'kraeshek',
    name: 'Яхтзи Крауч',
    magazine: 'Краешек',
    persona: 'быстро говорит, не любит попсу; ценит авторский голос и неожиданные решения',
    weights: { fun: 0.6, creativity: 1.2, graphics: 0.9, sound: 0.9 },
  },
  {
    id: 'evgamer',
    name: 'Мадам Рошель',
    magazine: 'Евгеймер',
    persona: 'взвешенная европейская школа; смотрит на игру целиком, без снобизма',
    weights: { fun: 1.0, creativity: 0.7, graphics: 0.9, sound: 0.9 },
  },
  {
    id: 'knr',
    name: 'Кит Вордсворт',
    magazine: 'Камень-Ножницы-Дробовик',
    persona: 'юмор и словесные кульбиты; даже разгром пишет так, что хочется читать',
    weights: { fun: 0.9, creativity: 1.1, graphics: 0.7, sound: 0.7 },
  },
];
