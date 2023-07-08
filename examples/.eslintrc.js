/* eslint-disable import/no-extraneous-dependencies */
const path = require('path');

module.exports = {
    settings: {
        'import/resolver': {
            webpack: {
                config: {
                    resolve: {
                        alias: {
                            '@giro3d/giro3d': path.resolve(__dirname, '../build/giro3d'),
                        },
                    },
                },
            },
        },
    },
};
