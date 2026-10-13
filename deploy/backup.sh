#!/bin/bash
# Ночной бэкап GameDevStory (plan/19). Тариф VDSina — без бэкапов, значит бэкап наш.
# Класть в /srv/gds/backup.sh (chmod +x), cron: 17 4 * * * /srv/gds/backup.sh >> /srv/gds/backup.log 2>&1
set -euo pipefail

BASE=/srv/gds
DATA=$BASE/shared/data
OUT=$BASE/backups
KEEP_DAYS=14

mkdir -p "$OUT"
STAMP="$(date +%F_%H%M)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# .backup — безопасно на живой базе (не читает файл «по кускам»)
if [ -f "$DATA/users.db" ]; then
  sqlite3 "$DATA/users.db" ".backup '$TMP/users.db'"
fi
# контент-БД и письма — просто копируем
[ -f "$DATA/gamedev.db" ] && cp "$DATA/gamedev.db" "$TMP/"
[ -f "$DATA/music-meta.sqlite" ] && cp "$DATA/music-meta.sqlite" "$TMP/"
[ -d "$DATA/mail-out" ] && cp -r "$DATA/mail-out" "$TMP/"
# аудит-51 04-P2-8: секреты (.env: GDS_PEPPER, ключи LLM/почты) — иначе бэкап невосстановим
[ -f "$BASE/shared/.env" ] && cp "$BASE/shared/.env" "$TMP/env.backup"

tar -czf "$OUT/gds-$STAMP.tar.gz" -C "$TMP" .
echo "[backup] $STAMP: $(du -h "$OUT/gds-$STAMP.tar.gz" | cut -f1)"

find "$OUT" -name 'gds-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
