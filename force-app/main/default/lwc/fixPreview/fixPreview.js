import { LightningElement, api } from 'lwc';

/**
 * Confirmation step before anything is written to the org.
 *
 * The user sees the named changes and which version they land on — never a diff of
 * raw metadata, and never a silent apply.
 */
export default class FixPreview extends LightningElement {
    @api flowLabel;
    @api changes = [];
    // true when the scanned version is Active, which means the fix lands on a new
    // Draft version rather than on the version in front of the user.
    @api isActiveFlow = false;
    @api busy = false;
    @api error;
    @api statusMessage;

    get hasChanges() {
        return Array.isArray(this.changes) && this.changes.length > 0;
    }

    get targetDescription() {
        return this.isActiveFlow
            ? 'This flow is Active. The fix is saved as a new Draft version — the running Active version is not changed, and nothing is activated.'
            : 'This flow is a Draft. The fix is saved to that Draft. Nothing is activated.';
    }

    get confirmLabel() {
        return this.isActiveFlow ? 'Save as new Draft version' : 'Save to Draft';
    }

    get confirmDisabled() {
        return this.busy === true || Boolean(this.statusMessage);
    }

    handleConfirm() {
        this.dispatchEvent(new CustomEvent('confirm'));
    }

    handleCancel() {
        if (this.busy) return;
        this.dispatchEvent(new CustomEvent('close'));
    }
}
