# How to release Giro3d

- review the changes, with `git log --oneline --no-merges $(git describe --tags --abbrev=0)..` for instance
- figure out what type of version we release (major, minor, patch)
- edit version in package.json
- run `npm i`
- edit `History.md`, for example with `git changelog` (usually in git-extras package):
```bash
git changelog --start-commit v0.1.1 -t v0.2.0 History.md
```
  NOTE: the output is not perfect, it should be edited
- open a MR on the repo with these changes
- once merged, tag the commit on master branch
- release the tag on npm:
```
# check authentification
npm who
# prepare the package
npm run build-package
cd build/giro3d
npm publish --access public
```
- Edit the version to <version +1>-next or something like that
