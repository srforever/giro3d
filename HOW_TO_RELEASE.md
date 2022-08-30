# How to release Giro3d

- review the changes, with `git log --oneline --no-merges $(git describe --tags --abbrev=0)..` for instance
- figure out what type of version we release (major, minor, patch). Normally commitizen should be
able to auto-detect it, but is confused by the fact release starting with v0.x are MAJOR in
semver...
- generate a changelog with commitizen:
```
cz changelog --incremental --unreleased-version <version>
```
- do NOT commit as is. The auto-generated changelog *always* needs editing. For instance, the
`BREAKING CHANGE` section must read like a migration guide.
- bump version in cz config with `cz bump`, you can specify which release type with `--increment MINOR` for
instance.
- bump version in package.json and run `npm i`
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
