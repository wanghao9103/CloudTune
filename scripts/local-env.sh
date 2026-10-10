#!/usr/bin/env bash
# Optional local SDK, supplied by CLOUDMUSIC_SDK_ROOT. Normal installations need no override.
if [[ -n "${CLOUDMUSIC_SDK_ROOT:-}" ]]; then
 export CARGO_HOME="$CLOUDMUSIC_SDK_ROOT/toolchain/cargo" RUSTUP_HOME="$CLOUDMUSIC_SDK_ROOT/toolchain/rustup"
 export PATH="$CARGO_HOME/bin:$CLOUDMUSIC_SDK_ROOT/ubuntu-deps/root/usr/bin:$PATH"
 export PKG_CONFIG_PATH="$CLOUDMUSIC_SDK_ROOT/ubuntu-deps/root/usr/lib/x86_64-linux-gnu/pkgconfig:$CLOUDMUSIC_SDK_ROOT/ubuntu-deps/root/usr/share/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}"
 export PKG_CONFIG_SYSROOT_DIR="$CLOUDMUSIC_SDK_ROOT/ubuntu-deps/root"
 export LD_LIBRARY_PATH="$CLOUDMUSIC_SDK_ROOT/ubuntu-deps/root/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
 export LIBRARY_PATH="$CLOUDMUSIC_SDK_ROOT/ubuntu-deps/root/usr/lib/x86_64-linux-gnu${LIBRARY_PATH:+:$LIBRARY_PATH}"
 export RUSTFLAGS="${RUSTFLAGS:-} -L native=$CLOUDMUSIC_SDK_ROOT/ubuntu-deps/root/usr/lib/x86_64-linux-gnu -C link-arg=-Wl,-rpath-link,$CLOUDMUSIC_SDK_ROOT/ubuntu-deps/root/usr/lib/x86_64-linux-gnu"
fi
