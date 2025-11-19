@IsTest
private class TestLightningFlowScannerController {
    
    // Mock auth provider for ToolingAPI
    public class MockAuthProvider implements ToolingAPI.IAuthProvider {
        public String getAccessToken() {
            return 'MOCK_TOKEN';
        }
    }
    
    // MDT stub
    private class QueryExecutorStub extends LightningFlowScannerController.QueryExecutor {
        public override List<SObject> runQuery(String q) {
            SObject r = new ScanRuleConfiguration__mdt(
                RuleName__c = 'Mock Rule',
                Severity__c = 'Medium',
                Expression__c = '1 == 1',
                Disabled__c = false
            );
            return new List<SObject>{ r };
        }
    }
    
    // HTTP mock for ToolingAPI callouts
    private class ToolingQueryMock implements HttpCalloutMock {
        ToolingAPI.QueryResult mockResult;
        Boolean shouldThrowException;
        
        public ToolingQueryMock(ToolingAPI.QueryResult result, Boolean throwException) {
            mockResult = result;
            shouldThrowException = throwException;
        }
        
        public HTTPResponse respond(HTTPRequest req) {
            if (shouldThrowException) {
                throw new CalloutException('Mock ToolingAPI error');
            }
            if (mockResult == null) {
                mockResult = new ToolingAPI.QueryResult();
                mockResult.records = new List<Map<String, Object>>();
            }
            Map<String, Object> jsonMap = new Map<String, Object>{
                'size' => mockResult.records.size(),
                'totalSize' => mockResult.records.size(),
                'done' => true,
                'entityTypeName' => 'Flow',
                'records' => addAttributes(mockResult.records)
            };
            HTTPResponse res = new HTTPResponse();
            res.setHeader('Content-Type', 'application/json');
            res.setBody(JSON.serialize(jsonMap));
            res.setStatusCode(200);
            return res;
        }
        
        private List<Object> addAttributes(List<Map<String, Object>> recs) {
            List<Object> withAttr = new List<Object>();
            for (Map<String, Object> rec : recs) {
                Map<String, Object> newRec = rec.clone();
                newRec.put('attributes', new Map<String, Object>{'type' => 'Flow', 'url' => '/dummy'});
                Map<String, Object> def = (Map<String, Object>) rec.get('Definition');
                if (def != null) {
                    Map<String, Object> newDef = def.clone();
                    newDef.put('attributes', new Map<String, Object>{'type' => 'FlowDefinition', 'url' => '/dummy'});
                    newRec.put('Definition', newDef);
                }
                withAttr.add(newRec);
            }
            return withAttr;
        }
    }
    
    static ToolingAPI.QueryResult mockResult;
    
    // ────────── Flows ──────────
    @IsTest
    static void testFlowDefinitions() {
        // INJECT MOCK AUTH PROVIDER
        ToolingAPI.authProvider = new MockAuthProvider();
        ToolingAPI.resetCache();
        
        mockResult = new ToolingAPI.QueryResult();
        mockResult.records = new List<Map<String,Object>>{
            new Map<String,Object>{
                'Id' => '301a',
                'Definition' => new Map<String,Object>{ 'DeveloperName' => 'ActiveFlow' },
                'MasterLabel' => 'Active Flow',
                'Status' => 'Active',
                'ProcessType' => 'Flow',
                'LastModifiedDate' => '2025-01-01T12:00:00Z'
            },
            new Map<String,Object>{
                'Id' => '301b',
                'Definition' => new Map<String,Object>{ 'DeveloperName' => 'DraftFlow' },
                'MasterLabel' => 'Draft Flow',
                'Status' => 'Draft',
                'ProcessType' => 'AutolaunchedFlow',
                'LastModifiedDate' => '2025-02-01T12:00:00Z'
            }
        };
        Test.setMock(HttpCalloutMock.class, new ToolingQueryMock(mockResult, false));
        Test.startTest();
        List<LightningFlowScannerController.FlowDefinitionWrapper> flows =
            LightningFlowScannerController.getFlowDefinitions('Flow');
        Test.stopTest();
        System.assertEquals(2, flows.size());
    }
    
    // ────────── Metadata ──────────
    @IsTest
    static void testFlowMetadata() {
        // INJECT MOCK AUTH PROVIDER
        ToolingAPI.authProvider = new MockAuthProvider();
        ToolingAPI.resetCache();
        
        mockResult = new ToolingAPI.QueryResult();
        mockResult.records = new List<Map<String,Object>>{
            new Map<String,Object>{ 'FullName' => 'TestFlow', 'Metadata' => new Map<String,Object>() }
        };
        Test.setMock(HttpCalloutMock.class, new ToolingQueryMock(mockResult, false));
        Test.startTest();
        LightningFlowScannerController.FlowWrapper w =
            LightningFlowScannerController.getFlowMetadata('301a');
        Test.stopTest();
        System.assertEquals('TestFlow', w.fullName);
        
        // Not found
        mockResult.records = new List<Map<String,Object>>();
        Test.setMock(HttpCalloutMock.class, new ToolingQueryMock(mockResult, false));
        LightningFlowScannerController.FlowWrapper w2 =
            LightningFlowScannerController.getFlowMetadata('nonexistent');
        System.assertEquals(null, w2);
    }
    
    // ────────── MDT ──────────
    @IsTest
    static void testMDTRules() {
        LightningFlowScannerController.queryExecutor = new QueryExecutorStub();
        Test.startTest();
        List<LightningFlowScannerController.ScanRuleWrapper> rules =
            LightningFlowScannerController.getMDTRules();
        Test.stopTest();
        System.assertEquals(1, rules.size());
    }
    
    // ────────── Optional Exception Branch ──────────
    @IsTest
    static void testFlowDefinitionsException() {
        // INJECT MOCK AUTH PROVIDER
        ToolingAPI.authProvider = new MockAuthProvider();
        ToolingAPI.resetCache();
        
        Test.setMock(HttpCalloutMock.class, new ToolingQueryMock(null, true));
        Test.startTest();
        Boolean caught = false;
        try {
            LightningFlowScannerController.getFlowDefinitions('Error');
        } catch (AuraHandledException e) {
            caught = true;
        }
        Test.stopTest();
        System.assert(caught);
    }
}