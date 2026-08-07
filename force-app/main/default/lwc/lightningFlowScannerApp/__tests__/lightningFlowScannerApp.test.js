import { createElement } from '@lwc/engine-dom';
import LightningFlowScannerApp from 'c/lightningFlowScannerApp';

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

const STABLE_RULES = [
    { name: 'FlowDescription', ruleId: 'missing-flow-description', description: 'd', severity: 'error', category: 'problem' },
    { name: 'CyclomaticComplexity', ruleId: 'excessive-cyclomatic-complexity', description: 'd', severity: 'note', category: 'problem' }
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
