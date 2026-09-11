// PLAN-18: отправка писем (восстановление пароля).
// dev — письмо кладётся в data/mail-out/ и печатается в консоль (код ещё и показывается на экране);
// smtp — реальная отправка через nodemailer (подключается при выкладке в интернет).
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { MAIL_FROM, MAIL_MODE, SMTP_HOST, SMTP_PASS, SMTP_PORT, SMTP_USER } from './config';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** Куда dev-режим складывает письма (живые вложения — только для smtp). */
export const MAIL_OUT_DIR = path.join(ROOT, 'data', 'mail-out');

function writeDevLetter(to: string, subject: string, text: string): string {
  fs.mkdirSync(MAIL_OUT_DIR, { recursive: true });
  const safe = (s: string) => s.replace(/[^\w.@-]+/g, '_').slice(0, 60);
  const file = path.join(MAIL_OUT_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-${safe(to)}.txt`);
  fs.writeFileSync(file, `Кому: ${to}\nТема: ${subject}\n\n${text}\n`, 'utf8');
  return file;
}

export interface Mailer {
  /** Отправить письмо. Возвращает режим доставки ('dev' — без реальной почты). */
  send(to: string, subject: string, text: string): Promise<'dev' | 'smtp'>;
}

export function createMailer(): Mailer {
  return {
    async send(to: string, subject: string, text: string): Promise<'dev' | 'smtp'> {
      if (MAIL_MODE !== 'smtp') {
        const file = writeDevLetter(to, subject, text);
        console.log(`[gds][mail:dev] письмо → ${file}\n[gds][mail:dev] кому: ${to}\n[gds][mail:dev] тема: ${subject}\n${text}`);
        return 'dev';
      }
      // динамический импорт: пакет нужен только в smtp-режиме (в dev его может не быть)
      let nodemailer: typeof import('nodemailer');
      try {
        nodemailer = await import('nodemailer');
      } catch {
        throw new Error('SMTP-режим: установите nodemailer (pnpm add nodemailer) или включите MAIL_MODE=dev');
      }
      if (!SMTP_HOST || !SMTP_USER) throw new Error('SMTP-режим: заполните SMTP_HOST/SMTP_USER/SMTP_PASS в .env');
      const transport = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });
      await transport.sendMail({ from: MAIL_FROM, to, subject, text });
      return 'smtp';
    },
  };
}
