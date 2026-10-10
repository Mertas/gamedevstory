// Общее для приложений «Код»: подписи режимов разработки и ролей (UI-08: вынесено из CodeApp.tsx).
import type { Mode } from '../../../core/config';
import type { Role } from '../../../core/types';

export const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'normal', label: 'Обычный', hint: 'без изменений' },
  { id: 'speed', label: 'Быстрый', hint: 'время −15%, цена +20%, багов +50%' },
  { id: 'quality', label: 'Качественный', hint: 'очков +32%, цена +30%, время +15%, багов −30%' },
  { id: 'research', label: 'Исследовательский', hint: 'PR +50%, цена +50%, время +10%' },
  { id: 'budget', label: 'Бюджетный', hint: 'цена ×2, очков +62%, время +30%' },
];

export const ROLE_LABELS: Record<Role, string> = {
  proposal: 'Сценарий',
  program: 'Программирование',
  graphics: 'Графика',
  sound: 'Звук',
  debug: 'Отладка',
};
