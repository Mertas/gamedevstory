// Русские названия профессий — единственный источник (сервер: попапы; клиент: карточки/селекты).
import type { CareerId } from '../core/data/schema';

export const CAREER_LABELS: Record<string, string> = {
  coder: 'Кодер', writer: 'Сценарист', designer: 'Дизайнер', sound: 'Звукорежиссёр',
  director: 'Режиссёр', producer: 'Продюсер', hw: 'Инженер железа', hacker: 'Хакер',
};

/** Порядок профессий в UI (окно сотрудника, мини-карточка кандидата). */
export const CAREER_ORDER: CareerId[] = ['coder', 'writer', 'designer', 'sound', 'director', 'producer', 'hw', 'hacker'];
