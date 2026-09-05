// Генерация аватарок сотрудников: 48 случайных иконок из LLMKing/data/icons → public/avatars (48×48).
// Запуск: pnpm avatars (один раз; файлы кладутся в public/)
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC_DIR = 'E:/MY/LLMKing/data/icons';
const OUT_DIR = path.join(ROOT, 'public', 'avatars');
const COUNT = 48;

const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.png'));
if (files.length < COUNT) {
  console.error(`В ${SRC_DIR} только ${files.length} файлов — нужно >= ${COUNT}`);
  process.exit(1);
}

// детерминированный выбор: перемешиваем фиксированным сидом
const seed = 20260831;
let s = seed >>> 0;
const rnd = () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = ((t ^ (t >>> 15)) * (t | 1)) >>> 0;
  t = ((t ^ (t >>> 7)) * (t | 61)) >>> 0;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const picked = [...files].sort(() => rnd() - 0.5).slice(0, COUNT);

fs.mkdirSync(OUT_DIR, { recursive: true });
let ok = 0;
for (let i = 0; i < picked.length; i++) {
  const name = `avatar-${String(i + 1).padStart(2, '0')}.png`;
  const out = path.join(OUT_DIR, name);
  if (fs.existsSync(out)) { ok++; continue; }
  await sharp(path.join(SRC_DIR, picked[i]!))
    .resize(48, 48, { fit: 'cover' })
    .png()
    .toFile(out);
  ok++;
}
console.log(`OK: ${ok}/${COUNT} аватарок → public/avatars/`);
