# giro3d Testing suite

This document describes the giro3d testing framework and details how to write tests, run test suite and more.

## Unit tests

Unit tests use the [Jest framework](https://jestjs.io/).

Unit test structure:

- Unit tests for `Extent.js` are located in `/test/unit/Extent.test.js`.
- The root `describe()` should contain the name of the tested class:

  ```js
  describe('Extent', () => {...});
  ```

- each tested method should have its own `describe()`:

  ```js
  describe('Extent', () => {
    describe('isValid', () => { ... }),
    describe('isInside', () => { ... }),
  });
  ```

- Inside each method block, you can have any number of tests. Each test should have a clear description about the expected outcome, such as:

```js
describe('Extent', () => {
    describe('isValid', () => {
        it('should return false if extent has infinite values', () => {
            expect(new Extent('EPSG:3857', NaN, 1, 0, 1).isValid()).toEqual(false);
            expect(new Extent('EPSG:3857', Infinity, 1, 0, 1).isValid()).toEqual(false);
            expect(new Extent('EPSG:3857', 0, 1, Infinity, 1).isValid()).toEqual(false);
        });
    });
});
```

### Coverage

Unit test coverage can be computed with:

```shell
npm run test-with-coverage
```

## Examples

The [example page](https://giro3d.org/examples/) contains a lot of examples, each tackling a single feature, or a combination of features.

Examples are both used to showcase giro3d capabilities, but also as interactive tests, when unit testing is impossible or impractical, for example to test visual results.

### Structure

Each example is a pair of files: HTML and JS. The HTML is actually a template used to generate the actual HTML file with

```shell
npm run build-examples
```

The template looks like this:

```plain
---
title: Cloud Optimized GeoTIFF (COG)
shortdesc: Display a RGB COG.
longdesc: Cloud Optimized GeoTIFFs are regular GeoTIFF files whose layout is optimized for remote access. They allow streaming the image without tiling it beforehand.
attribution: © <a target="_blank" href="https://eox.at/">EOX</a>
---
```

`title` and `shortdesc` are both displayed in the example index, and the example itself. The `longdesc` is only displayed in the example itself, and include additional details about how-tos and API information.

The `attribution` contains all relevant copyright holders and a link to their respective website, if applicable.