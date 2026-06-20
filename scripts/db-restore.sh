#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [[ $# -ne 1 ]]; then
  echo "Usage: scripts/db-restore.sh ./backups/pgs-YYYYMMDD-HHMMSS.dump" >&2
  exit 1
fi

if [[ "${RESTORE_CONFIRM:-}" != "pgs-restore" ]]; then
  echo "Refusing restore. Set RESTORE_CONFIRM=pgs-restore." >&2
  exit 1
fi

pg_restore "$1" --dbname="$DATABASE_URL" --clean --if-exists --no-owner --no-acl
echo "Restore completed from $1"
