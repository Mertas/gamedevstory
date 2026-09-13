// GigaChat: OAuth-токен (30 мин) + chat/completions; DeepSeek — OpenAI-совместимый фолбэк.
// Паттерн из LLMKing/src/server/models.ts: самоподписанный TLS Сбера — rejectUnauthorized:false.
import * as crypto from 'crypto';
import * as https from 'https';
import { DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, GIGACHAT_CLIENT_ID, GIGACHAT_CLIENT_SECRET, LLM_TIMEOUT_MS, LLM_TOTAL_MS, gigaReady } from './config';

export const GIGA_BASE = 'https://gigachat.devices.sberbank.ru/api/v1';
const GIGA_MODELS = ['GigaChat-2-Max', 'GigaChat-2-Pro', 'GigaChat-2'];

export interface LlmMessage { role: 'system' | 'user' | 'assistant'; content: string }

/** LLM-функция (LLM-05): инъекция fake-LLM в тестах вместо GigaChat */
export type LlmFn = (messages: LlmMessage[], maxTokens: number) => Promise<{ text: string; model: string }>;

let gigaToken: string | null = null;
let gigaExp = 0;
// SER-21: Сбер отвечает пустотой на всплески запросов (у игры их много: фазы, письма, автопилот,
// пресса). Держим минимальный зазор между ВСЕМИ запросами к GigaChat — сглаживает лимиты.
let gigaLastAt = 0;
const GIGA_MIN_GAP_MS = 650;

async function gigaGap(): Promise<void> {
  const wait = GIGA_MIN_GAP_MS - (Date.now() - gigaLastAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  gigaLastAt = Date.now();
}

function gigaPost(url: string, headers: Record<string, string>, body: string, timeoutMs = LLM_TIMEOUT_MS): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers, rejectUnauthorized: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>); }
        catch { reject(new Error('GigaChat: bad response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('GigaChat: timeout')));
    req.write(body);
    req.end();
  });
}

async function refreshGigaToken(): Promise<string> {
  const auth = Buffer.from(`${GIGACHAT_CLIENT_ID}:${GIGACHAT_CLIENT_SECRET}`).toString('base64');
  const d = await gigaPost('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
    'Authorization': `Basic ${auth}`,
    'RqUID': crypto.randomUUID(),
  }, 'scope=GIGACHAT_API_PERS');
  const token = d.access_token;
  if (typeof token !== 'string') throw new Error('GigaChat OAuth failed');
  gigaToken = token;
  gigaExp = Date.now() + (typeof d.expires_in === 'number' ? d.expires_in : 1800) * 1000;
  return token;
}

async function gigaTokenOrThrow(): Promise<string> {
  if (gigaToken && Date.now() < gigaExp - 60000) return gigaToken;
  return refreshGigaToken();
}

async function gigaChat(model: string, messages: LlmMessage[], maxTokens: number, timeoutMs = LLM_TIMEOUT_MS): Promise<string> {
  await gigaGap();
  const token = await gigaTokenOrThrow();
  const d = await gigaPost(`${GIGA_BASE}/chat/completions`, {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
  }, JSON.stringify({ model, messages, temperature: 0.9, max_tokens: maxTokens }), timeoutMs);
  const content = (d.choices as Array<{ message?: { content?: unknown } }> | undefined)?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    const status = typeof d.status === 'number' ? d.status : null;
    const msg = typeof d.message === 'string' ? d.message.slice(0, 80) : '';
    throw new Error(status ? `GigaChat ${model}: API ${status}${msg ? ` (${msg})` : ''}` : `GigaChat ${model}: пустой ответ`);
  }
  return content;
}

// DeepSeek-фолбэк ОСТАВЛЕН в коде по решению пользователя («пусть пока только гигачат»),
// но в generateWithFallback не вызывается. export — чтобы strict-tsconfig не считал его
// мёртвым (noUnusedLocals), при этом наружу сервера он не отдаётся.
export async function deepseek(messages: LlmMessage[], maxTokens: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: DEEPSEEK_MODEL, messages, temperature: 0.9, max_tokens: maxTokens });
    const req = https.request(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try {
          const d = JSON.parse(Buffer.concat(chunks).toString()) as { choices?: Array<{ message?: { content?: unknown } }>; error?: { message?: unknown } };
          if (d.error) { reject(new Error(`DeepSeek: ${String(d.error.message ?? 'error')}`)); return; }
          const content = d.choices?.[0]?.message?.content;
          if (typeof content !== 'string' || !content.trim()) reject(new Error('DeepSeek: пустой ответ'));
          else resolve(content);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(LLM_TIMEOUT_MS, () => req.destroy(new Error('DeepSeek: timeout')));
    req.write(body);
    req.end();
  });
}

/** Чат: только GigaChat (по просьбе). Цепочка Max → Pro → 2; при недоступности — чат молчит. */
export async function generateWithFallback(messages: LlmMessage[], maxTokens = 800): Promise<{ text: string; model: string }> {
  if (!gigaReady) throw new Error('GigaChat недоступен: проверьте .env (GIGACHAT_CLIENT_ID/SECRET)');
  let lastErr: unknown = null;
  // LLM-01: общий дедлайн на каскад — чат не должен «замирать» на минуты
  const deadline = Date.now() + LLM_TOTAL_MS;
  // 2 прохода: GigaChat иногда разово отвечает пустотой (rate limit) — повторяем
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const model of GIGA_MODELS) {
      const left = deadline - Date.now();
      if (left <= 1000) break;
      try {
        return { text: await gigaChat(model, messages, maxTokens, Math.min(LLM_TIMEOUT_MS, left)), model: `GigaChat ${model}` };
      } catch (e) {
        lastErr = e; /* следующий */
      }
    }
    if (Date.now() + 1500 >= deadline) break;
    await new Promise((r) => setTimeout(r, 2500)); // пауза перед повтором (SER-21: лимиты Сбера)
  }
  throw lastErr instanceof Error ? lastErr : new Error('GigaChat не ответил');
}

export function llmStatus(): { giga: boolean; deepseek: boolean } {
  // аудит 05.09: deepseek фолбэк отключён в generateWithFallback — не врать в /api/health
  return { giga: gigaReady, deepseek: false };
}

// вытащить JSON-объект из ответа LLM (устойчиво к тексту вокруг)
function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  try {
    const p = JSON.parse(text) as unknown;
    if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, unknown>;
  } catch { /* дальше */ }
  const startIdx = text.indexOf('{');
  if (startIdx === -1) return null;
  let depth = 0, inString = false, escaped = false, endIdx = -1;
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
  }
  if (endIdx === -1) return null;
  try { return JSON.parse(text.slice(startIdx, endIdx)) as Record<string, unknown>; }
  catch { return null; }
}

/** Название и краткий сюжет игры (для мастера) — только GigaChat. */
export async function generateStory(genreRu: string, typeRu: string): Promise<{ title: string; plot: string }> {
  const prompt =
    `Ты — геймдизайнер игровой студии. Придумай название и краткий сюжет для игры: жанр «${genreRu}», тема «${typeRu}». ` +
    `Название: 1–3 слова, по-русски, без кавычек, запоминающееся. Сюжет: 2–3 предложения, по-русски, лёгкий и игровой. ` +
    `Ответь СТРОГО одним JSON-объектом: {"title":"название","plot":"сюжет"}`;
  const raw = await generateWithFallback([{ role: 'user', content: prompt }], 400);
  const json = extractJsonObject(raw.text);
  const title = typeof json?.title === 'string' ? json.title.trim().replace(/^["'«]+|["'»]+$/g, '').slice(0, 40) : '';
  const plot = typeof json?.plot === 'string' ? json.plot.trim().slice(0, 10000) : '';
  if (!title || !plot) throw new Error('GigaChat: не удалось разобрать название и сюжет');
  return { title, plot };
}

/** SER-25: пачка названий для студии — уникальность проверяет вызывающая сторона. */
export async function generateStudioNames(count = 8): Promise<string[]> {
  if (!gigaReady) throw new Error('GigaChat недоступен');
  const out = await generateWithFallback(
    [
      {
        role: 'system',
        content: 'Ты придумываешь названия для игровых студий. Отвечай ТОЛЬКО JSON-массивом строк, без пояснений.',
      },
      {
        role: 'user',
        content: `Придумай ${count} разных названий для игровой студии: по-русски, 2–3 слова, без кавычек и точек, в духе геймдева и ретро-игр (коты, пиксели, белки, дискеты, кубики). Не длиннее 30 символов. Формат: ["Название 1", "Название 2", ...]`,
      },
    ],
    500,
  );
  const m = out.text.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('нет массива в ответе');
  const parsed = JSON.parse(m[0]) as unknown;
  if (!Array.isArray(parsed)) throw new Error('не массив');
  const clean = parsed
    .map((t) => String(t ?? '').replace(/["«»]/g, '').trim().slice(0, 40))
    .filter((t) => t.length >= 3);
  if (clean.length === 0) throw new Error('пустые названия');
  return clean;
}
