import { createElement } from '@lwc/engine-dom';
import SetupAssistant from 'c/setupAssistant';
import getSetupStatus from '@salesforce/apex/LFSSetupController.getSetupStatus';

jest.mock(
    '@salesforce/apex/LFSSetupController.getSetupStatus',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/LFSSetupController.saveConsumerKey',
    () => ({ default: jest.fn() }),
    { virtual: true }
);
jest.mock(
    '@salesforce/apex/LFSSetupController.testConnection',
    () => ({ default: jest.fn() }),
    { virtual: true }
);

const ADMIN_STATUS = {
    isAdmin: true,
    permissionSetAssigned: true,
    certificateFound: false,
    consumerKeyConfigured: false
};

// Wait for microtasks (promise resolution + rerender)
function flushPromises() {
    return new Promise(process.nextTick);
}

describe('c-setup-assistant', () => {
    afterEach(() => {
        // The jsdom instance is shared across test cases in a single file so reset the DOM
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('renders the checklist and consumer key input for admins', async () => {
        getSetupStatus.mockResolvedValue(ADMIN_STATUS);

        const element = createElement('c-setup-assistant', { is: SetupAssistant });
        document.body.appendChild(element);
        await flushPromises();

        const items = element.shadowRoot.querySelectorAll('li.slds-item');
        expect(items.length).toBe(3);
        expect(element.shadowRoot.querySelector('lightning-input')).not.toBeNull();
    });

    it('hides the consumer key input for non-admins and shows a notice', async () => {
        getSetupStatus.mockResolvedValue({ ...ADMIN_STATUS, isAdmin: false });

        const element = createElement('c-setup-assistant', { is: SetupAssistant });
        document.body.appendChild(element);
        await flushPromises();

        expect(element.shadowRoot.querySelector('lightning-input')).toBeNull();
        const notice = element.shadowRoot.querySelector('.slds-theme_info');
        expect(notice).not.toBeNull();
    });

    it('shows an error message when the status cannot be loaded', async () => {
        getSetupStatus.mockRejectedValue({ body: { message: 'boom' } });

        const element = createElement('c-setup-assistant', { is: SetupAssistant });
        document.body.appendChild(element);
        await flushPromises();

        const error = element.shadowRoot.querySelector('.slds-theme_error');
        expect(error).not.toBeNull();
        expect(error.textContent).toContain('boom');
    });
});
