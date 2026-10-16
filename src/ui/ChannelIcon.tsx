// PLAN-52 M2b: иконка телеканала — public/channels/<id>.png (LLMPics: gds-tv-kanaly).
// Файла нет — фолбэк-эмодзи на плитке, как у квестов (никаких битых картинок).
import { useState } from 'react';
import type { TvChannelId } from '../core/types';

export function ChannelIcon({ id, size, title }: { id: TvChannelId; size: number; title?: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) {
    return <span style={{ fontSize: Math.round(size * 0.8), lineHeight: 1, flexShrink: 0 }}>📺</span>;
  }
  return (
    <img
      src={`/channels/${id}.png`}
      alt=""
      title={title}
      width={size}
      height={size}
      draggable={false}
      style={{ imageRendering: 'pixelated', flexShrink: 0 }}
      onError={() => setOk(false)}
    />
  );
}
