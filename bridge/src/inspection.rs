//! Bounded adapter for the pinned compiler's versioned module inventory.
use super::{compiler_error, error, load_workspace, module_limits, Request, MAX_REQUEST_JSON_BYTES};
use std::io::{self, Write};

const MAX_INSPECTION_BYTES: usize = 512 * 1024;

struct BoundedInventory {
    bytes: Vec<u8>,
    limit: usize,
}
impl Write for BoundedInventory {
    fn write(&mut self, input: &[u8]) -> io::Result<usize> {
        if input.len() > self.limit.saturating_sub(self.bytes.len()) {
            return Err(io::Error::new(io::ErrorKind::Other, "inspection output limit"));
        }
        self.bytes.extend_from_slice(input);
        Ok(input.len())
    }
    fn flush(&mut self) -> io::Result<()> { Ok(()) }
}

/// Compile the graph, then ask the official compiler for its resolved
/// inventory. Never evaluate runtime statements or read program input.
/// Compile-time constant work uses the same compiler limits as Verify.
pub(super) fn request(raw: &str) -> String {
    if raw.len() > MAX_REQUEST_JSON_BYTES {
        return error("The compiler request exceeds the 1 MiB JSON limit.");
    }
    let request: Request = match serde_json::from_str(raw) {
        Ok(request) => request,
        Err(_) => return error("Malformed module inspection request."),
    };
    let (entry, loader) = match load_workspace(request) {
        Ok(result) => result,
        Err(problem) => return error(problem),
    };
    let program = match scarp::modules::compile_with_loader(&entry, &loader, module_limits()) {
        Ok(program) => program,
        Err(problem) => return compiler_error(problem),
    };
    let mut inventory = BoundedInventory { bytes: Vec::new(), limit: MAX_INSPECTION_BYTES };
    if program.write_inspection_json(&mut inventory).is_err() {
        return error("Compiler module inspection exceeds the 512 KiB browser metadata limit.");
    }
    let raw = match String::from_utf8(inventory.bytes) {
        Ok(raw) => raw,
        Err(_) => return error("Compiler module inspection returned invalid UTF-8."),
    };
    // The upstream writer emits exactly one JSON object. Do not parse and
    // duplicate its potentially large metadata tree in Rust.
    format!("{{\"ok\":true,\"inspection\":{}}}", raw)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn inspect(files: &[(&str, &str)]) -> Value {
        let raw = json!({ "entry": "main.srp", "files": files.iter().copied().collect::<std::collections::BTreeMap<_, _>>() });
        serde_json::from_str(&request(&raw.to_string())).unwrap()
    }

    #[test]
    fn inspects_resolved_modules_and_functions_without_runtime_execution() {
        let source = "import \"lib/math.srp\" as math;\nprint(1 / 0);\nprint(read_line());\n";
        let lib = "// नमस्ते\npub pure funcra twice(value: integer) -> integer { return value * 2; }\npub bind answer: integer = 42;";
        let result = inspect(&[("main.srp", source), ("lib/math.srp", lib), ("scratch.srp", "not valid scarp")]);
        assert_eq!(result["ok"], true, "{result}");
        let data = &result["inspection"];
        let modules = data["modules"].as_array().unwrap();
        assert_eq!(modules.len(), 2);
        assert_eq!(modules[0]["path"], "main.srp");
        assert_eq!(modules[0]["dependencies"], json!([1]));
        assert_eq!(modules[1]["dependents"], json!([0]));
        let symbols = modules[1]["symbols"].as_array().unwrap();
        let function = symbols.iter().find(|symbol| symbol["name"] == "twice").unwrap();
        assert_eq!(function["kind"], "function");
        assert_eq!(function["pure"], true);
        assert_eq!(function["public"], true);
        assert_eq!(function["parameters"][0]["name"], "value");
        assert_eq!(function["parameters"][0]["type"], "integer");
        let span = function["span"].as_array().unwrap();
        let start = span[0].as_u64().unwrap() as usize;
        let end = span[1].as_u64().unwrap() as usize;
        assert_eq!(&lib[start..end], "twice");
    }

    #[test]
    fn exposes_real_compiler_failure_without_partial_inventory() {
        let result = inspect(&[("main.srp", "import \"absent.srp\" as missing;")]);
        assert_eq!(result["ok"], false);
        assert_eq!(result["diagnostic"]["code"], "E0038");
        assert!(result.get("inspection").is_none());
    }

    #[test]
    fn bounded_writer_rejects_before_extending_and_retains_no_oversize_bytes() {
        let mut inventory = BoundedInventory { bytes: Vec::new(), limit: 4 };
        inventory.write_all(b"1234").unwrap();
        assert!(inventory.write_all(b"5").is_err());
        assert_eq!(inventory.bytes, b"1234");
    }

    #[test]
    fn rejects_oversized_and_malformed_requests() {
        let oversized = " ".repeat(MAX_REQUEST_JSON_BYTES + 1);
        let result: Value = serde_json::from_str(&request(&oversized)).unwrap();
        assert_eq!(result["ok"], false);
        let result: Value = serde_json::from_str(&request("{}")).unwrap();
        assert_eq!(result["ok"], false);
    }
}
