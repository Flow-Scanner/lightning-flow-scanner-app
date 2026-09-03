/**
 * @description Write-back for the auto-fixable scanner rules.
 *
 *              The engine that produces a fixed Flow already runs in the browser;
 *              this class only persists the result, and only ever as a Draft:
 *
 *              - the flow version is already a Draft  -> Tooling PATCH in place
 *              - the flow version is Active           -> Metadata API deployment of a
 *                                                        new Draft version, leaving the
 *                                                        running Active version alone
 *
 *              Nothing here activates a flow. Promoting the fixed Draft stays a
 *              deliberate step the user takes in Flow Builder.
 * @group Fix
 */
public with sharing class LFSFixController {

    private static final String METADATA_NAMESPACE = 'http://soap.sforce.com/2006/04/metadata';

    /* ────────────────────── WRAPPERS ────────────────────── */
    public class FixResult {
        // 'patched' (Tooling, in place) or 'deployed' (Metadata API, new Draft).
        @AuraEnabled public String  mode          { get; set; }
        @AuraEnabled public Boolean done          { get; set; }
        @AuraEnabled public String  deployRequestId { get; set; }
        @AuraEnabled public String  message       { get; set; }
    }

    public class DeployStatus {
        @AuraEnabled public Boolean done     { get; set; }
        @AuraEnabled public Boolean success  { get; set; }
        @AuraEnabled public String  state    { get; set; }
        @AuraEnabled public String  message  { get; set; }
    }

    @TestVisible
    private static ILFSFixGateway gateway = new ToolingGateway();

    /* ────────────────────── ENTRY POINT ────────────────────── */
    /**
     * @description Saves a fixed Flow as a Draft.
     * @param versionId    Tooling Flow version id (301…) the fix was produced from.
     * @param metadataJson The fixed Flow.Metadata tree, serialised by the browser engine.
     * @return What was done, and whether a deployment still needs polling.
     */
    @AuraEnabled
    public static FixResult saveAsDraft(String versionId, String metadataJson) {
        if (String.isBlank(versionId) || String.isBlank(metadataJson)) {
            throw auraError('A flow version and its fixed metadata are both required.');
        }

        Map<String, Object> metadata;
        try {
            metadata = (Map<String, Object>) JSON.deserializeUntyped(metadataJson);
        } catch (Exception e) {
            throw auraError('The fixed flow metadata could not be read.');
        }

        // The client tells us which version it fixed, never whether that version is
        // safe to overwrite — re-read the status so a stale page cannot clobber an
        // Active flow through the in-place path.
        FlowTarget target = gateway.describeFlow(versionId);
        if (target == null) {
            throw auraError('Flow version ' + versionId + ' no longer exists.');
        }

        // Whatever the engine produced, what we save is a Draft.
        metadata.put('status', 'Draft');

        return target.isActive
            ? deployNewDraft(target, metadata)
            : patchDraftInPlace(target, metadata);
    }

    /**
     * @description Polls a deployment started by {@link #saveAsDraft}.
     * @param deployRequestId Metadata API deploy id.
     * @return Current state, and the failure detail when it did not succeed.
     */
    @AuraEnabled
    public static DeployStatus checkDeployStatus(String deployRequestId) {
        if (String.isBlank(deployRequestId)) {
            throw auraError('A deployment id is required.');
        }
        return gateway.checkDeploy(deployRequestId);
    }

    /* ────────────────────── DRAFT: IN PLACE ────────────────────── */
    private static FixResult patchDraftInPlace(FlowTarget target, Map<String, Object> metadata) {
        gateway.patchFlowMetadata(target.versionId, metadata);

        FixResult result = new FixResult();
        result.mode = 'patched';
        result.done = true;
        result.message = 'Draft flow updated.';
        return result;
    }

    /* ────────────────────── ACTIVE: NEW DRAFT VERSION ────────────────────── */
    private static FixResult deployNewDraft(FlowTarget target, Map<String, Object> metadata) {
        String flowXml = LFSFlowXmlWriter.toXml(metadata);
        Blob archive = buildPackage(target.fullName, flowXml);
        String deployId = gateway.deploy(archive);

        FixResult result = new FixResult();
        result.mode = 'deployed';
        result.done = false;
        result.deployRequestId = deployId;
        result.message = 'Deploying a new Draft version. The Active version is untouched.';
        return result;
    }

    @TestVisible
    private static Blob buildPackage(String flowApiName, String flowXml) {
        Compression.ZipWriter writer = new Compression.ZipWriter();
        writer.addEntry('package.xml', Blob.valueOf(packageManifest(flowApiName)));
        writer.addEntry('flows/' + flowApiName + '.flow', Blob.valueOf(flowXml));
        return writer.getArchive();
    }

    private static String packageManifest(String flowApiName) {
        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
               '<Package xmlns="' + METADATA_NAMESPACE + '">\n' +
               '    <types>\n' +
               '        <members>' + flowApiName + '</members>\n' +
               '        <name>Flow</name>\n' +
               '    </types>\n' +
               '    <version>' + ToolingAPI.getApiVersion() + '</version>\n' +
               '</Package>\n';
    }

    /* ────────────────────── GATEWAY ────────────────────── */
    public class FlowTarget {
        public String versionId;
        public String fullName;
        public Boolean isActive;
    }

    @TestVisible
    private interface ILFSFixGateway {
        FlowTarget describeFlow(String versionId);
        void patchFlowMetadata(String versionId, Map<String, Object> metadata);
        String deploy(Blob archive);
        DeployStatus checkDeploy(String deployRequestId);
    }

    private class ToolingGateway implements ILFSFixGateway {

        public FlowTarget describeFlow(String versionId) {
            String safeId = String.escapeSingleQuotes(versionId);
            ToolingAPI.QueryResult res = ToolingAPI.query(
                'SELECT Id, FullName, Status FROM Flow WHERE Id = \'' + safeId + '\' LIMIT 1'
            );
            if (res.records.isEmpty()) {
                return null;
            }
            Map<String, Object> rec = res.records[0];
            FlowTarget target = new FlowTarget();
            target.versionId = (String) rec.get('Id');
            target.fullName = stripVersionSuffix((String) rec.get('FullName'));
            target.isActive = 'Active'.equals((String) rec.get('Status'));
            return target;
        }

        public void patchFlowMetadata(String versionId, Map<String, Object> metadata) {
            String body = JSON.serialize(new Map<String, Object>{ 'Metadata' => metadata });
            HttpResponse res = ToolingAPI.send(
                'PATCH',
                '/tooling/sobjects/Flow/' + EncodingUtil.urlEncode(versionId, 'UTF-8'),
                body,
                'application/json'
            );
            // 204 No Content is the success shape for a Tooling PATCH.
            if (res.getStatusCode() != 204 && res.getStatusCode() != 200) {
                throw auraError('Could not update the Draft flow: ' + describeError(res.getBody()));
            }
        }

        public String deploy(Blob archive) {
            // The SOAP endpoint takes the archive base64-encoded inside the envelope,
            // which avoids assembling a multipart body out of binary in Apex.
            String envelope =
                '<?xml version="1.0" encoding="UTF-8"?>' +
                '<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" ' +
                'xmlns:met="' + METADATA_NAMESPACE + '">' +
                '<env:Header><met:SessionHeader><met:sessionId>' +
                ToolingAPI.getAccessToken() +
                '</met:sessionId></met:SessionHeader></env:Header>' +
                '<env:Body><met:deploy>' +
                '<met:ZipFile>' + EncodingUtil.base64Encode(archive) + '</met:ZipFile>' +
                '<met:DeployOptions>' +
                '<met:singlePackage>true</met:singlePackage>' +
                '<met:rollbackOnError>true</met:rollbackOnError>' +
                '</met:DeployOptions>' +
                '</met:deploy></env:Body></env:Envelope>';

            HttpResponse res = soapCall(envelope);
            if (res.getStatusCode() != 200) {
                throw auraError('Could not start the deployment: ' + describeError(res.getBody()));
            }
            String deployId = extractTag(res.getBody(), 'id');
            if (String.isBlank(deployId)) {
                throw auraError('The deployment started but returned no id.');
            }
            return deployId;
        }

        public DeployStatus checkDeploy(String deployRequestId) {
            String envelope =
                '<?xml version="1.0" encoding="UTF-8"?>' +
                '<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/" ' +
                'xmlns:met="' + METADATA_NAMESPACE + '">' +
                '<env:Header><met:SessionHeader><met:sessionId>' +
                ToolingAPI.getAccessToken() +
                '</met:sessionId></met:SessionHeader></env:Header>' +
                '<env:Body><met:checkDeployStatus>' +
                '<met:asyncProcessId>' + deployRequestId + '</met:asyncProcessId>' +
                '<met:includeDetails>true</met:includeDetails>' +
                '</met:checkDeployStatus></env:Body></env:Envelope>';

            HttpResponse res = soapCall(envelope);
            if (res.getStatusCode() != 200) {
                throw auraError('Could not read the deployment status: ' + describeError(res.getBody()));
            }
            return parseDeployStatus(res.getBody());
        }

        private HttpResponse soapCall(String envelope) {
            HttpRequest req = new HttpRequest();
            req.setEndpoint(
                URL.getOrgDomainUrl().toExternalForm() + '/services/Soap/m/' + ToolingAPI.getApiVersion()
            );
            req.setMethod('POST');
            req.setHeader('Content-Type', 'text/xml; charset=UTF-8');
            req.setHeader('SOAPAction', '""');
            req.setBody(envelope);
            req.setTimeout(120000);
            return new Http().send(req);
        }
    }

    // The Tooling API reports a flow version's FullName with the version number
    // appended once more than one version exists ("MyFlow-2"). Deploying that name
    // targets that exact version, so an Active one is refused; deploying the bare
    // name lets the platform update the Draft, or create one when there is none.
    @TestVisible
    private static String stripVersionSuffix(String fullName) {
        if (String.isBlank(fullName)) {
            return fullName;
        }
        return fullName.replaceAll('-\\d+$', '');
    }

    /* ────────────────────── RESPONSE PARSING ────────────────────── */
    @TestVisible
    private static DeployStatus parseDeployStatus(String soapBody) {
        DeployStatus status = new DeployStatus();
        status.state = extractTag(soapBody, 'status');
        status.done = 'true'.equalsIgnoreCase(extractTag(soapBody, 'done'));
        status.success = 'true'.equalsIgnoreCase(extractTag(soapBody, 'success'));

        if (status.done == true && status.success != true) {
            String problem = extractTag(soapBody, 'problem');
            String errorMessage = extractTag(soapBody, 'errorMessage');
            status.message = String.isNotBlank(problem)
                ? problem
                : (String.isNotBlank(errorMessage) ? errorMessage : 'The deployment failed.');
        } else if (status.done == true) {
            status.message = 'A new Draft version was created. The Active version was not changed.';
        } else {
            status.message = 'Deployment ' + (String.isBlank(status.state) ? 'in progress' : status.state) + '…';
        }
        return status;
    }

    // The SOAP responses are small and shallow; a targeted read of the first
    // matching tag is enough and keeps this free of a full XML walk.
    @TestVisible
    private static String extractTag(String xml, String tag) {
        if (String.isBlank(xml)) {
            return null;
        }
        Matcher m = Pattern.compile('(?s)<(?:[A-Za-z0-9]+:)?' + tag + '>(.*?)</(?:[A-Za-z0-9]+:)?' + tag + '>')
            .matcher(xml);
        return m.find() ? m.group(1) : null;
    }

    @TestVisible
    private static String describeError(String body) {
        if (String.isBlank(body)) {
            return 'no detail returned.';
        }
        String faultString = extractTag(body, 'faultstring');
        if (String.isNotBlank(faultString)) {
            return faultString;
        }
        // Tooling errors come back as [{"message":"…","errorCode":"…"}].
        try {
            Object parsed = JSON.deserializeUntyped(body);
            if (parsed instanceof List<Object>) {
                List<Object> errors = (List<Object>) parsed;
                if (!errors.isEmpty() && errors[0] instanceof Map<String, Object>) {
                    Object message = ((Map<String, Object>) errors[0]).get('message');
                    if (message != null) {
                        return String.valueOf(message);
                    }
                }
            }
        } catch (Exception ignored) {
            // Fall through to the raw body below.
        }
        return body.abbreviate(255);
    }

    private static AuraHandledException auraError(String message) {
        AuraHandledException e = new AuraHandledException(message);
        e.setMessage(message);
        return e;
    }
}
