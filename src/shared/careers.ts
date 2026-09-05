// Русские названия профессий — ЕДИНСТВЕННЫЙ источник (аудит 05.09, D3: раньше были
// дубликаты CAREER_RU в core/systems/progression.ts и CAREER_LABELS в ui/careers.ts).
// Используется и сервером (попапы), и клиентом (карточки/селекты).
export const CAREER_LABELS: Record<string, string> = {
  coder: 'Кодер', writer: 'Сценарист', designer: 'Дизайнер', sound: 'Звукорежиссёр',
  director: 'Режиссёр', producer: 'Продюсер', hw: 'Инженер железа', hacker: 'Хакер',
};
