module.exports = {
    presets: ['@babel/preset-typescript'],
    plugins: [
        // Necessary to import text files (shaders)
        ['babel-plugin-inline-import', {
            extensions: [
                '.json',
                '.glsl',
            ],
        }],
        ['minify-replace', {
            replacements: [{
                identifierName: '__DEBUG__',
                replacement: {
                    type: 'booleanLiteral',
                    value: false,
                },
            }],
        }],
        ['minify-dead-code-elimination'],
    ],
    env: {
        test: {
            presets: [
                'jest',
                [
                    '@babel/preset-env',
                ],
            ],
        },
    },
};
