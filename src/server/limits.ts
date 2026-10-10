// аудит-51 P1-4: квоты сервера — защита диска и event loop (сейвы, импорт, личные сообщения).
export const SAVE_MAX_COUNT = 10; // максимум сохранений на аккаунт
export const SAVE_IMPORT_MAX_BYTES = 4_000_000; // импорт сейва из файла (клиентский ввод), байты UTF-8
export const SAVE_PAYLOAD_MAX_BYTES = 8_000_000; // жёсткий предел любой записи payload в БД (страховка)
export const DM_MAX_PER_MINUTE = 30; // сообщений в минуту от одного игрока
export const DM_KEEP_PER_PAIR = 500; // храним последние N сообщений каждой пары
