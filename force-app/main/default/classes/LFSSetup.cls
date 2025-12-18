/**
 * @description Setup utility for Flow Scanner OAuth configuration
 * @group Setup
 */
global class LFSSetup {
    
    // Test seam for dependency injection
    @TestVisible
    private static IMetadataDeployer deployer = new ProductionMetadataDeployer();
    
    /**
     * @description Configures the OAuth Consumer Key for Flow Scanner API access
     * @param consumerKey The Consumer Key from your Connected App
     * @return Metadata deployment Job ID
     */
    global static Id configure(String consumerKey) {
        // Validate input
        if (String.isBlank(consumerKey)) {
            throw new IllegalArgumentException('Consumer Key cannot be blank');
        }
        
        if (consumerKey.length() > 255) {
            throw new IllegalArgumentException('Consumer Key exceeds 255 characters');
        }
        
        try {
            // Auto-detect namespace
            String namespace = getNamespace();
            String prefix = String.isBlank(namespace) ? '' : namespace + '__';
            
            // Create the custom metadata record
            Metadata.CustomMetadata cmd = new Metadata.CustomMetadata();
            cmd.fullName = prefix + 'Flow_Scanner_OAuth_Config_Protected__mdt.Default';
            cmd.label = 'Default';
            
            // Set the Consumer Key field
            Metadata.CustomMetadataValue field = new Metadata.CustomMetadataValue();
            field.field = prefix + 'Consumer_Key__c';
            field.value = consumerKey;
            cmd.values.add(field);
            
            // Deploy using injected deployer
            Id jobId = deployer.deploy(cmd);
            
            System.debug('✓ SUCCESS! Flow Scanner configured successfully.');
            System.debug('Deployment Job ID: ' + jobId);
            System.debug('⏱ Wait 30 seconds for deployment to complete, then you\'re ready!');
            
            return jobId;
            
        } catch (Exception e) {
            throw e;
        }
    }
    
    /**
     * @description Gets the namespace of this class
     * @return Namespace prefix (e.g., 'lfscanner') or empty string if none
     */
    @TestVisible
    private static String getNamespace() {
        String className = LFSSetup.class.getName();
        if (className.contains('.')) {
            return className.substringBefore('.');
        }
        return '';
    }
    
    // Interface for metadata deployment
    @TestVisible
    private interface IMetadataDeployer {
        Id deploy(Metadata.CustomMetadata cmd);
    }
    
    // Production implementation
    @TestVisible
    private class ProductionMetadataDeployer implements IMetadataDeployer {
        public Id deploy(Metadata.CustomMetadata cmd) {
            Metadata.DeployContainer mdc = new Metadata.DeployContainer();
            mdc.addMetadata(cmd);
            return Metadata.Operations.enqueueDeployment(mdc, null);
        }
    }
}