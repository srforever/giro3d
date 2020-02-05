/* global browser, giro3dPort */
const assert = require('assert');

describe('planar_vector_tiles', () => {
    it('should run', async function _() {
        const page = await browser.newPage();

        const result = await loadExample(page,
            `http://localhost:${giro3dPort}/examples/planar_vector_tiles.html`,
            this.test.fullTitle());

        assert.ok(result);
        await page.close();
    });
});
