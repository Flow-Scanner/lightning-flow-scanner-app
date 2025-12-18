@isTest
private class LFSSetupTest {
    
    // Use obviously fake keys for testing
    private static final String FAKE_CONSUMER_KEY = 'FAKE_CONSUMER_KEY_FOR_TESTING_ONLY_12345678901234567890';
    
    private class MockMetadataDeployer implements LFSSetup.IMetadataDeployer {
        public Id deploy(Metadata.CustomMetadata cmd) {
            return (Id)'707000000000000AAA';
        }
    }
    
    @isTest
    static void testConfigureSuccess() {
        LFSSetup.deployer = new MockMetadataDeployer();
        
        Test.startTest();
        Id jobId = LFSSetup.configure(FAKE_CONSUMER_KEY);
        Test.stopTest();
        
        System.assertNotEquals(null, jobId, 'Job ID should not be null');
    }
    
    @isTest
    static void testConfigureMaxLength() {
        String maxLengthKey = 'A'.repeat(255);
        LFSSetup.deployer = new MockMetadataDeployer();
        
        Test.startTest();
        Id jobId = LFSSetup.configure(maxLengthKey);
        Test.stopTest();
        
        System.assertNotEquals(null, jobId, 'Should handle 255 character keys');
    }
    
    @isTest
    static void testConfigureBlankKey() {
        LFSSetup.deployer = new MockMetadataDeployer();
        
        Test.startTest();
        try {
            LFSSetup.configure('');
            System.assert(false, 'Should have thrown IllegalArgumentException');
        } catch (IllegalArgumentException e) {
            System.assert(
                e.getMessage().contains('cannot be blank'), 
                'Exception message should mention blank key'
            );
        }
        Test.stopTest();
    }
    
    @isTest
    static void testConfigureNullKey() {
        LFSSetup.deployer = new MockMetadataDeployer();
        
        Test.startTest();
        try {
            LFSSetup.configure(null);
            System.assert(false, 'Should have thrown IllegalArgumentException');
        } catch (IllegalArgumentException e) {
            System.assert(
                e.getMessage().contains('cannot be blank'), 
                'Exception message should mention blank key'
            );
        }
        Test.stopTest();
    }
    
    @isTest
    static void testConfigureTooLong() {
        String tooLongKey = 'X'.repeat(256);
        LFSSetup.deployer = new MockMetadataDeployer();
        
        Test.startTest();
        try {
            LFSSetup.configure(tooLongKey);
            System.assert(false, 'Should have thrown IllegalArgumentException');
        } catch (IllegalArgumentException e) {
            System.assert(
                e.getMessage().contains('exceeds 255 characters'), 
                'Exception message should mention length limit'
            );
        }
        Test.stopTest();
    }
    
    @isTest
    static void testConfigureWhitespaceOnly() {
        LFSSetup.deployer = new MockMetadataDeployer();
        
        Test.startTest();
        try {
            LFSSetup.configure('   ');
            System.assert(false, 'Should have thrown IllegalArgumentException');
        } catch (IllegalArgumentException e) {
            System.assert(
                e.getMessage().contains('cannot be blank'), 
                'Exception message should mention blank key'
            );
        }
        Test.stopTest();
    }
    
    @isTest
    static void testConfigureSpecialCharacters() {
        String specialCharKey = 'TEST_KEY_WITH-SPECIAL.CHARS_123';
        LFSSetup.deployer = new MockMetadataDeployer();
        
        Test.startTest();
        Id jobId = LFSSetup.configure(specialCharKey);
        Test.stopTest();
        
        System.assertNotEquals(null, jobId, 'Should handle special characters');
    }
    
    @isTest
    static void testMultipleConfigurations() {
        String key1 = 'FAKE_KEY_1_FOR_TESTING';
        String key2 = 'FAKE_KEY_2_FOR_TESTING';
        LFSSetup.deployer = new MockMetadataDeployer();
        
        Test.startTest();
        Id jobId1 = LFSSetup.configure(key1);
        Id jobId2 = LFSSetup.configure(key2);
        Test.stopTest();
        
        System.assertNotEquals(null, jobId1, 'First job ID should not be null');
        System.assertNotEquals(null, jobId2, 'Second job ID should not be null');
    }
    
    @isTest
    static void testGetNamespace() {
        String ns = LFSSetup.getNamespace();
        System.assertNotEquals(null, ns, 'Namespace should not be null (may be empty string)');
    }
}