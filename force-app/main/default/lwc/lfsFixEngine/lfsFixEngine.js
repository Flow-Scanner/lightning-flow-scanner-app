/**
 * Turns a scan result into a fix: a human-readable list of changes, and the Flow
 * metadata to save.
 *
 * The scanner engine is the same one the CLI and the VS Code extension use, so the
 * fixes themselves are identical. What differs is the input: the Tooling API hands
 * back JSON padded with nulls rather than parsed XML, and the fixed document has to
 * be written back to an org rather than to a file. Both of those are handled here.
 */

// Rules the engine can fix on its own. Everything else needs a human decision
// (a missing fault path, for instance, has to be connected somewhere).
export const FIXABLE_RULES = {
    UnusedVariable: 'unused-variable',
    UnconnectedElement: 'unreachable-element',
    AutoLayout: 'missing-auto-layout',
    APIVersion: 'invalid-api-version'
};

const NODE_TAGS = [
    'actionCalls', 'apexPluginCalls', 'collectionProcessors', 'customErrors', 'decisions',
    'loops', 'orchestratedStages', 'recordCreates', 'recordDeletes', 'recordLookups',
    'recordRollbacks', 'recordUpdates', 'screens', 'steps', 'subflows', 'transforms',
    'waits', 'assignments'
];

const VARIABLE_TAGS = ['choices', 'constants', 'dynamicChoiceSets', 'formulas', 'variables'];

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * Removes the nulls the Tooling API pads its JSON with.
 *
 * The engine walks the document expecting parsed XML, where an absent element is
 * simply missing. Tooling instead returns every field of the schema with a null
 * value, and the engine throws on the first one it tries to read a name off, so
 * this has to run before a Flow is constructed — for scanning as much as fixing.
 */
export function stripNulls(value) {
    const walk = (node) => {
        if (node === null || node === undefined) return undefined;
        if (Array.isArray(node)) {
            const items = node.map(walk).filter((item) => item !== undefined);
            return items.length ? items : undefined;
        }
        if (typeof node === 'object') {
            const out = {};
            Object.keys(node).forEach((key) => {
                const next = walk(node[key]);
                if (next !== undefined) out[key] = next;
            });
            return out;
        }
        return node;
    };
    const stripped = walk(clone(value));
    return stripped === undefined ? {} : stripped;
}

/** Fixable rules that actually fired on this flow, with the elements they name. */
export function fixableViolations(scanResult) {
    return (scanResult?.ruleResults || [])
        .filter((r) => r.occurs && FIXABLE_RULES[r.ruleName])
        .map((r) => ({
            ruleName: r.ruleName,
            ruleId: r.ruleId || FIXABLE_RULES[r.ruleName],
            names: (r.details || []).map((d) => d.name).filter(Boolean)
        }));
}

export function isFixableRule(ruleName) {
    return Boolean(FIXABLE_RULES[ruleName]);
}

/**
 * Runs the engine's fixes and describes the outcome.
 *
 * @param scanner  window.lightningflowscanner
 * @param flowName Flow API name
 * @param metadata Flow metadata straight from the Tooling API
 * @param scanOptions The same options the scan ran with
 * @returns {{changes: Array, fixedMetadata: Object}} or null when nothing is fixable
 */
export function buildFixPlan(scanner, flowName, metadata, scanOptions) {
    const original = clone(metadata);
    const forEngine = stripNulls(original);

    const flow = new scanner.Flow(flowName, forEngine);
    const scanned = scanner.scan([{ uri: flowName, flow }], scanOptions);
    const violations = fixableViolations(scanned[0]);
    if (!violations.length) return null;

    // The engine reads per-rule options off a Map (the API version target lives
    // there); the scan takes the same options as a plain object.
    const fixed = scanner.fix(scanned, toRuleOptionMap(scanOptions?.rules));
    if (!fixed?.length) return null;

    const fixedMetadata = mergeFix(original, fixed[0].flow.xmldata);
    return {
        changes: describeChanges(violations, original, fixedMetadata),
        fixedMetadata
    };
}

/**
 * Applies the engine's result back onto the original Tooling document.
 *
 * The engine works on a stripped copy, so saving its document directly would drop
 * every field that happened to be null at read time. Instead only the four things
 * the fixable rules can change are carried over: which elements survive, the API
 * version, and the canvas mode.
 */
export function mergeFix(original, fixedFlowData) {
    const doc = clone(original);
    delete doc.attributes;
    delete doc.fullName;
    // Whatever the engine produced, what gets saved is always a Draft.
    doc.status = 'Draft';

    const surviving = new Set([
        ...namesIn(fixedFlowData, NODE_TAGS),
        ...namesIn(fixedFlowData, VARIABLE_TAGS)
    ]);

    [...NODE_TAGS, ...VARIABLE_TAGS].forEach((tag) => {
        if (!Array.isArray(doc[tag])) return;
        doc[tag] = doc[tag].filter((item) => !item?.name || surviving.has(item.name));
    });

    if (fixedFlowData?.apiVersion !== null && fixedFlowData?.apiVersion !== undefined) {
        doc.apiVersion = fixedFlowData.apiVersion;
    }

    const canvasMode = asArray(fixedFlowData?.processMetadataValues).find(
        (v) => v && v.name === 'CanvasMode'
    );
    if (canvasMode) {
        if (!Array.isArray(doc.processMetadataValues)) {
            doc.processMetadataValues = asArray(doc.processMetadataValues);
        }
        const index = doc.processMetadataValues.findIndex((v) => v && v.name === 'CanvasMode');
        if (index >= 0) doc.processMetadataValues[index] = canvasMode;
        else doc.processMetadataValues.push(canvasMode);
    }

    return doc;
}

/**
 * The preview the user confirms.
 *
 * Deliberately named changes rather than an XML diff: the app knows the rule and the
 * element names already, and "remove unused variable myVar" is easier to check than
 * a wall of metadata.
 */
export function describeChanges(violations, before, after) {
    const changes = [];
    violations.forEach((violation, index) => {
        const base = { id: `fix-${index}`, ruleId: violation.ruleId, ruleName: violation.ruleName };
        switch (violation.ruleName) {
            case 'UnusedVariable':
                changes.push({
                    ...base,
                    action: 'Remove unused variable',
                    target: violation.names.join(', ')
                });
                break;
            case 'UnconnectedElement':
                changes.push({
                    ...base,
                    action: 'Remove unreachable element',
                    target: violation.names.join(', ')
                });
                break;
            case 'AutoLayout':
                changes.push({
                    ...base,
                    action: 'Switch canvas mode',
                    target: `${canvasModeOf(before)} → ${canvasModeOf(after)}`
                });
                break;
            case 'APIVersion':
                changes.push({
                    ...base,
                    action: 'Raise API version',
                    target: `${before?.apiVersion ?? '?'} → ${after?.apiVersion ?? '?'}`
                });
                break;
            default:
                break;
        }
    });
    return changes;
}

export function toRuleOptionMap(rules) {
    const options = new Map();
    Object.keys(rules || {}).forEach((key) => options.set(key, rules[key]));
    return options;
}

function canvasModeOf(metadata) {
    const value = asArray(metadata?.processMetadataValues).find((v) => v && v.name === 'CanvasMode');
    return value?.value?.stringValue || 'FREE_FORM_CANVAS';
}

function namesIn(metadata, tags) {
    const names = [];
    tags.forEach((tag) => {
        asArray(metadata?.[tag]).forEach((item) => {
            if (item?.name) names.push(item.name);
        });
    });
    return names;
}

function asArray(value) {
    if (value === null || value === undefined) return [];
    return Array.isArray(value) ? value : [value];
}
