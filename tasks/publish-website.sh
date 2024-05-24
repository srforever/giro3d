#!/usr/bin/env bash

set -e

HERE=$(dirname "$0")

[[ ! -d "${HERE}/giro3d-org" ]] && git clone "https://tmuguet:${GIRO3D_ORG_KEY}@gitlab.com/tmuguet/giro3d-org.git" "${HERE}/giro3d-org"

# Build website
node ${HERE}/../tasks/build-site.mjs --release

# Clean previous version-specific content
rm -rf ${HERE}/giro3d-org/dist/next
[[ -d "${HERE}/../build/site/latest" ]] && rm -rf ${HERE}/giro3d-org/dist/latest

# Copy new website
cp -r ${HERE}/../build/site/* ${HERE}/giro3d-org/dist/

# Commit & push changes
cd "${HERE}/giro3d-org"
if [ -n "$(git status --porcelain)" ]; then
    git config user.name "$(git --no-pager log --format=format:'%an' -n 1)"
    git config user.email "$(git --no-pager log --format=format:'%ae' -n 1)"
    git add .
    git commit -m "Website updates"
    git push origin main
fi
