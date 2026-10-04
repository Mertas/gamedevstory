// PLAN-26: аватарки сотрудников — персональные иконки public/avatars/<id>.png должны носить
// реальные id сотрудников (файл-сирота = опечатка или переименование) и быть PNG 48×48.
// v1.41.0: наборы LLMPics в папках avatars/<id>/ — используемые UI-варианты на месте и нативные.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STAFF } from '../src/core/data/db';

const DIR = fileURLToPath(new URL('../public/avatars', import.meta.url));
const personal = () => readdirSync(DIR).filter((f) => f.endsWith('.png') && !f.startsWith('avatar-'));

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
  // варианты, которые использует UI (карта AV в src/ui/StaffAvatar.tsx), и их нативные размеры
  const USED: Array<[string, number]> = [
    ['256_d8', 32], // рабочий стол, таблица команды
    ['256_d12', 21], // «печатает…» в чате
    ['256_d16', 16], // таскбар и заголовок окна сотрудника
    ['1024_d16', 64], // обучение, команда проекта, чат
    ['1024_d12', 85], // превью кандидата перед наймом
    ['1024_d8', 128], // приложение сотрудника, основатели
  ];

  // TODO(иконки): phil-harmonic — иконки ещё не сгенерированы (цель добавлена в LLMPics
  // gds-staff-icons); после генерации и экспорта в public/avatars убрать id из списка.
  const ICON_PENDING = new Set(['phil-harmonic']);

  it('у каждого сотрудника — все используемые варианты, размеры нативные', () => {
    for (const id of ICON_PENDING) {
      expect(STAFF.some((s) => s.id === id), `ICON_PENDING: ${id} нет в STAFF`).toBe(true);
      expect(existsSync(`${DIR}/${id}/${id}_256_d8.png`), `иконки ${id} появились — уберите из ICON_PENDING`).toBe(false);
    }
    const missing: string[] = [];
    for (const s of STAFF) {
      if (ICON_PENDING.has(s.id)) continue;
      for (const [v, px] of USED) {
        const f = `${DIR}/${s.id}/${s.id}_${v}.png`;
        if (!existsSync(f)) {
          missing.push(`${s.id}_${v}`);
          continue;
        }
        const b = readFileSync(f);
        expect(b.subarray(0, 4), s.id).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        expect([b.readUInt32BE(16), b.readUInt32BE(20)], `${s.id}_${v}`).toEqual([px, px]);
      }
    }
    expect(missing).toEqual([]);
  });
});
