module.exports = {
    settings: {
        'import/resolver': {
            webpack: {
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
