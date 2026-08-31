@IsTest
private class LFSFlowXmlWriterTest {

    private static Map<String, Object> metadata(String document) {
        return (Map<String, Object>) JSON.deserializeUntyped(document);
    }

    @IsTest
    static void writesAFlowDocument() {
        String xml = LFSFlowXmlWriter.toXml(metadata('{"label":"My Flow","status":"Draft"}'));

        System.assert(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'A deployment needs the XML prolog');
        System.assert(xml.contains('<Flow xmlns="http://soap.sforce.com/2006/04/metadata">'), 'The namespace is required');
        System.assert(xml.contains('<label>My Flow</label>'));
        System.assert(xml.contains('<status>Draft</status>'));
        System.assert(xml.endsWith('</Flow>\n'));
    }

    @IsTest
    static void repeatsAnElementPerArrayItem() {
        String xml = LFSFlowXmlWriter.toXml(metadata(
            '{"variables":[{"name":"a"},{"name":"b"}]}'
        ));

        System.assert(xml.contains('<name>a</name>'));
        System.assert(xml.contains('<name>b</name>'));
        System.assertEquals(2, xml.countMatches('<variables>'), 'Each item is its own element, not a wrapper');
    }

    @IsTest
    static void nestsComplexValues() {
        String xml = LFSFlowXmlWriter.toXml(metadata(
            '{"processMetadataValues":{"name":"CanvasMode","value":{"stringValue":"AUTO_LAYOUT_CANVAS"}}}'
        ));

        System.assert(xml.contains('<value>'), 'Nested complex types must keep their wrapper');
        System.assert(xml.contains('<stringValue>AUTO_LAYOUT_CANVAS</stringValue>'));
    }

    @IsTest
    static void dropsNullsAndTheElementsLeftEmptyByThem() {
        // Tooling pads its JSON with nulls; deploying them back produces either an
        // empty complex type or an invalid field.
        String xml = LFSFlowXmlWriter.toXml(metadata(
            '{"label":"My Flow","description":null,"start":{"connector":null}}'
        ));

        System.assert(!xml.contains('<description'), 'Null fields do not belong in the document');
        System.assert(!xml.contains('<start>'), 'An element whose children were all null carries nothing');
    }

    @IsTest
    static void dropsReadOnlyToolingFields() {
        String xml = LFSFlowXmlWriter.toXml(metadata(
            '{"label":"My Flow","fullName":"MyFlow-2","attributes":{"type":"Flow"},"urls":{"self":"/x"}}'
        ));

        System.assert(!xml.contains('fullName'), 'fullName comes from the manifest, not the document');
        System.assert(!xml.contains('attributes'), 'Tooling transport fields would be rejected');
        System.assert(!xml.contains('urls'));
    }

    @IsTest
    static void escapesMarkupInValues() {
        String xml = LFSFlowXmlWriter.toXml(metadata(
            '{"description":"a < b & c > d \\" e"}'
        ));

        System.assert(xml.contains('a &lt; b &amp; c &gt; d &quot; e'), 'Raw markup would break the document');
        System.assert(!xml.contains('a < b'), 'The unescaped form must not survive');
    }

    @IsTest
    static void writesNonStringScalars() {
        String xml = LFSFlowXmlWriter.toXml(metadata('{"apiVersion":50,"isTemplate":false}'));

        System.assert(xml.contains('<apiVersion>50</apiVersion>'));
        System.assert(xml.contains('<isTemplate>false</isTemplate>'));
    }

    @IsTest
    static void ordersElementsPredictably() {
        String xml = LFSFlowXmlWriter.toXml(metadata('{"status":"Draft","apiVersion":50,"label":"L"}'));

        System.assert(
            xml.indexOf('<apiVersion>') < xml.indexOf('<label>')
                && xml.indexOf('<label>') < xml.indexOf('<status>'),
            'Stable ordering keeps deployments diffable'
        );
    }

    @IsTest
    static void requiresMetadata() {
        Boolean threw = false;
        try {
            LFSFlowXmlWriter.toXml(null);
        } catch (IllegalArgumentException e) {
            threw = true;
        }
        System.assert(threw, 'There is nothing to deploy without metadata');
    }
}
