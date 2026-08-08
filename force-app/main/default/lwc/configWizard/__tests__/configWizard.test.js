import { createElement } from '@lwc/engine-dom';
import ConfigWizard from 'c/configWizard';

const RULES = [
    {
        id: 'rule-0',
        name: 'FlowDescription',
        ruleId: 'missing-flow-description',
        description: 'Flows should have a description',
        severity: 'error',
        isBeta: false,
        isActive: true,
        configurableOptions: []
    },
    {
        id: 'rule-1',
        name: 'CyclomaticComplexity',
        ruleId: 'excessive-cyclomatic-complexity',
        description: 'Too many branches',
        severity: 'note',
        isBeta: false,
        isActive: true,
        configurableOptions: [
            { name: 'threshold', type: 'number', description: 'Max complexity', defaultValue: 25 }
        ],
        options: [
            { name: 'threshold', type: 'number', description: 'Max complexity', defaultValue: 25, value: '30', placeholder: '25' }
        ]
    },
    {
        id: 'rule-2',
        name: 'HardcodedSecret',
        ruleId: 'hardcoded-secret',
        description: 'Beta rule',
        severity: 'error',
        isBeta: true,
        isActive: false,
        configurableOptions: []
    }
];

const flush = () => new Promise(process.nextTick);

async function createWizard({ rules = RULES, initialRuleMode } = {}) {
    const element = createElement('c-config-wizard', { is: ConfigWizard });
    element.rules = JSON.parse(JSON.stringify(rules));
    element.initialRuleMode = initialRuleMode;
    document.body.appendChild(element);
    await flush();
    return element;
}

function button(element, label) {
    return [...element.shadowRoot.querySelectorAll('lightning-button')].find(b => b.label === label);
}

async function next(element) {
    button(element, 'Next').click();
    await flush();
}

async function applyAndCapture(element) {
    let detail;
    element.addEventListener('apply', e => { detail = e.detail; });
    button(element, 'Apply').click();
    await flush();
    return detail;
}

describe('c-config-wizard', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('walks through and emits a merged config with explicit enabled flags', async () => {
        const element = await createWizard();
        await next(element); // mode -> rules
        await next(element); // rules -> options
        await next(element); // options -> review
        const detail = await applyAndCapture(element);

        expect(detail.config.ruleMode).toBe('merged');
        expect(detail.config.rules['missing-flow-description']).toEqual({ enabled: true });
        // Seeded option value carries through, coerced to a number.
        expect(detail.config.rules['excessive-cyclomatic-complexity']).toEqual({
            enabled: true,
            threshold: 30
        });
        // Beta excluded by default: explicitly disabled in merged mode.
        expect(detail.config.rules['hardcoded-secret']).toEqual({ enabled: false });
        expect(detail.clearedOptions).toEqual([]);
    });

    it('deselecting a rule disables it in the merged config', async () => {
        const element = await createWizard();
        await next(element);

        const checkbox = element.shadowRoot.querySelector(
            'lightning-input[data-rule-id="missing-flow-description"]'
        );
        checkbox.checked = false;
        checkbox.dispatchEvent(new CustomEvent('change'));
        await flush();

        await next(element);
        await next(element);
        const detail = await applyAndCapture(element);
        expect(detail.config.rules['missing-flow-description']).toEqual({ enabled: false });
    });

    it('isolated mode lists only selected rules, with severity and options', async () => {
        const element = await createWizard({ initialRuleMode: 'isolated' });
        await next(element);
        await next(element);
        await next(element);
        const detail = await applyAndCapture(element);

        expect(detail.config.ruleMode).toBe('isolated');
        expect(detail.config.rules['missing-flow-description']).toEqual({ severity: 'error' });
        expect(detail.config.rules['excessive-cyclomatic-complexity']).toEqual({
            severity: 'note',
            threshold: 30
        });
        expect(detail.config.rules['hardcoded-secret']).toBeUndefined();
    });

    it('enabling beta rules makes them selectable and included', async () => {
        const element = await createWizard();
        const betaToggle = element.shadowRoot.querySelector('lightning-input[data-id="beta-toggle"]');
        betaToggle.checked = true;
        betaToggle.dispatchEvent(new CustomEvent('change'));
        await flush();
        await next(element);

        const betaCheckbox = element.shadowRoot.querySelector(
            'lightning-input[data-rule-id="hardcoded-secret"]'
        );
        expect(betaCheckbox).not.toBeNull();
        betaCheckbox.checked = true;
        betaCheckbox.dispatchEvent(new CustomEvent('change'));
        await flush();

        await next(element);
        await next(element);
        const detail = await applyAndCapture(element);
        expect(detail.config.rules['hardcoded-secret']).toEqual({ enabled: true });
    });

    it('editing and clearing options updates the config and reports clears', async () => {
        const element = await createWizard();
        await next(element);
        await next(element);

        const input = element.shadowRoot.querySelector(
            'lightning-input[data-option="threshold"]'
        );
        input.value = '';
        input.dispatchEvent(new CustomEvent('change'));
        await flush();

        await next(element);
        const detail = await applyAndCapture(element);
        expect(detail.config.rules['excessive-cyclomatic-complexity']).toEqual({ enabled: true });
        expect(detail.clearedOptions).toEqual([
            { identifier: 'excessive-cyclomatic-complexity', name: 'threshold' }
        ]);
    });

    it('cancel emits close without applying', async () => {
        const element = await createWizard();
        const closeHandler = jest.fn();
        const applyHandler = jest.fn();
        element.addEventListener('close', closeHandler);
        element.addEventListener('apply', applyHandler);

        button(element, 'Cancel').click();
        await flush();
        expect(closeHandler).toHaveBeenCalled();
        expect(applyHandler).not.toHaveBeenCalled();
    });
});
