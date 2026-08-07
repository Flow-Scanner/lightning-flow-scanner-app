import { parseConfigText, parseYaml } from 'c/configParser';

describe('c/configParser', () => {
    it('parses JSON regardless of file name', () => {
        const config = parseConfigText('{"rules":{"dml-in-loop":{"severity":"error"}}}', '.flow-scanner');
        expect(config.rules['dml-in-loop'].severity).toBe('error');
    });

    it('throws the JSON error for .json files instead of retrying as YAML', () => {
        expect(() => parseConfigText('rules:\n  dml-in-loop:\n', 'config.json')).toThrow(/JSON/);
    });

    it('parses a VS Code style .flow-scanner.yml document', () => {
        const text = [
            '# written by the VS Code extension',
            'rules:',
            '  invalid-naming-convention:',
            '    severity: error',
            "    expression: '[A-Za-z0-9]+_[A-Za-z0-9]+'",
            '  excessive-cyclomatic-complexity:',
            '    threshold: 30',
            '  dml-in-loop:',
            '    enabled: false',
            'threshold: warning',
            'categories:',
            '  - problem',
            '  - suggestion',
            "ignoreFlows: [Flow_A, 'Flow B']",
            'betaMode: true',
            'exceptions:',
            '  My_Flow:',
            '    unused-variable:',
            "      - '*'",
            ''
        ].join('\n');

        const config = parseConfigText(text, '.flow-scanner.yml');
        expect(config.rules['invalid-naming-convention']).toEqual({
            severity: 'error',
            expression: '[A-Za-z0-9]+_[A-Za-z0-9]+'
        });
        expect(config.rules['excessive-cyclomatic-complexity'].threshold).toBe(30);
        expect(config.rules['dml-in-loop'].enabled).toBe(false);
        expect(config.threshold).toBe('warning');
        expect(config.categories).toEqual(['problem', 'suggestion']);
        expect(config.ignoreFlows).toEqual(['Flow_A', 'Flow B']);
        expect(config.betaMode).toBe(true);
        expect(config.exceptions.My_Flow['unused-variable']).toEqual(['*']);
    });

    it('handles quoted keys, comments, nulls, and document markers', () => {
        const config = parseYaml(
            [
                '---',
                "'my key': value # trailing comment",
                '"other": "quoted # not a comment"',
                'empty:',
                'nothing: null'
            ].join('\n')
        );
        expect(config['my key']).toBe('value');
        expect(config.other).toBe('quoted # not a comment');
        expect(config.empty).toBeNull();
        expect(config.nothing).toBeNull();
    });

    it('returns an empty object for blank input', () => {
        expect(parseYaml('')).toEqual({});
        expect(parseYaml('# only comments\n\n')).toEqual({});
    });

    it('rejects YAML features outside the supported subset', () => {
        expect(() => parseYaml('key: &anchor value')).toThrow(/Unsupported YAML/);
        expect(() => parseYaml('key: |\n  block')).toThrow(/Unsupported YAML/);
        expect(() => parseYaml('list:\n  - name: nested')).toThrow(/Unsupported YAML/);
        expect(() => parseYaml('key: {a: 1}')).toThrow(/Unsupported YAML/);
    });

    it('rejects malformed lines instead of guessing', () => {
        expect(() => parseYaml('just a plain sentence')).toThrow(/Unsupported YAML/);
        expect(() => parseYaml('key:value-without-space')).toThrow(/Unsupported YAML/);
        expect(() => parseYaml("bad: 'unterminated")).toThrow(/Unsupported YAML/);
    });

    it('does not split plain scalars containing colons (URLs)', () => {
        const config = parseYaml('rules:\n  hardcoded-url:\n    messageUrl: https://example.com/docs#anchor');
        expect(config.rules['hardcoded-url'].messageUrl).toBe('https://example.com/docs#anchor');
    });
});
