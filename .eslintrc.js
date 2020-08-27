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
        'no-console': 'off', // let's log cleverly!
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
        'no-use-before-define': ["error", "nofunc"],
        // same as airbnb, but allow for..of, because our babel config doesn't import generators
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ForInStatement',
            message: 'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
          },
          {
            selector: 'LabeledStatement',
            message: 'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
          },
          {
            selector: 'WithStatement',
            message: '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
          },
        ],
        // disabling this because it is not yet possible to be subtle enough.
        // For instance, ok:
        // [this.zoom, this.row, this.col] = values
        // is more readable than
        // this.zoom = values[0]; this.row = values[1], this.col = values[2]
        // or { foo, bar } = object; is better than foo = object.foo; bar = object.bar;
        //
        // But what about:
        // [, , z] = array VS z = array[2];
        // or
        //
        // color = this._activeChain()[this.active.point].color;
        // VS
        // ({color} = this._activeChain()[this.active.point])
        // ?
        // (yes, parenthesis are necessary)
        // So let's use our common sense here
        'prefer-destructuring': 'off',
        'no-bitwise': 'off', // we DO manipulate bits often enough, making this irrelevant
    },
    "globals": {
        "__DEBUG__": false
    }
}
