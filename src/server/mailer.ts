// Почта (plan/18/20). Три режима:
//   dev — письмо кладётся файлом в data/mail-out/ (локально) и печатается в консоль;
//   smtp — nodemailer (нужен разблокированный исходящий SMTP у хостера);
//   api  — SendPulse REST по HTTPS (443): у VDSina SMTP закрыт, а HTTPS работает всегда.
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  MAIL_FROM, MAIL_MODE, SENDPULSE_API_KEY, SENDPULSE_ID, SENDPULSE_SECRET,
  SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER,
} from './config';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** Куда dev-режим складывает письма. */
export const MAIL_OUT_DIR = path.join(ROOT, 'data', 'mail-out');

export type MailMode = 'dev' | 'smtp' | 'api';

export interface Mailer {
  /** Отправить письмо. Возвращает режим доставки ('dev' — без реальной почты). */
  send(to: string, subject: string, text: string): Promise<MailMode>;
}

/** HTTP-POST с таймаутом: в тестах подменяется, чтобы не ходить в сеть. */
export type HttpPost = (url: string, headers: Record<string, string>, body: string, timeoutMs?: number) => Promise<Record<string, unknown>>;

export const httpsPost: HttpPost = (url, headers, body, timeoutMs = 60000) => new Promise((resolve, reject) => {
  const req = https.request(url, { method: 'POST', headers }, (res) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => {
      const text = Buffer.concat(chunks).toString();
      try { resolve(JSON.parse(text) as Record<string, unknown>); }
      catch { reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`)); }
    });
  });
  req.on('error', reject);
  req.setTimeout(timeoutMs, () => req.destroy(new Error('HTTP: timeout')));
  req.write(body);
  req.end();
});

/** «Game Dev Studio <no-reply@mertas.space>» → имя и адрес. */
export function parseFrom(from: string): { name: string; email: string } {
  const m = /^(.*?)\s*<([^>]+)>\s*$/.exec(from.trim());
  if (m && m[2]) return { name: (m[1] ?? '').replace(/^"|"$/g, '').trim() || 'Game Dev Studio', email: m[2].trim() };
  return { name: 'Game Dev Studio', email: from.trim() };
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SENDPULSE_API = 'https://api.sendpulse.com';

export interface MailerDeps {
  post?: HttpPost;
  mode?: MailMode;
  from?: string;
  /** Ключи SendPulse: статический ключ из настроек аккаунта или пара id/secret (OAuth). */
  sendpulse?: { apiKey?: string; id?: string; secret?: string };
}

function writeDevLetter(to: string, subject: string, text: string): string {
  fs.mkdirSync(MAIL_OUT_DIR, { recursive: true });
  const safe = (s: string) => s.replace(/[^\w.@-]+/g, '_').slice(0, 60);
  const file = path.join(MAIL_OUT_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-${safe(to)}.txt`);
  fs.writeFileSync(file, `Кому: ${to}\nТема: ${subject}\n\n${text}\n`, 'utf8');
  return file;
}

export function createMailer(deps: MailerDeps = {}): Mailer {
  const post = deps.post ?? httpsPost;
  const mode = deps.mode ?? (MAIL_MODE as MailMode);
  const from = parseFrom(deps.from ?? MAIL_FROM);
  const sp = {
    apiKey: deps.sendpulse?.apiKey ?? SENDPULSE_API_KEY,
    id: deps.sendpulse?.id ?? SENDPULSE_ID,
    secret: deps.sendpulse?.secret ?? SENDPULSE_SECRET,
  };

  let token = '';
  let tokenExp = 0;

  /** Статический ключ из кабинета либо OAuth-токен (client_credentials, живёт час). */
  async function bearer(): Promise<string> {
    if (sp.apiKey) return sp.apiKey;
    if (!sp.id || !sp.secret) throw new Error('MAIL_MODE=api: задайте SENDPULSE_API_KEY или SENDPULSE_ID/SENDPULSE_SECRET');
    if (token && Date.now() < tokenExp) return token;
    const d = await post(
      `${SENDPULSE_API}/oauth/access_token`,
      { 'Content-Type': 'application/json' },
      JSON.stringify({ grant_type: 'client_credentials', client_id: sp.id, client_secret: sp.secret }),
    );
    const t = d.access_token;
    if (typeof t !== 'string' || !t) throw new Error('SendPulse: не удалось получить токен — проверьте SENDPULSE_ID/SENDPULSE_SECRET');
    token = t;
    const ttl = typeof d.expires_in === 'number' ? d.expires_in : 3600;
    tokenExp = Date.now() + Math.max(60, ttl - 120) * 1000; // обновляем с запасом до истечения
    return token;
  }

  return {
    async send(to: string, subject: string, text: string): Promise<MailMode> {
      // ─── dev: письмо файлом + в консоль ───
      if (mode !== 'smtp' && mode !== 'api') {
        const file = writeDevLetter(to, subject, text);
        console.log(`[gds][mail:dev] письмо → ${file}\n[gds][mail:dev] кому: ${to}\n[gds][mail:dev] тема: ${subject}\n${text}`);
        return 'dev';
      }

      // ─── api: SendPulse по HTTPS (работает при закрытых SMTP-портах) ───
      if (mode === 'api') {
        const auth = await bearer();
        const r = await post(
          `${SENDPULSE_API}/smtp/emails`,
          { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth}` },
          JSON.stringify({
            email: {
              subject,
              from,
              to: [{ email: to }],
              text,
              html: `<div style="white-space:pre-wrap;font:14px/1.45 Arial,sans-serif">${escapeHtml(text)}</div>`,
              auto_plain_text: true,
            },
          }),
        );
        if (r.result !== true) {
          const why = (r.message ?? r.error ?? JSON.stringify(r)).toString().slice(0, 200);
          throw new Error(`SendPulse: письмо не принято — ${why}`);
        }
        return 'api';
      }

      // ─── smtp: nodemailer (пакет нужен только в этом режиме) ───
      let nodemailer: typeof import('nodemailer');
      try {
        nodemailer = await import('nodemailer');
      } catch {
        throw new Error('SMTP-режим: установите nodemailer (pnpm add nodemailer) или включите MAIL_MODE=dev/api');
      }
      if (!SMTP_HOST || !SMTP_USER) throw new Error('SMTP-режим: заполните SMTP_HOST/SMTP_USER/SMTP_PASS в .env');
      const transport = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });
      await transport.sendMail({ from: deps.from ?? MAIL_FROM, to, subject, text });
      return 'smtp';
    },
  };
}
