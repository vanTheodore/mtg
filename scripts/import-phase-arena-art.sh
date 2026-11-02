#!/usr/bin/env bash
# One-time source-pinned import of Phase's original arena paintings.
set -euo pipefail
if [[ "$GITHUB_REF_NAME" != "ui/arena-svelte-first-pass-20261102" ]]; then
  echo "Refusing to write outside the UI branch" >&2
  exit 2
fi
sha=0dd35e4a9dfe1dfba697224775d2205d56f7f20d
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git clone --quiet --no-checkout --filter=blob:none --depth=1 https://github.com/phase-rs/phase.git "$work/phase"
git -C "$work/phase" sparse-checkout init --cone
git -C "$work/phase" sparse-checkout set client/public/battlefield/arenas
git -C "$work/phase" fetch --quiet --depth=1 origin "$sha"
git -C "$work/phase" checkout --quiet --detach "$sha"
test "$(git -C "$work/phase" rev-parse HEAD)" = "$sha"
mkdir -p static/phase/arenas
cp "$work/phase/client/public/battlefield/arenas/"*.webp static/phase/arenas/
python3 - <<'PY'
from pathlib import Path
import subprocess
expected = {
 'angelic-sky-topdown.webp': '6082f096ab1d0aaeece9ca6cc7aca1850b8710e4',
 'elderwood-topdown.webp': 'c32622317145d78d7ad0255414f721f5bf789efe',
 'molten-topdown.webp': '0169ebb56d58641efa5a82a5def75470f6092104',
 'moon-coven-topdown.webp': '7abe89dde891e1258ac3a6c055eee07e957b67c7',
 'ocean-temple-topdown.webp': 'a321c9e6dcfd769967cefb64117dc2b436446127',
}
folder = Path('static/phase/arenas')
actual = {p.name for p in folder.glob('*.webp')}
if actual != set(expected):
 raise RuntimeError(f'Unexpected arena asset set: {actual}')
for name, upstream_blob in expected.items():
 path = folder / name
 actual_hash = subprocess.check_output(['git', 'hash-object', str(path)], text=True).strip()
 if actual_hash != upstream_blob: raise RuntimeError(f'Source mismatch: {name}')
 print(f'verified: {name}: {path.stat().st_size} B')
PY
git add static/phase/arenas
git config user.name 'mesa-asset-import'
git config user.email 'mesa-asset-import@users.noreply.github.com'
git commit -m 'assets(ui): import five pinned Phase arena paintings' --quiet
git push origin HEAD:refs/heads/ui/arena-svelte-first-pass-20261102
