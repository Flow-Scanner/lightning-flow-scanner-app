public with sharing class ToolingAPI {
    private static final String API_VERSION  = '62.0';
    
    @SuppressWarnings('PMD.AvoidHardcodedCredentials')
    private static final String CERT_NAME    = 'Flow_Scanner';
    
    private static final String MDT_DEV_NAME = 'Default';
    @TestVisible private static String   cachedAccessToken;
    @TestVisible private static Datetime tokenExpiry;
    
    @TestVisible private static Boolean bypassAuthInTests = true;
    @TestVisible private static IAuthProvider authProvider = new ProductionAuthProvider();
    @TestVisible private static void resetCache() { 
        cachedAccessToken = null; 
        tokenExpiry = null; 
    }
    
    public interface IAuthProvider {
        String getAccessToken();
    }
    
    private class ProductionAuthProvider implements IAuthProvider {
        public String getAccessToken() {
            return getProductionAccessToken();
        }
    }
    
    @SuppressWarnings('PMD.ApexSuggestUsingNamedCred')
    public static String getAccessToken() {
        // Check cache first
        if (String.isNotBlank(cachedAccessToken) && tokenExpiry != null && tokenExpiry > Datetime.now()) {
            return cachedAccessToken;
        }
        
        // Get token from provider (allows test injection)
        String token = authProvider.getAccessToken();
        
        // Cache it
        cachedAccessToken = token;
        tokenExpiry = Datetime.now().addHours(1);
        return cachedAccessToken;
    }
    
    @TestVisible
    private static String getProductionAccessToken() {
        if (!Schema.sObjectType.Flow_Scanner_OAuth_Config__mdt.fields.Consumer_Key__c.isAccessible()) {
            throw new AuraHandledException('Insufficient permissions to access OAuth configuration');
        }
        
        List<Flow_Scanner_OAuth_Config__mdt> cfgs = [
            SELECT Consumer_Key__c
            FROM Flow_Scanner_OAuth_Config__mdt
            WHERE DeveloperName = :MDT_DEV_NAME
            LIMIT 1
        ];
        
        if (cfgs.isEmpty() || String.isBlank(cfgs[0].Consumer_Key__c)) {
            throw new AuraHandledException(
                'OAuth configuration not found. Please set the Consumer Key in Flow Scanner OAuth Config (Default).'
            );
        }
        
        return performJWTAuthentication(cfgs[0].Consumer_Key__c);
    }
    
    @TestVisible
    private static String performJWTAuthentication(String consumerKey) {
        // ─── BUILD JWT ───
        Auth.JWT jwt = new Auth.JWT();
        jwt.setIss(consumerKey);
        jwt.setSub(UserInfo.getUserName());
        jwt.setAud(getAudience());
        
        Auth.JWS jws = new Auth.JWS(jwt, CERT_NAME);
        String assertion = jws.getCompactSerialization();
        
        return exchangeJWTForToken(assertion);
    }
    
    @TestVisible
    private static String exchangeJWTForToken(String assertion) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(getAudience() + '/services/oauth2/token');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        req.setBody('grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + assertion);
        req.setTimeout(120000);
        
        HttpResponse res = new Http().send(req);
        if (res.getStatusCode() != 200) {
            throw new AuraHandledException('OAuth authentication failed: ' + res.getBody());
        }
        
        Map<String, Object> json = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        return (String) json.get('access_token');
    }
    
    @TestVisible
    private static String getAudience() {
        String domain = URL.getOrgDomainUrl().toExternalForm();
        return domain.containsIgnoreCase('sandbox') || domain.containsIgnoreCase('scratch')
            ? 'https://test.salesforce.com'
            : 'https://login.salesforce.com';
    }
    
    public static QueryResult query(String soql) {
        String token = getAccessToken();
        String endpoint = URL.getOrgDomainUrl().toExternalForm() +
            '/services/data/v' + API_VERSION + '/tooling/query?q=' + EncodingUtil.urlEncode(soql, 'UTF-8');
        
        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('GET');
        req.setHeader('Authorization', 'Bearer ' + token);
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(120000);
        
        HttpResponse res = new Http().send(req);
        if (res.getStatusCode() != 200) {
            throw new AuraHandledException('Tooling API Error: ' + res.getStatusCode() + ' - ' + res.getBody());
        }
        
        return parseQueryResponse(res.getBody());
    }
    
    @TestVisible
    private static QueryResult parseQueryResponse(String responseBody) {
        Map<String, Object> resultMap = (Map<String, Object>) JSON.deserializeUntyped(responseBody);
        QueryResult qr = new QueryResult();
        qr.totalSize = (Integer) resultMap.get('totalSize');
        qr.done      = (Boolean) resultMap.get('done');
        qr.records   = new List<Map<String, Object>>();
        
        List<Object> raw = (List<Object>) resultMap.get('records');
        if (raw != null) {
            for (Object o : raw) {
                qr.records.add((Map<String, Object>) o);
            }
        }
        return qr;
    }
    
    public class QueryResult {
        @AuraEnabled public Integer                  totalSize;
        @AuraEnabled public Boolean                   done;
        @AuraEnabled public List<Map<String,Object>> records;
    }
}