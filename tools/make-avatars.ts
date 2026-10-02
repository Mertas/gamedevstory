// Импорт аватарок сотрудников из LLMPics → public/avatars/<staffId>.png (48×48).
// Источник — проект «Иконки сотрудников GDS» (E:/MY/LLMPics): берём ВЫБРАННЫЙ вариант каждой цели.
// У кого иконки нет — остаётся случайная avatar-NN.png (фолбэк в UI: StaffAvatar).
// Запуск: pnpm avatars
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LLMPICS_PROJECT = 'E:/MY/LLMPics/data/projects/gds-staff-icons';
const OUT_DIR = path.join(ROOT, 'public', 'avatars');
const SIZE = 48;

interface StoredSubject { id: string; selected?: string | string[] | null }

const subjectsFile = path.join(LLMPICS_PROJECT, 'subjects.json');
if (!fs.existsSync(subjectsFile)) {
  console.error(`Нет данных LLMPics: ${subjectsFile}\nСначала запусти LLMPics (E:/MY/LLMPics) и сгенерируй иконки.`);
  process.exit(1);
}
const { subjects } = JSON.parse(fs.readFileSync(subjectsFile, 'utf8')) as { subjects: StoredSubject[] };
let meta: Record<string, { size?: number; nativeSize?: boolean }> = {};
try { meta = JSON.parse(fs.readFileSync(path.join(LLMPICS_PROJECT, 'meta.json'), 'utf8')); } catch { /* без мета берём первый выбранный */ }

fs.mkdirSync(OUT_DIR, { recursive: true });
let imported = 0;
let absent = 0;
for (const s of subjects) {
  // selected — массив (режим секций: 256/512/1024) или легаси-строка
  const sel = s.selected == null ? [] : Array.isArray(s.selected) ? s.selected : [s.selected];
  if (!sel.length) { absent++; continue; }
  // источник побольше, но самый мелкий из подходящих: нативная 256 → sharp уменьшит до 48 с nearest
  const ranked = [...sel].sort((a, b) => (meta[a]?.size ?? 0) - (meta[b]?.size ?? 0));
  const pick = ranked.find((f) => (meta[f]?.size ?? 0) >= SIZE) ?? ranked[ranked.length - 1]!;
  const src = path.join(LLMPICS_PROJECT, 'icons', pick);
  if (!fs.existsSync(src)) { absent++; continue; }
  await sharp(src)
    .resize(SIZE, SIZE, { kernel: 'nearest' })
    .png()
    .toFile(path.join(OUT_DIR, `${s.id}.png`));
  imported++;
}
console.log(`OK: импортировано ${imported}/${subjects.length} иконок → public/avatars/ (без выбранной иконки: ${absent})`);
