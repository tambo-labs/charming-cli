#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: build-release-archive.sh <version> <outdir>" >&2
  exit 2
fi

version="$1"
outdir="$2"
package_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
archive_name="charming-${version}.tar.gz"

mkdir -p "$outdir"
outdir="$(cd "$outdir" && pwd)"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

mkdir "$work/pack" "$work/build"
tarball="$(cd "$package_dir" && npm pack --silent --pack-destination "$work/pack")"
tar -xzf "$work/pack/$tarball" -C "$work/build"
mv "$work/build/package" "$work/build/charming"

(
  cd "$work/build/charming"
  npm install --omit=dev --ignore-scripts --no-package-lock --no-audit --no-fund
  chmod +x bin/run.js
)

tar -czf "$outdir/$archive_name" -C "$work/build" charming

mkdir "$work/smoke"
tar -xzf "$outdir/$archive_name" -C "$work/smoke"
test -f "$work/smoke/charming/skills/charming/SKILL.md"

direct="$(node "$work/smoke/charming/bin/run.js" --version)"
ln -s "$work/smoke/charming/bin/run.js" "$work/smoke/charming-link"
linked="$("$work/smoke/charming-link" --version)"

for output in "$direct" "$linked"; do
  case "$output" in
    *"$version"*) ;;
    *)
      echo "smoke test failed: expected version $version, got: $output" >&2
      exit 1
      ;;
  esac
done

echo "built $outdir/$archive_name"
echo "direct: $direct"
echo "symlink: $linked"
echo "skill: charming/skills/charming/SKILL.md"
