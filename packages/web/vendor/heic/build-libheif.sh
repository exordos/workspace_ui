#!/usr/bin/env bash
set -euo pipefail

# Pass --install-sdk to bootstrap the pinned compiler in a temporary directory.
vendor_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
build_dir="$(mktemp -d)"
trap 'rm -rf "$build_dir"' EXIT
cd "$build_dir"

if [[ "${1:-}" == "--install-sdk" ]]; then
  sdk_version=4.0.14
  sdk_revision=eff90ca04a3785f571a8095b3a42b63799cf384a
  git clone --quiet --depth 1 --branch "$sdk_version" https://github.com/emscripten-core/emsdk.git emsdk
  if [[ "$(git -C emsdk rev-parse HEAD)" != "$sdk_revision" ]]; then
    echo "Unexpected emsdk revision for $sdk_version" >&2
    exit 1
  fi
  emsdk/emsdk install "$sdk_version"
  emsdk/emsdk activate "$sdk_version"
  set +u
  source emsdk/emsdk_env.sh
  set -u
fi

curl --fail --silent --show-error --location --retry 3 \
  https://codeload.github.com/strukturag/libheif/tar.gz/refs/tags/v1.23.7 \
  --output libheif-1.23.7.tar.gz
curl --fail --silent --show-error --location --retry 3 \
  https://github.com/strukturag/libde265/releases/download/v1.1.3/libde265-1.1.3.tar.gz \
  --output libde265-1.1.3.tar.gz
checksum=(shasum -a 256)
if command -v sha256sum >/dev/null; then
  checksum=(sha256sum)
fi
"${checksum[@]}" -c - <<'CHECKSUMS'
90e389caad285ca4946461d56d1c115e56bcbb5141d9038050282af91064fbc7  libheif-1.23.7.tar.gz
554228bd17788c99a7e63b37ab5634722190e6e2bf60c1dcb01cef328e133905  libde265-1.1.3.tar.gz
CHECKSUMS
tar -xf libheif-1.23.7.tar.gz
tar -xf libde265-1.1.3.tar.gz

emcmake cmake -S libde265-1.1.3 -B libde265-build -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF -DENABLE_DECODER=OFF -DENABLE_SIMD=OFF
cmake --build libde265-build --target de265 --parallel "${CORES:-4}"
# The upstream libheif script looks for the decoder in its original Autotools location.
mkdir -p libde265-1.1.3/libde265/.libs
cp libde265-build/libde265/libde265.a libde265-1.1.3/libde265/.libs/
cp libde265-build/libde265/de265-version.h libde265-1.1.3/libde265/

# Embed the WASM bytes so the Worker can run from Electron's file: URLs.
sed -e 's/-DWITH_EXAMPLES=OFF/-DWITH_EXAMPLES=OFF -DBUILD_TESTING=OFF/' \
  -e 's/-sWASM_ASYNC_COMPILATION=0/-sWASM_ASYNC_COMPILATION=0 -sENVIRONMENT=worker -sSINGLE_FILE=1 -sMAXIMUM_MEMORY=536870912/' \
  libheif-1.23.7/build-emscripten.sh > build-decoder.sh
CORES="${CORES:-4}" LIBDE265_VERSION=1.1.3 USE_ES6=1 USE_TYPESCRIPT=0 USE_UNSAFE_EVAL=0 \
  bash build-decoder.sh "$build_dir/libheif-1.23.7"

{
  printf '%s\n' '/*! libheif 1.23.7 and libde265 1.1.3 (LGPL-3.0). See vendor/heic-license.txt. */'
  cat libheif.js
} > "$vendor_dir/libheif.js"

{
  cat <<'NOTICE'
Workspace HEIC preview decoder

libheif 1.23.7 — Copyright (C) 2017–2026 struktur AG and contributors
https://github.com/strukturag/libheif/tree/v1.23.7

libde265 1.1.3 — Copyright (C) 2013–2014 struktur AG, Dirk Farin and contributors
https://github.com/strukturag/libde265/tree/v1.1.3

The decoder is compiled to WebAssembly from the source above. The build script
is packages/web/vendor/heic/build-libheif.sh in the Workspace repository.

NOTICE
  cat libheif-1.23.7/COPYING
} > "$vendor_dir/../../public/vendor/heic-license.txt"
