// PLAN-18: dev-режим почты — письмо кладётся в data/mail-out (SMTP подключается на выкладке).
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import { createMailer, MAIL_OUT_DIR } from '../src/server/mailer';

describe('PLAN-18: почта', () => {
  it('dev-режим: письмо сохраняется в data/mail-out и режим = dev', async () => {
    const mode = await createMailer().send('test@example.com', 'Восстановление пароля', 'Код: 123456');
    expect(mode).toBe('dev');
    const files = fs.readdirSync(MAIL_OUT_DIR).filter((f) => f.includes('test@example.com'));
    expect(files.length).toBeGreaterThan(0);
    const last = files.sort().at(-1)!;
    const body = fs.readFileSync(`${MAIL_OUT_DIR}/${last}`, 'utf8');
    expect(body).toContain('Код: 123456');
    expect(body).toContain('test@example.com');
  });
});
