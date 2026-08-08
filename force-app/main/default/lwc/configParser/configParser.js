// Parses .flow-scanner config text: JSON, or the YAML subset that flow-scanner
// configs use (the VS Code extension writes .flow-scanner.yml). The YAML
// parser is deliberately strict — anything outside the subset (anchors,
// multi-line scalars, flow maps, sequences of mappings) throws so a config is
// never silently misread.

const JSON_EXTENSIONS = /\.json$/i;

// Parse config text into a plain object. Tries JSON first; for non-.json
// sources, falls back to YAML. Throws Error with a readable message.
export function parseConfigText(text, sourceName) {
    let jsonError;
    try {
        return JSON.parse(text);
    } catch (e) {
        jsonError = e;
    }
    if (JSON_EXTENSIONS.test(sourceName || '')) {
        throw jsonError;
    }
    return parseYaml(text);
}

export function parseYaml(text) {
    const lines = [];
    String(text)
        .split(/\r\n?|\n/)
        .forEach((raw, index) => {
            const withoutComment = stripComment(raw);
            if (!withoutComment.trim()) return;
            if (withoutComment.trim() === '---') return; // document marker
            lines.push({
                indent: withoutComment.length - withoutComment.trimStart().length,
                content: withoutComment.trim(),
                lineNo: index + 1
            });
        });
    if (!lines.length) return {};
    const state = { lines, pos: 0 };
    const value = parseBlock(state, lines[0].indent);
    if (state.pos < lines.length) {
        fail(lines[state.pos], 'unexpected content');
    }
    return value;
}

function fail(line, reason) {
    throw new Error(`Unsupported YAML at line ${line.lineNo} (${reason}): ${line.content}`);
}

// Cut an unquoted trailing comment. YAML only starts a comment at '#' when it
// is at line start or preceded by whitespace.
function stripComment(raw) {
    let quote = null;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (quote) {
            if (ch === quote) quote = null;
        } else if (ch === "'" || ch === '"') {
            quote = ch;
        } else if (ch === '#' && (i === 0 || raw[i - 1] === ' ' || raw[i - 1] === '\t')) {
            return raw.slice(0, i);
        }
    }
    return raw;
}

function parseBlock(state, indent) {
    const line = state.lines[state.pos];
    return line.content.startsWith('- ') || line.content === '-'
        ? parseSequence(state, indent)
        : parseMapping(state, indent);
}

function parseMapping(state, indent) {
    const result = {};
    while (state.pos < state.lines.length) {
        const line = state.lines[state.pos];
        if (line.indent < indent) break;
        if (line.indent > indent) fail(line, 'bad indentation');
        if (line.content.startsWith('- ') || line.content === '-') {
            fail(line, 'sequence where mapping expected');
        }
        const { key, rest } = splitKey(line);
        state.pos++;
        if (rest) {
            result[key] = parseScalar(rest, line);
        } else {
            const next = state.lines[state.pos];
            if (next && next.indent > indent) {
                result[key] = parseBlock(state, next.indent);
            } else {
                result[key] = null; // "key:" with no value
            }
        }
    }
    return result;
}

function parseSequence(state, indent) {
    const result = [];
    while (state.pos < state.lines.length) {
        const line = state.lines[state.pos];
        if (line.indent < indent) break;
        if (line.indent > indent) fail(line, 'bad indentation');
        if (!(line.content.startsWith('- ') || line.content === '-')) break;
        const rest = line.content === '-' ? '' : line.content.slice(2).trim();
        state.pos++;
        if (!rest) {
            const next = state.lines[state.pos];
            if (next && next.indent > indent) {
                result.push(parseBlock(state, next.indent));
            } else {
                result.push(null);
            }
        } else if (/^[^'"[\]{}]*:(\s|$)/.test(rest)) {
            // "- key: value" — a mapping inside a list; flow-scanner configs
            // never use this shape, and supporting it complicates indentation.
            fail(line, 'mapping inside sequence item');
        } else {
            result.push(parseScalar(rest, line));
        }
    }
    return result;
}

// Split "key: value" / "key:"; key may be quoted (rule ids, flow names).
function splitKey(line) {
    const text = line.content;
    let key;
    let after;
    if (text[0] === "'" || text[0] === '"') {
        const quote = text[0];
        const end = text.indexOf(quote, 1);
        if (end === -1) fail(line, 'unterminated quoted key');
        key = unquote(text.slice(0, end + 1), line);
        after = text.slice(end + 1);
    } else {
        const idx = findKeySeparator(text);
        if (idx === -1) fail(line, 'expected "key: value"');
        key = text.slice(0, idx).trim();
        after = text.slice(idx);
    }
    after = after.trimStart();
    if (after[0] !== ':') fail(line, 'expected ":" after key');
    const rest = after.slice(1);
    if (rest && rest[0] !== ' ' && rest[0] !== '\t') fail(line, 'expected space after ":"');
    return { key, rest: rest.trim() };
}

// First ":" that ends the key: followed by space/EOL (so URLs in plain
// scalars like "https://…" never split).
function findKeySeparator(text) {
    for (let i = 0; i < text.length; i++) {
        if (text[i] === ':' && (i === text.length - 1 || text[i + 1] === ' ' || text[i + 1] === '\t')) {
            return i;
        }
    }
    return -1;
}

function parseScalar(text, line) {
    if (text[0] === '[') return parseInlineArray(text, line);
    if (text[0] === '{' || text[0] === '&' || text[0] === '*' || text[0] === '|' || text[0] === '>') {
        fail(line, 'unsupported YAML feature');
    }
    if (text[0] === "'" || text[0] === '"') return unquote(text, line);
    if (text === 'true' || text === 'True') return true;
    if (text === 'false' || text === 'False') return false;
    if (text === 'null' || text === 'Null' || text === '~') return null;
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    return text;
}

function parseInlineArray(text, line) {
    if (text[text.length - 1] !== ']') fail(line, 'unterminated inline array');
    const inner = text.slice(1, -1).trim();
    if (!inner) return [];
    const items = [];
    let current = '';
    let quote = null;
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (quote) {
            current += ch;
            if (ch === quote) quote = null;
        } else if (ch === "'" || ch === '"') {
            current += ch;
            quote = ch;
        } else if (ch === ',') {
            items.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    items.push(current.trim());
    return items.map(item => parseScalar(item, line));
}

function unquote(text, line) {
    const quote = text[0];
    if (text.length < 2 || text[text.length - 1] !== quote) {
        fail(line, 'unterminated quoted string');
    }
    const inner = text.slice(1, -1);
    if (quote === "'") return inner.replace(/''/g, "'");
    return inner.replace(/\\(["\\/bfnrt])/g, (m, c) =>
        ({ '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' })[c]
    );
}
