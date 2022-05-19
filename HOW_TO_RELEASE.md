# How to release Giro3d

- edit version in package.json
- run `npm i`
- open a MR on the repo with these changes
- once merged, tag the commit on master branch
- release the tag on npm:
```
# check authentification
npm who
npm publish --access public
```
- Edit the version to <version +1>-next or something like that
