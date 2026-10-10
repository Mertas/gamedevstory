// LLM-08: порядок аккаунтов GigaChat — текущий первым, резерв следом.
import { describe, expect, it } from 'vitest';
import { gigaCa, gigaOrder, studioAvoidLine } from '../src/server/giga';

describe('LLM-08: обход аккаунтов GigaChat (резерв при отказе основного)', () => {
  it('текущий идёт первым, остальные следом', () => {
    expect(gigaOrder(0, 2)).toEqual([0, 1]);
    expect(gigaOrder(1, 2)).toEqual([1, 0]);
    expect(gigaOrder(0, 1)).toEqual([0]);
  });
  it('битый current не ломает порядок', () => {
    expect(gigaOrder(5, 2)).toEqual([0, 1]);
    expect(gigaOrder(-1, 2)).toEqual([0, 1]);
  });
});

describe('SER-25: исключения в промпте названий студии', () => {
  it('пустой список — без хвоста', () => {
    expect(studioAvoidLine([])).toBe('');
    expect(studioAvoidLine(['  ', ''])).toBe('');
  });
  it('занятые идут «ёлочками», дубли убраны', () => {
    const line = studioAvoidLine(['Пиксель-Плюс', 'Пиксель-Плюс', 'Байт и К°']);
    expect(line).toContain('«Пиксель-Плюс»');
    expect(line).toContain('«Байт и К°»');
    expect(line.match(/«/g)!.length).toBe(2);
  });
  it('не больше 80 названий', () => {
    const many = Array.from({ length: 120 }, (_, i) => `Студия ${i}`);
    expect(studioAvoidLine(many).match(/«/g)!.length).toBe(80);
  });
});

describe('аудит-51 P1-6: TLS GigaChat по корневому CA Минцифры', () => {
  it('корневой сертификат на месте и читается', () => {
    const ca = gigaCa();
    expect(ca).not.toBeNull();
    expect(ca![0]!.toString('utf8')).toContain('-----BEGIN CERTIFICATE-----');
  });
});
