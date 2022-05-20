# How to release Giro3d

- edit version in package.json (choose the version wisely, do we have breaking changes?)
- run `npm i`
- open a MR on the repo with these changes
- once accepted, don't merge it, just tag it
- edit the commit, increment the PATCH part of the version by 1 and add `-next` at the end of the version number. 
- release the tag on npm:
```
# check authentification
npm who
npm publish --access public
```
- Edit the version to <version +1>-next or something like that
