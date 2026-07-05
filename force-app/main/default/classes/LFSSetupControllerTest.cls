@IsTest
private class LFSSetupControllerTest {

    private static final String FAKE_CONSUMER_KEY = 'FAKE_CONSUMER_KEY_FOR_TESTING_ONLY_12345678901234567890';

    private class MockMetadataDeployer implements LFSSetup.IMetadataDeployer {
        public Id deploy(Metadata.CustomMetadata cmd) {
            return (Id) '707000000000000AAA';
        }
    }

    private class MockAuthProvider implements ToolingAPI.IAuthProvider {
        public Boolean shouldThrow = false;

        public String getAccessToken() {
            if (shouldThrow) {
                throw new AuraHandledException('Mock auth error');
            }
            return 'MOCK_TOKEN';
        }
    }

    private class SuccessMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('{"totalSize":1,"done":true,"records":[{"Id":"301fake"}]}');
            return res;
        }
    }

    private static User createStandardUser() {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
        return new User(
            Alias = 'lfstest',
            Email = 'lfstest@example.com',
            Username = 'lfstest' + Datetime.now().getTime() + '@example.com',
            LastName = 'Test',
            ProfileId = p.Id,
            TimeZoneSidKey = 'America/Los_Angeles',
            LocaleSidKey = 'en_US',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'en_US'
        );
    }

    @IsTest
    static void testGetSetupStatus() {
        Test.startTest();
        LFSSetupController.SetupStatus status = LFSSetupController.getSetupStatus();
        Test.stopTest();

        System.assertNotEquals(null, status, 'Status should not be null');
        System.assertEquals(true, status.isAdmin, 'Test runner should be an admin');
        System.assertEquals(false, status.certificateFound, 'No certificate exists in test context');
        System.assertEquals(false, status.consumerKeyConfigured, 'No consumer key is stored in test context');
        System.assertEquals(null, status.lastConfiguredAt, 'No configuration timestamp exists in test context');
        System.assertNotEquals(null, status.permissionSetAssigned, 'Permission set flag should be set');
    }

    @IsTest
    static void testGetSetupStatusAsStandardUser() {
        User u = createStandardUser();
        insert u;

        System.runAs(u) {
            Test.startTest();
            LFSSetupController.SetupStatus status = LFSSetupController.getSetupStatus();
            Test.stopTest();

            System.assertEquals(false, status.isAdmin, 'Standard user is not an admin');
        }
    }

    @IsTest
    static void testSaveConsumerKey() {
        LFSSetup.deployer = new MockMetadataDeployer();

        Test.startTest();
        Id jobId = LFSSetupController.saveConsumerKey(FAKE_CONSUMER_KEY);
        Test.stopTest();

        System.assertNotEquals(null, jobId, 'Job ID should not be null');
    }

    @IsTest
    static void testSaveConsumerKeyBlank() {
        LFSSetup.deployer = new MockMetadataDeployer();

        Test.startTest();
        try {
            LFSSetupController.saveConsumerKey('');
            System.assert(false, 'Should have thrown AuraHandledException');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('cannot be blank'), 'Exception message should mention blank key');
        }
        Test.stopTest();
    }

    @IsTest
    static void testSaveConsumerKeyNonAdmin() {
        User u = createStandardUser();
        insert u;
        LFSSetup.deployer = new MockMetadataDeployer();

        System.runAs(u) {
            Test.startTest();
            try {
                LFSSetupController.saveConsumerKey(FAKE_CONSUMER_KEY);
                System.assert(false, 'Should have thrown AuraHandledException');
            } catch (AuraHandledException e) {
                System.assert(e.getMessage().contains('Customize Application'), 'Exception message should mention required permission');
            }
            Test.stopTest();
        }
    }

    @IsTest
    static void testConnectionSuccess() {
        ToolingAPI.authProvider = new MockAuthProvider();
        ToolingAPI.resetCache();
        Test.setMock(HttpCalloutMock.class, new SuccessMock());

        Test.startTest();
        LFSSetupController.ConnectionResult result = LFSSetupController.testConnection();
        Test.stopTest();

        System.assertEquals(true, result.success, 'Connection should succeed');
        System.assert(String.isNotBlank(result.message), 'Success message should be set');
    }

    @IsTest
    static void testConnectionFailure() {
        MockAuthProvider mockAuth = new MockAuthProvider();
        mockAuth.shouldThrow = true;
        ToolingAPI.authProvider = mockAuth;
        ToolingAPI.resetCache();

        Test.startTest();
        LFSSetupController.ConnectionResult result = LFSSetupController.testConnection();
        Test.stopTest();

        System.assertEquals(false, result.success, 'Connection should fail');
        System.assert(String.isNotBlank(result.message), 'Failure message should be set');
    }
}
