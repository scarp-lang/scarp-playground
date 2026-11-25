//! Browser bridge to the real Scarp interpreter, pinned to published v0.0.7-alpha.1.
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
const MAX_CAPTURE_BYTES: usize = 1024 * 1024;

/// Prompt writes are immediate in the upstream interactive API and may
/// otherwise bypass the interpreter's transactional output-event budget.
/// Give both streams one independent, enforced 1 MiB memory ceiling.
struct BrowserCapture {
    bytes: Vec<u8>,
    total: std::rc::Rc<std::cell::Cell<usize>>,
}
impl BrowserCapture {
    fn new(total: std::rc::Rc<std::cell::Cell<usize>>) -> Self {
        Self { bytes: Vec::new(), total }
    }
}
impl std::io::Write for BrowserCapture {
    fn write(&mut self, chunk: &[u8]) -> std::io::Result<usize> {
        if chunk.len() > MAX_CAPTURE_BYTES.saturating_sub(self.total.get()) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other, "Browser output exceeded its 1 MiB limit.",
            ));
        }
        self.bytes.extend_from_slice(chunk);
        self.total.set(self.total.get() + chunk.len());
        Ok(chunk.len())
    }
    fn flush(&mut self) -> std::io::Result<()> { Ok(()) }
}


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
    #[serde(default, rename = "allowPrompts")]
    allow_prompts: bool,
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

/// Compile and resolve without evaluating user program statements.
/// Compile-time constant evaluation may still occur under the compiler's
/// bounded constant-expression rules; this is not an interpreter run.
fn verify_request(json_source: &str) -> String {
    if json_source.len() > MAX_REQUEST_JSON_BYTES {
        return error("The compiler request exceeds the 1 MiB JSON limit.");
    }
    let request: Request = match serde_json::from_str(json_source) {
        Ok(request) => request,
        Err(_) => return error("Malformed playground request."),
    };
    let (entry, loader) = match load_workspace(request) {
        Ok(loaded) => loaded,
        Err(problem) => return error(problem),
    };
    match modules::compile_with_loader(&entry, &loader, module_limits()) {
        Ok(_) => json!({ "ok": true, "stdout": "", "stderr": "" }).to_string(),
        Err(problem) => compiler_error(problem),
    }
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
    let captured = std::rc::Rc::new(std::cell::Cell::new(0));
    let mut stdout = BrowserCapture::new(std::rc::Rc::clone(&captured));
    let mut stderr = BrowserCapture::new(captured);
    let options = ExecutionOptions {
        limits: ExecutionLimits { max_steps: 200_000, max_prints: 1_000 },
        max_call_depth: 64,
        max_calls: 10_000,
        max_live_slots: 100_000,
        max_capture_bytes: 1024 * 1024,
        max_vector_bytes: 2 * 1024 * 1024,
        max_text_bytes: 2 * 1024 * 1024,
        max_tuple_bytes: 1024 * 1024,
        // Tighter than upstream defaults: browser quotas are logical limits,
        // not a physical Worker memory cap or protection against process OOM.
        max_bigint_digits: 2_048,
        max_bigint_bytes: 256 * 1024,
        // Alpha.10 adds cumulative immutable array allocations.
        // This logical budget is not a physical WASM memory cap.
        max_array_bytes: 1024 * 1024,
    };
    // Input is supplied ONLY from this request's bounded, copied text. Never
    // borrow process stdin, user filesystem, or a remote service in WebAssembly.
    // Historical check mode evaluates selected paths but cannot read input;
    // the compiler correctly reports E0054 for a selected read_line().
    let mut stdin = std::io::Cursor::new(request.stdin.as_bytes());
    let result = if check_only {
        program.check(options).map_err(ModuleRunError::Diagnostic)
    } else {
        let input_limits = InputLimits {
            max_line_bytes: MAX_STDIN_BYTES,
            max_total_bytes: MAX_STDIN_BYTES,
            max_reads: 128,
        };
        if request.allow_prompts {
            // The only prompt writer is bounded in-memory stdout; no real
            // terminal, process stdin, or browser callback is accessible.
            program.execute_with_interactive_input(
                &mut stdin, &mut stdout, &mut stderr, options, input_limits,
            )
        } else {
            program.execute_with_input(
                &mut stdin, &mut stdout, &mut stderr, options, input_limits,
            )
        }
    };
    match result {
        Ok(()) => json!({
            "ok": true,
            "stdout": String::from_utf8_lossy(&stdout.bytes),
            "stderr": String::from_utf8_lossy(&stderr.bytes)
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

/// Compile, resolve and type-check a virtual project without running
/// program statements, input functions, assertions or runtime print calls.
#[wasm_bindgen]
pub fn verify(request_json: &str) -> String {
    verify_request(request_json)
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
mod alpha13;

#[cfg(test)]
mod alpha14;

#[cfg(test)]
mod alpha15;

#[cfg(test)]
mod alpha16;
#[cfg(test)]
mod alpha17;
#[cfg(test)]
mod alpha18;
#[cfg(test)]
mod alpha19;
#[cfg(test)]
mod alpha20;

#[cfg(test)]
mod v007_alpha1;

#[cfg(test)]
mod bigint_capacity;

#[cfg(test)]
mod buffered_prompts;

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
    fn static_verify_does_not_run_assertions_or_read_stdin() {
        for source in [
            r#"print("side effect"); assert(false, "reachable failure");"#,
            r#"print(read_line());"#,
            r#"print(decimal("not a number"));"#,
        ] {
            let input = request(&[("main.srp", source)]);
            let verified: Value = serde_json::from_str(&verify_request(&input)).unwrap();
            assert_eq!(verified["ok"], true, "{verified}");
            assert_eq!(verified["stdout"], "", "{verified}");
            assert_eq!(verified["stderr"], "", "{verified}");
        }
        let runtime: Value = serde_json::from_str(&check_request(&request(&[
            ("main.srp", r#"assert(false, "reached");"#),
        ]))).unwrap();
        assert_eq!(runtime["diagnostic"]["code"], "E0065", "{runtime}");
    }

    #[test]
    fn static_verify_reports_real_compiler_diagnostics_without_executing() {
        for (entry, error_path) in [
            (r#"print(missing_symbol);"#, "main.srp"),
            (r#"import "lib/missing.srp" as missing; print(1);"#, "main.srp"),
        ] {
            let result: Value = serde_json::from_str(&verify_request(&request(&[
                ("main.srp", entry),
            ]))).unwrap();
            assert_eq!(result["ok"], false, "{result}");
            assert_eq!(result["stdout"], "", "{result}");
            assert_eq!(result["stderr"], "", "{result}");
            assert_eq!(result["diagnostic"]["schema_version"], 1, "{result}");
            assert_eq!(result["diagnostic"]["primary"]["path"], error_path, "{result}");
        }
    }

    #[test]
    fn static_verify_enforces_workspace_json_and_module_limits() {
        let excessive = "x".repeat(MAX_REQUEST_JSON_BYTES + 1);
        let failure: Value = serde_json::from_str(&verify_request(&excessive)).unwrap();
        assert_eq!(failure["ok"], false);
        let missing_entry = json!({"entry":"main.srp","files":{"a.srp":"print(1);"}}).to_string();
        let rejected: Value = serde_json::from_str(&verify_request(&missing_entry)).unwrap();
        assert_eq!(rejected["ok"], false, "{rejected}");
    }

    #[test]
    fn alpha12_data_destructure_matches_published_output() {
        let program = "// Structural destructuring evaluates one initializer for multiple bindings.\npure funcra make_pair(value: integer) -> tuple<integer, string> {\n    return (value * 2, \"ready\");\n}\n\nbind (result, state) = make_pair(21);\nprint(result, state);\n\nvar [first, second, third] = [array: 3, 5, 7];\nfirst += second;\nprint(first, third);\n\n// The underscore ignores the corresponding element, without storing it.\nbind (_, answer) = (true, 42);\nprint(answer);\n\n{\n    bind (result, note) = (5, \"inner\");\n    print(result, note);\n}\nprint(result);\n\nbind ([(quantity, unit_price), (_, spare_price)], currency) =\n    ([array: (2, 15), (1, 7)], \"INR\");\nprint(quantity * unit_price + spare_price, currency);\n";
        let result: Value = serde_json::from_str(&execute_request(
            &request(&[("main.srp", program)]),
        )).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "42 ready\n8 7\n42\n5 inner\n42\n37 INR\n", "{result}");
        assert_eq!(result["stderr"], "", "{result}");
    }

    #[test]
    fn alpha12_typed_dynamic_lists_matches_published_output() {
        let program = "// Source-level typed dynamic lists: immutable values with a length-independent type.\n// Every binding retains a snapshot and list indexing is checked at runtime.\nrecord Task {\n    title: string,\n    done: boolean,\n}\n\npure funcra first_title(tasks: list<record Task>) -> string {\n    return tasks[0]->title;\n}\n\nbind one: list<record Task> = [list:\n    new Task { title: \"Draft\", done: false },\n    new Task { title: \"Review\", done: true },\n];\nbind unchanged = one;\n\nvar tasks: list<record Task> = one;\nprint(\"First\", first_title(tasks));\ntasks = [list:\n    new Task { title: \"Ready\", done: true },\n    new Task { title: \"Review\", done: true },\n    new Task { title: \"Publish\", done: false },\n];\nassert(unchanged[0]->title == \"Draft\");\nprint(\"Updated\", first_title(tasks), tasks[2]->title);\nbind empty: list<integer> = [list: <integer>];\nprint(\"Empty\", empty);\nbind nested: list<list<integer>> = [list: [list: 1, 2], [list: 3]];\nprint(\"Nested\", nested[0][1], nested[1][0]);\n";
        let result: Value = serde_json::from_str(&execute_request(
            &request(&[("main.srp", program)]),
        )).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "First Draft\nUpdated Ready Publish\nEmpty [list: <integer>]\nNested 2 3\n", "{result}");
        assert_eq!(result["stderr"], "", "{result}");
    }

    #[test]
    fn alpha12_typed_maps_matches_published_output() {
        let program = "// Typed, immutable maps have canonical ordering irrespective of source order.\npure funcra labels() -> map<string, integer> {\n    return [map: \"z\": 9, \"a\": 1];\n}\n\nbind original = labels();\nbind reversed = [map: \"a\": 1, \"z\": 9];\nprint(original);\nprint(original == reversed);\nbind empty: map<integer, string> = [map: <integer, string>];\nprint(empty);\nbind features: map<boolean, string> = [map: true: \"enabled\", false: \"disabled\"];\nprint(features);\nbind nested: map<integer, list<integer>> = [map:\n    2: [list: 1, 2],\n    1: [list: 3],\n];\nprint(nested);\n";
        let result: Value = serde_json::from_str(&execute_request(
            &request(&[("main.srp", program)]),
        )).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "[map: \"a\": 1, \"z\": 9]\ntrue\n[map: <integer, string>]\n[map: false: \"disabled\", true: \"enabled\"]\n[map: 1: [list: 3], 2: [list: 1, 2]]\n", "{result}");
        assert_eq!(result["stderr"], "", "{result}");
    }

    #[test]
    fn alpha12_typed_propagation_matches_published_output() {
        let program = "// Development-only: explicit propagation from immutable bindings.\nrecord Task { title: string }\n\npure funcra validate_title(value: option<string>) -> result<string, string> {\n    match on value {\n        case None { return new result<string, string>::Err(\"title missing\"); }\n        case Some(title) {\n            if title == \"\" {\n                return new result<string, string>::Err(\"title empty\");\n            }\n            return new result<string, string>::Ok(title);\n        }\n    }\n}\n\n// Failure skips the remaining body and returns Err from this function.\n// The successful payload is bound to title, with no unchecked extraction.\npure funcra submit(value: option<string>) -> result<record Task, string> {\n    bind title: string = validate_title(value)?;\n    return new result<record Task, string>::Ok(new Task { title: title });\n}\n\n// Absence also propagates between distinct Option payload types.\npure funcra has_title(value: option<string>) -> option<boolean> {\n    bind title = value?;\n    return new option<boolean>::Some(title != \"\");\n}\n\nfuncra present(outcome: result<record Task, string>) -> unit {\n    match on outcome {\n        case Ok(task) { print(\"Saved\", task->title); }\n        case Err(message) { print(\"Rejected\", message); }\n    }\n}\n\npresent(submit(new option<string>::Some(\"Review PR\")));\npresent(submit(new option<string>::Some(\"\")));\npresent(submit(new option<string>::None()));\nmatch on has_title(new option<string>::None()) {\n    case None { print(\"No title\"); }\n    case Some(value) { print(value); }\n}\nmatch on has_title(new option<string>::Some(\"Ready\")) {\n    case None { print(\"No title\"); }\n    case Some(value) { print(value); }\n}\n";
        let result: Value = serde_json::from_str(&execute_request(
            &request(&[("main.srp", program)]),
        )).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "Saved Review PR\nRejected title empty\nRejected title missing\nNo title\ntrue\n", "{result}");
        assert_eq!(result["stderr"], "", "{result}");
    }

    #[test]
    fn alpha12_map_projections_matches_published_output() {
        let program = "// Maps expose their canonical ordering as immutable typed lists.\npure funcra ordered_labels(items: map<string, integer>) -> list<string> {\n    return map_keys(items);\n}\n\nbind mixed = [map: \"z\": 9, \"a\": 1, \"m\": 5];\nbind keys: list<string> = ordered_labels(mixed);\nbind values: list<integer> = map_values(mixed);\nprint(keys);\nprint(values);\nprint(keys[0], values[0]);\nprint(map_len(mixed));\n\nbind none: map<integer, string> = [map: <integer, string>];\nprint(map_keys(none));\nprint(map_values(none));\n\nbind boolean_keys = [map: true: \"enabled\", false: \"disabled\"];\nprint(map_keys(boolean_keys));\nprint(map_values(boolean_keys));\n";
        let result: Value = serde_json::from_str(&execute_request(
            &request(&[("main.srp", program)]),
        )).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "[list: \"a\", \"m\", \"z\"]\n[list: 1, 5, 9]\na 1\n3\n[list: <integer>]\n[list: <string>]\n[list: false, true]\n[list: \"disabled\", \"enabled\"]\n", "{result}");
        assert_eq!(result["stderr"], "", "{result}");
    }

    #[test]
    fn alpha12_task_board_imports_records_variants_and_collections() {
        let input = request(&[
            ("main.srp", "import \"board.srp\" as tasks;\n\nbind initial = tasks.empty();\nvar board = initial;\nmatch on tasks.apply(board, new tasks.Action::Add(new option<string>::Some(\"Review PR\"))) {\n    case Ok(next) { board = next; print(\"Created Review PR\"); }\n    case Err(message) { print(message); }\n}\nmatch on tasks.apply(board, new tasks.Action::Complete(\"Review PR\")) {\n    case Ok(next) { board = next; }\n    case Err(message) { print(message); }\n}\nmatch on tasks.find(board, \"Review PR\") {\n    case Some(task) { print(task->title, task->done); }\n    case None { print(\"Task missing\"); }\n}\nmatch on tasks.apply(board, new tasks.Action::Complete(\"Missing\")) {\n    case Ok(_) { print(\"Unexpected success\"); }\n    case Err(message) { print(\"Rejected\", message); }\n}\nprint(\"Original size\", list_len(initial->tasks));\n"),
            ("board.srp", "// A bounded task store with an exact-title index and pure transitions.\npub record Task {\n    title: string,\n    done: boolean,\n}\n\npub record Board {\n    tasks: list<record Task>,\n    positions: map<string, integer>,\n}\n\npub variant Action {\n    Add(option<string>),\n    Complete(string),\n}\n\npub pure funcra empty() -> record Board {\n    return new Board {\n        tasks: [list: <record Task>],\n        positions: [map: <string, integer>],\n    };\n}\n\npub pure funcra find(board: record Board, title: string) -> option<record Task> {\n    if not map_contains(board->positions, title) {\n        return new option<record Task>::None();\n    }\n    bind index = map_get_or(board->positions, title, 0);\n    return new option<record Task>::Some(board->tasks[index]);\n}\n\npure funcra accept_title(input: option<string>) -> result<string, string> {\n    match on input {\n        case None { return new result<string, string>::Err(\"title missing\"); }\n        case Some(title) {\n            if title == \"\" {\n                return new result<string, string>::Err(\"title empty\");\n            }\n            return new result<string, string>::Ok(title);\n        }\n    }\n}\n\npub pure funcra apply(board: record Board, action: variant Action) -> result<record Board, string> {\n    match on action {\n        case Add(input) {\n            bind title = accept_title(input)?;\n            if map_contains(board->positions, title) {\n                return new result<record Board, string>::Err(\"task already exists\");\n            }\n            bind index = list_len(board->tasks);\n            if index >= 128 {\n                return new result<record Board, string>::Err(\"board is full\");\n            }\n            return new result<record Board, string>::Ok(new Board {\n                tasks: list_push(board->tasks, new Task { title: title, done: false }),\n                positions: map_set(board->positions, title, index),\n            });\n        }\n        case Complete(title) {\n            match on find(board, title) {\n                case None {\n                    return new result<record Board, string>::Err(\"task not found\");\n                }\n                case Some(task) {\n                    if task->done {\n                        return new result<record Board, string>::Ok(board);\n                    }\n                    bind index = map_get_or(board->positions, title, 0);\n                    return new result<record Board, string>::Ok(new Board {\n                        tasks: list_set(board->tasks, index, new Task { title: title, done: true }),\n                        positions: board->positions,\n                    });\n                }\n            }\n        }\n    }\n}\n"),
        ]);
        let checked: Value = serde_json::from_str(&verify_request(&input)).unwrap();
        assert_eq!(checked["ok"], true, "{checked}");
        let result: Value = serde_json::from_str(&execute_request(&input)).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "Created Review PR\nReview PR true\nRejected task not found\nOriginal size 0\n", "{result}");
        assert_eq!(result["stderr"], "", "{result}");
    }

    #[test]
    fn alpha12_duplicate_map_key_errors_are_atomic() {
        let source = r#"print("before");
bind items = [map: "repeat": 1, "repeat": 2];
print(items);"#;
        let result: Value = serde_json::from_str(&execute_request(
            &request(&[("main.srp", source)]),
        )).unwrap();
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(result["diagnostic"]["code"], "E0082", "{result}");
        assert_eq!(result["stdout"], "", "{result}");
        assert_eq!(result["stderr"], "", "{result}");
    }

    #[test]
    fn alpha11_decimal_fixture_has_exact_published_output() {
        let source = r#"pure funcra taxed(price: decimal, rate: decimal) -> decimal {
    return price + price * rate;
}
bind total: decimal = taxed(decimal("199.99"), decimal("0.18"));
bind scores: array<decimal, 2> = [array: decimal("0.1"), decimal("0.2")];
print(decimal_format(total, 2, "half_even"));
print(scores[0] + scores[1]);
print(decimal_div_rounded(decimal("1"), decimal("3"), 2, "half_even"));
"#;
        let result: Value = serde_json::from_str(&execute_request(
            &request(&[("main.srp", source)]),
        )).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "235.99\n0.3\n0.33\n");
        assert_eq!(result["stderr"], "");
    }

    #[test]
    fn alpha11_decimal_imports_preserve_exact_arithmetic() {
        let result: Value = serde_json::from_str(&execute_request(&request(&[
            ("main.srp", r#"import "math/price.srp" as price;
print(price.sum(decimal("0.1"), decimal("0.2")));"#),
            ("math/price.srp", r#"pub pure funcra sum(a: decimal, b: decimal) -> decimal {
    return a + b;
}"#),
        ]))).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "0.3\n");
    }

    #[test]
    fn alpha11_decimal_errors_discard_stdout_and_have_source_diagnostics() {
        for (source, code) in [
            (r#"print("before"); print(decimal("oops"));"#, "E0068"),
            (r#"print("before"); print(decimal("1") / decimal("3"));"#, "E0070"),
        ] {
            let result: Value = serde_json::from_str(&execute_request(
                &request(&[("main.srp", source)]),
            )).unwrap();
            assert_eq!(result["ok"], false, "{result}");
            assert_eq!(result["stdout"], "", "{result}");
            assert_eq!(result["stderr"], "", "{result}");
            assert_eq!(result["diagnostic"]["schema_version"], 1, "{result}");
            assert_eq!(result["diagnostic"]["code"], code, "{result}");
            assert_eq!(result["diagnostic"]["primary"]["path"], "main.srp");
        }
    }

    #[test]
    fn alpha11_decimal_reads_bounded_stdin_but_not_interactive_prompts() {
        let buffered = json!({
            "entry": "main.srp",
            "files": {"main.srp": r#"print(decimal_format(decimal(read_line()), 2, "half_even"));"#},
            "stdin": "1.225\n"
        }).to_string();
        let result: Value = serde_json::from_str(&execute_request(&buffered)).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "1.22\n");

        let interactive = json!({
            "entry": "main.srp",
            "files": {"main.srp": r#"print("before"); print(input_decimal("Amount> "));"#},
            "stdin": "1.225\n"
        }).to_string();
        let blocked: Value = serde_json::from_str(&execute_request(&interactive)).unwrap();
        assert_eq!(blocked["ok"], false, "{blocked}");
        assert_eq!(blocked["diagnostic"]["code"], "E0054", "{blocked}");
        assert_eq!(blocked["stdout"], "", "{blocked}");
    }

    #[test]
    fn alpha10_fixed_arrays_match_published_fixture() {
        let source = r#"pure funcra labels(values: array<string, 2> = [array: "नमस्ते", "Scarp"])
    -> array<string, 2> ensures result == values; {
    return values;
}
var index = 1;
bind grid = [array: [array: 1, 2], [array: 3, 4]];
bind empty = [array: <array<integer, 2>>];
print(labels()[index], grid[index][0], empty);
print(labels(), grid[0] == [array: 1, 2]);
"#;
        let result: Value = serde_json::from_str(&execute_request(
            &request(&[("main.srp", source)]),
        )).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], r#"Scarp 3 [array: <array<integer, 2>>]
[array: "नमस्ते", "Scarp"] true
"#);
        assert_eq!(result["stderr"], "");
    }

    #[test]
    fn alpha10_advanced_bigints_match_published_fixture() {
        let source = r#"bind amount = bigint("1000000000000000000000000000007");
bind parts = bigint_divmod(amount, bigint("9"));
print(parts[0], parts[1]);

bind width = bigint_pow(bigint("2"), 128);
print(bigint_bit_length(width), bigint_to_radix(width, 16));
print(bigint_sqrt(width), bigint_gcd(bigint("-84"), bigint("30")));
"#;
        let result: Value = serde_json::from_str(&execute_request(
            &request(&[("main.srp", source)]),
        )).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "111111111111111111111111111111 8\n129 100000000000000000000000000000000\n18446744073709551616 6\n");
    }

    #[test]
    fn alpha10_try_read_line_distinguishes_empty_line_from_eof() {
        let input = json!({
            "entry": "main.srp",
            "files": {"main.srp": r#"bind first = try_read_line();
print(first[0], first[1]);
bind blank = try_read_line();
print(blank[0], blank[1] == "");
bind eof = try_read_line();
print(eof[0], eof[1] == "");
"#},
            "stdin": "नमस्ते\r\n\n"
        }).to_string();
        let result: Value = serde_json::from_str(&execute_request(&input)).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "true नमस्ते\ntrue true\nfalse true\n");
    }

    #[test]
    fn alpha10_interactive_prompt_has_no_noninteractive_browser_capability() {
        let input = json!({
            "entry": "main.srp",
            "files": {"main.srp": r#"print("before"); print(ask_or("Name> ", "Guest"));"#},
            "stdin": "Ada\n"
        }).to_string();
        let result: Value = serde_json::from_str(&execute_request(&input)).unwrap();
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(result["diagnostic"]["code"], "E0054", "{result}");
        assert_eq!(result["stdout"], "");
        assert_eq!(result["stderr"], "");
    }

    #[test]
    fn alpha9_exact_bigints_run_through_the_bounded_browser_bridge() {
        let result: Value = serde_json::from_str(&execute_request(&request(&[
            ("main.srp",
                "bind a: bigint = bigint(\"999999999999999999999999999999\"); \
                 bind one = bigint_from_integer(1); \
                 print(a + one); \
                 print(-a / bigint(\"1000000000000000000\")); \
                 print(bigint_to_integer(one));"),
        ]))).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "1000000000000000000000000000000\n-999999999999\n1\n");
        assert_eq!(result["stderr"], "");
    }

    #[test]
    fn alpha9_bigint_decimal_errors_discard_prior_stdout() {
        let result: Value = serde_json::from_str(&execute_request(&request(&[
            ("main.srp", "print(\"before\"); print(bigint(\"not-decimal\"));"),
        ]))).unwrap();
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(result["stdout"], "");
        assert_eq!(result["diagnostic"]["schema_version"], 1);
        assert_eq!(result["diagnostic"]["code"], "E0051");
    }

    #[test]
    fn alpha9_bigint_digit_budget_is_enforced_without_output() {
        let source = format!("print(\"before\"); print(bigint(\"{}\"));", "9".repeat(2_049));
        let result: Value = serde_json::from_str(&execute_request(&request(&[
            ("main.srp", &source),
        ]))).unwrap();
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(result["stdout"], "");
        assert!(result["diagnostic"].is_object(), "{result}");
    }

    #[test]
    fn alpha8_assertions_run_through_the_real_bounded_interpreter() {
        let result: Value = serde_json::from_str(&execute_request(&request(&[
            ("main.srp", "assert(2 + 2 == 4, \"arithmetic holds\"); print(3);"),
        ]))).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "3\n");
        assert_eq!(result["stderr"], "");
    }

    #[test]
    fn alpha8_assertion_failure_in_import_is_source_located_and_discards_stdout() {
        let result: Value = serde_json::from_str(&execute_request(&request(&[
            ("main.srp", "import \"lib/math.srp\" as math; print(\"before\"); print(math.double(-2));"),
            ("lib/math.srp", "pub pure funcra double(value: integer) -> integer { assert(value >= 0, \"positive input required\"); return value * 2; }"),
        ]))).unwrap();
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(result["stdout"], "", "{result}");
        assert_eq!(result["diagnostic"]["schema_version"], 1);
        assert_eq!(result["diagnostic"]["code"], "E0065");
        assert_eq!(result["diagnostic"]["primary"]["path"], "lib/math.srp");
    }

    #[test]
    fn alpha8_playground_check_evaluates_reachable_assertions() {
        let result: Value = serde_json::from_str(&check_request(&request(&[
            ("main.srp", "assert(false, \"reached by check\");"),
        ]))).unwrap();
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(result["stdout"], "");
        assert_eq!(result["diagnostic"]["code"], "E0065");
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
