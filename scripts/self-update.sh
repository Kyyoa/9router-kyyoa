#!/bin/bash
# 9router-kyyoa self-update — 1 script buat update dari terminal.
# Dipakai user: klik "Copy & Shutdown" di dashboard, paste perintah ini, Enter.
# Urutan: cek repo -> backup DB -> pull -> install -> build -> restart -> verifikasi.
# Berhenti di langkah pertama yang gagal, dengan pesan yang jelas.
set -u

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR" || { echo "❌ Gagal masuk $REPO_DIR"; exit 1; }

PORT="${PORT:-20130}"

say()  { echo "▶ $*"; }
ok()   { echo "✅ $*"; }
fail() { echo "❌ $*"; echo "   Lihat error di atas. Server lama TIDAK disentuh — dashboard masih jalan kalau belum shutdown."; exit 1; }

# 1. Harus repo git yang bener (punya custom-server.js + package.json)
[ -f "$REPO_DIR/custom-server.js" ] || fail "Bukan folder 9router-kyyoa (custom-server.js tidak ada). Jalanin dari folder install kamu."
git rev-parse --git-dir >/dev/null 2>&1 || fail "Bukan repo git. Install kamu mungkin hasil copy, bukan git clone — update manual."

# 2. Backup DB dulu (WAL-safe, bukan cp)
DATA_DIR_RESOLVED="${DATA_DIR:-$HOME/.9router-kyyoa}"
DB_FILE="$DATA_DIR_RESOLVED/db/data.sqlite"
if [ -f "$DB_FILE" ]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  BAK_DIR="$DATA_DIR_RESOLVED/db/backups"
  mkdir -p "$BAK_DIR" || fail "Gagal bikin folder backup $BAK_DIR (cek permission user)."
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_FILE" ".backup '$BAK_DIR/data-pre-update-$TS.sqlite'" \
      && ok "DB dibackup: data-pre-update-$TS.sqlite" \
      || fail "Backup DB gagal. Update dibatalkan biar data aman."
  else
    cp "$DB_FILE" "$BAK_DIR/data-pre-update-$TS.sqlite" \
      && ok "DB dibackup (cp, sqlite3 tidak ada): data-pre-update-$TS.sqlite" \
      || fail "Backup DB gagal. Update dibatalkan biar data aman."
  fi
else
  say "DB belum ada ($DB_FILE) — fresh install, lewati backup."
fi

# 3. Pull (ff-only: kalau lokal dimodif, BERHENTI, jangan paksa)
say "git pull --ff-only..."
git pull --ff-only || fail "git pull gagal (repo lokal ada perubahan / diverge). Rapikan dulu: git status"

# 4. Install + build
say "npm install..."
npm install || fail "npm install gagal (cek koneksi / nodejs)."
say "npm run build (tunggu, beberapa menit)..."
npm run build || fail "npm run build gagal. Kode baru BERMASALAH — server lama masih jalan, lapor ke Kyyoa."

# 5. Restart: kill yang pegang port, tunggu bebas, start lagi
say "Restart server di port $PORT..."
OLD_PID="$(ss -tlnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K[0-9]+' | head -1)"
if [ -n "${OLD_PID:-}" ]; then
  kill -9 "$OLD_PID" 2>/dev/null && ok "Server lama (PID $OLD_PID) dimatikan." || say "PID $OLD_PID sudah mati."
  for _ in $(seq 1 15); do
    ss -tln 2>/dev/null | grep -q ":$PORT " || break
    sleep 1
  done
  ss -tln 2>/dev/null | grep -q ":$PORT " && fail "Port $PORT masih dipakai setelah 15 detik. Kill manual lalu jalanin script ini lagi."
else
  say "Tidak ada server di port $PORT — langsung start."
fi

export NODE_OPTIONS="--max-http-header-size=65536"
export PORT="$PORT"
nohup node custom-server.js --port "$PORT" > /tmp/9router-kyyoa.log 2>&1 &
ok "Server baru dijalankan (log: /tmp/9router-kyyoa.log)."

# 6. Verifikasi: tunggu /api/version jawab versi
say "Verifikasi (maks 60 detik)..."
for _ in $(seq 1 30); do
  VER="$(curl -s --max-time 5 "http://127.0.0.1:$PORT/api/version" 2>/dev/null)"
  if echo "$VER" | grep -q '"currentVersion"'; then
    CV="$(echo "$VER" | grep -oP '"currentVersion":"\K[^"]+')"
    HU="$(echo "$VER" | grep -oP '"hasUpdate":\K(true|false)')"
    echo ""
    ok "Server jawab. Versi jalan: $CV, hasUpdate: $HU"
    echo "   Buka dashboard lagi — sidebar harusnya nunjukin versi baru."
    exit 0
  fi
  sleep 2
done
fail "Server tidak jawab /api/version dalam 60 detik. Cek log: tail -50 /tmp/9router-kyyoa.log"
