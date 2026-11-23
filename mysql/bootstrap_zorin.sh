#!/usr/bin/env bash
# ============================================================================
# SchoolCare — safe schema import + migration runner for Zorin OS.
#
#   npm run db:init      # first-time import into a VERIFIED EMPTY database
#   npm run db:migrate   # apply pending migrations to an existing database
#   npm run db:status    # read-only status report
#   npm run db:backup    # gzip dump into backups/ (mode 0600)
#
# Safety rules enforced here:
#   - never import the schema if the database already has any table
#   - never apply a migration whose file changed after it was recorded
#   - back up an existing database before applying migrations
#   - stop on the first SQL error; nothing is silently skipped
# The existing mysql/schoolcare_db.sql is NOT modified by this script.
# ============================================================================
set -euo pipefail

MODE="${1:-init}"
DB_NAME="schoolcare_db"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_DUMP="$ROOT_DIR/mysql/schoolcare_db.sql"
MIGRATIONS_DIR="$ROOT_DIR/mysql/migrations"
BACKUP_DIR="$ROOT_DIR/backups"
SUDO=(sudo)

command -v mariadb >/dev/null 2>&1 && MARIADB="mariadb" || MARIADB="mysql"

resolve_dump_command() {
  if command -v mariadb-dump >/dev/null 2>&1; then
    MARIADB_DUMP="mariadb-dump"
  elif command -v mysqldump >/dev/null 2>&1; then
    MARIADB_DUMP="mysqldump"
  else
    echo "ERROR: mariadb-dump (or mysqldump) not found. Install mariadb-client before backing up or migrating." >&2
    exit 1
  fi
}

db_exists() {
  local count
  count="$("${SUDO[@]}" "$MARIADB" -NBe \
    "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${DB_NAME}';")"
  [[ "$count" -gt 0 ]]
}

table_count() {
  "${SUDO[@]}" "$MARIADB" -NBe \
    "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${DB_NAME}';"
}

backup_database() {
  local count
  resolve_dump_command
  count="$(table_count)"
  if [[ "$count" -eq 0 ]]; then
    echo "Database is empty; no backup needed."
    return 0
  fi
  mkdir -p "$BACKUP_DIR"
  local output="$BACKUP_DIR/${DB_NAME}_$(date +%Y%m%d_%H%M%S).sql.gz"
  echo "Backing up ${DB_NAME} (${count} tables) to ${output} ..."
  "${SUDO[@]}" "$MARIADB_DUMP" "$DB_NAME" | gzip > "$output"
  chmod 600 "$output"
  echo "Backup complete."
}

ensure_tracking() {
  "${SUDO[@]}" "$MARIADB" "$DB_NAME" <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
SQL
}

apply_migrations() {
  local applied=0 skipped=0
  ensure_tracking

  # Fail fast on naming mistakes and warn about duplicate numeric prefixes.
  # The live database already has two applied 005_* files, so duplicates are
  # tolerated for compatibility; new migrations must use a unique prefix.
  local -A prefixes=()
  local preflight_name preflight_prefix
  for file in "$MIGRATIONS_DIR"/*.sql; do
    [[ -e "$file" ]] || continue
    preflight_name="$(basename "$file")"
    if [[ ! "$preflight_name" =~ ^[0-9]{3}_.+\.sql$ ]]; then
      echo "ERROR: migration ${preflight_name} must use the NNN_description.sql naming convention." >&2
      exit 1
    fi
    preflight_prefix="${preflight_name:0:3}"
    prefixes["$preflight_prefix"]="$(( ${prefixes[$preflight_prefix]:-0} + 1 ))"
  done
  for preflight_prefix in "${!prefixes[@]}"; do
    if [[ "${prefixes[$preflight_prefix]}" -gt 1 ]]; then
      echo "WARNING: migration prefix ${preflight_prefix} is used by ${prefixes[$preflight_prefix]} files; ordering depends on the filename." >&2
    fi
  done

  echo "Applying migrations from $MIGRATIONS_DIR ..."
  for file in "$MIGRATIONS_DIR"/*.sql; do
    if [[ ! -e "$file" ]]; then
      echo "No .sql migration files found; nothing to apply."
      return 0
    fi
    local name version checksum recorded recorded_checksum
    name="$(basename "$file")"
    version="${name%.sql}"
    checksum="$(sha256sum "$file" | awk '{print $1}')"
    recorded="$("${SUDO[@]}" "$MARIADB" "$DB_NAME" -NBe \
      "SELECT COUNT(*) FROM schema_migrations WHERE version='${version}';")"

    if [[ "$recorded" -gt 0 ]]; then
      recorded_checksum="$("${SUDO[@]}" "$MARIADB" "$DB_NAME" -NBe \
        "SELECT checksum FROM schema_migrations WHERE version='${version}';")"
      if [[ "$recorded_checksum" != "$checksum" ]]; then
        echo "ERROR: migration ${name} changed after it was applied. Refusing to re-run it." >&2
        exit 1
      fi
      echo "  skip   ${name} (already applied)"
      skipped=$((skipped + 1))
      continue
    fi

    echo "  apply  ${name}"
    "${SUDO[@]}" "$MARIADB" "$DB_NAME" < "$file"
    "${SUDO[@]}" "$MARIADB" "$DB_NAME" -e \
      "INSERT INTO schema_migrations (version, filename, checksum) VALUES ('${version}', '${name}', '${checksum}');"
    applied=$((applied + 1))
  done
  echo "Migrations: ${applied} applied, ${skipped} already applied."
}

status_report() {
  if ! db_exists; then
    echo "Database ${DB_NAME} does not exist. Run: npm run db:setup"
    return 0
  fi
  echo "Database:  ${DB_NAME} (exists)"
  echo "Tables:    $(table_count)"
  local tracking
  tracking="$("${SUDO[@]}" "$MARIADB" -NBe \
    "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${DB_NAME}' AND TABLE_NAME='schema_migrations';")"
  if [[ "$tracking" -eq 0 ]]; then
    echo "Migrations: none recorded yet."
  else
    echo "Migrations recorded:"
    "${SUDO[@]}" "$MARIADB" "$DB_NAME" -e \
      "SELECT version, filename, applied_at FROM schema_migrations ORDER BY version;" || true
  fi
}

case "$MODE" in
  init)
    if ! db_exists; then
      echo "ERROR: database ${DB_NAME} does not exist. Run 'npm run db:setup' first." >&2
      exit 1
    fi
    COUNT="$(table_count)"
    if [[ "$COUNT" -gt 0 ]]; then
      echo "ERROR: ${DB_NAME} already contains ${COUNT} table(s). Refusing to import the schema dump." >&2
      echo "Nothing was changed. If this is an existing SchoolCare database, use 'npm run db:migrate'." >&2
      exit 1
    fi
    echo "Database is empty. Importing the existing schema dump (mysql/schoolcare_db.sql) ..."
    "${SUDO[@]}" "$MARIADB" < "$SQL_DUMP"
    echo "Schema imported."
    apply_migrations
    echo
    echo "Initialization complete. Next: npm run db:check"
    ;;
  migrate)
    if ! db_exists; then
      echo "ERROR: database ${DB_NAME} does not exist. Run 'npm run db:setup' first." >&2
      exit 1
    fi
    COUNT="$(table_count)"
    if [[ "$COUNT" -eq 0 ]]; then
      echo "ERROR: database is empty. Run 'npm run db:init' first." >&2
      exit 1
    fi
    backup_database
    apply_migrations
    ;;
  backup)
    backup_database
    ;;
  status)
    status_report
    ;;
  *)
    echo "Usage: $0 [init|migrate|status|backup]" >&2
    exit 1
    ;;
esac
