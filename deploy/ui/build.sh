#!/usr/bin/env bash
# Build the enclave UI image with root podman and copy it to the transfer drive.
#
# Usage: deploy/ui/build.sh [-d dir] [-n] [-p platform] [-- extra podman build args]
#
# Builds localhost/pulp-ui-enclave:<version>-enclave.<N>, where <version> comes
# from package.json and <N> is one more than the highest build number already
# in root's podman images or in the transfer directory for that version.
# The image is then saved as <dir>/pulp-ui-enclave_<tag>.tar with a .sha256 next to it.
#
#   -d  transfer directory   (default: /run/media/nparente/pulp-transfer/images)
#   -n  build only, don't copy to the transfer directory
#   -p  target platform, e.g. linux/amd64 (default: the host's)
#
# Anything after -- goes straight to "podman build", e.g. -- --no-cache
set -euo pipefail

usage() { sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; }

image=localhost/pulp-ui-enclave
dest=/run/media/nparente/pulp-transfer/images
copy=true
platform=""
orig_args=("$@")

while getopts ":d:np:h" opt; do
  case "$opt" in
    d) dest="$OPTARG" ;;
    n) copy=false ;;
    p) platform="$OPTARG" ;;
    h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))
[[ "${1:-}" == "--" ]] && shift

# images live in root's podman storage
if [[ $EUID -ne 0 ]]; then
  exec sudo -- "$(readlink -f "$0")" "${orig_args[@]}"
fi

# the build context is the repository root, wherever this is run from
root="$(cd "$(dirname "$(readlink -f "$0")")/../.." && pwd)"

version="$(sed -n 's/^  "version": "\(.*\)",$/\1/p' "$root/package.json")"
if [[ -z "$version" ]]; then
  echo "error: could not read the version from $root/package.json" >&2
  exit 1
fi

if $copy; then
  if [[ ! -d "$dest" ]]; then
    echo "error: $dest does not exist; is the transfer drive mounted? (use -n to skip the copy)" >&2
    exit 1
  fi
  if [[ ! -w "$dest" ]]; then
    echo "error: $dest is not writable" >&2
    exit 1
  fi
fi

# next build number: highest existing <version>-enclave.N in podman or on the drive, plus one
last=0
while read -r n; do
  if ((n > last)); then
    last=$n
  fi
done < <(
  {
    podman images --noheading --format '{{.Tag}}' --filter "reference=$image"
    if [[ -d "$dest" ]]; then
      find "$dest" -maxdepth 1 -name "pulp-ui-enclave_*.tar" -printf '%f\n' \
        | sed 's/^pulp-ui-enclave_\(.*\)\.tar$/\1/'
    fi
  } | sed -n "s/^${version//./\\.}-enclave\.\([0-9][0-9]*\)$/\1/p"
)
tag="$version-enclave.$((last + 1))"

args=(build -f "$root/deploy/ui/Containerfile" -t "$image:$tag")
if [[ -n "$platform" ]]; then
  args+=(--platform "$platform")
fi

echo "+ podman ${args[*]} $* $root"
podman "${args[@]}" "$@" "$root"
echo "Built $image:$tag"

if $copy; then
  file="pulp-ui-enclave_$tag.tar"
  echo "Saving to $dest/$file"
  podman save -o "$dest/$file.partial" "$image:$tag"
  mv "$dest/$file.partial" "$dest/$file"
  (cd "$dest" && sha256sum "$file" >"$file.sha256")
  sync
  echo "Copied $dest/$file"
  echo "On the other side: podman load -i $file"
fi
