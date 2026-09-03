import { createElement } from 'lwc';
import LightningFlowScanner from 'c/lightningFlowScanner';

// One flow with a fixable violation (UnusedVariable) and one that only has a
// violation no rule can fix (InactiveFlow), so the fix affordance has to be
// selective rather than shown on every row.
const ALL_SCAN_RESULTS = [
    {
        flowName: 'Flow A',
        flowApiName: 'Flow_A',
        flowId: '300A',
        scanResult: {
            ruleResults: [
                {
                    ruleName: 'UnusedVariable',
                    severity: 'warning',
                    details: [
                        { name: 'anUnusedVariable', type: 'variables', details: { dataType: 'String' } }
                    ]
                },
                {
                    ruleName: 'InactiveFlow',
                    severity: 'warning',
                    details: [{ name: 'Draft', type: 'status', details: {} }]
                }
            ]
        }
    },
    {
        flowName: 'Flow B',
        flowApiName: 'Flow_B',
        flowId: '300B',
        scanResult: {
            ruleResults: [
                {
                    ruleName: 'InactiveFlow',
                    severity: 'warning',
                    details: [{ name: 'Draft', type: 'status', details: {} }]
                }
            ]
        }
    }
];

function buildElement(allScanResults = ALL_SCAN_RESULTS) {
    const element = createElement('c-lightning-flow-scanner', { is: LightningFlowScanner });
    element.allScanResults = allScanResults;
    document.body.appendChild(element);
    return element;
}

describe('c-lightning-flow-scanner all-results fix affordance', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('offers a fix action only on rows a rule can fix', () => {
        const element = buildElement();
        const rows = element.shadowRoot.querySelectorAll('tbody tr');
        const buttons = element.shadowRoot.querySelectorAll('button.fix-button');

        expect(rows.length).toBe(3);
        expect(buttons.length).toBe(1);
    });

    it('names the flow the fix would act on', () => {
        const element = buildElement();
        const button = element.shadowRoot.querySelector('button.fix-button');

        expect(button.dataset.flowId).toBe('300A');
        expect(button.dataset.flowName).toBe('Flow A');
    });

    it('dispatches fixflowrow with the flow identity', () => {
        const element = buildElement();
        const handler = jest.fn();
        element.addEventListener('fixflowrow', handler);

        element.shadowRoot.querySelector('button.fix-button').click();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toEqual({
            flowId: '300A',
            flowName: 'Flow A'
        });
    });

    it('counts what can be fixed in the toolbar, beside the violation count', () => {
        const element = buildElement();
        const stats = [...element.shadowRoot.querySelectorAll('.toolbar-stats')];
        const fixStat = stats.find((s) => s.textContent.includes('Auto-fixable'));

        expect(stats.some((s) => s.textContent.includes('Violations:'))).toBe(true);
        expect(fixStat.textContent).toContain('Auto-fixable: 1');
        expect(fixStat.title).toContain('1 issue across 1 flow');
    });

    it('keeps the count out of the band between the toolbar and the table', () => {
        const element = buildElement();

        expect(element.shadowRoot.querySelector('.slds-scoped-notification')).toBeNull();
    });

    it('hides the count when nothing is auto-fixable', () => {
        const element = buildElement([ALL_SCAN_RESULTS[1]]);
        const stats = [...element.shadowRoot.querySelectorAll('.toolbar-stats')];

        expect(stats.some((s) => s.textContent.includes('Auto-fixable'))).toBe(false);
        expect(element.shadowRoot.querySelectorAll('button.fix-button').length).toBe(0);
    });
});

describe('c-lightning-flow-scanner single-flow fix affordance', () => {
    function buildSingleFlow({ canFix = true, flowIsActive = false } = {}) {
        const element = createElement('c-lightning-flow-scanner', { is: LightningFlowScanner });
        element.name = 'Flow_A';
        element.metadata = { label: 'Flow A', status: 'Draft', processType: 'Flow', apiVersion: 58 };
        element.numberOfRules = 23;
        element.scanResult = ALL_SCAN_RESULTS[0].scanResult;
        element.canFix = canFix;
        element.fixableIssueCount = canFix ? 1 : 0;
        element.flowIsActive = flowIsActive;
        document.body.appendChild(element);
        return element;
    }

    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('reports the count in the flow header rather than a banner', () => {
        const element = buildSingleFlow();
        const header = element.shadowRoot.querySelector('.flow-header');

        expect(header.textContent).toContain('Auto-fixable:');
        expect(header.textContent).toContain('1');
        expect(element.shadowRoot.querySelector('.slds-scoped-notification')).toBeNull();
    });

    it('puts the fix action on the fixable row only', () => {
        const element = buildSingleFlow();
        const buttons = element.shadowRoot.querySelectorAll('button.fix-button');

        expect(element.shadowRoot.querySelectorAll('tbody tr').length).toBe(2);
        expect(buttons.length).toBe(1);
    });

    it('dispatches fixflow from the row action', () => {
        const element = buildSingleFlow();
        const handler = jest.fn();
        element.addEventListener('fixflow', handler);

        element.shadowRoot.querySelector('button.fix-button').click();

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('says on the action where an Active flow lands', () => {
        const element = buildSingleFlow({ flowIsActive: true });
        const button = element.shadowRoot.querySelector('button.fix-button');

        expect(button.title).toContain('new Draft version');
    });

    it('offers nothing when the flow cannot be fixed', () => {
        const element = buildSingleFlow({ canFix: false });
        const header = element.shadowRoot.querySelector('.flow-header');

        expect(header.textContent).not.toContain('Auto-fixable:');
        expect(element.shadowRoot.querySelectorAll('button.fix-button').length).toBe(0);
    });
});
