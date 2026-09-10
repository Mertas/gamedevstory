// Общее для приложений «Код»: подписи режимов разработки и ролей (UI-08: вынесено из CodeApp.tsx).
import type { Mode } from '../../../core/config';
import type { Role } from '../../../core/types';

export const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'normal', label: 'Обычный', hint: 'стоимость ×1' },
  { id: 'speed', label: 'Быстрый', hint: '−20% времени, но больше багов' },
  { id: 'quality', label: 'Качественный', hint: '+30% очков, +30% стоимости' },
  { id: 'research', label: 'Исследовательский', hint: '+50% PR, +50% стоимости' },
  { id: 'budget', label: 'Бюджетный', hint: 'стоимость ×2, −15% багов' },
];

export const ROLE_LABELS: Record<Role, string> = {
  proposal: 'Сценарий',
  program: 'Программирование',
  graphics: 'Графика',
  sound: 'Звук',
  debug: 'Отладка',
};
