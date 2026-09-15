// Настройка «выключать музыку в неактивной вкладке» — чистая логика.
import { describe, expect, it } from 'vitest';
import { DEFAULT_MUSIC_HIDDEN, MUSIC_HIDDEN_KEY, musicHiddenLabel, parseMusicHidden } from '../src/shared/music';

describe('музыка в неактивной вкладке — настройка', () => {
  it('дефолт — выключать', () => {
    expect(parseMusicHidden(null)).toBe('on');
    expect(parseMusicHidden(undefined)).toBe('on');
    expect(DEFAULT_MUSIC_HIDDEN).toBe('on');
  });
  it('«не выключать» читается как off', () => {
    expect(parseMusicHidden('off')).toBe('off');
  });
  it('мусор — дефолт', () => {
    expect(parseMusicHidden('maybe')).toBe('on');
    expect(parseMusicHidden(0)).toBe('on');
    expect(parseMusicHidden({})).toBe('on');
  });
  it('подписи — по-русски', () => {
    expect(musicHiddenLabel('on')).toBe('Выключать');
    expect(musicHiddenLabel('off')).toBe('Не выключать');
  });
  it('ключ хранения постоянный (совместимость)', () => {
    expect(MUSIC_HIDDEN_KEY).toBe('gds-music-hidden');
  });
});
