# How to release Giro3D

[[_TOC_]]

## Requirements

Install the commitizen utility with pip

```shell
pip install commitizen
```

This will install the `cz` utility in your python packages folder (by default `$HOME/.local/bin/cz`).

## Create a release branch

If new major/minor release: create a branch `release/X.Y` where `X.Y.0` is the release version number.

If patch release, the branch `release/X.Y` should already exist, start from there.

## Generate the changelog

1. review the changes between the last release and the current `main`, with the following command

    ```shell
    git log --oneline --no-merges $(git describe --tags --abbrev=0)..
    ```

2. figure out what type of version we release (major, minor, patch). Normally commitizen should be
able to auto-detect it, but is confused by the fact release starting with v0.x are MAJOR in
semver...
3. generate a changelog with commitizen:

    ```shell
    $HOME/.local/bin/cz changelog --incremental --unreleased-version <version>
    ```

    where version is the version we want to release (don't forget the `v` prefix, for example `v0.5.0`).

4. Edit the generated changelog for readability (fix typos, add some context for unclear changes).  
    It's also best to sort the items in Feat/Fix/Refactor alphabetically.  
    For the `BREAKING CHANGE` section, edit the text to add a migration guide.

## Bump the version number

- bump version in package.json and run `npm i`

## Open a MR

- open a MR on the repo with these changes
- once merged, tag the commit on main branch (Don't forget the `v` prefix)
- once tagged, the pipeline will automatically be triggered to publish the package on NPM.

**Note:** for pre-releases, you can use a release branch to tag the version, but that branch **MUST** be protected for the pipeline to run and publish the package. Branches following the pattern `release/*` are automatically protected.

## Publish on NPM

If you wish to manually create a NPM release:

```shell
# check authentification
npm who

# build the package
npm run make-package
# publish the package - make sure the path "build/giro3d/" is specified!
npm publish build/giro3d/ --access public
```
