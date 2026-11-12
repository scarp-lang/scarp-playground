//! Browser bridge to the real Scarp interpreter, pinned to published v0.0.6-alpha.8.
use scarp::modules::{self, symbols::IndexLimits, MemorySourceLoader, ModuleLimits, ModuleRunError};
use scarp::{ExecutionLimits, ExecutionOptions, InputLimits};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

const MAX_FILES: usize = 12;
const MAX_FILE_BYTES: usize = 64 * 1024;
const MAX_TOTAL_BYTES: usize = 128 * 1024;
// Even heavily escaped but valid 128 KiB source fits in this bound.
const MAX_REQUEST_JSON_BYTES: usize = 1024 * 1024;
// In-memory stdin is neither terminal access nor an interactive prompt.
const MAX_STDIN_BYTES: usize = 16 * 1024;

#[derive(Deserialize)]
struct Request {
    entry: String,
    files: BTreeMap<String, String>,
}

#[derive(Deserialize)]
struct ExecutionRequest {
    #[serde(flatten)]
    workspace: Request,
    #[serde(default)]
    stdin: String,
}

#[derive(Deserialize)]
struct DefinitionRequest {
    entry: String,
    files: BTreeMap<String, String>,
    path: String,
    offset: usize,
}

fn error(message: impl Into<String>) -> String {
    json!({ "ok": false, "stdout": "", "stderr": "", "error": message.into() }).to_string()
}


fn module_limits() -> ModuleLimits {
    ModuleLimits {
        max_files: MAX_FILES,
        max_depth: 8,
        max_file_bytes: MAX_FILE_BYTES,
        max_total_bytes: MAX_TOTAL_BYTES,
        max_imports: 64,
        max_expansion_bytes: 1024 * 1024,
    }
}

/// The navigator and executor consume the exact same validated virtual workspace.
fn load_workspace(request: Request) -> Result<(String, MemorySourceLoader), String> {
    if request.files.is_empty() || request.files.len() > MAX_FILES {
        return Err("The playground accepts between 1 and 12 source files.".into());
    }
    if !request.files.contains_key(&request.entry) {
        return Err("The selected entrypoint must exist in the workspace.".into());
    }
    let mut loader = MemorySourceLoader::new();
    let mut size = 0_usize;
    for (path, source) in request.files {
        if !path.ends_with(".srp") || path.len() > 128 || source.len() > MAX_FILE_BYTES {
            return Err("Invalid file name or a source exceeds the 64 KiB limit.".into());
        }
        size += source.len();
        if size > MAX_TOTAL_BYTES {
            return Err("The combined project sources exceed 128 KiB.".into());
        }
        loader.insert(&path, source).map_err(|problem| problem.to_string())?;
    }
    Ok((request.entry, loader))
}

fn compiler_error(problem: modules::ModuleDiagnostic) -> String {
    let mut encoded = Vec::new();
    let diagnostic = if problem.write_json(&mut encoded).is_ok() {
        serde_json::from_slice::<Value>(&encoded).ok()
    } else {
        None
    };
    json!({
        "ok": false, "stdout": "", "stderr": "",
        "error": problem.to_string(), "diagnostic": diagnostic
    }).to_string()
}

/// Build an opt-in static compiler index; never execute runtime statements.
fn definition_request(json_source: &str) -> String {
    if json_source.len() > MAX_REQUEST_JSON_BYTES {
        return error("The compiler request exceeds the 1 MiB JSON limit.");
    }
    let request: DefinitionRequest = match serde_json::from_str(json_source) {
        Ok(value) => value,
        Err(_) => return error("Malformed definition request."),
    };
    let selected_source = match request.files.get(&request.path) {
        Some(source) if request.offset <= source.len() &&
            source.is_char_boundary(request.offset) => source,
        _ => return error("Invalid navigation source or UTF-8 byte offset."),
    };
    // An out-of-token offset (including EOF) is a successful 'no definition'
    // result, but invalid source paths and non-character boundaries are rejected.
    if selected_source.len() > MAX_FILE_BYTES {
        return error("Invalid navigation source or UTF-8 byte offset.");
    }
    let path = request.path.clone();
    let (entry, loader) = match load_workspace(Request {
        entry: request.entry,
        files: request.files,
    }) {
        Ok(result) => result,
        Err(problem) => return error(problem),
    };
    let limits = IndexLimits {
        max_symbols: 4096,
        max_references: 16_384,
        max_name_bytes: 256 * 1024,
        max_work: 100_000,
    };
    let indexed = match modules::compile_indexed_with_loader(
        &entry, &loader, module_limits(), limits,
    ) {
        Ok(program) => program,
        Err(problem) => return compiler_error(problem),
    };
    let index = indexed.index();
    let Some(source_id) = index.sources().files().iter().position(|file| file.name == path) else {
        // A virtual but unreachable .srp file is not in the compiled import graph.
        return json!({ "ok": true, "target": null }).to_string();
    };
    let Some(symbol) = index.goto_definition(source_id, request.offset) else {
        return json!({ "ok": true, "target": null }).to_string();
    };
    let Some(location) = symbol.location else {
        // Never invent definition locations for builtins or implicit values.
        return json!({ "ok": true, "target": null }).to_string();
    };
    let Some(file) = index.sources().files().get(location.source) else {
        return error("Invalid compiler source location.");
    };
    json!({
        "ok": true,
        "target": {
            "path": file.name,
            "start": { "line": location.start.line, "column": location.start.column },
            "end": { "line": location.end.line, "column": location.end.column }
        }
    }).to_string()
}

const MAX_REFERENCE_RESULTS: usize = 120;

// Return source-owned semantic references, never a substring search. The
// compiler index is built without evaluating program statements or stdin.
fn references_request(json_source: &str) -> String {
    if json_source.len() > MAX_REQUEST_JSON_BYTES {
        return error("The compiler request exceeds the 1 MiB JSON limit.");
    }
    let request: DefinitionRequest = match serde_json::from_str(json_source) {
        Ok(value) => value,
        Err(_) => return error("Malformed references request."),
    };
    match request.files.get(&request.path) {
        Some(source) if source.len() <= MAX_FILE_BYTES &&
            request.offset <= source.len() && source.is_char_boundary(request.offset) => {}
        _ => return error("Invalid references source or UTF-8 byte offset."),
    };
    let path = request.path.clone();
    let (entry, loader) = match load_workspace(Request {
        entry: request.entry,
        files: request.files,
    }) {
        Ok(result) => result,
        Err(problem) => return error(problem),
    };
    let limits = IndexLimits {
        max_symbols: 4096,
        max_references: 16_384,
        max_name_bytes: 256 * 1024,
        max_work: 100_000,
    };
    let indexed = match modules::compile_indexed_with_loader(
        &entry, &loader, module_limits(), limits,
    ) {
        Ok(program) => program,
        Err(problem) => return compiler_error(problem),
    };
    let index = indexed.index();
    let Some(source_id) = index.sources().files().iter().position(|file| file.name == path) else {
        return json!({ "ok": true, "symbol": null, "declaration": null,
            "references": [], "truncated": false }).to_string();
    };
    let Some(symbol) = index.goto_definition(source_id, request.offset) else {
        return json!({ "ok": true, "symbol": null, "declaration": null,
            "references": [], "truncated": false }).to_string();
    };
    // The compiler supplies validated source spans; only map them to a bounded
    // path/range/kind payload. Do not return source bodies or the full index.
    let location_json = |location: modules::SourceLocation| -> Option<Value> {
        let file = index.sources().files().get(location.source)?;
        Some(json!({
            "path": file.name,
            "start": { "line": location.start.line, "column": location.start.column },
            "end": { "line": location.end.line, "column": location.end.column },
        }))
    };
    let declaration = match symbol.location {
        Some(location) => match location_json(location) {
            Some(found) => found,
            None => return error("Invalid compiler declaration location."),
        },
        None => Value::Null,
    };
    let mut references = Vec::new();
    let mut truncated = false;
    for reference in index.find_references(symbol.id) {
        if references.len() == MAX_REFERENCE_RESULTS {
            truncated = true;
            break;
        }
        let Some(location) = location_json(reference.location) else {
            return error("Invalid compiler reference location.");
        };
        let mut value = location;
        value["kind"] = json!(reference.kind.as_str());
        references.push(value);
    }
    json!({
        "ok": true,
        "symbol": { "name": symbol.name.as_ref(), "kind": symbol.kind.as_str() },
        "declaration": declaration,
        "references": references,
        "truncated": truncated,
    }).to_string()
}


const MAX_RENAME_SITES: usize = 120;

#[derive(Deserialize)]
struct RenameRequest {
    #[serde(flatten)]
    workspace: Request,
    path: String,
    offset: usize,
    new_name: String,
}

fn identifier_character(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

/// Reject possible capture in *any* virtual file, including files not reached
/// by the selected entry. False positives in comments and literals are safe:
/// this is intentionally a conservative rename, not text-substitution.
fn contains_identifier(source: &str, name: &str) -> bool {
    let bytes = source.as_bytes();
    source.match_indices(name).any(|(start, _)| {
        let end = start + name.len();
        (start == 0 || !identifier_character(bytes[start - 1]))
            && (end == bytes.len() || !identifier_character(bytes[end]))
    })
}

/// Preview a semantic rename using the compiler's resolved declaration and
/// references. Recompile the edited graph; NEVER execute user code. A caller
/// must explicitly confirm the returned workspace before applying any edit.
fn rename_request(json_source: &str) -> String {
    if json_source.len() > MAX_REQUEST_JSON_BYTES {
        return error("The compiler request exceeds the 1 MiB JSON limit.");
    }
    let request: RenameRequest = match serde_json::from_str(json_source) {
        Ok(value) => value,
        Err(_) => return error("Malformed rename request."),
    };
    let name = request.new_name.as_str();
    if name.is_empty() || name.len() > 64 ||
        !name.as_bytes()[0].is_ascii_alphabetic() && name.as_bytes()[0] != b'_' ||
        !name.bytes().all(identifier_character)
    {
        return error("Use a Scarp identifier of 1-64 ASCII letters, digits or underscores, starting with a letter or underscore.");
    }
    // The language parser owns the keyword list; avoid a divergent JS allowlist.
    if scarp::parse(&format!("bind {name} = 1;")).is_err() {
        return error("The new name is reserved or is not a valid Scarp declaration.");
    }
    let source = match request.workspace.files.get(&request.path) {
        Some(source) if request.offset < source.len() && source.is_char_boundary(request.offset) =>
            source,
        _ => return error("Place the rename cursor on a valid source identifier."),
    };
    if request.workspace.files.values().any(|source| contains_identifier(source, name)) {
        return error("The new identifier already occurs in this workspace. Choose an unused name to avoid capture.");
    }
    let (entry, loader) = match load_workspace(Request {
        entry: request.workspace.entry.clone(),
        files: request.workspace.files.clone(),
    }) {
        Ok(value) => value,
        Err(problem) => return error(problem),
    };
    let limits = IndexLimits {
        max_symbols: 4096,
        max_references: 16_384,
        max_name_bytes: 256 * 1024,
        max_work: 100_000,
    };
    let indexed = match modules::compile_indexed_with_loader(
        &entry, &loader, module_limits(), limits,
    ) {
        Ok(value) => value,
        Err(problem) => return compiler_error(problem),
    };
    let index = indexed.index();
    let Some(source_id) = index.sources().files().iter().position(|file| file.name == request.path) else {
        return error("The selected file is not reachable from the entrypoint.");
    };
    let Some(symbol) = index.goto_definition(source_id, request.offset) else {
        return error("No compiler-resolved identifier at the rename cursor.");
    };
    use modules::symbols::SymbolKind as K;
    if !matches!(symbol.kind, K::Binding | K::Constant | K::Function |
        K::Parameter | K::RepeatIndex | K::ImportAlias)
    {
        return error("This symbol kind cannot be renamed safely in the Playground.");
    }
    let old_name = symbol.name.as_ref();
    if name == old_name {
        return error("Choose a different identifier for the rename.");
    }
    let Some(declaration) = symbol.location else {
        return error("Symbols without source declarations cannot be renamed.");
    };
    let references: Vec<_> = index.find_references(symbol.id).collect();
    if references.len() + 1 > MAX_RENAME_SITES {
        return error("Too many symbol sites to rename safely (limit: 120).");
    }
    // Compiler locations are file-local UTF-8 byte spans, not Monaco columns.
    let mut locations: BTreeMap<String, Vec<(usize, usize)>> = BTreeMap::new();
    for location in std::iter::once(declaration).chain(references.iter().map(|r| r.location)) {
        let Some(file) = index.sources().files().get(location.source) else {
            return error("Invalid compiler rename source.");
        };
        let Some(original) = request.workspace.files.get(&file.name) else {
            return error("The rename crosses outside the virtual workspace.");
        };
        if original.get(location.span.start..location.span.end) != Some(old_name) {
            return error("The compiler's rename site does not match the source identifier.");
        }
        locations.entry(file.name.clone()).or_default()
            .push((location.span.start, location.span.end));
    }
    let mut changed = request.workspace.files.clone();
    for (path, sites) in &mut locations {
        sites.sort_unstable_by(|left, right| right.0.cmp(&left.0));
        let Some(source) = changed.get_mut(path) else {
            return error("The renamed file disappeared from the virtual workspace.");
        };
        let mut prior_start = usize::MAX;
        for &(start, end) in sites.iter() {
            if start >= end || end > prior_start || source.get(start..end) != Some(old_name) {
                return error("Overlapping or stale compiler rename locations.");
            }
            source.replace_range(start..end, name);
            prior_start = start;
        }
    }
    let (new_entry, new_loader) = match load_workspace(Request {
        entry: entry.clone(),
        files: changed.clone(),
    }) {
        Ok(value) => value,
        Err(problem) => return error(problem),
    };
    // Compiler-owned static validation: no read_line(), no evaluator, no user
    // stdout, and no runtime effects. A rename cannot introduce syntax errors
    // or silently drop references to the resolved declaration.
    let revised = match modules::compile_indexed_with_loader(
        &new_entry, &new_loader, module_limits(), limits,
    ) {
        Ok(value) => value,
        Err(problem) => return compiler_error(problem),
    };
    let newer = revised.index();
    let mut renamed = newer.symbols().iter().filter(|candidate|
        candidate.name.as_ref() == name && candidate.kind == symbol.kind
        && candidate.location.is_some());
    let Some(target) = renamed.next() else {
        return error("The renamed declaration was not found in the compiled workspace.");
    };
    if renamed.next().is_some() {
        return error("The new identifier resolves to multiple declarations.");
    }
    let mut previous_kinds: Vec<_> = references.iter().map(|r| r.kind.as_str()).collect();
    let mut updated_kinds: Vec<_> = newer.find_references(target.id)
        .map(|r| r.kind.as_str()).collect();
    previous_kinds.sort_unstable();
    updated_kinds.sort_unstable();
    if previous_kinds != updated_kinds {
        return error("Renaming would change compiler-resolved symbol references.");
    }
    let changed_files: Vec<_> = locations.keys().cloned().collect();
    // Send only compiler-owned file-local UTF-8 spans. The browser independently
    // reconstructs the proposed sources from these sites before enabling Apply.
    // The list is capped by MAX_RENAME_SITES and deterministic by file/offset.
    let mut edits = Vec::with_capacity(references.len() + 1);
    for (path, sites) in &locations {
        for &(start, end) in sites.iter().rev() {
            edits.push(json!({ "path": path, "start": start, "end": end }));
        }
    }
    json!({
        "ok": true, "old_name": old_name, "new_name": name,
        "kind": symbol.kind.as_str(), "changes": references.len() + 1,
        "changed_files": changed_files, "edits": edits, "files": changed,
    }).to_string()
}

fn execute_request(json_source: &str) -> String {
    process_request(json_source, false)
}

fn check_request(json_source: &str) -> String {
    process_request(json_source, true)
}

fn process_request(json_source: &str, check_only: bool) -> String {
    // Cap the raw JSON *before* serde allocates a decoded workspace.
    if json_source.len() > MAX_REQUEST_JSON_BYTES {
        return error("The compiler request exceeds the 1 MiB JSON limit.");
    }
    let request: ExecutionRequest = match serde_json::from_str(json_source) {
        Ok(value) => value,
        Err(_) => return error("Malformed playground request."),
    };
    if request.stdin.len() > MAX_STDIN_BYTES {
        return error("Program input exceeds the 16 KiB browser limit.");
    }
    let (entry, loader) = match load_workspace(request.workspace) {
        Ok(result) => result,
        Err(problem) => return error(problem),
    };
    let limits = module_limits();
    let program = match modules::compile_with_loader(&entry, &loader, limits) {
        Ok(program) => program,
        Err(problem) => {
            let mut encoded = Vec::new();
            let diagnostic = if problem.write_json(&mut encoded).is_ok() {
                serde_json::from_slice::<Value>(&encoded).ok()
            } else {
                None
            };
            return json!({
                "ok": false,
                "stdout": "",
                "stderr": "",
                "error": problem.to_string(),
                "diagnostic": diagnostic
            }).to_string();
        }
    };
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let options = ExecutionOptions {
        limits: ExecutionLimits { max_steps: 200_000, max_prints: 1_000 },
        max_call_depth: 64,
        max_calls: 10_000,
        max_live_slots: 100_000,
        max_capture_bytes: 1024 * 1024,
        max_vector_bytes: 2 * 1024 * 1024,
        max_text_bytes: 2 * 1024 * 1024,
        max_tuple_bytes: 1024 * 1024,
    };
    // Input is supplied ONLY from this request's bounded, copied text. Never
    // borrow process stdin, user filesystem, or a remote service in WebAssembly.
    // Historical check mode evaluates selected paths but cannot read input;
    // the compiler correctly reports E0054 for a selected read_line().
    let mut stdin = std::io::Cursor::new(request.stdin.as_bytes());
    let result = if check_only {
        program.check(options).map_err(ModuleRunError::Diagnostic)
    } else {
        program.execute_with_input(
            &mut stdin, &mut stdout, &mut stderr, options,
            InputLimits {
                max_line_bytes: MAX_STDIN_BYTES,
                max_total_bytes: MAX_STDIN_BYTES,
                max_reads: 128,
            },
        )
    };
    match result {
        Ok(()) => json!({
            "ok": true,
            "stdout": String::from_utf8_lossy(&stdout),
            "stderr": String::from_utf8_lossy(&stderr)
        }).to_string(),
        Err(ModuleRunError::Diagnostic(problem)) => {
            let mut encoded = Vec::new();
            let diagnostic = if problem.write_json(&mut encoded).is_ok() {
                serde_json::from_slice::<Value>(&encoded).ok()
            } else {
                None
            };
            json!({
                "ok": false,
                "stdout": "",
                "stderr": "",
                "error": problem.to_string(),
                "diagnostic": diagnostic
            }).to_string()
        }
        Err(problem) => error(problem.to_string()),
    }
}

/// Execute an isolated in-memory Scarp module graph. No source filesystem or host
/// process execution is exposed. The calling browser owns the wall-clock timeout.
#[wasm_bindgen]
pub fn execute(request_json: &str) -> String {
    execute_request(request_json)
}

/// Validate an isolated module graph with the same interpreter budgets,
/// without returning any program stdout or stderr.
#[wasm_bindgen]
pub fn check(request_json: &str) -> String {
    check_request(request_json)
}

/// Resolve a source token to its compiler-owned declaration (not a JS guess).
/// Source coordinates are file-local UTF-8 byte offsets, not UTF-16 columns.
#[wasm_bindgen]
pub fn definition(request_json: &str) -> String {
    definition_request(request_json)
}

/// Find actual uses of one resolved symbol, including cross-file calls.
/// Symbol declarations are returned separately; no runtime execution occurs.
#[wasm_bindgen]
pub fn references(request_json: &str) -> String {
    references_request(request_json)
}

/// Compute a bounded, compiler-verified rename preview without running code.
#[wasm_bindgen]
pub fn rename(request_json: &str) -> String {
    rename_request(request_json)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request(files: &[(&str, &str)]) -> String {
        json!({
            "entry": "main.srp",
            "files": files.iter().map(|(p, s)| ((*p).to_string(), (*s).to_string()))
                .collect::<BTreeMap<_, _>>()
        }).to_string()
    }



    #[test]
    fn rename_updates_only_the_compiler_resolved_symbol_across_imports() {
        let main = "import \"left.srp\" as left; import \"right.srp\" as right; print(left.twice(7), right.twice(9));";
        let request = json!({
            "entry": "main.srp",
            "files": {
                "main.srp": main,
                "left.srp": "pub pure funcra twice(value: integer)->integer{return value * 2;}",
                "right.srp": "pub pure funcra twice(value: integer)->integer{return value + 1;}"
            },
            "path": "main.srp",
            "offset": main.find("twice(7)").unwrap(),
            "new_name": "double",
        }).to_string();
        let result: Value = serde_json::from_str(&rename_request(&request)).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["changes"], 2);
        assert_eq!(result["changed_files"], json!(["left.srp", "main.srp"]));
        assert_eq!(result["edits"].as_array().unwrap().len(), 2);
        assert_eq!(result["edits"][0]["path"], "left.srp");
        assert_eq!(result["edits"][1]["path"], "main.srp");
        for edit in result["edits"].as_array().unwrap() {
            let path = edit["path"].as_str().unwrap();
            let start = edit["start"].as_u64().unwrap() as usize;
            let end = edit["end"].as_u64().unwrap() as usize;
            let original = if path == "main.srp" { main }
                else { "pub pure funcra twice(value: integer)->integer{return value * 2;}" };
            assert_eq!(&original[start..end], "twice");
        }
        assert!(result["files"]["main.srp"].as_str().unwrap().contains("left.double(7)"));
        assert!(result["files"]["main.srp"].as_str().unwrap().contains("right.twice(9)"));
        assert!(result["files"]["left.srp"].as_str().unwrap().contains("funcra double("));
        assert!(result["files"]["right.srp"].as_str().unwrap().contains("funcra twice("));
    }

    #[test]
    fn rename_parameter_updates_named_argument_labels_and_preserves_unicode_text() {
        let main = "import \"lib.srp\" as lib; print(lib.greet(name: 4), \"😀\");";
        let request = json!({
            "entry": "main.srp",
            "files": {
                "main.srp": main,
                "lib.srp": "pub pure funcra greet(name: integer)->integer{return name + 1;}"
            },
            "path": "main.srp",
            "offset": main.find("name:").unwrap(),
            "new_name": "value",
        }).to_string();
        let result: Value = serde_json::from_str(&rename_request(&request)).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["changes"], 3);
        let edits = result["edits"].as_array().unwrap();
        assert_eq!(edits.len(), 3);
        assert!(edits.iter().any(|edit| edit["path"] == "main.srp"));
        assert!(edits.iter().any(|edit| edit["path"] == "lib.srp"));
        assert!(result["files"]["main.srp"].as_str().unwrap().contains("greet(value: 4)"));
        assert!(result["files"]["main.srp"].as_str().unwrap().contains("\"😀\""));
        assert!(result["files"]["lib.srp"].as_str().unwrap().contains("greet(value: integer)"));
        assert!(result["files"]["lib.srp"].as_str().unwrap().contains("return value + 1;"));
    }

    #[test]
    fn rename_does_not_execute_program_input_or_output() {
        let source = "bind name = read_line(); print(name);";
        let request = json!({
            "entry": "main.srp", "files": {"main.srp": source},
            "path": "main.srp", "offset": source.find("name);").unwrap(),
            "new_name": "label",
        }).to_string();
        let result: Value = serde_json::from_str(&rename_request(&request)).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert!(result["files"]["main.srp"].as_str().unwrap().contains("print(label)"));
    }

    #[test]
    fn rename_rejects_capture_keywords_builtins_and_invalid_positions() {
        let source = "bind old = 1; bind existing = 2; print(old, existing);";
        for name in ["existing", "if", "old", "not-valid", "", "a".repeat(65).as_str()] {
            let request = json!({
                "entry": "main.srp", "files": {"main.srp": source},
                "path": "main.srp", "offset": source.find("old").unwrap(),
                "new_name": name,
            }).to_string();
            let result: Value = serde_json::from_str(&rename_request(&request)).unwrap();
            assert_eq!(result["ok"], false, "name={name}: {result}");
        }
        let request = json!({
            "entry": "main.srp", "files": {"main.srp": "print(1);"},
            "path": "main.srp", "offset": 0, "new_name": "other",
        }).to_string();
        let result: Value = serde_json::from_str(&rename_request(&request)).unwrap();
        assert_eq!(result["ok"], false);
        let request = json!({
            "entry": "main.srp", "files": {"main.srp": "bind a = \"😀\"; print(a);"},
            "path": "main.srp", "offset": 11, "new_name": "other",
        }).to_string();
        let result: Value = serde_json::from_str(&rename_request(&request)).unwrap();
        assert_eq!(result["ok"], false);
    }

    #[test]
    fn rename_conservatively_rejects_unindexed_collisions() {
        let request = json!({
            "entry": "main.srp",
            "files": {
                "main.srp": "bind original = 2; print(original);",
                "other.srp": "// proposed appears in unreachable source\n"
            },
            "path": "main.srp", "offset": 5, "new_name": "proposed",
        }).to_string();
        let result: Value = serde_json::from_str(&rename_request(&request)).unwrap();
        assert_eq!(result["ok"], false);
    }

    #[test]
    fn finds_only_compiler_owned_references_across_imports() {
        let main = "import \"math.srp\" as math; print(math.twice(21)); print(math.twice(5));";
        let request = json!({
            "entry": "main.srp",
            "files": {
                "main.srp": main,
                "math.srp": "pub pure funcra twice(value: integer) -> integer { return value * 2; }"
            },
            "path": "main.srp",
            "offset": main.find("twice(21)").unwrap(),
        }).to_string();
        let reply: Value = serde_json::from_str(&references_request(&request)).unwrap();
        assert_eq!(reply["ok"], true, "{reply}");
        assert_eq!(reply["symbol"]["name"], "twice");
        assert_eq!(reply["declaration"]["path"], "math.srp");
        assert_eq!(reply["references"].as_array().unwrap().len(), 2);
        assert_eq!(reply["references"][0]["kind"], "call");
        assert!(!reply["truncated"].as_bool().unwrap());
    }

    #[test]
    fn references_do_not_conflate_same_named_functions_in_different_modules() {
        let main = r#"import "left.srp" as left;
import "right.srp" as right;
print(left.compute(7));
print(right.compute(9));"#;
        let request = json!({
            "entry": "main.srp",
            "files": {
                "main.srp": main,
                "left.srp": "pub pure funcra compute(x: integer) -> integer { return x * 2; }",
                "right.srp": "pub pure funcra compute(x: integer) -> integer { return x + 1; }",
            },
            "path": "main.srp",
            "offset": main.find("compute(7)").unwrap(),
        }).to_string();
        let reply: Value = serde_json::from_str(&references_request(&request)).unwrap();
        assert_eq!(reply["ok"], true, "{reply}");
        assert_eq!(reply["declaration"]["path"], "left.srp");
        assert_eq!(reply["references"].as_array().unwrap().len(), 1);
        assert_eq!(reply["references"][0]["kind"], "call");
    }

    #[test]
    fn reference_queries_never_run_code_or_read_input() {
        let source = "bind name = read_line(); print(name);";
        let request = json!({
            "entry": "main.srp",
            "files": { "main.srp": source },
            "path": "main.srp",
            "offset": source.find("name);").unwrap(),
        }).to_string();
        let reply: Value = serde_json::from_str(&references_request(&request)).unwrap();
        assert_eq!(reply["ok"], true, "{reply}");
        assert_eq!(reply["symbol"]["name"], "name");
        assert_eq!(reply["references"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn references_reject_invalid_utf8_offset_and_do_not_infer_missing_tokens() {
        let source = "bind name = \"😀\"; print(name);";
        let request = json!({
            "entry": "main.srp",
            "files": { "main.srp": source },
            "path": "main.srp",
            "offset": source.find("😀").unwrap() + 1,
        }).to_string();
        let invalid: Value = serde_json::from_str(&references_request(&request)).unwrap();
        assert_eq!(invalid["ok"], false);
        let empty = json!({
            "entry": "main.srp",
            "files": { "main.srp": source },
            "path": "main.srp",
            "offset": source.len(),
        }).to_string();
        let reply: Value = serde_json::from_str(&references_request(&empty)).unwrap();
        assert_eq!(reply["ok"], true);
        assert_eq!(reply["symbol"], Value::Null);
        assert_eq!(reply["references"], json!([]));
    }

    #[test]
    fn rejects_large_raw_requests_before_deserialization() {
        let oversized = " ".repeat(MAX_REQUEST_JSON_BYTES + 1);
        let response: Value = serde_json::from_str(&execute_request(&oversized)).unwrap();
        assert_eq!(response["ok"], false);
        assert!(response["error"].as_str().unwrap().contains("1 MiB JSON limit"));
    }

    #[test]
    fn runs_actual_hello_program() {
        let result: Value = serde_json::from_str(&execute_request(&request(&[
            ("main.srp", "print(\"Hello from Scarp!\");"),
        ]))).unwrap();
        assert_eq!(result["ok"], true);
        assert_eq!(result["stdout"], "Hello from Scarp!\n");
    }

    #[test]
    fn runs_bounded_unicode_input_and_tuple_conversion_without_host_stdin() {
        let request = json!({
            "entry": "main.srp",
            "files": {
                "main.srp": "bind name = read_line(); bind pair: tuple<integer, string> = (7, name); print(pair[0], text_trim(pair[1]));"
            },
            "stdin": "  नमस्ते  \r\n"
        }).to_string();
        let result: Value = serde_json::from_str(&execute_request(&request)).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "7 नमस्ते\n");
    }

    #[test]
    fn check_rejects_selected_input_without_consumer_or_partial_output() {
        let request = json!({
            "entry": "main.srp",
            "files": { "main.srp": "print(read_line());" },
            "stdin": "hello\n"
        }).to_string();
        let result: Value = serde_json::from_str(&check_request(&request)).unwrap();
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(result["diagnostic"]["code"], "E0054");
        assert_eq!(result["stdout"], "");
        assert_eq!(result["stderr"], "");
    }

    #[test]
    fn empty_input_yields_real_eof_diagnostic() {
        let result: Value = serde_json::from_str(&execute_request(
            &request(&[("main.srp", "print(read_line());")]),
        )).unwrap();
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(result["diagnostic"]["code"], "E0055");
    }

    #[test]
    fn oversized_input_rejected_before_interpreter_invocation() {
        let request = json!({
            "entry": "main.srp",
            "files": { "main.srp": "print(\"should not run\");" },
            "stdin": "x".repeat(MAX_STDIN_BYTES + 1),
        }).to_string();
        let result: Value = serde_json::from_str(&execute_request(&request)).unwrap();
        assert_eq!(result["ok"], false);
        assert!(result["error"].as_str().unwrap().contains("16 KiB"));
        assert_eq!(result["stdout"], "");
    }

    #[test]
    fn resolves_real_imported_functions() {
        let result: Value = serde_json::from_str(&execute_request(&request(&[
            ("main.srp", "import \"math.srp\" as math; print(math.twice(21));"),
            ("math.srp", "pub pure funcra twice(n: integer) -> integer { return n * 2; }"),
        ]))).unwrap();
        assert_eq!(result["ok"], true);
        assert_eq!(result["stdout"], "42\n");
    }

    #[test]
    fn returns_compiler_diagnostics_instead_of_fake_output() {
        let result: Value = serde_json::from_str(&execute_request(&request(&[
            ("main.srp", "print(unknown_variable);"),
        ]))).unwrap();
        assert_eq!(result["ok"], false);
        assert_eq!(result["diagnostic"]["schema_version"], 1);
        assert_eq!(result["diagnostic"]["code"], "E0010");
    }

    #[test]
    fn preserves_real_imported_module_source_in_structured_diagnostics() {
        let result: Value = serde_json::from_str(&execute_request(&request(&[
            ("main.srp", "import \"lib/math.srp\" as math; print(math.twice(21));"),
            ("lib/math.srp", "pub pure funcra twice(n: integer) -> integer { return missing; }"),
        ]))).unwrap();
        assert_eq!(result["ok"], false);
        assert_eq!(result["diagnostic"]["schema_version"], 1);
        assert_eq!(result["diagnostic"]["code"], "E0010");
        assert_eq!(result["diagnostic"]["primary"]["path"], "lib/math.srp");
        assert_eq!(result["diagnostic"]["column_encoding"], "unicode-scalar");
        assert_eq!(result["diagnostic"]["span_encoding"], "utf-8-bytes");
        assert_eq!(result["diagnostic"]["position_base"], 1);
    }

    #[test]
    fn preserves_unicode_scalar_diagnostic_contract_after_non_bmp_text() {
        let result: Value = serde_json::from_str(&execute_request(&request(&[
            ("main.srp", "print(\"😀\"); print(missing);"),
        ]))).unwrap();
        assert_eq!(result["ok"], false);
        assert_eq!(result["diagnostic"]["code"], "E0010");
        assert_eq!(result["diagnostic"]["primary"]["path"], "main.srp");
        assert_eq!(result["diagnostic"]["primary"]["start"]["line"], 1);
        assert_eq!(result["diagnostic"]["column_encoding"], "unicode-scalar");
    }

    #[test]
    fn keeps_execution_budget_errors_bounded() {
        let result: Value = serde_json::from_str(&execute_request(&request(&[
            ("main.srp", "var n = 0; while n < 1000000 { n += 1; }"),
        ]))).unwrap();
        assert_eq!(result["ok"], false);
        assert_eq!(result["diagnostic"]["code"], "E0017");
        assert_eq!(result["stdout"], "");
    }

    #[test]
    fn rejects_missing_virtual_import_without_fake_output() {
        let result: Value = serde_json::from_str(&execute_request(&request(&[
            ("main.srp", "import \"missing.srp\" as missing; print(1);"),
        ]))).unwrap();
        assert_eq!(result["ok"], false);
        assert_eq!(result["stdout"], "");
        assert_ne!(result["diagnostic"], Value::Null);
    }

    fn stressed(source: &str) -> Value {
        serde_json::from_str(&execute_request(&request(&[("main.srp", source)]))).unwrap()
    }

    fn assert_atomic_failure(result: &Value) {
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(result["stdout"], "", "{result}");
        assert_eq!(result["stderr"], "", "{result}");
        assert_eq!(result["diagnostic"]["schema_version"], 1, "{result}");
        assert!(result["diagnostic"]["code"].as_str().is_some(), "{result}");
    }

    #[test]
    fn print_count_limit_is_atomic_even_after_many_selected_writes() {
        let result = stressed("repeat 1200 as index { print(\"x\"); }");
        assert_atomic_failure(&result);
        assert_eq!(result["diagnostic"]["code"], "E0018");
    }

    #[test]
    fn buffered_output_limit_is_atomic_across_repeated_large_snapshots() {
        // The materialized text is only 60 KiB; 20 selected 60 KiB prints
        // exhaust the 1 MiB cumulative output-capture allowance.
        let result = stressed(
            "bind chunk = text_repeat(\"x\", 60000); repeat 20 as index { print(chunk); }",
        );
        assert_atomic_failure(&result);
        assert_eq!(result["diagnostic"]["code"], "E0029");
    }

    #[test]
    fn recursive_call_depth_limit_is_bounded_and_rollback_is_atomic() {
        let result = stressed(
            "pure funcra dive(n: integer) -> integer { if n == 0 { return 0; } return 1 + dive(n - 1); } print(\"before\"); print(dive(1000));",
        );
        assert_atomic_failure(&result);
        assert_eq!(result["diagnostic"]["code"], "E0027");
    }

    #[test]
    fn large_text_construction_fails_without_releasing_partial_output() {
        // Work can reject first, before the interpreter reaches its separate
        // 1 MiB per-string and 2 MiB cumulative text quotas.
        let result = stressed("print(\"before\"); print(text_repeat(\"é\", 600000));");
        assert_atomic_failure(&result);
        assert!(matches!(
            result["diagnostic"]["code"].as_str(),
            Some("E0017" | "E0048")
        ));
    }

    #[test]
    fn oversized_vector_request_is_rejected_without_partial_output() {
        // The deterministic work quota can reject this before the independent
        // 2 MiB numerical payload budget. Both are bounded failure paths.
        let result = stressed("print(\"before\"); print(fill(1.0, 280000));");
        assert_atomic_failure(&result);
        // The parser, vector-length checks, interpreter work budget and
        // payload quota are independent. Whichever rejects first, the bridge
        // must return a real diagnostic and no buffered output.
    }

    #[test]
    fn nested_module_pressure_rejects_excessive_import_depth_atomically() {
        let mut files: Vec<(String, String)> = Vec::new();
        files.push((
            "main.srp".to_string(),
            "import \"m1.srp\" as m; print(\"should not appear\");".to_string(),
        ));
        for index in 1..=9 {
            files.push((
                format!("m{index}.srp"),
                if index < 9 {
                    format!("import \"m{}.srp\" as next; pub bind value = 1;", index + 1)
                } else {
                    "pub bind value = 1;".to_string()
                },
            ));
        }
        let refs: Vec<(&str, &str)> = files
            .iter()
            .map(|(path, source)| (path.as_str(), source.as_str()))
            .collect();
        let result: Value = serde_json::from_str(&execute_request(&request(&refs))).unwrap();
        assert_atomic_failure(&result);
    }

    #[test]
    fn a_failed_bounded_execution_never_poisoned_the_next_workspace() {
        for source in [
            "repeat 1200 as index { print(\"x\"); }",
            "pure funcra dive(n: integer) -> integer { return dive(n + 1); } print(dive(0));",
        ] {
            assert_atomic_failure(&stressed(source));
            let next = stressed("print(\"recovered\");");
            assert_eq!(next["ok"], true);
            assert_eq!(next["stdout"], "recovered\n");
            assert_eq!(next["stderr"], "");
        }
    }

    #[test]
    fn check_validates_without_replaying_stdout_or_stderr() {
        let input = request(&[("main.srp", "print(\"silent\"); eprint(\"also silent\");")]);
        let checked: Value = serde_json::from_str(&check_request(&input)).unwrap();
        assert_eq!(checked["ok"], true);
        assert_eq!(checked["stdout"], "");
        assert_eq!(checked["stderr"], "");
        let executed: Value = serde_json::from_str(&execute_request(&input)).unwrap();
        assert_eq!(executed["stdout"], "silent\n");
        assert_eq!(executed["stderr"], "also silent\n");
    }

    #[test]
    fn check_rejects_invalid_imports_and_preserves_real_locations() {
        let response: Value = serde_json::from_str(&check_request(&request(&[
            ("main.srp", "import \"math.srp\" as math; print(math.twice(4));"),
            ("math.srp", "pub pure funcra twice(n: integer) -> integer { return missing; }"),
        ]))).unwrap();
        assert_atomic_failure(&response);
        assert_eq!(response["diagnostic"]["code"], "E0010");
        assert_eq!(response["diagnostic"]["primary"]["path"], "math.srp");
    }

    #[test]
    fn check_enforces_runtime_budgets_without_output() {
        let response: Value = serde_json::from_str(&check_request(&request(&[
            ("main.srp", "repeat 1200 as index { print(\"silent\"); }"),
        ]))).unwrap();
        assert_atomic_failure(&response);
        assert_eq!(response["diagnostic"]["code"], "E0018");
    }

    #[test]
    fn executes_rms_added_in_scarp_alpha_six() {
        let response = stressed("print(rms([2.0, -2.0]));");
        assert_eq!(response["ok"], true, "{response}");
        assert_eq!(response["stdout"], "2.0\n");
    }


    #[test]
    fn executes_published_alpha4_scientific_examples() {
        // Expected output matches the official alpha.4 .stdout fixtures.
        let cases = [
            ("bind time = [0.0, 1.0, 3.0]; bind velocity = [0.0, 2.0, 6.0]; print(sample_area(time, velocity)); print(sample_slopes(time, velocity));", "9.0\n[2.0, 2.0]\n"),
            ("bind time = [0.0, 1.0, 3.0, 4.0]; bind speed = [0.0, 2.0, 6.0, 8.0]; print(sample_cumulative_area(time, speed)); print(sample_area(time, speed));", "[0.0, 1.0, 9.0, 16.0]\n16.0\n"),
            ("bind direction = [3.0, 4.0]; print(cosine_similarity(direction, [6.0, 8.0])); print(cosine_similarity([1.0, 0.0], [0.0, 1.0])); print(cosine_similarity([3.0], [-4.0]));", "1.0\n0.0\n-1.0\n"),
        ];
        for (source, expected) in cases {
            let response = stressed(source);
            assert_eq!(response["ok"], true, "{response}");
            assert_eq!(response["stdout"], expected);
        }
    }

    #[test]
    fn alpha4_rejects_invalid_cosine_domain_without_partial_output() {
        let response = stressed("print(\"before\"); print(cosine_similarity([0.0, 0.0], [1.0, 2.0]));");
        assert_atomic_failure(&response);
    }

    fn definition_test(files: &[(&str, &str)], path: &str, offset: usize) -> Value {
        let input = request(files);
        let mut request: Value = serde_json::from_str(&input).unwrap();
        request["path"] = json!(path);
        request["offset"] = json!(offset);
        serde_json::from_str(&definition_request(&request.to_string())).unwrap()
    }

    #[test]
    fn definition_uses_the_real_cross_module_index_without_execution() {
        let main = "import \"lib/math.srp\" as math; print(math.twice(21));";
        let module = "pub pure funcra twice(n: integer) -> integer { return n * 2; }";
        let offset = main.find("twice(21)").unwrap();
        let result = definition_test(
            &[("main.srp", main), ("lib/math.srp", module)],
            "main.srp", offset,
        );
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["target"]["path"], "lib/math.srp");
        assert_eq!(result["target"]["start"]["line"], 1);
        assert!(result["target"]["start"]["column"].as_u64().unwrap() > 1);
    }

    #[test]
    fn definition_handles_missing_tokens_and_unreachable_files_without_running() {
        let main = "bind value = 3; print(value); print(1 / 0);";
        let empty = definition_test(
            &[("main.srp", main)], "main.srp", main.len(),
        );
        assert_eq!(empty["ok"], true, "{empty}");
        assert_eq!(empty["target"], Value::Null);
        let unrelated = definition_test(
            &[("main.srp", main), ("hidden.srp", "bind x = 1;")],
            "hidden.srp", 5,
        );
        assert_eq!(unrelated["ok"], true, "{unrelated}");
        assert_eq!(unrelated["target"], Value::Null);
    }

    #[test]
    fn definition_respects_unicode_offsets_and_rejects_non_boundaries() {
        let main = "print(\"😀\"); bind value = 3; print(value);";
        let token = main.rfind("value").unwrap();
        let result = definition_test(&[("main.srp", main)], "main.srp", token);
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["target"]["path"], "main.srp");
        let invalid = definition_test(&[("main.srp", main)], "main.srp", 8);
        assert_eq!(invalid["ok"], false, "{invalid}");
    }

    #[test]
    fn definition_does_not_leak_partial_index_for_compiler_errors() {
        let main = "import \"lib/math.srp\" as math; print(math.twice(3));";
        let module = "pub pure funcra twice(n: integer) -> integer { return missing; }";
        let result = definition_test(
            &[("main.srp", main), ("lib/math.srp", module)],
            "main.srp", main.find("twice(3)").unwrap(),
        );
        assert_eq!(result["ok"], false);
        assert_eq!(result["diagnostic"]["code"], "E0010");
        assert_eq!(result["diagnostic"]["primary"]["path"], "lib/math.srp");
        assert_eq!(result["target"], Value::Null);
    }

    #[test]
    fn definition_index_limits_are_bounded_and_atomic() {
        let mut main = String::new();
        for i in 0..4100 {
            main.push_str(&format!("bind a{i}=0;"));
        }
        let result = definition_test(&[("main.srp", &main)], "main.srp", 5);
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(result["diagnostic"]["code"], "E0050");
        assert_eq!(result["target"], Value::Null);
    }

    #[test]
    fn rejects_nonexistent_entry_without_running() {
        let result: Value = serde_json::from_str(
            &execute_request(r#"{"entry":"no.srp","files":{"main.srp":"print(1);"}} "#)
        ).unwrap();
        assert_eq!(result["ok"], false);
    }
    /// Compiler alpha.2 adds opt-in caches. The Playground deliberately uses
    /// cold, disposable module graphs; edits must never inherit stale results.
    #[test]
    fn alpha_two_fresh_workspace_edits_do_not_reuse_old_compiler_results() {
        let main = "import \"lib/ops.srp\" as ops; print(ops.twice(21));";
        let valid = "pub pure funcra twice(n: integer) -> integer { return n * 2; }";
        let edited = "pub pure funcra twice(n: integer) -> integer { return n * 3; }";
        let invalid = "pub pure funcra twice(n: integer) -> integer { return missing; }";
        let original = request(&[("main.srp", main), ("lib/ops.srp", valid)]);
        let changed = request(&[("main.srp", main), ("lib/ops.srp", edited)]);
        let corrupted = request(&[("main.srp", main), ("lib/ops.srp", invalid)]);

        let first: Value = serde_json::from_str(&execute_request(&original)).unwrap();
        assert_eq!(first["ok"], true, "{first}");
        assert_eq!(first["stdout"], "42\n");

        let next: Value = serde_json::from_str(&execute_request(&changed)).unwrap();
        assert_eq!(next["ok"], true, "{next}");
        assert_eq!(next["stdout"], "63\n");
        let checked: Value = serde_json::from_str(&check_request(&changed)).unwrap();
        assert_eq!(checked["ok"], true, "{checked}");
        assert_eq!(checked["stdout"], "");
        assert_eq!(checked["stderr"], "");

        let broken: Value = serde_json::from_str(&execute_request(&corrupted)).unwrap();
        assert_eq!(broken["ok"], false, "{broken}");
        assert_eq!(broken["diagnostic"]["code"], "E0010");
        assert_eq!(broken["diagnostic"]["primary"]["path"], "lib/ops.srp");
        assert_eq!(broken["stdout"], "");
        assert_eq!(broken["stderr"], "");

        let lookup = definition_test(
            &[("main.srp", main), ("lib/ops.srp", edited)],
            "main.srp",
            main.find("twice(21)").unwrap(),
        );
        assert_eq!(lookup["ok"], true, "{lookup}");
        assert_eq!(lookup["target"]["path"], "lib/ops.srp");

        // Reusing the previous source in another request must still work.
        let restored: Value = serde_json::from_str(&execute_request(&original)).unwrap();
        assert_eq!(restored["ok"], true, "{restored}");
        assert_eq!(restored["stdout"], "42\n");
    }

    /// Exact-output fixtures from the published Scarp v0.0.6-alpha.3 source.
    #[test]
    fn alpha_three_topk_fixture_runs_and_check_is_silent() {
        let source = r#"// Deterministic candidate ranking for finite model scores.
bind scores = [1.0, 5.0, 5.0, -2.0, 3.0];
print(topk(scores, 3));
print(topk_values(scores, 3));
print(topk(softmax(scores), 2));
print(topk([], 0));
"#;
        let payload = request(&[("main.srp", source)]);
        let run: Value = serde_json::from_str(&execute_request(&payload)).unwrap();
        assert_eq!(run["ok"], true, "{run}");
        assert_eq!(run["stdout"], "[integer: 1, 2, 4]\n[5.0, 5.0, 3.0]\n[integer: 1, 2]\n[integer:]\n");
        let checked: Value = serde_json::from_str(&check_request(&payload)).unwrap();
        assert_eq!(checked["ok"], true, "{checked}");
        assert_eq!(checked["stdout"], "");
        assert_eq!(checked["stderr"], "");

        let invalid = request(&[("main.srp", "print(topk([1.0], 2));")]);
        let rejected: Value = serde_json::from_str(&execute_request(&invalid)).unwrap();
        assert_eq!(rejected["ok"], false, "{rejected}");
        assert_eq!(rejected["diagnostic"]["code"], "E0033");
        assert_eq!(rejected["stdout"], "");
    }

    #[test]
    fn alpha_three_temperature_fixture_and_invalid_domain_are_atomic() {
        let source = r#"// Temperature controls softmax concentration without random sampling.
print(softmax_temp([2.0, 2.0], 0.5));
print(logsoftmax_temp([5.0], 2.0));
bind logits = [1.0, 4.0, 4.0, 2.0];
print(topk(softmax_temp(logits, 0.5), 3));
"#;
        let payload = request(&[("main.srp", source)]);
        let run: Value = serde_json::from_str(&execute_request(&payload)).unwrap();
        assert_eq!(run["ok"], true, "{run}");
        assert_eq!(run["stdout"], "[0.5, 0.5]\n[0.0]\n[integer: 1, 2, 3]\n");
        let checked: Value = serde_json::from_str(&check_request(&payload)).unwrap();
        assert_eq!(checked["ok"], true, "{checked}");
        assert_eq!(checked["stdout"], "");
        assert_eq!(checked["stderr"], "");

        let invalid = request(&[("main.srp", "print(\"before\"); print(softmax_temp([1.0], 0.0));")]);
        let rejected: Value = serde_json::from_str(&execute_request(&invalid)).unwrap();
        assert_eq!(rejected["ok"], false, "{rejected}");
        assert_eq!(rejected["diagnostic"]["code"], "E0034");
        assert_eq!(rejected["stdout"], "");
        assert_eq!(rejected["stderr"], "");
    }

}

#[cfg(test)]
mod fuzz_regression;
