#!/usr/bin/env bash
# ============================================================================
# SchoolCare — safe MariaDB database + application user setup for Zorin OS.
#
# Run in YOUR terminal (the script asks for your sudo password itself):
#   npm run db:setup
#
# What it does:
#   - creates schoolcare_db only if it does not already exist
#   - creates schoolcare_user for localhost and 127.0.0.1 if missing
#   - grants least-privilege rights on schoolcare_db.* only
# What it NEVER does:
#   - drop a database or table, change an existing user's password,
#     print or store the password, or grant global/root privileges
# ============================================================================
set -euo pipefail

DB_NAME="schoolcare_db"
DB_USER="schoolcare_user"
SUDO=(sudo)

if command -v mariadb >/dev/null 2>&1; then
  MARIADB="mariadb"
elif command -v mysql >/dev/null 2>&1; then
  MARIADB="mysql"
else
  echo "ERROR: MariaDB client not found. Install mariadb-client first." >&2
  exit 1
fi

echo "SchoolCare MariaDB setup"
echo "  database: $DB_NAME"
echo "  user:     $DB_USER"
echo
echo "This script will ask for your Linux (sudo) password, then for a NEW database password."
echo "The database password is entered with echo disabled and is never displayed or saved."
echo

"${SUDO[@]}" -v

read -r -s -p "New password for ${DB_USER} (12-128 chars): " DB_PASSWORD
echo
read -r -s -p "Confirm password: " DB_PASSWORD_CONFIRM
echo

if [[ "$DB_PASSWORD" != "$DB_PASSWORD_CONFIRM" ]]; then
  echo "ERROR: Passwords do not match. Nothing was changed." >&2
  exit 1
fi
if [[ ! "$DB_PASSWORD" =~ ^[A-Za-z0-9_@#%+=.-]{12,128}$ ]]; then
  echo "ERROR: Use 12-128 letters, digits or _ @ # % + = . - (no quotes or spaces). Nothing was changed." >&2
  exit 1
fi

DB_EXISTS="$("${SUDO[@]}" "$MARIADB" -NBe \
  "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='${DB_NAME}';")"

if [[ "$DB_EXISTS" -eq 0 ]]; then
  echo "Creating database ${DB_NAME} ..."
  printf 'CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n' "$DB_NAME" \
    | "${SUDO[@]}" "$MARIADB"
else
  echo "Database ${DB_NAME} already exists. It will not be modified."
fi

for HOST in localhost 127.0.0.1; do
  USER_EXISTS="$("${SUDO[@]}" "$MARIADB" -NBe \
    "SELECT COUNT(*) FROM mysql.user WHERE User='${DB_USER}' AND Host='${HOST}';")"
  if [[ "$USER_EXISTS" -eq 0 ]]; then
    echo "Creating ${DB_USER}@${HOST} ..."
    printf "CREATE USER IF NOT EXISTS '%s'@'%s' IDENTIFIED BY '%s';\n" "$DB_USER" "$HOST" "$DB_PASSWORD" \
      | "${SUDO[@]}" "$MARIADB"
  else
    echo "User ${DB_USER}@${HOST} already exists. Its password was NOT changed."
  fi

  echo "Granting least-privilege access on ${DB_NAME}.* to ${DB_USER}@${HOST} ..."
  printf "GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON \`%s\`.* TO '%s'@'%s';\n" \
    "$DB_NAME" "$DB_USER" "$HOST" | "${SUDO[@]}" "$MARIADB"
done

echo
echo "Setup complete. The password was not displayed or stored by this script."
echo "NEXT: edit .env in the project root and set DB_PASSWORD to the password you just entered."
echo "Then run: npm run db:check"
