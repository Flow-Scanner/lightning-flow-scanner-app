/**
 * @description Aura-enabled endpoints backing the in-app Setup tab. Lets an admin
 *              check setup progress, store the Consumer Key, and test the JWT connection
 *              without using the Developer Console.
 * @group Setup
 */
public with sharing class LFSSetupController {

    private static final String CERT_NAME           = 'Flow_Scanner';
    private static final String PERMISSION_SET_NAME = 'Flow_Scanner';
    private static final String MDT_DEV_NAME        = 'Default';

    public class SetupStatus {
        @AuraEnabled public Boolean  isAdmin               { get; set; }
        @AuraEnabled public Boolean  permissionSetAssigned { get; set; }
        @AuraEnabled public Boolean  certificateFound      { get; set; }
        @AuraEnabled public Boolean  consumerKeyConfigured { get; set; }
        @AuraEnabled public Datetime lastConfiguredAt      { get; set; }
    }

    public class ConnectionResult {
        @AuraEnabled public Boolean success { get; set; }
        @AuraEnabled public String  message { get; set; }
    }

    @AuraEnabled
    public static SetupStatus getSetupStatus() {
        SetupStatus status = new SetupStatus();
        status.isAdmin               = isAdminUser();
        status.permissionSetAssigned = isPermissionSetAssigned();
        status.certificateFound      = isCertificateFound();
        status.consumerKeyConfigured = false;

        Flow_Scanner_OAuth_Config_Protected__mdt cfg = getConfig();
        if (cfg != null) {
            status.consumerKeyConfigured = String.isNotBlank(cfg.Consumer_Key__c);
            status.lastConfiguredAt      = cfg.Last_Updated__c;
        }
        return status;
    }

    @AuraEnabled
    public static Id saveConsumerKey(String consumerKey) {
        requireAdmin();
        try {
            return LFSSetup.configure(consumerKey);
        } catch (IllegalArgumentException e) {
            throw auraError(e.getMessage());
        }
    }

    @AuraEnabled
    public static ConnectionResult testConnection() {
        requireAdmin();
        ConnectionResult result = new ConnectionResult();
        try {
            ToolingAPI.query('SELECT Id FROM Flow LIMIT 1');
            result.success = true;
            result.message = 'Authentication succeeded. Flow Scanner is ready to use.';
        } catch (Exception e) {
            result.success = false;
            result.message = e.getMessage();
        }
        return result;
    }

    private static void requireAdmin() {
        if (!isAdminUser()) {
            throw auraError('Only users with the Customize Application permission can change the Flow Scanner setup.');
        }
    }

    private static Boolean isAdminUser() {
        List<UserPermissionAccess> access = [SELECT PermissionsCustomizeApplication FROM UserPermissionAccess LIMIT 1];
        return !access.isEmpty() && access[0].PermissionsCustomizeApplication;
    }

    private static Boolean isPermissionSetAssigned() {
        String ns = getNamespace();
        String nsOrNull = String.isBlank(ns) ? null : ns;
        List<PermissionSetAssignment> assignments = [
            SELECT Id
            FROM PermissionSetAssignment
            WHERE AssigneeId = :UserInfo.getUserId()
            AND PermissionSet.Name = :PERMISSION_SET_NAME
            AND PermissionSet.NamespacePrefix = :nsOrNull
            LIMIT 1
        ];
        return !assignments.isEmpty();
    }

    private static Boolean isCertificateFound() {
        // Signing a throwaway JWT is the only way to detect the certificate from Apex;
        // Auth.JWS throws when no certificate with this developer name exists.
        try {
            Auth.JWT jwt = new Auth.JWT();
            jwt.setIss('setup-status-check');
            jwt.setSub(UserInfo.getUserName());
            jwt.setAud('https://login.salesforce.com');
            new Auth.JWS(jwt, CERT_NAME).getCompactSerialization();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static Flow_Scanner_OAuth_Config_Protected__mdt getConfig() {
        if (!Schema.sObjectType.Flow_Scanner_OAuth_Config_Protected__mdt.fields.Consumer_Key__c.isAccessible()) {
            return null;
        }
        List<Flow_Scanner_OAuth_Config_Protected__mdt> cfgs = [
            SELECT Consumer_Key__c, Last_Updated__c
            FROM Flow_Scanner_OAuth_Config_Protected__mdt
            WHERE DeveloperName = :MDT_DEV_NAME
            LIMIT 1
        ];
        return cfgs.isEmpty() ? null : cfgs[0];
    }

    private static String getNamespace() {
        String className = LFSSetupController.class.getName();
        if (className.contains('.')) {
            return className.substringBefore('.');
        }
        return '';
    }

    private static AuraHandledException auraError(String message) {
        AuraHandledException e = new AuraHandledException(message);
        e.setMessage(message);
        return e;
    }
}
