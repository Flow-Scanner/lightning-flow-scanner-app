/**
 * @description Serialises Flow metadata (as returned by the Tooling API) back into
 *              the Flow XML shape the Metadata API expects.
 *
 *              The Tooling API hands back the same tree the Metadata API consumes,
 *              only as JSON and padded with nulls plus a handful of read-only system
 *              fields. Dropping those and emitting the remainder verbatim round-trips
 *              cleanly, so no per-element knowledge of the Flow schema is needed here.
 * @group Fix
 */
public with sharing class LFSFlowXmlWriter {

    private static final String NAMESPACE = 'http://soap.sforce.com/2006/04/metadata';

    // Read-only or transport-only keys the Tooling API adds. Deploying them back
    // fails with INVALID_FIELD, so they never reach the XML.
    private static final Set<String> SKIP_KEYS = new Set<String>{
        'attributes',
        'urls',
        'fullname',
        'createdbyid',
        'createddate',
        'lastmodifiedbyid',
        'lastmodifieddate',
        'manageablestate',
        'namespaceprefix'
    };

    /**
     * @description Builds a `.flow-meta.xml` document from Tooling metadata.
     * @param metadata Deserialised Flow.Metadata map.
     * @return XML document, ready to be zipped into a Metadata API deployment.
     */
    public static String toXml(Map<String, Object> metadata) {
        if (metadata == null) {
            throw new IllegalArgumentException('Flow metadata is required');
        }
        String body = writeChildren(metadata, '    ');
        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
               '<Flow xmlns="' + NAMESPACE + '">\n' +
               body +
               '</Flow>\n';
    }

    private static String writeChildren(Map<String, Object> node, String indent) {
        String out = '';
        for (String key : sortedKeys(node)) {
            if (isSkipped(key)) {
                continue;
            }
            out += writeNode(key, node.get(key), indent);
        }
        return out;
    }

    private static String writeNode(String name, Object value, String indent) {
        if (value == null) {
            return '';
        }
        if (value instanceof List<Object>) {
            String out = '';
            for (Object item : (List<Object>) value) {
                out += writeNode(name, item, indent);
            }
            return out;
        }
        if (value instanceof Map<String, Object>) {
            String childXml = writeChildren((Map<String, Object>) value, indent + '    ');
            // An element whose children were all null carries no information and
            // is rejected by the Metadata API as an empty complex type.
            if (String.isBlank(childXml)) {
                return '';
            }
            return indent + '<' + name + '>\n' + childXml + indent + '</' + name + '>\n';
        }
        return indent + '<' + name + '>' + escapeXml(String.valueOf(value)) + '</' + name + '>\n';
    }

    // Deterministic output keeps deployments diffable and tests stable; the
    // Metadata API accepts Flow children in any order.
    private static List<String> sortedKeys(Map<String, Object> node) {
        List<String> keys = new List<String>(node.keySet());
        keys.sort();
        return keys;
    }

    private static Boolean isSkipped(String key) {
        return key == null || SKIP_KEYS.contains(key.toLowerCase());
    }

    private static String escapeXml(String value) {
        return value
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;');
    }
}
