// PLAN-18: dev-режим почты — письмо кладётся в data/mail-out (SMTP подключается на выкладке).
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import { createMailer, MAIL_OUT_DIR, parseFrom } from '../src/server/mailer';

describe('PLAN-20: почта через SendPulse API (HTTPS, без SMTP-портов)', () => {
  it('parseFrom разбирает «Имя <адрес>» и голый адрес', () => {
    expect(parseFrom('Game Dev Studio <no-reply@mertas.space>')).toEqual({ name: 'Game Dev Studio', email: 'no-reply@mertas.space' });
    expect(parseFrom('no-reply@mertas.space')).toEqual({ name: 'Game Dev Studio', email: 'no-reply@mertas.space' });
  });

  it('OAuth: берёт токен и отправляет письмо с нашего домена', async () => {
    const calls: { url: string; body: string; auth: string }[] = [];
    const post = async (url: string, headers: Record<string, string>, body: string) => {
      calls.push({ url, body, auth: headers.Authorization ?? '' });
      if (url.endsWith('/oauth/access_token')) return { access_token: 'tok-123', expires_in: 3600 };
      return { result: true, id: 'msg-1' };
    };
    const mail = createMailer({
      mode: 'api', from: 'Game Dev Studio <no-reply@mertas.space>',
      sendpulse: { id: 'id', secret: 'sec' }, post,
    });
    expect(await mail.send('drug@example.com', 'Восстановление пароля', 'Код 123456')).toBe('api');
    expect(calls[0]!.url).toContain('/oauth/access_token');
    expect(calls[0]!.body).toContain('client_credentials');
    expect(calls[1]!.url).toContain('/smtp/emails');
    expect(calls[1]!.auth).toBe('Bearer tok-123');
    const payload = JSON.parse(calls[1]!.body) as { email: { subject: string; from: { email: string }; to: { email: string }[]; text: string } };
    expect(payload.email.subject).toBe('Восстановление пароля');
    expect(payload.email.from.email).toBe('no-reply@mertas.space');
    expect(payload.email.to[0]!.email).toBe('drug@example.com');
    expect(payload.email.text).toContain('Код 123456');
  });

  it('статический ключ — без OAuth; отказ сервиса и пустые ключи дают понятную ошибку', async () => {
    let auth = '';
    const ok = createMailer({
      mode: 'api', sendpulse: { apiKey: 'key-1' },
      post: async (_u, h) => { auth = h.Authorization ?? ''; return { result: true }; },
    });
    expect(await ok.send('a@b.ru', 'тема', 'текст')).toBe('api');
    expect(auth).toBe('Bearer key-1');

    const refused = createMailer({ mode: 'api', sendpulse: { apiKey: 'k' }, post: async () => ({ result: false, message: 'sender not verified' }) });
    await expect(refused.send('a@b.ru', 'т', 'т')).rejects.toThrow(/sender not verified/);

    const noKeys = createMailer({ mode: 'api', sendpulse: {}, post: async () => ({}) });
    await expect(noKeys.send('a@b.ru', 'т', 'т')).rejects.toThrow(/SENDPULSE/);
  });
});

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
