// M4: уровень звука — чистая логика (парсинг, громкость, подписи).
import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND, parseSoundLevel, soundLabel, volumeOf } from '../src/shared/sound';

describe('M4: звук — уровень и громкость', () => {
  it('без записи — дефолт «тихо»', () => {
    expect(parseSoundLevel(null)).toBe('low');
    expect(parseSoundLevel(undefined)).toBe('low');
    expect(DEFAULT_SOUND).toBe('low');
  });
  it('мусор в записи — тоже дефолт', () => {
    expect(parseSoundLevel('loud')).toBe('low');
    expect(parseSoundLevel(1)).toBe('low');
    expect(parseSoundLevel({})).toBe('low');
  });
  it('валидные уровни проходят как есть', () => {
    expect(parseSoundLevel('off')).toBe('off');
    expect(parseSoundLevel('low')).toBe('low');
    expect(parseSoundLevel('mid')).toBe('mid');
    expect(parseSoundLevel('high')).toBe('high');
  });
  it('громкость: выкл — 0, дальше строго по возрастанию', () => {
    expect(volumeOf('off')).toBe(0);
    expect(volumeOf('low')).toBeGreaterThan(0);
    expect(volumeOf('low')).toBeLessThan(volumeOf('mid'));
    expect(volumeOf('mid')).toBeLessThan(volumeOf('high'));
    expect(volumeOf('high')).toBeLessThanOrEqual(1);
  });
  it('подписи — по-русски, коротко', () => {
    expect(soundLabel('off')).toBe('Выкл');
    expect(soundLabel('low')).toBe('Тихо');
    expect(soundLabel('mid')).toBe('Средне');
    expect(soundLabel('high')).toBe('Громко');
  });
});
