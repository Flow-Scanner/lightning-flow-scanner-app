import { createElement } from 'lwc';
import FlowOverview from 'c/flowOverview';

const RECORDS = [
    {
        id: '1',
        masterLabel: 'Flow A',
        developerName: 'Flow_A',
        developerNameUrl: '/1',
        processType: 'Flow',
        isActive: true,
        lastModifiedDate: '2026-01-01T10:00:00.000Z',
        issueCount: 3
    },
    {
        id: '2',
        masterLabel: 'Flow B',
        developerName: 'Flow_B',
        developerNameUrl: '/2',
        processType: 'AutoLaunchedFlow',
        isActive: false,
        lastModifiedDate: '2026-01-02T10:00:00.000Z'
        // issueCount undefined -> still scanning
    },
    {
        id: '3',
        masterLabel: 'Flow C',
        developerName: 'Flow_C',
        developerNameUrl: '/3',
        processType: 'Flow',
        isActive: true,
        lastModifiedDate: '2026-01-03T10:00:00.000Z',
        issueCount: null // scan failed
    }
];

function buildElement(records = RECORDS) {
    const element = createElement('c-flow-overview', { is: FlowOverview });
    element.records = records;
    document.body.appendChild(element);
    return element;
}

function rowFor(element, label) {
    return Array.from(element.shadowRoot.querySelectorAll('tbody tr')).find(
        (tr) => tr.textContent.includes(label)
    );
}

describe('c-flow-overview', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it('renders the issue count once known', async () => {
        const element = buildElement();
        await Promise.resolve();
        const row = rowFor(element, 'Flow A');
        expect(row.querySelector('.issue-count').textContent).toBe('3');
    });

    it('shows a loading indicator while the count is pending', async () => {
        const element = buildElement();
        await Promise.resolve();
        const row = rowFor(element, 'Flow B');
        expect(row.querySelector('.count-loading')).not.toBeNull();
        expect(row.querySelector('.issue-count')).toBeNull();
    });

    it('shows a dash when the scan failed for a flow', async () => {
        const element = buildElement();
        await Promise.resolve();
        const row = rowFor(element, 'Flow C');
        expect(row.querySelector('.issue-count-failed').textContent).toBe('—');
    });

    it('shows the running total of known issue counts in the toolbar', async () => {
        const element = buildElement();
        await Promise.resolve();
        const total = element.shadowRoot.querySelector('.toolbar-stats');
        expect(total.textContent).toContain('Violations: 3');
        // one record is still pending, so the toolbar spinner is visible
        expect(total.querySelector('.count-loading')).not.toBeNull();
    });

    it('hides the toolbar spinner when every count resolved', async () => {
        const element = buildElement(
            RECORDS.map((r) => ({ ...r, issueCount: 2 }))
        );
        await Promise.resolve();
        const total = element.shadowRoot.querySelector('.toolbar-stats');
        expect(total.textContent).toContain('Violations: 6');
        expect(total.querySelector('.count-loading')).toBeNull();
    });

    it('sorts by issue count numerically on header click', async () => {
        const element = buildElement();
        await Promise.resolve();
        const header = element.shadowRoot.querySelector('th[data-field="issueCount"]');
        header.click(); // asc
        await Promise.resolve();
        // Issues is the first column; the label sits in the second.
        const labels = Array.from(
            element.shadowRoot.querySelectorAll('tbody tr td:nth-child(2)')
        ).map((td) => td.textContent);
        // pending/failed sort as 0, Flow A (3) comes last
        expect(labels[labels.length - 1]).toBe('Flow A');
    });

    it('resizes a column on drag without triggering a sort', async () => {
        const element = buildElement();
        await Promise.resolve();
        const header = element.shadowRoot.querySelector('th[data-field="masterLabel"]');
        const resizer = header.querySelector('.col-resizer');
        const initialSortArrow = header.textContent;

        resizer.dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, clientX: 100 })
        );
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 160 }));
        window.dispatchEvent(new MouseEvent('mouseup', {}));
        await Promise.resolve();

        expect(header.style.width).toBe('60px'); // jsdom rects are 0 wide → clamped to min
        const table = element.shadowRoot.querySelector('table');
        expect(table.style.tableLayout).toBe('fixed');
        // the click that follows the drag must not toggle sorting
        header.click();
        await Promise.resolve();
        expect(header.textContent).toBe(initialSortArrow);
    });
});
