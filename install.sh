#!/usr/bin/env bash
# Install MyOffice for the current user (macOS / Linux).
#
#   curl -fsSL https://raw.githubusercontent.com/halilbaris/AI-Office/main/install.sh | bash
#
# Environment:
#   MYOFFICE_REPO  git URL (default: https://github.com/halilbaris/AI-Office.git)
#   MYOFFICE_DIR   install folder (default: ~/MyOffice)
#   MYOFFICE_BIN   launcher folder (default: ~/.local/bin)
set -euo pipefail

REPO="${MYOFFICE_REPO:-https://github.com/halilbaris/AI-Office.git}"
DIR="${MYOFFICE_DIR:-$HOME/MyOffice}"
BIN="${MYOFFICE_BIN:-$HOME/.local/bin}"

say() { printf '%s\n' "$*"; }
fail() { say "Error: $*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || fail "git is required."
command -v python3 >/dev/null 2>&1 || fail "Python 3.10+ is required."
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' \
  || fail "Python 3.10+ is required (found $(python3 -V 2>&1))."

if [ -d "$DIR/.git" ]; then
  say "Updating $DIR"
  git -C "$DIR" pull --ff-only
elif [ -d "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
  [ -f "$DIR/myoffice.py" ] || fail "$DIR exists and is not a MyOffice checkout."
  say "Using existing checkout at $DIR"
else
  say "Cloning into $DIR"
  git clone "$REPO" "$DIR"
fi

mkdir -p "$BIN"
cat > "$BIN/myoffice" <<EOF
#!/usr/bin/env bash
exec python3 "$DIR/myoffice.py" "\$@"
EOF
chmod +x "$BIN/myoffice"

python3 "$DIR/myoffice.py" init
say ""
say "Installed: $BIN/myoffice"
case ":$PATH:" in
  *":$BIN:"*) say "Start the office with: myoffice start" ;;
  *) say "Add $BIN to PATH, then run: myoffice start" ;;
esac
