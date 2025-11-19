public with sharing class LightningFlowScannerController {

    /* ────────────────────── WRAPPERS ────────────────────── */
    public class FlowDefinitionWrapper {
        @AuraEnabled public String   id               { get; set; }
        @AuraEnabled public String   developerName    { get; set; }
        @AuraEnabled public String   masterLabel      { get; set; }
        @AuraEnabled public Boolean  isActive         { get; set; }
        @AuraEnabled public String   processType      { get; set; }
        @AuraEnabled public String   versionId        { get; set; }
        @AuraEnabled public Datetime lastModifiedDate { get; set; }
    }

    public class FlowWrapper {
        @AuraEnabled public String fullName { get; set; }
        @AuraEnabled public Object metadata { get; set; }
    }

    public class ScanRuleWrapper {
        @AuraEnabled public String  ruleName   { get; set; }
        @AuraEnabled public String  severity   { get; set; }
        @AuraEnabled public String  expression { get; set; }
        @AuraEnabled public Boolean disabled   { get; set; }
    }

    /* ────────────────────── QUERY HELPER ────────────────────── */
    public virtual class QueryExecutor {
        public virtual List<SObject> runQuery(String q) {
            return Database.query(q);
        }
    }

    public static QueryExecutor queryExecutor = new QueryExecutor();

    /* ────────────────────── FLOWS ────────────────────── */
    @AuraEnabled(cacheable=false)
    public static List<FlowDefinitionWrapper> getFlowDefinitions(String searchTerm) {
        String safeTerm = String.escapeSingleQuotes(searchTerm);
        String soql = 'SELECT Id, Definition.DeveloperName, MasterLabel, ProcessType, ' +
                      'Status, LastModifiedDate ' +
                      'FROM Flow WHERE Status IN (\'Active\', \'Draft\')';

        if (String.isNotBlank(safeTerm)) {
            soql += ' AND (Definition.DeveloperName LIKE \'%' + safeTerm + '%\' OR MasterLabel LIKE \'%' + safeTerm + '%\')';
        }
        soql += ' ORDER BY Definition.DeveloperName DESC LIMIT 200';

        try {
            ToolingAPI.QueryResult result = ToolingAPI.query(soql);
            Map<String, FlowDefinitionWrapper> flowMap = new Map<String, FlowDefinitionWrapper>();

            for (Map<String, Object> rec : result.records) {
                Map<String, Object> def = (Map<String, Object>) rec.get('Definition');
                String devName = (String) def.get('DeveloperName');

                if (!flowMap.containsKey(devName)) {
                    FlowDefinitionWrapper w = new FlowDefinitionWrapper();
                    w.id = (String) rec.get('Id');
                    w.developerName = devName;
                    w.masterLabel = (String) rec.get('MasterLabel');
                    w.isActive = 'Active'.equals((String) rec.get('Status'));
                    w.processType = (String) rec.get('ProcessType');
                    w.versionId = (String) rec.get('Id');
                    w.lastModifiedDate = parseDateTime((String) rec.get('LastModifiedDate'));
                    flowMap.put(devName, w);
                }
            }
            return flowMap.values();
        } catch (Exception e) {
            throw new AuraHandledException('Failed to retrieve flows: ' + e.getMessage());
        }
    }

    /* ────────────────────── METADATA ────────────────────── */
    @AuraEnabled(cacheable=false)
    public static FlowWrapper getFlowMetadata(String versionId) {
        if (String.isBlank(versionId)) return null;

        String safeId = String.escapeSingleQuotes(versionId);
        String soql = 'SELECT FullName, Metadata FROM Flow WHERE Id = \'' + safeId + '\' LIMIT 1';

        try {
            ToolingAPI.QueryResult result = ToolingAPI.query(soql);
            if (result.records.isEmpty()) return null;

            Map<String, Object> rec = result.records[0];
            FlowWrapper w = new FlowWrapper();
            w.fullName = (String) rec.get('FullName');
            w.metadata = rec.get('Metadata');
            return w;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Metadata fetch failed: ' + e.getMessage());
            return null;
        }
    }

    /* ────────────────────── MDT RULES ────────────────────── */
    @AuraEnabled(cacheable=true)
    public static List<ScanRuleWrapper> getMDTRules() {
        if (!Schema.sObjectType.Organization.fields.NamespacePrefix.isAccessible()) {
            throw new AuraHandledException('Insufficient permissions');
        }
        String ns = [SELECT NamespacePrefix FROM Organization WITH SECURITY_ENFORCED LIMIT 1]?.NamespacePrefix;
        String prefix = String.isBlank(ns) ? '' : ns + '__';
        String mdtName = prefix + 'ScanRuleConfiguration__mdt';

        if (Schema.getGlobalDescribe().get(mdtName) == null) {
            return new List<ScanRuleWrapper>();
        }

        String query = 'SELECT ' +
                       prefix + 'RuleName__c, ' +
                       prefix + 'Severity__c, ' +
                       prefix + 'Expression__c, ' +
                       prefix + 'Disabled__c ' +
                       'FROM ' + mdtName;

        List<SObject> rows = queryExecutor.runQuery(query);
        List<ScanRuleWrapper> result = new List<ScanRuleWrapper>();

        for (SObject r : rows) {
            ScanRuleWrapper w = new ScanRuleWrapper();
            w.ruleName   = (String) r.get(prefix + 'RuleName__c');
            w.severity   = (String) r.get(prefix + 'Severity__c');
            w.expression = (String) r.get(prefix + 'Expression__c');
            w.disabled   = (Boolean) r.get(prefix + 'Disabled__c');
            result.add(w);
        }
        return result;
    }

    /* ────────────────────── HELPER ────────────────────── */
    private static Datetime parseDateTime(String iso) {
        if (String.isBlank(iso)) return null;
        try {
            return (Datetime) JSON.deserialize('"' + iso + '"', Datetime.class);
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Invalid ISO datetime: ' + iso);
            return null;
        }
    }
}
