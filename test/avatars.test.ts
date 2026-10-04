// PLAN-26: аватарки сотрудников — персональные иконки public/avatars/<id>.png должны носить
// реальные id сотрудников (файл-сирота = опечатка или переименование) и быть PNG 48×48.
// v1.41.0: наборы LLMPics в папках avatars/<id>/ — используемые UI-варианты на месте и нативные.
// v1.47.0: то же для аватарок игрока-героя — папки avatars/player-NN/ (проект gds-player-avatars).
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STAFF } from '../src/core/data/db';
import { PLAYER_AVATARS } from '../src/shared/hero';

const DIR = fileURLToPath(new URL('../public/avatars', import.meta.url));
const personal = () => readdirSync(DIR).filter((f) => f.endsWith('.png') && !f.startsWith('avatar-'));

// варианты, которые использует UI (карта AV в src/ui/StaffAvatar.tsx), и их нативные размеры
const USED: Array<[string, number]> = [
  ['256_d8', 32], // рабочий стол, таблица команды
  ['256_d12', 21], // «печатает…» в чате
  ['256_d16', 16], // таскбар и заголовок окна сотрудника
  ['1024_d16', 64], // обучение, команда проекта, чат
  ['1024_d12', 85], // превью кандидата перед наймом
  ['1024_d8', 128], // приложение сотрудника, основатели
];

/** Все используемые варианты папок <id>/ на месте и нативные; возвращает отсутствующие. */
function missingVariants(ids: readonly string[]): string[] {
  const missing: string[] = [];
  for (const id of ids) {
    for (const [v, px] of USED) {
      const f = `${DIR}/${id}/${id}_${v}.png`;
      if (!existsSync(f)) {
        missing.push(`${id}_${v}`);
        continue;
      }
      const b = readFileSync(f);
      expect(b.subarray(0, 4), id).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      expect([b.readUInt32BE(16), b.readUInt32BE(20)], `${id}_${v}`).toEqual([px, px]);
    }
  }
  return missing;
}

describe('PLAN-26 аватарки сотрудников', () => {
  it('персональные иконки названы по реальным id сотрудников', () => {
    const ids = new Set(STAFF.map((s) => s.id));
    expect(ids.size).toBeGreaterThan(40);
    const files = personal();
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((f) => !ids.has(f.slice(0, -4)))).toEqual([]);
  });

  it('каждая персональная иконка — PNG 48×48', () => {
    for (const f of personal()) {
      const b = readFileSync(`${DIR}/${f}`);
      expect(b.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([48, 48]);
    }
  });
});

describe('v1.41 варианты иконок LLMPics (папки сотрудников)', () => {
  it('у каждого сотрудника — все используемые варианты, размеры нативные', () => {
    expect(missingVariants(STAFF.map((s) => s.id))).toEqual([]);
  });
});

describe('v1.47 иконки игрока-героя (папки player-NN)', () => {
  it('у каждой аватарки игрока — все используемые варианты, размеры нативные', () => {
    expect(missingVariants(PLAYER_AVATARS)).toEqual([]);
  });
});
