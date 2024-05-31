#!/bin/sh

set -e

HERE=$(dirname "$0")
thisCommit=$(git describe --tags --always)
thisUsername=$(git --no-pager log --format=format:'%an' -n 1)
thisUseremail=$(git --no-pager log --format=format:'%ae' -n 1)

push=0
for arg in "$@"
do
    if [ "$arg" = "--push" ]; then
        push=1
        break
    fi
done

[ ! -d "${HERE}/giro3d-website" ] && git clone "https://giro3d:${GIRO3D_ORG_KEY}@gitlab.com/giro3d/giro3d-website.git" "${HERE}/giro3d-website"

# Clean previous version-specific content
rm -rf ${HERE}/giro3d-website/dist/next
[ -d "${HERE}/../build/site/latest" ] && rm -rf ${HERE}/giro3d-website/dist/latest

# Copy new website
cp -r ${HERE}/../build/site/* ${HERE}/giro3d-website/dist/

# Commit & push changes
cd "${HERE}/giro3d-website"
if [ -n "$(git status --porcelain)" ]; then
    git config user.name "${thisUsername}"
    git config user.email "${thisUseremail}"
    git add .
    git commit -m "Website updates ${thisCommit}"
    if [ $push -eq 1 ]; then
        echo "Pushing to repo..."
        git push origin main
    else
        echo "Dry-run git push, skipping"
    fi
else
    echo "Nothing new to push, skipping"
fi
