import { LightningElement, api, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import LFSStaticRessource from "@salesforce/resourceUrl/LFS_SR";

export default class lightningFlowScannerApp extends LightningElement {
    @api accessToken;
    @api userId;
    @track activeTab = 1;
    @track records = [];
    @track err;
    @track selectedFlowRecord = null;
    @track flowMetadata = null;
    @track flowName;
    conn;

    get isTab1Active() {
        return this.activeTab === 1;
    }

    get isTab2Active() {
        return this.activeTab === 2;
    }

    get FlowsClass() {
        return this.activeTab === 1 ? 'active' : '';
    }

    get AnalysisClass() {
        return this.activeTab === 2 ? 'active' : '';
    }

    async connectedCallback() {
        try {
            await loadScript(this, LFSStaticRessource + '/jsforce.js');
            let SF_API_VERSION = '60.0';
            this.conn = new jsforce.Connection({
                accessToken: this.accessToken,
                version: SF_API_VERSION,
                maxRequest: '10000'
            });

            const res = await this.conn.tooling.query(`SELECT Id, DeveloperName, ActiveVersionId, LatestVersionId, ActiveVersion.Status, ActiveVersion.MasterLabel, ActiveVersion.ProcessType, LatestVersion.Status, LatestVersion.MasterLabel, LatestVersion.ProcessType FROM FlowDefinition`);
            if (res && res.records) {
                this.records = res.records.map(record => ({
                    id: record.Id,
                    developerName: record.DeveloperName,
                    developerNameUrl: `/${record.Id}`,
                    isActive: !!record.ActiveVersionId,
                    masterLabel: record.ActiveVersionId ? record.ActiveVersion.MasterLabel : record.LatestVersion.MasterLabel,
                    processType: record.ActiveVersionId ? record.ActiveVersion.ProcessType : record.LatestVersion.ProcessType,
                    versionId: record.ActiveVersionId ? record.ActiveVersionId : record.LatestVersionId
                }));

                if (this.records.length > 0) {
                    this.selectedFlowRecord = this.records[0];
                    await this.loadFlowMetadata(this.selectedFlowRecord);
                }
            }
        } catch (error) {
            this.err = error.message;
            console.error(error.message);
        }
    }

   async loadFlowMetadata(record) {
        try {
            const id = record.versionId;
            const metadataRes = await this.conn.tooling.query(
                `SELECT Id, FullName, Metadata FROM Flow WHERE Id = '${id}' LIMIT 1`
            );

            if (metadataRes && metadataRes.records.length) {
                const flow = metadataRes.records[0];
                this.flowName = flow.FullName;
                this.flowMetadata = flow.Metadata;
            }
        } catch (error) {
            this.err = error.message;
            console.error(error.message);
        }
    }

    handleTabClick(event) {
        this.activeTab = parseInt(event.currentTarget.dataset.tab, 10);
    }

   async handleScanFlow(event) {
        const flowId = event.detail.flowId;
        const record = this.records.find(rec => rec.id === flowId);
    
        if (record) {
            this.isLoading = true;
            this.selectedFlowRecord = record;
            try {
                await this.loadFlowMetadata(record);
                this.activeTab = 2; 
            } catch (error) {
                this.err = error.message;
                console.error(error.message);
            } finally {
                this.isLoading = false; 
            }
        }
    }

}
