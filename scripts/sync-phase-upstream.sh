#!/usr/bin/env bash
set -euo pipefail
if [[ "${GITHUB_REF_NAME:-}" != "maintenance/phase-upstream-20261102" ]]; then
  echo "Refusing to sync outside the dedicated upstream branch" >&2
  exit 2
fi
UPSTREAM_SHA=0dd35e4a9dfe1dfba697224775d2205d56f7f20d
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
git clone --quiet --depth=1 --filter=blob:none --sparse https://github.com/phase-rs/phase.git "$work/phase"
git -C "$work/phase" fetch --quiet --depth=1 origin "$UPSTREAM_SHA"
git -C "$work/phase" checkout --quiet --detach "$UPSTREAM_SHA"
git -C "$work/phase" sparse-checkout set crates/engine crates/phase-ast crates/phase-parser
test "$(git -C "$work/phase" rev-parse HEAD)" = "$UPSTREAM_SHA"
for src in engine phase-ast phase-parser; do
  target="$src"
  if [[ "$src" == engine ]]; then target=phase-engine; fi
  rm -rf "crates/$target"
  cp -a "$work/phase/crates/$src" "crates/$target"
  cp "$work/phase/LICENSE-MIT" "crates/$target/LICENSE-MIT"
  cp "$work/phase/LICENSE-APACHE" "crates/$target/LICENSE-APACHE"
done
python3 - <<'PY'
from pathlib import Path
import re
for crate in ('phase-engine', 'phase-ast', 'phase-parser'):
    path=Path('crates')/crate/'Cargo.toml'
    text=path.read_text()
    text,n=re.subn(r'^version\.workspace\s*=\s*true$', 'version = "0.119.0"', text, count=1, flags=re.M)
    if n!=1: raise RuntimeError(f'Missing upstream version: {path}')
    path.write_text(text)
root=Path('Cargo.toml')
text=root.read_text()
anchor='members = ["crates/phase-engine", "crates/mtg-engine-wasm"]'
if anchor not in text: raise RuntimeError('Mesa workspace changed')
text=text.replace(anchor, 'members = ["crates/phase-engine", "crates/phase-ast", "crates/phase-parser", "crates/mtg-engine-wasm"]')
if '[workspace.dependencies]' in text: raise RuntimeError('Unexpected workspace dependencies')
root.write_text(text+'\n[workspace.dependencies]\nserde = { version = "1", features = ["derive", "rc"] }\ntracing = "0.1"\n')
PY
report="$(bun scripts/verify-engine.ts crates/phase-engine/src || true)"
source_hash="$(printf '%s\n' "$report" | python3 -c 'import json,sys; print(json.load(sys.stdin)["sha256"])')"
if [[ ! "$source_hash" =~ ^[0-9a-f]{64}$ ]]; then echo "bad source hash" >&2; exit 2; fi
PHASE_SHA="$UPSTREAM_SHA" PHASE_SRC_HASH="$source_hash" python3 - <<'PY'
from pathlib import Path
import os,re,json
p=Path('scripts/verify-engine.ts')
text,count=re.subn(r"const EXPECTED = '[0-9a-f]{64}';",f"const EXPECTED = '{os.environ['PHASE_SRC_HASH']}';",p.read_text(),count=1)
if count != 1: raise RuntimeError('verifier changed')
p.write_text(text)
Path('docs/PHASE-UPSTREAM-PIN.json').write_text(json.dumps({
 'origin':'https://github.com/phase-rs/phase',
 'commit':os.environ['PHASE_SHA'],
 'version':'0.119.0',
 'sourceSha256':os.environ['PHASE_SRC_HASH'],
 'crates':['phase-engine','phase-ast','phase-parser']
},indent=2)+'\n')
PY
bun run engine:verify
cargo metadata --format-version 1 > /dev/null
cargo metadata --locked --format-version 1 > /dev/null
git add -A crates/phase-engine crates/phase-ast crates/phase-parser Cargo.toml Cargo.lock scripts/verify-engine.ts docs/PHASE-UPSTREAM-PIN.json
if git diff --cached --quiet; then echo "No changes"; exit 0; fi
echo "Changed files: $(git diff --cached --name-only | wc -l)"
git config user.name "mesa-upstream-sync"
git config user.email "mesa-upstream-sync@users.noreply.github.com"
git commit -m "chore(phase): vendor upstream 0dd35e4 with AST/parser split" --quiet
git push origin "HEAD:refs/heads/maintenance/phase-upstream-20261102"
echo "Upstream Phase import complete at $UPSTREAM_SHA"
