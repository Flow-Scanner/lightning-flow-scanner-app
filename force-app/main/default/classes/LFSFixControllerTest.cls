@IsTest
private class LFSFixControllerTest {

    /* ────────────────────── DOUBLE ────────────────────── */
    private class GatewaySpy implements LFSFixController.ILFSFixGateway {
        public LFSFixController.FlowTarget target;
        public Map<String, Object> patchedMetadata;
        public Blob deployedArchive;
        public String deployId = '0Af000000000001AAA';
        public LFSFixController.DeployStatus status;
        public Boolean throwOnPatch = false;

        public LFSFixController.FlowTarget describeFlow(String versionId) {
            return target;
        }

        public void patchFlowMetadata(String versionId, Map<String, Object> metadata) {
            if (throwOnPatch) {
                throw new CalloutException('boom');
            }
            patchedMetadata = metadata;
        }

        public String deploy(Blob archive) {
            deployedArchive = archive;
            return deployId;
        }

        public LFSFixController.DeployStatus checkDeploy(String deployRequestId) {
            return status;
        }
    }

    private static LFSFixController.FlowTarget target(String versionId, String fullName, Boolean isActive) {
        LFSFixController.FlowTarget t = new LFSFixController.FlowTarget();
        t.versionId = versionId;
        t.fullName = fullName;
        t.isActive = isActive;
        return t;
    }

    private static String draftMetadataJson() {
        return JSON.serialize(new Map<String, Object>{
            'label' => 'My Flow',
            'status' => 'Active',
            'apiVersion' => 50,
            'processType' => 'Flow'
        });
    }

    /* ────────────────────── DRAFT: IN PLACE ────────────────────── */
    @IsTest
    static void draftFlowIsPatchedInPlace() {
        GatewaySpy spy = new GatewaySpy();
        spy.target = target('301000000000001AAA', 'MyFlow', false);
        LFSFixController.gateway = spy;

        Test.startTest();
        LFSFixController.FixResult result = LFSFixController.saveAsDraft('301000000000001AAA', draftMetadataJson());
        Test.stopTest();

        System.assertEquals('patched', result.mode, 'A Draft flow should be updated in place');
        System.assertEquals(true, result.done, 'An in-place update finishes synchronously');
        System.assertNotEquals(null, spy.patchedMetadata, 'The metadata should have been sent');
    }

    @IsTest
    static void whateverWasScannedIsSavedAsDraft() {
        GatewaySpy spy = new GatewaySpy();
        spy.target = target('301000000000001AAA', 'MyFlow', false);
        LFSFixController.gateway = spy;

        Test.startTest();
        LFSFixController.saveAsDraft('301000000000001AAA', draftMetadataJson());
        Test.stopTest();

        System.assertEquals(
            'Draft',
            (String) spy.patchedMetadata.get('status'),
            'An Active status in the payload must never be saved back'
        );
    }

    /* ────────────────────── ACTIVE: NEW DRAFT ────────────────────── */
    @IsTest
    static void activeFlowIsDeployedAsANewDraft() {
        GatewaySpy spy = new GatewaySpy();
        spy.target = target('301000000000001AAA', 'MyFlow', true);
        LFSFixController.gateway = spy;

        Test.startTest();
        LFSFixController.FixResult result = LFSFixController.saveAsDraft('301000000000001AAA', draftMetadataJson());
        Test.stopTest();

        System.assertEquals('deployed', result.mode, 'An Active flow cannot be overwritten in place');
        System.assertEquals(false, result.done, 'A deployment still has to be polled');
        System.assertEquals(spy.deployId, result.deployRequestId, 'The deploy id should be returned for polling');
        System.assertNotEquals(null, spy.deployedArchive, 'An archive should have been built');
    }

    @IsTest
    static void deployedArchiveCarriesManifestAndFlow() {
        Blob archive = LFSFixController.buildPackage('MyFlow', '<?xml version="1.0"?><Flow/>');
        Compression.ZipReader reader = new Compression.ZipReader(archive);

        Set<String> entryNames = new Set<String>();
        for (Compression.ZipEntry entry : reader.getEntries()) {
            entryNames.add(entry.getName());
        }

        System.assert(entryNames.contains('package.xml'), 'A deployment needs a manifest');
        System.assert(entryNames.contains('flows/MyFlow.flow'), 'The flow must be at the path the manifest names');
    }

    /* ────────────────────── VERSION SUFFIX ────────────────────── */
    @IsTest
    static void versionSuffixIsStrippedFromFlowName() {
        // Deploying "MyFlow-2" targets version 2, which is refused when it is Active;
        // the bare name lets the platform put the change on a Draft.
        System.assertEquals('MyFlow', LFSFixController.stripVersionSuffix('MyFlow-2'));
        System.assertEquals('MyFlow', LFSFixController.stripVersionSuffix('MyFlow'));
        System.assertEquals('My-Flow', LFSFixController.stripVersionSuffix('My-Flow'));
        System.assertEquals('My-Flow', LFSFixController.stripVersionSuffix('My-Flow-12'));
    }

    /* ────────────────────── VALIDATION ────────────────────── */
    @IsTest
    static void missingArgumentsAreRejected() {
        Boolean threw = false;
        try {
            LFSFixController.saveAsDraft('', draftMetadataJson());
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'A blank version id should be rejected before any callout');
    }

    @IsTest
    static void unreadableMetadataIsRejected() {
        Boolean threw = false;
        try {
            LFSFixController.saveAsDraft('301000000000001AAA', 'not json');
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'Unparseable metadata should be rejected');
    }

    @IsTest
    static void missingFlowIsReported() {
        GatewaySpy spy = new GatewaySpy();
        spy.target = null;
        LFSFixController.gateway = spy;

        Boolean threw = false;
        try {
            LFSFixController.saveAsDraft('301000000000001AAA', draftMetadataJson());
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'A deleted flow version should be reported, not silently skipped');
    }

    /* ────────────────────── DEPLOY STATUS ────────────────────── */
    @IsTest
    static void deployStatusIsPassedThrough() {
        GatewaySpy spy = new GatewaySpy();
        LFSFixController.DeployStatus expected = new LFSFixController.DeployStatus();
        expected.done = true;
        expected.success = true;
        spy.status = expected;
        LFSFixController.gateway = spy;

        LFSFixController.DeployStatus actual = LFSFixController.checkDeployStatus('0Af000000000001AAA');

        System.assertEquals(true, actual.success);
    }

    @IsTest
    static void blankDeployIdIsRejected() {
        Boolean threw = false;
        try {
            LFSFixController.checkDeployStatus('');
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'A blank deploy id should be rejected');
    }

    @IsTest
    static void successfulDeployIsReportedAsANewDraft() {
        String soap =
            '<soapenv:Envelope><result><done>true</done><status>Succeeded</status>' +
            '<success>true</success></result></soapenv:Envelope>';

        LFSFixController.DeployStatus status = LFSFixController.parseDeployStatus(soap);

        System.assertEquals(true, status.done);
        System.assertEquals(true, status.success);
        System.assert(
            status.message.contains('Active version was not changed'),
            'The message should make clear the Active version is untouched'
        );
    }

    @IsTest
    static void failedDeployReportsTheProblem() {
        String soap =
            '<soapenv:Envelope><result><done>true</done><status>Failed</status><success>false</success>' +
            '<componentFailures><problem>The version of the flow you are updating is active' +
            '</problem></componentFailures></result></soapenv:Envelope>';

        LFSFixController.DeployStatus status = LFSFixController.parseDeployStatus(soap);

        System.assertEquals(false, status.success);
        System.assert(status.message.contains('is active'), 'The platform message should reach the user');
    }

    @IsTest
    static void inProgressDeployIsNotDone() {
        String soap = '<soapenv:Envelope><result><done>false</done><status>InProgress</status></result></soapenv:Envelope>';

        LFSFixController.DeployStatus status = LFSFixController.parseDeployStatus(soap);

        System.assertEquals(false, status.done);
        System.assert(status.message.contains('InProgress'), 'The state should be surfaced while waiting');
    }

    /* ────────────────────── REAL GATEWAY, MOCKED HTTP ────────────────────── */
    private class StubAuth implements ToolingAPI.IAuthProvider {
        public String getAccessToken() {
            return 'MOCK_TOKEN';
        }
    }

    // Answers the three endpoints the gateway talks to, and records what it was asked.
    private class OrgMock implements HttpCalloutMock {
        public String flowStatus = 'Draft';
        public Integer patchStatusCode = 204;
        public String patchBody;
        public String lastSoapAction;
        public String deployedEnvelope;

        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            String endpoint = req.getEndpoint();

            if (endpoint.contains('/tooling/query')) {
                res.setStatusCode(200);
                res.setBody(
                    '{"totalSize":1,"done":true,"records":[' +
                    '{"Id":"301000000000001AAA","FullName":"MyFlow-2","Status":"' + flowStatus + '"}]}'
                );
            } else if (endpoint.contains('/tooling/sobjects/Flow/')) {
                patchBody = req.getBody();
                res.setStatusCode(patchStatusCode);
                res.setBody(patchStatusCode == 204 ? '' : '[{"message":"nope","errorCode":"X"}]');
            } else {
                deployedEnvelope = req.getBody();
                lastSoapAction = deployedEnvelope.contains('checkDeployStatus') ? 'status' : 'deploy';
                res.setStatusCode(200);
                res.setBody(
                    lastSoapAction == 'deploy'
                        ? '<soapenv:Envelope><result><id>0Af000000000009AAA</id><done>false</done></result></soapenv:Envelope>'
                        : '<soapenv:Envelope><result><done>true</done><status>Succeeded</status><success>true</success></result></soapenv:Envelope>'
                );
            }
            return res;
        }
    }

    private static OrgMock installOrgMock(String flowStatus) {
        ToolingAPI.authProvider = new StubAuth();
        ToolingAPI.resetCache();
        OrgMock mock = new OrgMock();
        mock.flowStatus = flowStatus;
        Test.setMock(HttpCalloutMock.class, mock);
        return mock;
    }

    @IsTest
    static void gatewayPatchesADraftOverTooling() {
        OrgMock mock = installOrgMock('Draft');

        Test.startTest();
        LFSFixController.FixResult result = LFSFixController.saveAsDraft('301000000000001AAA', draftMetadataJson());
        Test.stopTest();

        System.assertEquals('patched', result.mode);
        System.assert(mock.patchBody.contains('"Metadata"'), 'The Tooling PATCH wraps the document in Metadata');
        System.assert(mock.patchBody.contains('"status":"Draft"'), 'The saved document must be a Draft');
    }

    @IsTest
    static void gatewaySurfacesAToolingRejection() {
        OrgMock mock = installOrgMock('Draft');
        mock.patchStatusCode = 400;

        Boolean threw = false;
        Test.startTest();
        try {
            LFSFixController.saveAsDraft('301000000000001AAA', draftMetadataJson());
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();

        System.assert(threw, 'A rejected PATCH should not be reported as a success');
    }

    @IsTest
    static void gatewayDeploysAnActiveFlowWithoutItsVersionSuffix() {
        OrgMock mock = installOrgMock('Active');

        Test.startTest();
        LFSFixController.FixResult result = LFSFixController.saveAsDraft('301000000000001AAA', draftMetadataJson());
        Test.stopTest();

        System.assertEquals('deployed', result.mode);
        System.assertEquals('0Af000000000009AAA', result.deployRequestId, 'The deploy id comes from the SOAP response');
        System.assert(mock.deployedEnvelope.contains('<met:ZipFile>'), 'The archive travels inside the envelope');
    }

    @IsTest
    static void gatewayReadsDeployStatusOverSoap() {
        installOrgMock('Active');

        Test.startTest();
        LFSFixController.DeployStatus status = LFSFixController.checkDeployStatus('0Af000000000009AAA');
        Test.stopTest();

        System.assertEquals(true, status.done);
        System.assertEquals(true, status.success);
    }

    /* ────────────────────── ERROR DESCRIPTION ────────────────────── */
    @IsTest
    static void toolingErrorsAreUnwrapped() {
        String body = '[{"message":"The fullName is not unique.","errorCode":"DUPLICATE_VALUE"}]';

        System.assertEquals('The fullName is not unique.', LFSFixController.describeError(body));
    }

    @IsTest
    static void soapFaultsAreUnwrapped() {
        String body = '<soapenv:Envelope><soapenv:Fault><faultstring>INVALID_SESSION_ID</faultstring>' +
                      '</soapenv:Fault></soapenv:Envelope>';

        System.assertEquals('INVALID_SESSION_ID', LFSFixController.describeError(body));
    }

    @IsTest
    static void emptyErrorBodiesStillProduceAMessage() {
        System.assertEquals('no detail returned.', LFSFixController.describeError(''));
    }
}
