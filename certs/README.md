# Сертификаты для внешних HTTPS-подключений (аудит-51 P1-6)

- `russian_trusted_root_ca.pem` — корневой CA «Russian Trusted Root CA» (Минцифры).
  Сертификаты GigaChat/Sber (OAuth `ngw.devices.sberbank.ru:9443` и API
  `gigachat.devices.sberbank.ru`) подписаны промежуточным CA, который строится к этому
  корню; Node не знает его из коробки, поэтому `src/server/giga.ts` подкладывает файл
  в `ca` при TLS-проверке — вместо прежнего `rejectUnauthorized:false`.

- Источник: `https://gu-st.ru` (скачан 2026-10-10). SHA-256:
  `D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31`.
  Срок действия: до 2032-02-27. При ротации — скачать новый файл и заменить (тест
  `test/giga.test.ts` сторожит наличие и читаемость сертификата).
