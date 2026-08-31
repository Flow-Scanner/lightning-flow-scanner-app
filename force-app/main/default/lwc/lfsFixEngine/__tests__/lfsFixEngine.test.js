import {
    FIXABLE_RULES,
    buildFixPlan,
    describeChanges,
    fixableViolations,
    isFixableRule,
    mergeFix,
    stripNulls
} from 'c/lfsFixEngine';

// A Tooling API response, nulls and all.
function toolingFlow(overrides = {}) {
    return {
        attributes: { type: 'Flow', url: '/services/data/v62.0/tooling/sobjects/Flow/301' },
        fullName: 'MyFlow-2',
        apiVersion: 49,
        label: 'My Flow',
        status: 'Active',
        description: null,
        processMetadataValues: [
            { name: 'CanvasMode', value: { stringValue: 'FREE_FORM_CANVAS', numberValue: null } }
        ],
        variables: [
            { name: 'unusedVar', dataType: 'String', scale: null, objectType: null },
            { name: 'usedVar', dataType: 'String', scale: null, objectType: null }
        ],
        assignments: [{ name: 'orphan', label: 'Orphan', connector: null }],
        screens: null,
        ...overrides
    };
}

describe('stripNulls', () => {
    it('removes null fields the engine cannot walk', () => {
        const stripped = stripNulls(toolingFlow());

        expect(stripped.description).toBeUndefined();
        expect(stripped.screens).toBeUndefined();
        expect(stripped.variables[0].scale).toBeUndefined();
        expect(stripped.variables[0].name).toBe('unusedVar');
    });

    it('drops arrays that held nothing but nulls', () => {
        expect(stripNulls({ variables: [null, null] }).variables).toBeUndefined();
    });

    it('leaves the input untouched', () => {
        const original = toolingFlow();
        stripNulls(original);
        expect(original.description).toBeNull();
    });

    it('returns an object for a null document', () => {
        expect(stripNulls(null)).toEqual({});
    });
});

describe('isFixableRule', () => {
    it('knows the four rules the engine can fix', () => {
        Object.keys(FIXABLE_RULES).forEach((rule) => {
            expect(isFixableRule(rule)).toBe(true);
        });
    });

    it('rejects rules that need a human decision', () => {
        expect(isFixableRule('MissingFaultPath')).toBe(false);
        expect(isFixableRule(undefined)).toBe(false);
    });
});

describe('fixableViolations', () => {
    it('keeps only fixable rules that actually fired', () => {
        const violations = fixableViolations({
            ruleResults: [
                { ruleName: 'UnusedVariable', ruleId: 'unused-variable', occurs: true, details: [{ name: 'unusedVar' }] },
                { ruleName: 'UnusedVariable', ruleId: 'unused-variable', occurs: false, details: [] },
                { ruleName: 'MissingFaultPath', ruleId: 'missing-fault-path', occurs: true, details: [{ name: 'x' }] }
            ]
        });

        expect(violations).toHaveLength(1);
        expect(violations[0].names).toEqual(['unusedVar']);
    });

    it('tolerates a missing scan result', () => {
        expect(fixableViolations(null)).toEqual([]);
    });
});

describe('mergeFix', () => {
    it('drops only the elements the engine removed', () => {
        const merged = mergeFix(toolingFlow(), {
            variables: [{ name: 'usedVar' }],
            assignments: []
        });

        expect(merged.variables.map((v) => v.name)).toEqual(['usedVar']);
        expect(merged.assignments).toEqual([]);
    });

    it('keeps fields the engine never saw, because it works on a stripped copy', () => {
        const merged = mergeFix(toolingFlow(), { variables: [{ name: 'usedVar' }] });

        expect(merged.variables[0].dataType).toBe('String');
        expect(merged.label).toBe('My Flow');
    });

    it('always saves as a Draft, whatever was scanned', () => {
        expect(mergeFix(toolingFlow(), {}).status).toBe('Draft');
    });

    it('strips the read-only fields a deployment would reject', () => {
        const merged = mergeFix(toolingFlow(), {});

        expect(merged.attributes).toBeUndefined();
        expect(merged.fullName).toBeUndefined();
    });

    it('carries over a raised API version', () => {
        expect(mergeFix(toolingFlow(), { apiVersion: 50 }).apiVersion).toBe(50);
    });

    it('carries over a switched canvas mode without duplicating it', () => {
        const merged = mergeFix(toolingFlow(), {
            processMetadataValues: [
                { name: 'CanvasMode', value: { stringValue: 'AUTO_LAYOUT_CANVAS' } }
            ]
        });

        const canvasValues = merged.processMetadataValues.filter((v) => v.name === 'CanvasMode');
        expect(canvasValues).toHaveLength(1);
        expect(canvasValues[0].value.stringValue).toBe('AUTO_LAYOUT_CANVAS');
    });
});

describe('describeChanges', () => {
    it('names the element for a removal', () => {
        const changes = describeChanges(
            [{ ruleName: 'UnusedVariable', ruleId: 'unused-variable', names: ['unusedVar'] }],
            toolingFlow(),
            toolingFlow()
        );

        expect(changes[0].action).toBe('Remove unused variable');
        expect(changes[0].target).toBe('unusedVar');
    });

    it('shows before and after for a version bump', () => {
        const changes = describeChanges(
            [{ ruleName: 'APIVersion', ruleId: 'invalid-api-version', names: [] }],
            toolingFlow({ apiVersion: 49 }),
            toolingFlow({ apiVersion: 50 })
        );

        expect(changes[0].target).toBe('49 → 50');
    });

    it('shows before and after for a canvas switch', () => {
        const changes = describeChanges(
            [{ ruleName: 'AutoLayout', ruleId: 'missing-auto-layout', names: [] }],
            toolingFlow(),
            toolingFlow({
                processMetadataValues: [
                    { name: 'CanvasMode', value: { stringValue: 'AUTO_LAYOUT_CANVAS' } }
                ]
            })
        );

        expect(changes[0].target).toBe('FREE_FORM_CANVAS → AUTO_LAYOUT_CANVAS');
    });
});

describe('buildFixPlan', () => {
    // Stands in for the bundled engine: reports one unused variable and removes it.
    const scanner = {
        Flow: class {
            constructor(name, data) {
                this.name = name;
                this.xmldata = data;
            }
        },
        scan: jest.fn((parsed) => [
            {
                flow: parsed[0].flow,
                ruleResults: [
                    {
                        ruleName: 'UnusedVariable',
                        ruleId: 'unused-variable',
                        occurs: true,
                        details: [{ name: 'unusedVar' }]
                    }
                ]
            }
        ]),
        fix: jest.fn((scanned) => [
            {
                flow: {
                    xmldata: {
                        ...scanned[0].flow.xmldata,
                        variables: [{ name: 'usedVar' }]
                    }
                }
            }
        ])
    };

    beforeEach(() => {
        scanner.scan.mockClear();
        scanner.fix.mockClear();
    });

    it('returns a named change list and metadata to save', () => {
        const plan = buildFixPlan(scanner, 'MyFlow', toolingFlow(), { rules: {} });

        expect(plan.changes).toEqual([
            expect.objectContaining({ action: 'Remove unused variable', target: 'unusedVar' })
        ]);
        expect(plan.fixedMetadata.variables.map((v) => v.name)).toEqual(['usedVar']);
        expect(plan.fixedMetadata.status).toBe('Draft');
    });

    it('hands the engine a document without nulls', () => {
        buildFixPlan(scanner, 'MyFlow', toolingFlow(), { rules: {} });

        const handedOver = scanner.scan.mock.calls[0][0][0].flow.xmldata;
        expect(handedOver.description).toBeUndefined();
        expect(handedOver.variables[0].scale).toBeUndefined();
    });

    it('returns nothing when no fixable rule fired', () => {
        const quiet = {
            ...scanner,
            scan: () => [{ flow: {}, ruleResults: [{ ruleName: 'MissingFaultPath', occurs: true, details: [] }] }]
        };

        expect(buildFixPlan(quiet, 'MyFlow', toolingFlow(), { rules: {} })).toBeNull();
    });
});
