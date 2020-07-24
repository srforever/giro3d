module.exports = {
    root: true,
    'extends': [
        'eslint-config-airbnb-base',
        'eslint-config-airbnb-base/rules/strict',
    ],
    parserOptions: {
        ecmaVersion: 2017,
        sourceType: 'module',
        ecmaFeatures: {
            impliedStrict: true
        }
    },
    settings: {
        'import/resolver': {
            'webpack': {}
        }
    },
    env: {
        browser: true,
        es6: true,
        amd: true,
        commonjs: true
    },
    rules: {
        eqeqeq: ["error", "smart"],
        'no-plusplus': 'off',
        'arrow-parens': ['error', 'as-needed'],
        // this option sets a specific tab width for your code
        // http://eslint.org/docs/rules/indent
        indent: ['warn', 4, {
            SwitchCase: 1,
            VariableDeclarator: 1,
            outerIIFEBody: 1,
            // MemberExpression: null,
            // CallExpression: {
            // parameters: null,
            // },
            FunctionDeclaration: {
                parameters: 1,
                body: 1
            },
            FunctionExpression: {
                parameters: 1,
                body: 1
            }
        }],
        'one-var': ['error', 'never'],
        'valid-jsdoc': ['error', {
            requireReturn: false,
            requireParamDescription: false,
            requireReturnDescription: false,
        }],
        'import/extensions': ["error", "always"],
        'import/no-extraneous-dependencies': ['error', {
            devDependencies: ['test/**', 'utils/**', 'examples/**'],
        }],
        'no-underscore-dangle': 'off',
        // we make heavy use of for loop, and continue is very handy when used correctly
        'no-continue': 'off',
        'no-param-reassign': 'off', // we use param reassign too much with targets
        'no-use-before-define': ["error", "nofunc"]
    },
    "globals": {
        "__DEBUG__": false
    }
}
