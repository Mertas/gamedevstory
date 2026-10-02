// Аватар сотрудника. Цепочка (v1.41.0): новая иконка LLMPics из папки сотрудника —
// avatars/<staffId>/<staffId>_<вариант>.png (вариант выбирается по месту UI, см. AV) →
// старая плоская avatars/<staffId>.png → случайная из набора (st.avatar) → фолбэк (эмодзи).
// Правило владельца (02.10.2026): картинки НЕ уменьшаем — нативный размер; проп size — только
// для особых мест (например «печатает…» 21px).
// Тип — структурный минимум: подходит и Staff, и кандидат из meta.staff (без аватарки).
import { useEffect, useState } from 'react';

/** Варианты иконок по местам UI (файл avatars/<id>/<id>_<вариант>.png).
 *  Нативные размеры: 256_d8=32, 256_d12=21, 256_d16=16, 1024_d16=64, 1024_d12=85, 1024_d8=128. */
export const AV = {
  desktop: '256_d8', // рабочий стол (иконки сотрудников) — 32px
  hireTeam: '256_d8', // найм → «Команда», таблица — 32px
  hirePreview: '1024_d12', // найм → превью кандидата (мини-карточка) — 85px
  training: '1024_d16', // обучение + «Код → Команда» (StaffCard) — 64px
  chat: '1024_d16', // чат, сообщения — 64px
  chatTyping: '256_d12', // чат, строка «печатает…» — 21px
  taskbar: '256_d16', // таскбар и заголовок окна сотрудника — 16px
  staffWindow: '1024_d8', // приложение сотрудника — 128px
  newGame: '1024_d8', // выбор основателей в новой игре — 128px
} as const;

export interface StaffAvatarProps {
  staff: { id: string; avatar?: string };
  /** вариант из LLMPics (AV.*) */
  variant?: string;
  /** фиксированный размер в px; без него — нативный размер файла */
  size?: number;
  className?: string;
  /** Что показать, если файлов нет вовсе (по умолчанию — ничего). */
  fallback?: React.ReactNode;
}

export function StaffAvatar({ staff, variant, size, className, fallback }: StaffAvatarProps) {
  const [stage, setStage] = useState(0);
  useEffect(() => setStage(0), [staff.id, variant]);
  const urls = [
    variant ? `avatars/${staff.id}/${staff.id}_${variant}.png` : '',
    `avatars/${staff.id}.png`,
    staff.avatar || '',
  ].filter(Boolean) as string[];
  const src = urls[stage] ?? '';
  if (!src) return <>{fallback ?? null}</>;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={className}
      style={{ imageRendering: 'pixelated', ...(size ? { width: size, height: size } : null) }}
      onError={() => setStage((s) => s + 1)}
    />
  );
}
