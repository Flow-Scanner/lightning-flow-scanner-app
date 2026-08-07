@IsTest
private class LFSConfigControllerTest {

    private class MockDeployer implements LFSConfigController.IMetadataDeployer {
        public Metadata.CustomMetadata lastDeployed;
        public Id deploy(Metadata.CustomMetadata cmd) {
            lastDeployed = cmd;
            return '0Af000000000001AAA';
        }
    }

    @IsTest
    static void testSaveConfigDeploysJson() {
        MockDeployer mock = new MockDeployer();
        LFSConfigController.deployer = mock;
        String json = '{"ruleMode":"merged","rules":{"excessive-cyclomatic-complexity":{"severity":"note","threshold":30}}}';

        Test.startTest();
        Id jobId = LFSConfigController.saveConfig(json);
        Test.stopTest();

        System.assertEquals('0Af000000000001AAA', jobId);
        System.assert(mock.lastDeployed.fullName.contains('Flow_Scanner_Saved_Config__mdt.Default'));
        Boolean foundJson = false;
        for (Metadata.CustomMetadataValue v : mock.lastDeployed.values) {
            if (String.valueOf(v.field).endsWith('Config_JSON__c')) {
                foundJson = true;
                System.assertEquals(json, v.value);
            }
        }
        System.assert(foundJson, 'Config_JSON__c should be part of the deployment');
    }

    @IsTest
    static void testSaveConfigRejectsInvalidInput() {
        LFSConfigController.deployer = new MockDeployer();

        assertSaveFails(null, 'blank');
        assertSaveFails('   ', 'blank');
        assertSaveFails('not json', 'invalid JSON');
        assertSaveFails('[1,2,3]', 'non-object JSON');
        assertSaveFails('"just a string"', 'non-object JSON');
    }

    private static void assertSaveFails(String json, String label) {
        try {
            LFSConfigController.saveConfig(json);
            System.assert(false, 'Expected save to fail for ' + label);
        } catch (AuraHandledException e) {
            System.assert(String.isNotBlank(e.getMessage()), 'Message expected for ' + label);
        }
    }

    @IsTest
    static void testGetSavedConfigReturnsNullWhenUnconfigured() {
        // No Flow_Scanner_Saved_Config__mdt record exists in a test context.
        System.assertEquals(null, LFSConfigController.getSavedConfig());
    }

    @IsTest
    static void testValidateAcceptsFullDocument() {
        // Should not throw for a realistic full-shape document.
        LFSConfigController.validateConfigJson(
            '{"ruleMode":"isolated","threshold":"warning","categories":["problem"],' +
            '"rules":{"invalid-naming-convention":{"severity":"error","expression":"[A-Z].+"}}}'
        );
        System.assert(true);
    }

    @IsTest
    static void testNamespacePrefix() {
        String prefix = LFSConfigController.getNamespacePrefix();
        // Unmanaged in tests: empty prefix; managed: ends with '__'.
        System.assert(prefix == '' || prefix.endsWith('__'));
    }
}
