import { createElement } from '@lwc/engine-dom';
import ScanConfigurator from 'c/scanConfigurator';

const SAMPLE_RULES = [
    {
        id: 'rule-0',
        name: 'CyclomaticComplexity',
        ruleId: 'excessive-cyclomatic-complexity',
        description: 'Too many loops',
        severity: 'note',
        isActive: true,
        isBeta: false
    },
    {
        id: 'rule-1',
        name: 'APIVersion',
        ruleId: 'invalid-api-version',
        description: 'API version check',
        severity: 'error',
        isActive: true,
        isBeta: false
    },
    {
        id: 'rule-2',
        name: 'CognitiveComplexity',
        ruleId: 'cognitive-complexity',
        description: 'Cognitive complexity',
        severity: 'note',
        isActive: false,
        isBeta: true
    }
];

function createComponent(rules = SAMPLE_RULES) {
    const element = createElement('c-scan-configurator', {
        is: ScanConfigurator
    });
    element.rules = rules;
    document.body.appendChild(element);
    return element;
}

describe('c-scan-configurator', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders rules from the api property', async () => {
        const element = createComponent();
        await Promise.resolve();

        const rows = element.shadowRoot.querySelectorAll('tbody tr');
        // toggle-all row + 3 rules
        expect(rows.length).toBe(4);
    });

    it('dispatches configimport for a valid CLI-style JSON document', async () => {
        const element = createComponent();
        await Promise.resolve();

        const handler = jest.fn();
        element.addEventListener('configimport', handler);

        const ok = element.applyImportedText(
            JSON.stringify({
                rules: {
                    'excessive-cyclomatic-complexity': { threshold: 30, severity: 'warning' },
                    'invalid-api-version': { expression: '>=58' }
                },
                threshold: 'error',
                categories: ['problem']
            }),
            'flow-scanner.json'
        );

        expect(ok).toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
        const config = handler.mock.calls[0][0].detail.config;
        expect(config.rules['excessive-cyclomatic-complexity'].threshold).toBe(30);
        expect(config.threshold).toBe('error');
        expect(config.categories).toEqual(['problem']);
        await Promise.resolve();
        const msg = element.shadowRoot.querySelector('.import-msg');
        expect(msg).not.toBeNull();
        expect(msg.textContent).toMatch(/flow-scanner\.json/);
        expect(msg.className).toMatch(/import-msg_success/);
    });

    it('accepts a bare rules map without a top-level rules key', async () => {
        const element = createComponent();
        await Promise.resolve();

        const handler = jest.fn();
        element.addEventListener('configimport', handler);

        const ok = element.applyImportedText(
            JSON.stringify({
                CyclomaticComplexity: { threshold: 15 },
                'invalid-naming-convention': { expression: '[A-Z].+' }
            }),
            'rules-only.json'
        );

        expect(ok).toBe(true);
        expect(handler).toHaveBeenCalledTimes(1);
        const config = handler.mock.calls[0][0].detail.config;
        expect(config.CyclomaticComplexity.threshold).toBe(15);
        expect(config.rules).toBeUndefined();
    });

    it('rejects invalid JSON with an error message and no event', async () => {
        const element = createComponent();
        await Promise.resolve();

        const handler = jest.fn();
        element.addEventListener('configimport', handler);

        const ok = element.applyImportedText('{ not json', 'bad.json');

        expect(ok).toBe(false);
        expect(handler).not.toHaveBeenCalled();
        await Promise.resolve();
        const msg = element.shadowRoot.querySelector('.import-msg');
        expect(msg).not.toBeNull();
        expect(msg.textContent).toMatch(/Could not parse bad\.json/);
        expect(msg.className).toMatch(/import-msg_error/);
    });

    it('rejects non-object JSON roots', async () => {
        const element = createComponent();
        await Promise.resolve();

        const handler = jest.fn();
        element.addEventListener('configimport', handler);

        expect(element.applyImportedText('[]', 'array.json')).toBe(false);
        expect(element.applyImportedText('"string"', 'str.json')).toBe(false);
        expect(handler).not.toHaveBeenCalled();
    });

    it('syncs local table when parent rules property is replaced', async () => {
        const element = createComponent();
        await Promise.resolve();

        element.rules = [
            {
                id: 'rule-0',
                name: 'CyclomaticComplexity',
                ruleId: 'excessive-cyclomatic-complexity',
                description: 'Too many loops',
                severity: 'error',
                isActive: false,
                isBeta: false
            }
        ];
        await Promise.resolve();

        const rows = element.shadowRoot.querySelectorAll('tbody tr');
        // toggle-all + 1 rule
        expect(rows.length).toBe(2);
        const severity = element.shadowRoot.querySelector('lightning-combobox');
        expect(severity.value).toBe('error');
    });
});
