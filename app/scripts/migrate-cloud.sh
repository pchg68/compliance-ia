#!/usr/bin/env bash
# Aplica todas as migrations no banco Supabase cloud.
# Uso: DATABASE_URL="postgresql://..." bash scripts/migrate-cloud.sh
# A DATABASE_URL deve usar a conexão DIRETA (porta 5432), não o pooler.

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Erro: defina DATABASE_URL com a string de conexão direta do Supabase."
  echo "Encontre em: supabase.com → projeto → Settings → Database → Connection string → URI"
  exit 1
fi

MIGRATIONS_DIR="$(dirname "$0")/../supabase/migrations"

echo "Aplicando migrations em: $DATABASE_URL"
echo ""

for file in "$MIGRATIONS_DIR"/*.sql; do
  name=$(basename "$file")
  echo "→ $name"
  psql "$DATABASE_URL" -f "$file" --single-transaction -q
done

echo ""
echo "✓ Todas as migrations aplicadas com sucesso."
