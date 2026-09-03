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

    it('summarises what can be fixed across flows', () => {
        const element = buildElement();
        const notification = element.shadowRoot.querySelector('.slds-scoped-notification');

        expect(notification.textContent).toContain('1 issue across 1 flow');
    });

    it('hides the summary when nothing is auto-fixable', () => {
        const element = buildElement([ALL_SCAN_RESULTS[1]]);

        expect(element.shadowRoot.querySelector('.slds-scoped-notification')).toBeNull();
        expect(element.shadowRoot.querySelectorAll('button.fix-button').length).toBe(0);
    });
});
