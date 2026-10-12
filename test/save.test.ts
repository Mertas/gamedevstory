// аудит-51 04-P2-4: файловый SaveManager (тестовый/локальный путь; боевой автосейв — users.db).
// Проверяем то, что раньше жило без тестов: запись/чтение, бэкап битого сейва, pre-import-бэкап.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/engine';
import { SaveManager } from '../src/server/save';
import { resetChat } from '../src/shared/chat';

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gds-save-'));
}

describe('аудит-51 04-P2-4: файловый SaveManager', () => {
  it('autosave → read: партия и чат переживают запись', () => {
    const dir = tmpdir();
    const sm = new SaveManager(path.join(dir, 'save.json'));
    const g = newGame(3);
    sm.autosave(g, resetChat(), true);
    const loaded = sm.read();
    expect(loaded?.game.studioName).toBe(g.studioName);
    expect(loaded?.chat).not.toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('битый файл не стирается: read даёт null и .corrupt-бэкап рядом', () => {
    const dir = tmpdir();
    const p = path.join(dir, 'save.json');
    fs.writeFileSync(p, '{битый');
    const sm = new SaveManager(p);
    expect(sm.read()).toBeNull();
    const corrupt = fs.readdirSync(dir).filter((f) => f.includes('.corrupt-'));
    expect(corrupt).toHaveLength(1);
    expect(fs.readFileSync(p, 'utf8')).toBe('{битый'); // оригинал на месте — улика сохранена
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('importPayload: мусор — null, валидный — загрузка с pre-import-бэкапом', () => {
    const dir = tmpdir();
    const p = path.join(dir, 'save.json');
    const sm = new SaveManager(p);
    expect(sm.importPayload('{"nope":true}')).toBeNull();
    expect(fs.readdirSync(dir).filter((f) => f.includes('.pre-import-'))).toHaveLength(0);
    const good = sm.exportPayload(newGame(5), resetChat());
    fs.writeFileSync(p, '{"old":1}');
    const loaded = sm.importPayload(good);
    expect(loaded?.game.studioName).toBeTruthy();
    expect(fs.readdirSync(dir).filter((f) => f.includes('.pre-import-'))).toHaveLength(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
