// Аватар сотрудника: сначала персональная иконка из LLMPics (avatars/<staffId>.png),
// затем случайная из набора (st.avatar), затем — фолбэк (например, эмодзи).
// Тип — структурный минимум: подходит и Staff, и кандидат из meta.staff (без аватарки).
import { useEffect, useState } from 'react';

export interface StaffAvatarProps {
  staff: { id: string; avatar?: string };
  size?: number;
  className?: string;
  /** Что показать, если файлов нет вовсе (по умолчанию — ничего). */
  fallback?: React.ReactNode;
}

export function StaffAvatar({ staff, size, className, fallback }: StaffAvatarProps) {
  // 0 — персональная иконка LLMPics, 1 — случайная, 2 — фолбэк
  const [stage, setStage] = useState(0);
  const custom = `avatars/${staff.id}.png`;
  useEffect(() => setStage(0), [staff.id]);

  const src = stage === 0 ? custom : stage === 1 ? (staff.avatar || null) : null;
  if (!src) return <>{fallback ?? null}</>;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className={className}
      style={size ? { width: size, height: size } : undefined}
      onError={() => setStage((s) => (s === 0 && staff.avatar ? 1 : 2))}
    />
  );
}
