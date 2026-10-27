#!/usr/bin/env bash
# Launch the WRJ demo frontend from the prebuilt dist/ (fully offline, no network needed).
# For Kylin (麒麟) / UOS (统信) / deepin and other Linux systems.
# Supported CPUs: x86_64, aarch64 (飞腾/鲲鹏), loongarch64 (龙芯) — anything Node runs on.
#
# Node resolution order:
#   1. runtime/node-linux-<arch>/bin/node   (portable Node tarball, folder renamed)
#   2. runtime/node-linux-<arch>/node       (flat layout)
#   3. system node from PATH
# A candidate whose binary cannot run (e.g. wrong CPU arch) is skipped automatically.
# All user-facing messages are printed by scripts/serve-offline.mjs (UTF-8).

set -u
cd "$(dirname "$0")" || exit 1

ARCH="$(uname -m)"
NODE_BIN=""

for candidate in \
  "runtime/node-linux-${ARCH}/bin/node" \
  "runtime/node-linux-${ARCH}/node"
do
  if [ -x "$candidate" ] && "$candidate" --version >/dev/null 2>&1; then
    NODE_BIN="$candidate"
    break
  fi
done

if [ -z "$NODE_BIN" ] && command -v node >/dev/null 2>&1 && node --version >/dev/null 2>&1; then
  NODE_BIN="node"
fi

if [ -z "$NODE_BIN" ]; then
  echo "[ERROR] Node.js not found."
  echo "        Put a portable Node at runtime/node-linux-${ARCH}/bin/node"
  echo "        (official tarball from nodejs.org works on x86_64/aarch64;"
  echo "         for loongarch64 use the Loongson/Loongnix build),"
  echo "        or install Node.js 22+ with the system package manager."
  exit 1
fi

if [ ! -f "dist/index.html" ]; then
  if [ -d "node_modules" ] && command -v npm >/dev/null 2>&1; then
    echo "[INFO] dist/ not found, building locally with npm run build ..."
    npm run build || { echo "[ERROR] Build failed. See messages above."; exit 1; }
  else
    echo "[ERROR] dist/ missing and node_modules/ missing."
    echo "        Run: npm ci --legacy-peer-deps && npm run build"
    exit 1
  fi
fi

exec "$NODE_BIN" scripts/serve-offline.mjs "$@"
