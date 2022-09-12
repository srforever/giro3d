module.exports = {
    settings: {
        'import/resolver': {
            webpack: {
                // TODO when eslint will work correctly with ESM module, replace by:
                /*
                 resolve: {
                    alias: {
                        '@giro3d/giro3d': '../src'
                    }
                },
                */
                config: {
                    resolve: {
                        alias: {
                            '@giro3d/giro3d': '../src',
                        },
                    },
                },
            },
        },
    },
};
