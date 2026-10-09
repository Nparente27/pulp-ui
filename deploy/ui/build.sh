#!/usr/bin/env bash
# Build the enclave UI image from deploy/ui/Containerfile.
#
# Usage: deploy/ui/build.sh [-i image] [-t tag] [-p platform] [-e engine] [-P] [-- extra build args]
#
#   -i  image name                       (default: $IMAGE or localhost/pulp-ui)
#   -t  extra tag; always also tagged with the git short sha
#                                        (default: $TAG or latest)
#   -p  target platform, e.g. linux/amd64 (default: the host's)
#   -e  container engine                 (default: $ENGINE, else podman, else docker)
#   -P  push both tags after building
#
# Anything after -- goes straight to "<engine> build", e.g. -- --no-cache
set -euo pipefail

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; }

image="${IMAGE:-localhost/pulp-ui}"
tag="${TAG:-latest}"
platform=""
engine="${ENGINE:-}"
push=false

while getopts ":i:t:p:e:Ph" opt; do
  case "$opt" in
    i) image="$OPTARG" ;;
    t) tag="$OPTARG" ;;
    p) platform="$OPTARG" ;;
    e) engine="$OPTARG" ;;
    P) push=true ;;
    h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
[[ "${1:-}" == "--" ]] && shift

if [[ -z "$engine" ]]; then
  if command -v podman >/dev/null; then
    engine=podman
  elif command -v docker >/dev/null; then
    engine=docker
  else
    echo "error: neither podman nor docker found; set -e or ENGINE" >&2
    exit 1
  fi
fi

# the build context is the repository root, wherever this is run from
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
sha="$(git -C "$root" rev-parse --short HEAD 2>/dev/null || echo unknown)"
if [[ -n "$(git -C "$root" status --porcelain 2>/dev/null)" ]]; then
  sha="$sha-dirty"
fi

args=(build -f "$root/deploy/ui/Containerfile" -t "$image:$tag" -t "$image:$sha")
[[ -n "$platform" ]] && args+=(--platform "$platform")

echo "+ $engine ${args[*]} $* $root"
"$engine" "${args[@]}" "$@" "$root"

echo "Built $image:$tag and $image:$sha"

if $push; then
  "$engine" push "$image:$tag"
  "$engine" push "$image:$sha"
fi
