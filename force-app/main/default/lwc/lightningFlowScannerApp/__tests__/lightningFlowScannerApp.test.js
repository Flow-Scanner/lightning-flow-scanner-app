import { createElement } from '@lwc/engine-dom';
import LightningFlowScannerApp from 'c/lightningFlowScannerApp';
import getSavedConfig from '@salesforce/apex/LFSConfigController.getSavedConfig';
import saveConfig from '@salesforce/apex/LFSConfigController.saveConfig';

jest.mock(
    'lightning/platformResourceLoader',
    () => ({
        loadScript: jest.fn().mockResolvedValue(undefined),
        loadStyle: jest.fn().mockResolvedValue(undefined)
    }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/LightningFlowScannerController.getFlowDefinitions',
    () => ({ default: jest.fn().mockResolvedValue([]) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/LightningFlowScannerController.getFlowMetadata',
    () => ({ default: jest.fn().mockResolvedValue(null) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/LightningFlowScannerController.getMDTRules',
    () => ({ default: jest.fn().mockResolvedValue([]) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/LFSConfigController.getSavedConfig',
    () => ({ default: jest.fn().mockResolvedValue(null) }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/LFSConfigController.saveConfig',
    () => ({ default: jest.fn().mockResolvedValue('0Af000000000001AAA') }),
    { virtual: true }
);

const STABLE_RULES = [
    { name: 'FlowDescription', ruleId: 'missing-flow-description', description: 'd', severity: 'error', category: 'problem' },
    {
        name: 'CyclomaticComplexity',
        ruleId: 'excessive-cyclomatic-complexity',
        description: 'd',
        severity: 'note',
        category: 'problem',
        configurableOptions: [
            { name: 'threshold', type: 'number', description: 'Max complexity', defaultValue: 25 }
        ]
    }
];
const BETA_RULES = [
    ...STABLE_RULES,
    { name: 'HardcodedSecret', ruleId: 'hardcoded-secret', description: 'd', severity: 'error', category: 'problem' }
];

// Drain the microtask queue enough times to settle the connectedCallback
// chain (loadScript → getRules → MDT → flows) and LWC re-renders.
const flushPromises = () =>
    Array.from({ length: 10 }).reduce(p => p.then(() => Promise.resolve()), Promise.resolve());

async function createApp() {
    window.lightningflowscanner = {
        getRules: (names, opts) => (opts && opts.betaMode ? BETA_RULES : STABLE_RULES)
    };
    const element = createElement('c-lightning-flow-scanner-app', {
        is: LightningFlowScannerApp
    });
    document.body.appendChild(element);
    await flushPromises();
    // Switch to the Configuration tab so c-scan-configurator renders.
    element.shadowRoot.querySelector('a[data-tab="3"]').click();
    await flushPromises();
    return element;
}

function importConfig(element, config) {
    const configurator = element.shadowRoot.querySelector('c-scan-configurator');
    configurator.dispatchEvent(new CustomEvent('configimport', { detail: { config } }));
    return flushPromises();
}

function rulesByName(element) {
    const configurator = element.shadowRoot.querySelector('c-scan-configurator');
    return Object.fromEntries(configurator.rules.map(r => [r.name, r]));
}

describe('c-lightning-flow-scanner-app config import', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        delete window.lightningflowscanner;
    });

    it('merged import overrides named rules and leaves the rest untouched', async () => {
        const element = await createApp();
        await importConfig(element, {
            rules: { 'missing-flow-description': { severity: 'note' } }
        });

        const rules = rulesByName(element);
        expect(rules.FlowDescription.severity).toBe('note');
        expect(rules.FlowDescription.isActive).toBe(true);
        expect(rules.CyclomaticComplexity.isActive).toBe(true);
        // Beta rules stay off unless the config names them.
        expect(rules.HardcodedSecret.isActive).toBe(false);
    });

    it('ruleMode isolated runs only the rules named in the config', async () => {
        const element = await createApp();
        await importConfig(element, {
            ruleMode: 'Isolated',
            rules: {
                CyclomaticComplexity: { threshold: 30 },
                'hardcoded-secret': {}
            }
        });

        const rules = rulesByName(element);
        expect(rules.CyclomaticComplexity.isActive).toBe(true);
        expect(rules.HardcodedSecret.isActive).toBe(true); // beta, but explicitly named
        expect(rules.FlowDescription.isActive).toBe(false);
    });

    it('explicit enabled:false wins over isolated activation', async () => {
        const element = await createApp();
        await importConfig(element, {
            ruleMode: 'isolated',
            rules: {
                'missing-flow-description': {},
                'excessive-cyclomatic-complexity': { enabled: false }
            }
        });

        const rules = rulesByName(element);
        expect(rules.FlowDescription.isActive).toBe(true);
        expect(rules.CyclomaticComplexity.isActive).toBe(false);
    });

    it('applies, coerces, and clears inline option edits', async () => {
        const element = await createApp();
        const configurator = element.shadowRoot.querySelector('c-scan-configurator');

        const emit = detail =>
            configurator.dispatchEvent(new CustomEvent('optionchange', { detail }));

        emit({ identifier: 'excessive-cyclomatic-complexity', name: 'threshold', value: '30', type: 'number' });
        await flushPromises();
        expect(rulesByName(element).CyclomaticComplexity.options[0].value).toBe(30);

        // Non-numeric input for a number option is ignored.
        emit({ identifier: 'excessive-cyclomatic-complexity', name: 'threshold', value: 'lots', type: 'number' });
        await flushPromises();
        expect(rulesByName(element).CyclomaticComplexity.options[0].value).toBe(30);

        // Clearing falls back to the core default (empty value, placeholder 25).
        emit({ identifier: 'excessive-cyclomatic-complexity', name: 'threshold', value: '', type: 'number' });
        await flushPromises();
        const option = rulesByName(element).CyclomaticComplexity.options[0];
        expect(option.value).toBe('');
        expect(option.placeholder).toBe('25');
    });

    it('imported option values appear in the inline editors', async () => {
        const element = await createApp();
        await importConfig(element, {
            rules: { CyclomaticComplexity: { threshold: 40 } }
        });

        expect(rulesByName(element).CyclomaticComplexity.options[0].value).toBe(40);
    });

    it('wizard apply routes through the import pipeline and clears options', async () => {
        const element = await createApp();
        // Seed an option override so the wizard's clear takes effect.
        await importConfig(element, { rules: { CyclomaticComplexity: { threshold: 40 } } });

        const configurator = element.shadowRoot.querySelector('c-scan-configurator');
        configurator.dispatchEvent(new CustomEvent('openwizard'));
        await flushPromises();

        const wizard = element.shadowRoot.querySelector('c-config-wizard');
        expect(wizard).not.toBeNull();
        wizard.dispatchEvent(
            new CustomEvent('apply', {
                detail: {
                    config: { ruleMode: 'merged', rules: { 'missing-flow-description': { enabled: false } } },
                    clearedOptions: [{ identifier: 'excessive-cyclomatic-complexity', name: 'threshold' }]
                }
            })
        );
        await flushPromises();

        expect(element.shadowRoot.querySelector('c-config-wizard')).toBeNull();
        const rules = rulesByName(element);
        expect(rules.FlowDescription.isActive).toBe(false);
        expect(rules.CyclomaticComplexity.options[0].value).toBe('');
    });

    it('export downloads the current config as .flow-scanner.json', async () => {
        const element = await createApp();
        await importConfig(element, {
            rules: {
                'missing-flow-description': { enabled: false },
                CyclomaticComplexity: { threshold: 40 }
            }
        });

        let anchor;
        const clickSpy = jest
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(function captureAnchor() { anchor = this; });

        const configurator = element.shadowRoot.querySelector('c-scan-configurator');
        configurator.dispatchEvent(new CustomEvent('configexport'));
        await flushPromises();
        clickSpy.mockRestore();

        expect(anchor.getAttribute('download')).toBe('.flow-scanner.json');
        const exported = JSON.parse(decodeURIComponent(anchor.getAttribute('href').split(',')[1]));
        expect(exported.rules['missing-flow-description']).toMatchObject({ enabled: false });
        expect(exported.rules['excessive-cyclomatic-complexity']).toMatchObject({ threshold: 40 });
        // Beta rules that are off are exported as disabled in merged mode.
        expect(exported.rules['hardcoded-secret']).toMatchObject({ enabled: false });
    });

    it('isolated export lists only active rules', async () => {
        const element = await createApp();
        await importConfig(element, {
            ruleMode: 'isolated',
            rules: { CyclomaticComplexity: { threshold: 30 } }
        });

        let anchor;
        const clickSpy = jest
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(function captureAnchor() { anchor = this; });
        const configurator = element.shadowRoot.querySelector('c-scan-configurator');
        configurator.dispatchEvent(new CustomEvent('configexport'));
        await flushPromises();
        clickSpy.mockRestore();

        const exported = JSON.parse(decodeURIComponent(anchor.getAttribute('href').split(',')[1]));
        expect(exported.ruleMode).toBe('isolated');
        expect(Object.keys(exported.rules)).toEqual(['excessive-cyclomatic-complexity']);
        expect(exported.rules['excessive-cyclomatic-complexity']).toMatchObject({ threshold: 30 });
    });

    it('reset restores core defaults and clears imported state', async () => {
        const element = await createApp();
        await importConfig(element, {
            ruleMode: 'isolated',
            threshold: 'error',
            rules: {
                'missing-flow-description': { severity: 'note' },
                CyclomaticComplexity: { threshold: 40 }
            }
        });
        expect(rulesByName(element).CyclomaticComplexity.options[0].value).toBe(40);

        const configurator = element.shadowRoot.querySelector('c-scan-configurator');
        configurator.dispatchEvent(new CustomEvent('configreset'));
        await flushPromises();

        const rules = rulesByName(element);
        expect(rules.FlowDescription.severity).toBe('error');
        expect(rules.FlowDescription.isActive).toBe(true);
        expect(rules.CyclomaticComplexity.options[0].value).toBe('');
        expect(rules.HardcodedSecret.isActive).toBe(false);

        // scanMeta was cleared: a fresh export carries no isolated ruleMode.
        let anchor;
        const clickSpy = jest
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(function captureAnchor() { anchor = this; });
        configurator.dispatchEvent(new CustomEvent('configexport'));
        await flushPromises();
        clickSpy.mockRestore();
        const exported = JSON.parse(decodeURIComponent(anchor.getAttribute('href').split(',')[1]));
        expect(exported.ruleMode).toBeUndefined();
        expect(exported.threshold).toBeUndefined();
    });

    it('applies the org-saved configuration on startup', async () => {
        getSavedConfig.mockResolvedValueOnce({
            configJson: JSON.stringify({
                rules: {
                    'missing-flow-description': { severity: 'note', enabled: false },
                    CyclomaticComplexity: { threshold: 35 }
                }
            }),
            lastUpdated: '2026-08-07T00:00:00.000Z'
        });

        const element = await createApp();
        const rules = rulesByName(element);
        expect(rules.FlowDescription.severity).toBe('note');
        expect(rules.FlowDescription.isActive).toBe(false);
        expect(rules.CyclomaticComplexity.options[0].value).toBe(35);
    });

    it('a corrupt saved configuration does not block startup', async () => {
        getSavedConfig.mockResolvedValueOnce({ configJson: 'not json at all' });
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const element = await createApp();
        errorSpy.mockRestore();

        // App still renders with core defaults.
        const rules = rulesByName(element);
        expect(rules.FlowDescription.severity).toBe('error');
        expect(rules.FlowDescription.isActive).toBe(true);
    });

    it('save to org sends the current configuration JSON', async () => {
        const element = await createApp();
        await importConfig(element, {
            rules: { CyclomaticComplexity: { threshold: 40 } }
        });

        const configurator = element.shadowRoot.querySelector('c-scan-configurator');
        configurator.dispatchEvent(new CustomEvent('configsave'));
        await flushPromises();

        expect(saveConfig).toHaveBeenCalledTimes(1);
        const sent = JSON.parse(saveConfig.mock.calls[0][0].configJson);
        expect(sent.rules['excessive-cyclomatic-complexity']).toMatchObject({ threshold: 40 });
    });

    it('ignores severities outside error|warning|note and normalizes case', async () => {
        const element = await createApp();
        await importConfig(element, {
            rules: {
                'missing-flow-description': { severity: 'critical' },
                'excessive-cyclomatic-complexity': { severity: 'ERROR' }
            }
        });

        const rules = rulesByName(element);
        expect(rules.FlowDescription.severity).toBe('error'); // unchanged default
        expect(rules.CyclomaticComplexity.severity).toBe('error'); // lowercased
    });
});
