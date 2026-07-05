import { LightningElement } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import getSetupStatus from '@salesforce/apex/LFSSetupController.getSetupStatus';
import saveConsumerKey from '@salesforce/apex/LFSSetupController.saveConsumerKey';
import testConnection from '@salesforce/apex/LFSSetupController.testConnection';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 20;

export default class SetupAssistant extends LightningElement {
    status;
    loadError;
    consumerKey = '';
    isLoading = false;
    isSaving = false;
    connectionResult;

    pollAttempts = 0;
    pollTimer;
    // lastConfiguredAt value before the save; the deployment has applied once it changes.
    // "Key exists" alone can't detect updates to an already-configured key.
    baselineConfiguredAt = null;

    async connectedCallback() {
        this.isLoading = true;
        await this.refreshStatus();
        this.isLoading = false;
    }

    disconnectedCallback() {
        this.stopPolling();
    }

    /* ────────────────────── STATUS ────────────────────── */
    async refreshStatus() {
        try {
            this.status = await getSetupStatus();
            this.loadError = undefined;
        } catch (e) {
            this.loadError = 'Failed to load setup status: ' + (e.body?.message || e.message);
        }
    }

    get permSetIcon()    { return this.status?.permissionSetAssigned ? 'utility:success' : 'utility:warning'; }
    get permSetVariant() { return this.status?.permissionSetAssigned ? 'success' : 'warning'; }
    get permSetHelp() {
        return this.status?.permissionSetAssigned
            ? 'The Flow Scanner permission set is assigned to you. Assign it to other users as needed.'
            : 'The Flow Scanner permission set is not assigned to you yet.';
    }

    get certIcon()    { return this.status?.certificateFound ? 'utility:success' : 'utility:warning'; }
    get certVariant() { return this.status?.certificateFound ? 'success' : 'warning'; }

    get keyIcon()    { return this.status?.consumerKeyConfigured ? 'utility:success' : 'utility:warning'; }
    get keyVariant() { return this.status?.consumerKeyConfigured ? 'success' : 'warning'; }

    get saveButtonLabel() { return this.isSaving ? 'Saving…' : 'Save Consumer Key'; }
    get saveDisabled()    { return this.isSaving || !this.consumerKey; }
    get testDisabled()    { return this.isSaving || !this.status?.consumerKeyConfigured; }

    get connectionResultClass() {
        const theme = this.connectionResult?.success ? 'slds-theme_success' : 'slds-theme_error';
        return `slds-scoped-notification slds-media slds-media_center slds-m-top_medium ${theme}`;
    }

    get connectionResultIcon() {
        return this.connectionResult?.success ? 'utility:success' : 'utility:error';
    }

    /* ────────────────────── EVENT HANDLERS ────────────────────── */
    handleKeyChange(event) {
        this.consumerKey = event.target.value?.trim() ?? '';
    }

    async handleSave() {
        this.isSaving = true;
        this.connectionResult = undefined;
        this.baselineConfiguredAt = this.status?.lastConfiguredAt ?? null;
        try {
            await saveConsumerKey({ consumerKey: this.consumerKey });
            this.toast('Deployment started', 'The Consumer Key is being saved. This usually takes 10–30 seconds.', 'info');
            this.startPolling();
        } catch (e) {
            this.isSaving = false;
            this.toast('Save failed', e.body?.message || e.message, 'error');
        }
    }

    async handleTestConnection() {
        this.isLoading = true;
        this.connectionResult = undefined;
        try {
            this.connectionResult = await testConnection();
        } catch (e) {
            this.connectionResult = { success: false, message: e.body?.message || e.message };
        } finally {
            this.isLoading = false;
        }
    }

    /* ────────────────────── DEPLOYMENT POLLING ────────────────────── */
    startPolling() {
        this.pollAttempts = 0;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.pollTimer = setInterval(() => this.pollForConfiguration(), POLL_INTERVAL_MS);
    }

    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
    }

    async pollForConfiguration() {
        this.pollAttempts += 1;
        await this.refreshStatus();

        const applied =
            this.status?.consumerKeyConfigured &&
            (this.status?.lastConfiguredAt ?? null) !== this.baselineConfiguredAt;

        if (applied) {
            this.stopPolling();
            this.isSaving = false;
            this.consumerKey = '';
            this.toast('Consumer Key saved', 'Use Test Connection to verify the setup end to end.', 'success');
        } else if (this.pollAttempts >= MAX_POLL_ATTEMPTS) {
            this.stopPolling();
            this.isSaving = false;
            this.toast(
                'Deployment still pending',
                'The Consumer Key change has not been applied yet — it may still be deploying, or the deployment may have failed. ' +
                    'Refresh this page in a minute and use Test Connection to verify.',
                'warning'
            );
        }
    }

    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
