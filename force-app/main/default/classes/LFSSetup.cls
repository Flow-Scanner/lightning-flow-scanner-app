/**
 * @description Setup utility for Flow Scanner OAuth configuration
 * @group Setup
 */
global class LFSSetup {
    
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
        
        // Validate format (alphanumeric, dots, underscores, hyphens only)
        if (!Pattern.matches('^[a-zA-Z0-9._-]+$', consumerKey)) {
            throw new IllegalArgumentException('Consumer Key contains invalid characters');
        }
        
        try {
            String namespace = getNamespace();
            String prefix = String.isBlank(namespace) ? '' : namespace + '__';
            
            Metadata.CustomMetadata cmd = new Metadata.CustomMetadata();
            cmd.fullName = prefix + 'Flow_Scanner_OAuth_Config_Protected__mdt.Default';
            cmd.label = 'Default';
            
            Metadata.CustomMetadataValue field = new Metadata.CustomMetadataValue();
            field.field = prefix + 'Consumer_Key__c';
            field.value = consumerKey;
            cmd.values.add(field);
            
            Id jobId = deployer.deploy(cmd);
            return jobId;
            
        } catch (Exception e) {
            // Don't expose internal exception details to users
            throw new AuraHandledException('Configuration failed. Please verify your Consumer Key and try again.');
        }
    }
    
    @TestVisible
    private static String getNamespace() {
        String className = LFSSetup.class.getName();
        if (className.contains('.')) {
            return className.substringBefore('.');
        }
        return '';
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