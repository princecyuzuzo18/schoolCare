#!/usr/bin/env bash
# Full SchoolCare backup: MariaDB dump + authoritative JSON store + uploads.
# Never deletes or modifies existing data. Run before migrations or deployments.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# The Node scripts load these with dotenv; source them here as well so the
# archive uses the same data/upload directories as the running application.
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env"
  set +a
fi

DATA_DIR="${SCHOOLCARE_DATA_DIR:-$ROOT_DIR/data}"
CONTENT_DIR="${SCHOOLCARE_PUBLIC_CONTENT_DIR:-$ROOT_DIR/data}"
ADMISSION_DIR="${ADMISSION_UPLOAD_DIR:-$ROOT_DIR/data/admission-documents}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$ROOT_DIR/backups"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

echo "[1/2] Backing up MariaDB..."
npx tsx scripts/db-backup.ts

ARCHIVE="$BACKUP_DIR/schoolcare-full-${STAMP}.tar.gz"
STAGE="$(mktemp -d "$BACKUP_DIR/.schoolcare-stage.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
echo "[2/2] Backing up JSON store, public content and uploads..."

mkdir -p "$STAGE/data"
[ -f "$DATA_DIR/schoolcare_db.json" ] && cp -p "$DATA_DIR/schoolcare_db.json" "$STAGE/data/schoolcare_db.json"
[ -f "$CONTENT_DIR/public_content.json" ] && cp -p "$CONTENT_DIR/public_content.json" "$STAGE/data/public_content.json"
[ -d "$CONTENT_DIR/public-uploads" ] && cp -a "$CONTENT_DIR/public-uploads" "$STAGE/data/public-uploads"
[ -d "$ADMISSION_DIR" ] && cp -a "$ADMISSION_DIR" "$STAGE/data/admission-documents"

if [ ! -f "$STAGE/data/schoolcare_db.json" ]; then
  echo "Backup aborted: authoritative JSON store not found at $DATA_DIR/schoolcare_db.json" >&2
  exit 1
fi

tar -czf "$ARCHIVE" -C "$STAGE" --transform="s|^|schoolcare-${STAMP}/|" data
chmod 600 "$ARCHIVE"
echo "Full backup created: $ARCHIVE"
