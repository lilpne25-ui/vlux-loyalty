#!/usr/bin/env bash
# Genera el contenido de vlux-ops (repositorio PRIVADO) desde el repositorio de la aplicación.
# Uso:  ./ops/vlux-ops/export.sh /ruta/a/tu/clon/vlux-ops
# No toca secretos, no hace push, no se conecta a ninguna base.
set -euo pipefail
DEST="${1:?Uso: export.sh <carpeta-del-clon-vlux-ops>}"
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
[ -d "$DEST" ] || { echo "No existe $DEST (clona primero el repositorio privado vlux-ops)"; exit 1; }
mkdir -p "$DEST/.github/workflows" "$DEST/ops"
cp "$SRC/ops/vlux-ops/respaldo-diario.yml" "$DEST/.github/workflows/respaldo-diario.yml"
cp "$SRC/ops/backup-verify.sh" "$SRC/ops/restore-drill.sh" "$SRC/ops/grants.sql" "$DEST/ops/"
chmod +x "$DEST/ops/backup-verify.sh" "$DEST/ops/restore-drill.sh"
cp "$SRC/ops/vlux-ops/README.md" "$DEST/README.md"
printf '%s\n' 'backups/' '*.dump' '*.gpg' '.env*' '*.pem' > "$DEST/.gitignore"
echo "Listo en $DEST. Revisa con 'git status' y haz commit TÚ; recuerda: el repositorio debe ser privado."
