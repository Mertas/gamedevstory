// Конфиг сервера: .env (ключи скопированы из LLMKing/.env).
import 'dotenv/config';

export const GIGACHAT_CLIENT_ID = process.env.GIGACHAT_CLIENT_ID ?? '';
export const GIGACHAT_CLIENT_SECRET = process.env.GIGACHAT_CLIENT_SECRET ?? '';
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

// PLAN-18: почта для восстановления пароля (dev — письмо в консоль + код на экран).
export const MAIL_MODE = process.env.MAIL_MODE ?? 'dev';
export const SMTP_HOST = process.env.SMTP_HOST ?? '';
export const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
export const SMTP_USER = process.env.SMTP_USER ?? '';
export const SMTP_PASS = process.env.SMTP_PASS ?? '';
export const MAIL_FROM = process.env.MAIL_FROM ?? 'Game Dev Studio <no-reply@example.com>';

export const gigaReady = !!(GIGACHAT_CLIENT_ID && GIGACHAT_CLIENT_SECRET);
