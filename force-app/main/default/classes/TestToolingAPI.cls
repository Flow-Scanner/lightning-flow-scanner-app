@IsTest
private class TestToolingAPI {
    
    public class MockAuthProvider implements ToolingAPI.IAuthProvider {
        public String tokenToReturn = 'MOCK_TOKEN';
        public Boolean shouldThrow = false;
        
        public String getAccessToken() {
            if (shouldThrow) {
                throw new AuraHandledException('Mock auth error');
            }
            return tokenToReturn;
        }
    }
    
    private class SuccessMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('{"totalSize":2,"done":true,"records":[{"Id":"301fake"},{"Id":"302fake"}]}');
            return res;
        }
    }
    
    private class EmptyMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('{"totalSize":0,"done":true,"records":[]}');
            return res;
        }
    }
    
    private class ToolingFailMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(400);
            res.setBody('{"message":"Tooling query error"}');
            return res;
        }
    }
    
    private class OAuthSuccessMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('{"access_token":"OAUTH_TOKEN_123","token_type":"Bearer"}');
            return res;
        }
    }
    
    private class OAuthFailMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(400);
            res.setBody('{"error":"invalid_client"}');
            return res;
        }
    }
    
    @IsTest 
    static void testSuccessWithBypass() {
        // INJECT MOCK AUTH PROVIDER
        MockAuthProvider mockAuth = new MockAuthProvider();
        ToolingAPI.authProvider = mockAuth;
        ToolingAPI.resetCache();
        
        Test.setMock(HttpCalloutMock.class, new SuccessMock());
        Test.startTest();
        ToolingAPI.QueryResult qr = ToolingAPI.query('SELECT Id FROM Flow');
        Test.stopTest();
        
        System.assertNotEquals(null, qr);
        System.assertEquals(2, qr.totalSize);
    }
    
    @IsTest 
    static void testQueryEmpty() {
        // INJECT MOCK AUTH PROVIDER
        MockAuthProvider mockAuth = new MockAuthProvider();
        ToolingAPI.authProvider = mockAuth;
        ToolingAPI.resetCache();
        
        Test.setMock(HttpCalloutMock.class, new EmptyMock());
        Test.startTest();
        ToolingAPI.QueryResult qr = ToolingAPI.query('SELECT Id FROM Flow WHERE Id = null');
        Test.stopTest();
        
        System.assertEquals(0, qr.totalSize);
    }
    
    @IsTest
    static void testToolingError() {
        MockAuthProvider mockAuth = new MockAuthProvider();
        ToolingAPI.authProvider = mockAuth;
        ToolingAPI.resetCache();

        ToolingAPI.bypassAuthInTests = false;
        Test.setMock(HttpCalloutMock.class, new ToolingFailMock());
        Test.startTest();
        try {
            ToolingAPI.query('SELECT Id FROM Flow');
            System.assert(false, 'Should have thrown exception');
        } catch (AuraHandledException e) {
            System.assert(true);
        } catch (Exception e) {
            System.assert(false, 'Unexpected exception type: ' + e.getTypeName());
        }
        Test.stopTest();
    }
    
    @IsTest 
    static void testCaching() {
        // INJECT MOCK AUTH PROVIDER
        MockAuthProvider mockAuth = new MockAuthProvider();
        ToolingAPI.authProvider = mockAuth;
        ToolingAPI.resetCache();
        
        Test.setMock(HttpCalloutMock.class, new SuccessMock());
        Test.startTest();
        
        // First call
        String token1 = ToolingAPI.getAccessToken();
        // Second call - uses cache
        String token2 = ToolingAPI.getAccessToken();
        
        Test.stopTest();
        
        System.assertEquals(token1, token2);
    }
    
    @IsTest 
    static void testResetCache() {
        // INJECT MOCK AUTH PROVIDER
        MockAuthProvider mockAuth = new MockAuthProvider();
        ToolingAPI.authProvider = mockAuth;
        
        Test.startTest();
        String token1 = ToolingAPI.getAccessToken();
        
        ToolingAPI.resetCache();
        mockAuth.tokenToReturn = 'NEW_TOKEN';
        String token2 = ToolingAPI.getAccessToken();
        
        Test.stopTest();
        
        System.assertNotEquals(token1, token2);
    }
    
    @IsTest
    static void testAuthProviderError() {
        // INJECT MOCK AUTH PROVIDER
        MockAuthProvider mockAuth = new MockAuthProvider();
        mockAuth.shouldThrow = true;
        ToolingAPI.authProvider = mockAuth;
        ToolingAPI.resetCache();
        
        Test.startTest();
        try {
            ToolingAPI.getAccessToken();
            System.assert(false, 'Should have thrown exception');
        } catch (AuraHandledException e) {
            System.assert(true);
        } catch (Exception e) {
            System.assert(false, 'Unexpected exception type: ' + e.getTypeName());
        }
        Test.stopTest();
    }

    @IsTest 
    static void testGetAudience() {
        Test.startTest();
        String audience = ToolingAPI.getAudience();
        Test.stopTest();
        
        System.assert(
            audience == 'https://login.salesforce.com' || 
            audience == 'https://test.salesforce.com'
        );
    }
    
    @IsTest 
    static void testExchangeJWTForTokenSuccess() {
        Test.setMock(HttpCalloutMock.class, new OAuthSuccessMock());
        Test.startTest();
        String token = ToolingAPI.exchangeJWTForToken('mock.jwt.assertion');
        Test.stopTest();
        
        System.assertEquals('OAUTH_TOKEN_123', token);
    }
    
    @IsTest
    static void testExchangeJWTForTokenFailure() {
        Test.setMock(HttpCalloutMock.class, new OAuthFailMock());
        Test.startTest();
        try {
            ToolingAPI.exchangeJWTForToken('mock.jwt.assertion');
            System.assert(false, 'Should have thrown exception');
        } catch (AuraHandledException e) {
            System.assert(true);
        } catch (Exception e) {
            System.assert(false, 'Unexpected exception type: ' + e.getTypeName());
        }
        Test.stopTest();
    }
        
    @IsTest 
    static void testParseQueryResponse() {
        String mockResponse = '{"totalSize":3,"done":true,"records":[{"Id":"1"},{"Id":"2"},{"Id":"3"}]}';
        
        Test.startTest();
        ToolingAPI.QueryResult qr = ToolingAPI.parseQueryResponse(mockResponse);
        Test.stopTest();
        
        System.assertEquals(3, qr.totalSize);
        System.assertEquals(true, qr.done);
        System.assertEquals(3, qr.records.size());
    }
    
    @IsTest 
    static void testParseQueryResponseEmpty() {
        String mockResponse = '{"totalSize":0,"done":true,"records":null}';
        
        Test.startTest();
        ToolingAPI.QueryResult qr = ToolingAPI.parseQueryResponse(mockResponse);
        Test.stopTest();
        
        System.assertEquals(0, qr.totalSize);
        System.assertEquals(0, qr.records.size());
    }
    
    @IsTest
    static void testMultipleQueries() {
        // INJECT MOCK AUTH PROVIDER
        MockAuthProvider mockAuth = new MockAuthProvider();
        ToolingAPI.authProvider = mockAuth;
        ToolingAPI.resetCache();
        
        Test.setMock(HttpCalloutMock.class, new SuccessMock());
        Test.startTest();
        
        ToolingAPI.QueryResult qr1 = ToolingAPI.query('SELECT Id FROM Flow LIMIT 10');
        ToolingAPI.QueryResult qr2 = ToolingAPI.query('SELECT Id FROM FlowDefinition');
        
        Test.stopTest();
        
        System.assertEquals(2, qr1.totalSize);
        System.assertEquals(2, qr2.totalSize);
    }

    @IsTest
    static void testExpiredCache() {
        MockAuthProvider mockAuth = new MockAuthProvider();
        ToolingAPI.authProvider = mockAuth;
        
        ToolingAPI.cachedAccessToken = 'EXPIRED_TOKEN';
        ToolingAPI.tokenExpiry = Datetime.now().addHours(-1);
        
        Test.startTest();
        String token = ToolingAPI.getAccessToken();
        Test.stopTest();
        
        System.assertEquals('MOCK_TOKEN', token);
    }

    @TestVisible
    private static String performJWTAuthentication(String consumerKey) {
        // ─── BUILD JWT ───
        Auth.JWT jwt = new Auth.JWT();
        jwt.setIss(consumerKey);
        jwt.setSub(UserInfo.getUserName());
        jwt.setAud(ToolingAPI.getAudience());
        
        // Skip certificate signing in tests (cert doesn't exist)
        String assertion;
        if (Test.isRunningTest()) {
            assertion = 'mock.jwt.assertion';
        } else {
            Auth.JWS jws = new Auth.JWS(jwt, 'Flow_Scanner');
            assertion = jws.getCompactSerialization();
        }
        
        return ToolingAPI.exchangeJWTForToken(assertion);
    }
}