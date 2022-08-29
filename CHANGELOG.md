
v0.3.0 / 2022-07-04
===================

## BREAKING

* Instance, Map: capitalize file names: you might need to change your imports if you reference
individual files


## Features 

* Add helpers method to integrate any THREE controls in giro3d
* add min/max height options on FirstPersonControls

## Fixes

  * Fix picking with radius on regular THREE.js objects

## Documentation

More classes are now documented. More are even in progress!

The README has been rewritten (fix broken links, add logo, improve readability)

## others

* vscode: add tasks.json

v0.2.0 / 2022-06-15
===================

  * Example: change the background color of orthographic.html
  * Update three js to v0.135
  * Fix: remove useless log
  * Upgrade OpenLayers to the latest version to use the GeoTIFF loader

v0.1.1 / 2022-05-25
==================

  * Fix: display of heightfield elevation
  * Fix: fix picking on tile with heightfield elevation
  * Fix: correct typo in instance.threeObjects
  * Fix: also pick from THREE.Object3D we know about
  * Chore: fix the repo url in package.json
  * Fix: babel invocation in observer.py
