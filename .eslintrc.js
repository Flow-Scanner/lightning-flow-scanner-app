module.exports = {
    root: true,
    overrides: [
        // LWC configuration
        {
            files: ['**/lwc/**/*.js'],
            extends: ['@salesforce/eslint-config-lwc/recommended']
        },

        // LWC test files
        {
            files: ['**/lwc/**/*.test.js'],
            extends: ['@salesforce/eslint-config-lwc/recommended'],
            rules: {
                '@lwc/lwc/no-unexpected-wire-adapter-usages': 'off'
            },
            env: {
                node: true
            }
        },

        // Jest mocks
        {
            files: ['**/jest-mocks/**/*.js'],
            env: {
                node: true,
                es2021: true,
                jest: true
            },
            extends: ['plugin:jest/recommended']
        }
    ]
};
