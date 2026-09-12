// PLAN-26: аватарки сотрудников — персональные иконки public/avatars/<id>.png должны носить
// реальные id сотрудников (файл-сирота = опечатка или переименование) и быть PNG 48×48.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
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
