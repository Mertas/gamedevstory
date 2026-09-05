// Конфиг сервера: .env (ключи скопированы из LLMKing/.env).
import 'dotenv/config';

export const GIGACHAT_CLIENT_ID = process.env.GIGACHAT_CLIENT_ID ?? '';
export const GIGACHAT_CLIENT_SECRET = process.env.GIGACHAT_CLIENT_SECRET ?? '';
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? '';
export const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
export const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 90000);
export const PORT = Number(process.env.PORT ?? 3001);
// аудит 05.09: по умолчанию слушаем только локально; LAN-доступ — явно через HOST=0.0.0.0
export const HOST = process.env.HOST ?? '127.0.0.1';

export const gigaReady = !!(GIGACHAT_CLIENT_ID && GIGACHAT_CLIENT_SECRET);
