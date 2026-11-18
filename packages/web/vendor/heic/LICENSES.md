# HEIC preview decoder

The worker uses WebAssembly built from [libheif 1.23.7](https://github.com/strukturag/libheif/tree/v1.23.7) and [libde265 1.1.3](https://github.com/strukturag/libde265/tree/v1.1.3), both distributed under LGPL 3.0. Copyright belongs to Struktur AG and the contributors listed in the source distributions.

The corresponding sources are available in the release archives pinned in [build-libheif.sh](build-libheif.sh). CI builds `libheif.js` with this script and passes it to the app builds as an artifact. The app bundles the [license notice](../../public/vendor/heic-license.txt).

For local builds, run `bash packages/web/vendor/heic/build-libheif.sh --install-sdk` from the repository root with Git, CMake, curl and Python 3 available. The script installs [Emscripten 4.0.14](https://github.com/emscripten-core/emsdk/tree/4.0.14) in a temporary directory. If that SDK is already active, run the script without the flag. Rerun after changes to the pinned decoder sources or build flags.
