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

interface StoredSubject { id: string; selected?: string | null }

const subjectsFile = path.join(LLMPICS_PROJECT, 'subjects.json');
if (!fs.existsSync(subjectsFile)) {
  console.error(`Нет данных LLMPics: ${subjectsFile}\nСначала запусти LLMPics (E:/MY/LLMPics) и сгенерируй иконки.`);
  process.exit(1);
}
const { subjects } = JSON.parse(fs.readFileSync(subjectsFile, 'utf8')) as { subjects: StoredSubject[] };

fs.mkdirSync(OUT_DIR, { recursive: true });
let imported = 0;
let absent = 0;
for (const s of subjects) {
  if (!s.selected) { absent++; continue; }
  const src = path.join(LLMPICS_PROJECT, 'icons', s.selected);
  if (!fs.existsSync(src)) { absent++; continue; }
  await sharp(src)
    .resize(SIZE, SIZE, { kernel: 'nearest' })
    .png()
    .toFile(path.join(OUT_DIR, `${s.id}.png`));
  imported++;
}
console.log(`OK: импортировано ${imported}/${subjects.length} иконок → public/avatars/ (без выбранной иконки: ${absent})`);
