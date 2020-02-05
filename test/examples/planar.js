/* global browser, giro3dPort */
const assert = require('assert');

describe('planar', () => {
    it('should run', async function _() {
        const page = await browser.newPage();
        const result = await loadExample(page,
            `http://localhost:${giro3dPort}/examples/planar.html`,
            this.test.fullTitle());

        assert.ok(result);
        await page.close();
    });
});
