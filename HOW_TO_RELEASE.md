# How to release Giro3d

[[_TOC_]]

## Requirements

Install the commitizen utility with pip

```
pip install commitizen
```

This will install the `cz` utility in your python packages folder (by default `$HOME/.local/bin/cz`).

## Create a release branch

Before anything, create a branch `release_vX.Y.Z` where `X.Y.Z` is the release version number.

## Generate the changelog

- review the changes between the last release and the current `main`, with the following command

```
git log --oneline --no-merges $(git describe --tags --abbrev=0)..
```

- figure out what type of version we release (major, minor, patch). Normally commitizen should be
able to auto-detect it, but is confused by the fact release starting with v0.x are MAJOR in
semver...
- generate a changelog with commitizen:

```
$HOME/.local/bin/cz changelog --incremental --unreleased-version <version>
```

Where version is the version we want to release (don't forget the `v` prefix, for example `v0.5.0`).

Edit the generated changelog for readability (fix typos, add some context for unclear changes).

For the `BREAKING CHANGE` section, edit the text to add a migration guide.

## Bump the version number

- bump version in package.json and run `npm i`

## Open a MR

- open a MR on the repo with these changes
- once merged, tag the commit on main branch (Don't forget the `v` prefix)

## Publish on NPM

Checkout the created tag, then

```bash
# check authentification
npm who

# build the package
npm run prepare-package
cd build/giro3d

# publish the package
npm publish --access public
```
