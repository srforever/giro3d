/* global browser, giro3dPort */
const assert = require('assert');

describe('cubic_planar', () => {
    it('should run', async function _() {
        const page = await browser.newPage();
        const result = await loadExample(page,
            `http://localhost:${giro3dPort}/examples/cubic_planar.html`,
            this.test.fullTitle());

        assert.ok(result);
        await page.close();
    });
});
