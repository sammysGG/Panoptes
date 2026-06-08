#!/bin/sh
# Seed built-in modules into the (possibly empty/persistent) modules volume so
# they survive a fresh volume while user-uploaded modules persist alongside.
set -e

if [ -d /app/modules-builtin ]; then
  for src in /app/modules-builtin/*/; do
    [ -d "$src" ] || continue
    name="$(basename "$src")"
    if [ ! -e "/app/modules/$name" ]; then
      cp -a "$src" "/app/modules/$name"
    fi
  done
fi

exec "$@"
