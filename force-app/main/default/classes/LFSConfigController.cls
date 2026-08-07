/**
 * @description Loads and saves the org-wide Flow Scanner scan configuration.
 * The configuration is the same JSON document as .flow-scanner.json (CLI /
 * VS Code), stored in Flow_Scanner_Saved_Config__mdt and deployed via the
 * Metadata API like the OAuth Consumer Key in LFSSetup.
 * @group Configuration
 */
public with sharing class LFSConfigController {

    @TestVisible
    private static IMetadataDeployer deployer = new ProductionMetadataDeployer();

    private static final String MDT_DEV_NAME = 'Default';
    private static final Integer MAX_JSON_LENGTH = 131072;

    public class SavedConfig {
        @AuraEnabled public String   configJson  { get; set; }
        @AuraEnabled public Datetime lastUpdated { get; set; }
    }

    @AuraEnabled(cacheable=false)
    public static SavedConfig getSavedConfig() {
        List<Flow_Scanner_Saved_Config__mdt> rows = [
            SELECT Config_JSON__c, Last_Updated__c
            FROM Flow_Scanner_Saved_Config__mdt
            WHERE DeveloperName = :MDT_DEV_NAME
            LIMIT 1
        ];
        if (rows.isEmpty() || String.isBlank(rows[0].Config_JSON__c)) {
            return null;
        }
        SavedConfig cfg = new SavedConfig();
        cfg.configJson  = rows[0].Config_JSON__c;
        cfg.lastUpdated = rows[0].Last_Updated__c;
        return cfg;
    }

    @AuraEnabled
    public static Id saveConfig(String configJson) {
        requireAdmin();
        validateConfigJson(configJson);
        try {
            String prefix = getNamespacePrefix();

            Metadata.CustomMetadata cmd = new Metadata.CustomMetadata();
            cmd.fullName = prefix + 'Flow_Scanner_Saved_Config__mdt.' + MDT_DEV_NAME;
            cmd.label = MDT_DEV_NAME;

            Metadata.CustomMetadataValue cfgField = new Metadata.CustomMetadataValue();
            cfgField.field = prefix + 'Config_JSON__c';
            cfgField.value = configJson;
            cmd.values.add(cfgField);

            // Stamped in the same deployment so callers can detect when an
            // update to an existing configuration has actually been applied.
            Metadata.CustomMetadataValue updatedAt = new Metadata.CustomMetadataValue();
            updatedAt.field = prefix + 'Last_Updated__c';
            updatedAt.value = Datetime.now();
            cmd.values.add(updatedAt);

            return deployer.deploy(cmd);
        } catch (Exception e) {
            throw auraError('Saving the configuration failed. Please try again.');
        }
    }

    @TestVisible
    private static void validateConfigJson(String configJson) {
        if (String.isBlank(configJson)) {
            throw auraError('Configuration cannot be blank');
        }
        if (configJson.length() > MAX_JSON_LENGTH) {
            throw auraError('Configuration exceeds ' + MAX_JSON_LENGTH + ' characters');
        }
        Object parsed;
        try {
            parsed = JSON.deserializeUntyped(configJson);
        } catch (Exception e) {
            throw auraError('Configuration must be valid JSON');
        }
        if (!(parsed instanceof Map<String, Object>)) {
            throw auraError('Configuration must be a JSON object');
        }
    }

    private static void requireAdmin() {
        List<UserPermissionAccess> access = [SELECT PermissionsCustomizeApplication FROM UserPermissionAccess LIMIT 1];
        if (access.isEmpty() || !access[0].PermissionsCustomizeApplication) {
            throw auraError('Only users with the Customize Application permission can save the Flow Scanner configuration.');
        }
    }

    @TestVisible
    private static String getNamespacePrefix() {
        String className = LFSConfigController.class.getName();
        return className.contains('.') ? className.substringBefore('.') + '__' : '';
    }

    // AuraHandledException only carries its message to the client; getMessage()
    // in Apex returns 'Script-thrown exception' unless setMessage is also called.
    private static AuraHandledException auraError(String message) {
        AuraHandledException e = new AuraHandledException(message);
        e.setMessage(message);
        return e;
    }

    @TestVisible
    private interface IMetadataDeployer {
        Id deploy(Metadata.CustomMetadata cmd);
    }

    @TestVisible
    private class ProductionMetadataDeployer implements IMetadataDeployer {
        public Id deploy(Metadata.CustomMetadata cmd) {
            Metadata.DeployContainer mdc = new Metadata.DeployContainer();
            mdc.addMetadata(cmd);
            return Metadata.Operations.enqueueDeployment(mdc, null);
        }
    }
}
