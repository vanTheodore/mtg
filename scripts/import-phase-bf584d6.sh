#!/usr/bin/env bash
set -euo pipefail
BRANCH="maintenance/phase-bf584d6-20261103"
OLD="0dd35e4a9dfe1dfba697224775d2205d56f7f20d"
NEW="bf584d6bd39f254549be49ed9ff2b845e748e32c"
if [[ "${GITHUB_REF_NAME:-}" != "$BRANCH" || "${GITHUB_REPOSITORY:-}" != "vanTheodore/mtg" ]]; then
  echo "Refusing to import outside the dedicated Phase branch" >&2
  exit 2
fi
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
test "$(python3 -c 'import json;print(json.load(open("docs/PHASE-UPSTREAM-PIN.json"))["commit"])')" = "$OLD"
bun scripts/verify-engine.ts >/dev/null

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git clone --quiet --depth=20 --filter=blob:none --sparse https://github.com/phase-rs/phase.git "$tmp/phase"
git -C "$tmp/phase" fetch --quiet --depth=20 origin "$OLD" "$NEW"
git -C "$tmp/phase" checkout --quiet --detach "$NEW"
git -C "$tmp/phase" sparse-checkout set crates/engine
test "$(git -C "$tmp/phase" rev-parse HEAD)" = "$NEW"

files=(
  "src/game/coverage.rs"
  "src/game/engine.rs"
  "src/types/game_state.rs"
  "tests/integration/attacked_player_referent.rs"
  "tests/integration/cast_during_resolution_pipeline.rs"
)
for suffix in "${files[@]}"; do
  src="crates/engine/$suffix"
  dst="crates/phase-engine/$suffix"
  test -f "$dst"
  old_blob="$(git -C "$tmp/phase" rev-parse "$OLD:$src")"
  local_blob="$(git hash-object "$dst")"
  if [[ "$old_blob" != "$local_blob" ]]; then
    echo "Source has diverged from old upstream pin: $dst ($local_blob != $old_blob)" >&2
    exit 3
  fi
  cp "$tmp/phase/$src" "$dst"
  new_blob="$(git -C "$tmp/phase" rev-parse "$NEW:$src")"
  imported_blob="$(git hash-object "$dst")"
  if [[ "$imported_blob" != "$new_blob" ]]; then
    echo "Imported bytes are not the pinned upstream Git blob: $src" >&2
    exit 4
  fi
  echo "Verified $dst: $old_blob -> $new_blob"
done

# The verifier prints the computed digest even while its old pin makes it fail.
# Parse the real SHA; never weaken the verifier or the frozen Cargo lockfile.
report="$(bun scripts/verify-engine.ts || true)"
new_hash="$(printf '%s\n' "$report" | python3 -c 'import json,sys;print(json.load(sys.stdin)["sha256"])')"
if [[ ! "$new_hash" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Invalid computed source SHA-256" >&2
  exit 5
fi
PHASE_SHA="$NEW" PHASE_SOURCE_SHA="$new_hash" python3 - <<'PY'
import os, json
from pathlib import Path
p=Path('docs/PHASE-UPSTREAM-PIN.json')
pin=json.loads(p.read_text())
assert pin['commit']=='0dd35e4a9dfe1dfba697224775d2205d56f7f20d'
pin['commit']=os.environ['PHASE_SHA']
pin['sourceSha256']=os.environ['PHASE_SOURCE_SHA']
p.write_text(json.dumps(pin,indent=2)+'\n')
PY
bun run engine:verify
cargo metadata --locked --format-version 1 > /dev/null

# Remove both privileged one-time import resources BEFORE committing so that
# no contents:write workflow/script remains in the actual pull request tree.
git rm --quiet .github/workflows/import-phase-bf584d6.yml scripts/import-phase-bf584d6.sh
git add docs/PHASE-UPSTREAM-PIN.json
for suffix in "${files[@]}"; do git add "crates/phase-engine/$suffix"; done
count="$(git diff --cached --name-only | wc -l)"
test "$count" -eq 8 || { echo "Unexpected staged file count $count" >&2; exit 6; }
git config user.name "mesa-upstream-sync"
git config user.email "mesa-upstream-sync@users.noreply.github.com"
git commit --quiet -m "chore(phase): import five pinned Rust paths from bf584d6"
git push origin "HEAD:refs/heads/$BRANCH"
echo "Upstream import complete: $NEW; Phase engine source SHA-256: $new_hash"
