#!/usr/bin/env bash
# Backup + restore test: dumps a database, restores it into a scratch database and
# checks every table has the same number of rows. Proves a dump is usable.
#
#   scripts/backup-restore-test.sh "$DATABASE_URL" [dump-file]
#
# The scratch database (<name>_restore_check) is created and dropped on the same server,
# so the user needs CREATEDB. Keep the dump file (2nd argument) to use it as a backup.
set -euo pipefail

SRC="${1:?usage: backup-restore-test.sh DATABASE_URL [dump-file]}"
DUMP="${2:-$(mktemp -t spotifood-XXXXXX.dump)}"
BASE="${SRC%/*}"
NAME="${SRC##*/}"; NAME="${NAME%%\?*}"
CHECK="${NAME}_restore_check"
QUERY="${SRC#*\?}"; [ "$QUERY" = "$SRC" ] && QUERY="" || QUERY="?$QUERY"

echo "→ dump ${NAME} → ${DUMP}"
pg_dump --format=custom --no-owner --no-privileges --dbname="$SRC" --file="$DUMP"
echo "  $(du -h "$DUMP" | cut -f1)"

echo "→ restore into ${CHECK}"
psql "$SRC" -qAt -c "drop database if exists \"${CHECK}\"" -c "create database \"${CHECK}\""
trap 'psql "$SRC" -qAt -c "drop database if exists \"${CHECK}\"" >/dev/null 2>&1 || true' EXIT
# A newer pg_dump than the server writes settings the server ignores (transaction_timeout):
# pg_restore warns and goes on; the row counts below are what proves the restore.
pg_restore --no-owner --no-privileges --dbname="${BASE}/${CHECK}${QUERY}" "$DUMP" 2> restore.err ||
  { grep -v transaction_timeout restore.err | grep -E "error" >&2 || true; }
rm -f restore.err

COUNT_SQL="select string_agg(format('%s=%s', t, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', s, t), false, true, '')))[1]::text), ' ' order by t)
  from (select table_schema s, table_name t from information_schema.tables
        where table_schema in ('public', 'drizzle') and table_type = 'BASE TABLE') x"
A=$(psql "$SRC" -qAt -c "$COUNT_SQL")
B=$(psql "${BASE}/${CHECK}${QUERY}" -qAt -c "$COUNT_SQL")
if [ "$A" != "$B" ]; then
  echo "✗ row counts differ"; diff <(tr ' ' '\n' <<<"$A") <(tr ' ' '\n' <<<"$B") || true; exit 1
fi
echo "✓ restore OK: $(tr ' ' '\n' <<<"$A" | wc -l) tables, same row counts"
