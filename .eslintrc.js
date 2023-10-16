module.exports = {
    root: true,
    plugins: ['jsdoc', 'jest', 'compat'],
    extends: [
        'plugin:compat/recommended',
        'eslint-config-airbnb-base',
        'eslint-config-airbnb-base/rules/strict',
        'airbnb-typescript/base',
        'plugin:jsdoc/recommended',
    ],
    parserOptions: {
        project: './tsconfig.eslint.json',
        ecmaVersion: 2020,
        sourceType: 'module',
        ecmaFeatures: {
            impliedStrict: true,
        },
    },
    settings: {
        'import/ignore': [
            '\\.(coffee|scss|css|less|hbs|svg|json)$',
        ],
        jsdoc: {
            mode: 'typescript',
        },
    },
    env: {
        browser: true,
        es6: true,
        amd: true,
        commonjs: true,
        jest: {
            globals: true,
        },
    },
    rules: {
        'jest/no-disabled-tests': 'warn',
        'jest/no-focused-tests': 'error',
        'jest/no-identical-title': 'error',
        'jest/prefer-to-have-length': 'warn',
        'jest/valid-expect': 'error',
        'jsdoc/require-jsdoc': 'off',
        'jsdoc/require-returns': 'off',
        'jsdoc/check-tag-names': [
            'error', { definedTags: ['api'] },
        ],
        'no-console': 'off', // let's log cleverly!
        eqeqeq: ['error', 'smart'],
        'no-plusplus': 'off',
        'arrow-parens': ['error', 'as-needed'],
        '@typescript-eslint/lines-between-class-members': 'off',
        // this option sets a specific tab width for your code
        // http://eslint.org/docs/rules/indent
        '@typescript-eslint/indent': ['warn', 4, {
            SwitchCase: 1,
            VariableDeclarator: 1,
            outerIIFEBody: 1,
            FunctionDeclaration: {
                parameters: 1,
                body: 1,
            },
            FunctionExpression: {
                parameters: 1,
                body: 1,
            },
        }],
        'one-var': ['error', 'never'],
        // We want to be able to import .ts files from .js files without mentioning the extension,
        // otherwise the transpiled file would still import a .ts file and this would break.
        'import/extensions': 'off',
        'import/no-extraneous-dependencies': ['error', {
            devDependencies: ['test/**', 'examples/**'],
        }],
        'no-underscore-dangle': 'off',
        // we make heavy use of for loop, and continue is very handy when used correctly
        'no-continue': 'off',
        'no-param-reassign': 'off', // we use param reassign too much with targets
        'no-use-before-define': ['error', 'nofunc'],
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
        'max-classes-per-file': 'off', // for me, if we export only one, I don't see the wrong here
    },
    overrides: [
        {
            // Below are linter rules (probably enabled by airbnb-typescript/base) that we don't
            // want applied to JS files, to avoid warnings in legacy files and simplify the future
            // transition to Typescript.
            // As soon as one file transitions from .js to .ts, those rule apply and we must fix the
            // warnings/errors.
            files: ['**/*.js'],
            rules: {
                'import/no-named-as-default': 'off',
                '@typescript-eslint/naming-convention': 'off',
                '@typescript-eslint/no-use-before-define': 'off',
                '@typescript-eslint/no-unused-vars': 'off', // Because it's already present in eslint
                '@typescript-eslint/default-param-last': 'off'
            },
        },
        {
            // Below are Typescript specific rules that are disabled either because they don't make
            // sense, or because the Typescript compiler is a better tool to enforce them.
            files: ['**/*.ts'],
            rules: {
                // We don't need jsdoc param types because we use Typescript type annotations
                // and Typedoc supports them out of the box.
                'jsdoc/require-param-type': 'off',
                'jsdoc/require-returns-type': 'off',
                '@typescript-eslint/consistent-type-imports': 'error',
            },
        },
    ],
    globals: {
        __DEBUG__: false,
    },
};
