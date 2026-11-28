//! Source-only outline derived from the pinned parser AST, not evaluation.
use super::{MAX_FILE_BYTES, MAX_REQUEST_JSON_BYTES};
use scarp::ast::{BindingPattern, PatternKind, Statement};
use scarp::diagnostics::Span;
use serde::{Deserialize, Serialize};
use serde_json::json;

const MAX_OUTLINE_ENTRIES: usize = 256;
const MAX_OUTLINE_NAME_BYTES: usize = 128;
const MAX_OUTLINE_DEPTH: usize = 65;

#[derive(Deserialize)]
struct OutlineRequest {
    path: String,
    source: String,
}

#[derive(Serialize, Debug)]
struct OutlineEntry<'a> {
    name: &'a str,
    kind: &'static str,
    start: usize,
    end: usize,
    depth: usize,
    public: bool,
}

struct Outline<'a> {
    source: &'a str,
    entries: Vec<OutlineEntry<'a>>,
    truncated: bool,
}

impl<'a> Outline<'a> {
    fn push(&mut self, name: &'a str, kind: &'static str, span: Span, depth: usize, public: bool) {
        // Ignore synthetic compiler declarations: only actual identifier
        // tokens in this exact source buffer are navigable.
        if self.source.get(span.start..span.end) != Some(name) || name.is_empty() {
            return;
        }
        if self.entries.len() == MAX_OUTLINE_ENTRIES ||
            name.len() > MAX_OUTLINE_NAME_BYTES || depth > MAX_OUTLINE_DEPTH
        {
            self.truncated = true;
            return;
        }
        self.entries.push(OutlineEntry {
            name, kind, start: span.start, end: span.end, depth, public,
        });
    }

    fn pattern(&mut self, pattern: &'a BindingPattern, kind: &'static str, depth: usize) {
        for node in pattern.nodes() {
            if let PatternKind::Name(name) = &node.kind {
                self.push(name, kind, node.span, depth, false);
            }
        }
    }

    fn statements(&mut self, statements: &'a [Statement], depth: usize) {
        if depth > MAX_OUTLINE_DEPTH {
            self.truncated = true;
            return;
        }
        for statement in statements {
            self.statement(statement, depth, false);
        }
    }

    fn statement(&mut self, statement: &'a Statement, depth: usize, public: bool) {
        match statement {
            Statement::Export { declaration, .. } => self.statement(declaration, depth, true),
            Statement::Import { alias, alias_span, .. } =>
                self.push(alias, "import", *alias_span, depth, public),
            Statement::Function(function) => {
                self.push(&function.name, if function.pure { "pure_function" } else { "function" },
                    function.name_span, depth, public);
                for parameter in &function.type_parameters {
                    self.push(&parameter.name, "type_parameter", parameter.span, depth + 1, false);
                }
                for parameter in &function.parameters {
                    self.push(&parameter.name, "parameter", parameter.span, depth + 1, false);
                }
                self.statements(&function.statements, depth + 1);
            }
            Statement::Record(record) => {
                self.push(&record.name, "record", record.name_span, depth, public);
                for (name, span, _) in &record.fields {
                    self.push(name, "field", *span, depth + 1, false);
                }
            }
            Statement::Variant(variant) => {
                self.push(&variant.name, "variant", variant.name_span, depth, public);
                for case in &variant.cases {
                    self.push(&case.name, "variant_case", case.span, depth + 1, false);
                }
            }
            Statement::Declaration { name, name_span, mutable, .. } =>
                self.push(name, if *mutable { "var" } else { "bind" }, *name_span, depth, public),
            Statement::Destructure { pattern, mutable, .. } =>
                self.pattern(pattern, if *mutable { "var" } else { "bind" }, depth),
            Statement::Repeat { index, index_span, statements, .. } => {
                self.push(index, "repeat_index", *index_span, depth + 1, false);
                self.statements(statements, depth + 1);
            }
            Statement::While { statements, .. } | Statement::Block { statements, .. } =>
                self.statements(statements, depth + 1),
            Statement::If { branches, otherwise, .. } => {
                for branch in branches {
                    self.statements(&branch.statements, depth + 1);
                }
                self.statements(otherwise, depth + 1);
            }
            Statement::Match(statement) => {
                for arm in &statement.arms {
                    if let Some(pattern) = &arm.payload {
                        self.pattern(pattern, "match_binding", depth + 1);
                    }
                    self.statements(&arm.statements, depth + 1);
                }
            }
            _ => {}
        }
    }
}

fn safe_path(path: &str) -> bool {
    if path.len() > 128 {
        return false;
    }
    let Some(stem) = path.strip_suffix(".srp") else { return false; };
    stem.split('/').all(|part| !part.is_empty() &&
        part.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'))
}

fn failure(message: &str) -> String {
    json!({ "ok": false, "error": message }).to_string()
}

/// Independent parser request; only one source is supplied. No import loading,
/// name resolution, runtime evaluation, stdin, or host filesystem access.
pub(super) fn request(raw: &str) -> String {
    if raw.len() > MAX_REQUEST_JSON_BYTES {
        return failure("The outline request exceeds the 1 MiB JSON limit.");
    }
    let request: OutlineRequest = match serde_json::from_str(raw) {
        Ok(request) => request,
        Err(_) => return failure("Malformed source outline request."),
    };
    if !safe_path(&request.path) || request.source.len() > MAX_FILE_BYTES {
        return failure("Invalid outline source path or file size.");
    }
    let program = match scarp::parse(&request.source) {
        Ok(program) => program,
        Err(problem) => {
            return json!({
                "ok": false, "error": problem.to_string(), "code": problem.kind.code(),
            }).to_string();
        }
    };
    let mut outline = Outline { source: &request.source, entries: Vec::new(), truncated: false };
    outline.statements(&program.statements, 0);
    outline.entries.sort_by_key(|entry| (entry.start, entry.end));
    // Parser-generated nodes can reuse a source span. Emit each token once.
    outline.entries.dedup_by_key(|entry| (entry.start, entry.end));
    json!({
        "ok": true, "path": request.path,
        "entries": outline.entries, "truncated": outline.truncated,
    }).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn inspect(path: &str, source: &str) -> Value {
        serde_json::from_str(&request(&json!({ "path": path, "source": source }).to_string())).unwrap()
    }

    #[test]
    fn actual_parser_names_have_exact_utf8_spans_and_depth() {
        let source = concat!(
            "// नमस्ते 😀\r\n",
            "import r\"math.srp\" as math;\n",
            "pub pure funcra identity<T>(value: T) -> T { bind local = value; return local; }\n",
            "bind (left, right) = (1, 2);\n",
            "var counter = 0;\n",
            "repeat 2 as i { bind inner = i; }\n",
            "bind note = \"funcra fake()\";\n"
        );
        let result = inspect("src/main.srp", source);
        assert_eq!(result["ok"], true, "{result}");
        let entries = result["entries"].as_array().unwrap();
        let names: Vec<_> = entries.iter().map(|entry| entry["name"].as_str().unwrap()).collect();
        assert_eq!(names, ["math", "identity", "T", "value", "local", "left", "right", "counter", "i", "inner", "note"]);
        for entry in entries {
            let start = entry["start"].as_u64().unwrap() as usize;
            let end = entry["end"].as_u64().unwrap() as usize;
            assert_eq!(&source[start..end], entry["name"].as_str().unwrap());
        }
        assert_eq!(entries[1]["kind"], "pure_function");
        assert_eq!(entries[1]["public"], true);
        assert_eq!(entries[4]["depth"], 1);
        assert_eq!(entries[7]["kind"], "var");
        assert_eq!(entries[8]["kind"], "repeat_index");
        assert_eq!(result["truncated"], false);
    }

    #[test]
    fn does_not_resolve_imports_or_execute_statements() {
        let result = inspect("main.srp", "import \"absent.srp\" as absent; bind zero = 1 / 0; print(read_line());");
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["entries"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn syntax_failure_has_real_code_and_no_partial_outline() {
        let result = inspect("main.srp", "funcra f<T,T>(a:T)->T{return a;}");
        assert_eq!(result["ok"], false);
        assert_eq!(result["code"], "E0085");
        assert!(result.get("entries").is_none());
    }

    #[test]
    fn limits_and_path_validation_are_independent_of_the_browser() {
        for path in ["../main.srp", "/main.srp", "x\\main.srp", "x//main.srp", "main.txt", ".srp"] {
            assert_eq!(inspect(path, "")["ok"], false, "{path}");
        }
        assert_eq!(inspect("main.srp", &" ".repeat(MAX_FILE_BYTES + 1))["ok"], false);
        let source: String = (0..MAX_OUTLINE_ENTRIES + 1)
            .map(|i| format!("bind x{i} = 1;\n")).collect();
        let result = inspect("main.srp", &source);
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["entries"].as_array().unwrap().len(), MAX_OUTLINE_ENTRIES);
        assert_eq!(result["truncated"], true);
    }
}
