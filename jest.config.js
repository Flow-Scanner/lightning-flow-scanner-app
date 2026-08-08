const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig,
    modulePathIgnorePatterns: ['<rootDir>/.localdevserver'],
    collectCoverageFrom: [
        'force-app/main/default/lwc/**/*.js',
        '!**/__tests__/**'
    ]
};
