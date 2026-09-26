// Конфиг сервера: .env (ключи скопированы из LLMKing/.env).
import 'dotenv/config';

export const GIGACHAT_CLIENT_ID = process.env.GIGACHAT_CLIENT_ID ?? '';
export const GIGACHAT_CLIENT_SECRET = process.env.GIGACHAT_CLIENT_SECRET ?? '';
// LLM-08: второй аккаунт GigaChat — резерв, включается, если основной не отвечает.
export const GIGACHAT2_CLIENT_ID = process.env.GIGACHAT2_CLIENT_ID ?? '';
export const GIGACHAT2_CLIENT_SECRET = process.env.GIGACHAT2_CLIENT_SECRET ?? '';
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? '';
export const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
export const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 90000);
// аудит 09.09 (LLM-01): общий бюджет на каскад попыток — иначе 2 прохода × 3 модели × LLM_TIMEOUT_MS
// дают до 6 минут «молчания» чата при недоступном GigaChat
export const LLM_TOTAL_MS = Number(process.env.LLM_TOTAL_MS ?? 90000);
export const PORT = Number(process.env.PORT ?? 3001);
// аудит 05.09: по умолчанию слушаем только локально; LAN-доступ — явно через HOST=0.0.0.0
export const HOST = process.env.HOST ?? '127.0.0.1';

// Деплой (plan/19): PROD=1 — публичный режим (выключает сброс пароля и пр.).
export const PROD = process.env.PROD === '1' || process.env.NODE_ENV === 'production';
/** Восстановление пароля: локально включено; на публике выключено (PROD=1 или PASSWORD_RESET=0). */
export const PASSWORD_RESET = process.env.PASSWORD_RESET === '1' ? true : process.env.PASSWORD_RESET === '0' ? false : !PROD;
/** Регистрация только по инвайт-коду: владелец выдаёт их в игре (окно «Инвайты»). */
export const INVITE_REQUIRED = process.env.INVITE_REQUIRED !== '0';

// PLAN-18/20: почта. dev — письмо в data/mail-out; smtp — nodemailer (нужен открытый исходящий
// SMTP у хостера); api — SendPulse REST по HTTPS (VDSina блокирует SMTP, а HTTPS работает).
export const MAIL_MODE = process.env.MAIL_MODE ?? 'dev';
export const SENDPULSE_API_KEY = process.env.SENDPULSE_API_KEY ?? '';
export const SENDPULSE_ID = process.env.SENDPULSE_ID ?? '';
export const SENDPULSE_SECRET = process.env.SENDPULSE_SECRET ?? '';
export const SMTP_HOST = process.env.SMTP_HOST ?? '';
export const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
export const SMTP_USER = process.env.SMTP_USER ?? '';
export const SMTP_PASS = process.env.SMTP_PASS ?? '';
export const MAIL_FROM = process.env.MAIL_FROM ?? 'Game Dev Studio <no-reply@example.com>';

export const gigaReady = !!((GIGACHAT_CLIENT_ID && GIGACHAT_CLIENT_SECRET) || (GIGACHAT2_CLIENT_ID && GIGACHAT2_CLIENT_SECRET));
