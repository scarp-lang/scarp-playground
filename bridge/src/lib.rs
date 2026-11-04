//! Browser bridge to the real Scarp interpreter, pinned to published alpha.4.
use scarp::modules::{self, MemorySourceLoader, ModuleLimits, ModuleRunError};
use scarp::{ExecutionLimits, ExecutionOptions};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use wasm_bindgen::prelude::*;

const MAX_FILES: usize = 12;
const MAX_FILE_BYTES: usize = 64 * 1024;
const MAX_TOTAL_BYTES: usize = 128 * 1024;

#[derive(Deserialize)]
struct Request {
    entry: String,
    files: BTreeMap<String, String>,
}

fn error(message: impl Into<String>) -> String {
    json!({ "ok": false, "stdout": "", "stderr": "", "error": message.into() }).to_string()
}

fn execute_request(json_source: &str) -> String {
    let request: Request = match serde_json::from_str(json_source) {
        Ok(value) => value,
        Err(_) => return error("Malformed playground request."),
    };
    if request.files.is_empty() || request.files.len() > MAX_FILES {
        return error("The playground accepts between 1 and 12 source files.");
    }
    if !request.files.contains_key(&request.entry) {
        return error("The selected entrypoint must exist in the workspace.");
    }
    let mut loader = MemorySourceLoader::new();
    let mut size = 0_usize;
    for (path, source) in request.files {
        if !path.ends_with(".srp") || path.len() > 128 || source.len() > MAX_FILE_BYTES {
            return error("Invalid file name or a source exceeds the 64 KiB limit.");
        }
        size += source.len();
        if size > MAX_TOTAL_BYTES {
            return error("The combined project sources exceed 128 KiB.");
        }
        if let Err(problem) = loader.insert(&path, source) {
            return error(problem.to_string());
        }
    }
    let limits = ModuleLimits {
        max_files: MAX_FILES,
        max_depth: 8,
        max_file_bytes: MAX_FILE_BYTES,
        max_total_bytes: MAX_TOTAL_BYTES,
        max_imports: 64,
        max_expansion_bytes: 1024 * 1024,
    };
    let program = match modules::compile_with_loader(&request.entry, &loader, limits) {
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
    };
    let result = program.execute(&mut stdout, &mut stderr, options);
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
    fn runs_actual_hello_program() {
        let result: Value = serde_json::from_str(&execute_request(&request(&[
            ("main.srp", "print(\"Hello from Scarp!\");"),
        ]))).unwrap();
        assert_eq!(result["ok"], true);
        assert_eq!(result["stdout"], "Hello from Scarp!\n");
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
    fn rejects_nonexistent_entry_without_running() {
        let result: Value = serde_json::from_str(
            &execute_request(r#"{"entry":"no.srp","files":{"main.srp":"print(1);"}} "#)
        ).unwrap();
        assert_eq!(result["ok"], false);
    }
}
