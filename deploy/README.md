# deploy/ — выкладка GameDevStory на VDSina (plan/19)

Файлы:
| Файл | Куда на сервере |
|---|---|
| `post-receive` | `/srv/gds.git/hooks/post-receive` (+ `chmod +x`) |
| `gds.service` | `/etc/systemd/system/gds.service` |
| `nginx-gds.conf` | `/etc/nginx/sites-available/gds` (+ симлинк в `sites-enabled`) |
| `rollback.sh` | `/srv/gds/rollback.sh` (+ `chmod +x`) |
| `backup.sh` | `/srv/gds/backup.sh` (+ `chmod +x`), в cron |

## Первый запуск (один раз, от root)

```bash
# 1. пользователь + SSH-ключ (пароли по SSH потом выключаем)
adduser gds && usermod -aG sudo gds
mkdir -p /home/gds/.ssh && chmod 700 /home/gds/.ssh
#   локально: ssh-keygen -t ed25519 -f gds_key
#   публичный ключ → /home/gds/.ssh/authorized_keys (chmod 600, владелец gds)
#   /etc/ssh/sshd_config: PasswordAuthentication no, PermitRootLogin no → systemctl reload ssh

# 2. Node 22 LTS, pnpm, nginx, sqlite3
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs git nginx sqlite3 curl
corepack enable && corepack prepare pnpm@11 --activate

# 3. каталоги и «голый» репозиторий
mkdir -p /srv/gds/{releases,shared/data,backups}
chown -R gds:gds /srv
sudo -u gds git init --bare /srv/gds.git

# 4. секреты (значения — из .env.example)
install -m 600 -o gds -g gds /dev/null /srv/gds/shared/.env
nano /srv/gds/shared/.env          # заполнить GIGACHAT_*, HOST/PORT, PROD=1

# 5. хук, юнит, nginx, права на рестарт сервиса
install -m 755 -o gds -g gds /srv/gds/current/deploy/post-receive /srv/gds.git/hooks/post-receive   # (после первого push)
echo 'gds ALL=(root) NOPASSWD: /bin/systemctl restart gds, /bin/systemctl is-active gds' > /etc/sudoers.d/gds
chmod 440 /etc/sudoers.d/gds

# 6. система
cp /tmp/gds.service /etc/systemd/system/gds.service && systemctl daemon-reload && systemctl enable gds
cp /tmp/nginx-gds.conf /etc/nginx/sites-available/gds && ln -s /etc/nginx/sites-available/gds /etc/nginx/sites-enabled/gds
nginx -t && systemctl reload nginx
ufw allow 22,80,443/tcp && ufw enable

# 7. бэкапы
install -m 755 -o gds -g gds /srv/gds/current/deploy/backup.sh /srv/gds/backup.sh
echo '17 4 * * * /srv/gds/backup.sh >> /srv/gds/backup.log 2>&1' | crontab -u gds -
```

## Деплой

```bash
# локально (один раз)
git remote add prod ssh://gds@<IP>/srv/gds.git
# дальше — каждая выкладка:
git push prod master          # гейт-тесты → сборка → перезапуск → health-check, вывод виден в терминале
```

Откат: `ssh gds@<IP> /srv/gds/rollback.sh`. Логи: `journalctl -u gds -f`.

## HTTPS (домен MERTAS.SPACE)

```bash
# 1. A-запись game.mertas.space → IP сервера (панель nic.ru, «Управление зоной»)
#    проверка: dig +short game.mertas.space
# 2. в nginx-gds.conf заменить server_name _; на game.mertas.space
nginx -t && systemctl reload nginx
# 3. сертификат Let's Encrypt (порт 80 должен быть доступен из интернета)
apt install -y certbot python3-certbot-nginx
certbot --nginx -d game.mertas.space --redirect --agree-tos -m <почта> --no-eff-email
# продление — автоматически таймером certbot.timer (проверить: systemctl list-timers | grep certbot)
```
Игра открывается по `https://game.mertas.space/`, cookie сессии становятся Secure,
клиент сам переключается на `wss://`.

**Резерв, если DNS-записи менять нельзя:** бесплатный поддомен DuckDNS → `server_name <имя>.duckdns.org;` → тот же `certbot --nginx -d <имя>.duckdns.org`.
