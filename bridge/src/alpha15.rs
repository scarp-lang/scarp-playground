//! Regression checks for the published Scarp alpha.15 source a21b7b6d942bd1ca9abbbbb522f92f9c8e21e281.
use super::*;
use scarp::diagnostics::{DiagnosticKind, Span};
use scarp::RunError;

fn workspace(source: &str) -> String {
    json!({ "entry": "main.srp", "files": { "main.srp": source } }).to_string()
}

#[test]
fn alpha15_unicode_comparison_is_consistent_in_all_browser_modes() {
    let payload = workspace(
        "bind first = \"éé\"; bind same = \"éé\"; bind different = \"êé\";\n\
         print(first == same); print(first != different);\n\
         print(first == different); print(first != same);",
    );
    for response in [verify_request(&payload), check_request(&payload)] {
        let value: Value = serde_json::from_str(&response).unwrap();
        assert_eq!(value["ok"], true, "{value}");
        assert_eq!(value["stdout"], "", "{value}");
        assert_eq!(value["stderr"], "", "{value}");
    }
    let result: Value = serde_json::from_str(&execute_request(&payload)).unwrap();
    assert_eq!(result["ok"], true, "{result}");
    assert_eq!(result["stdout"], "true\ntrue\nfalse\nfalse\n");
    assert_eq!(result["stderr"], "");
}

#[test]
fn alpha15_equal_length_utf8_comparison_charges_steps_atomically() {
    // Unlike unequal-length comparisons, equal-size strings must be compared
    // bytewise under the compiler's work budget. Match an upstream boundary
    // exactly without exposing an adjustable limit to browser JavaScript.
    let common = "é".repeat(64);
    for (operator, suffix) in [("==", "!"), ("!=", "?")] {
        let source = format!(
            "bind a = \"{common}!\"; bind b = \"{common}{suffix}\"; \
             eprint(\"pending\"); print(a {operator} b);"
        );
        let at = source.find(operator).expect("operator position");
        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let mut limits = ExecutionLimits { max_steps: 12, max_prints: 2 };
        let error = scarp::run_with_io_and_limits(&source, &mut stdout, &mut stderr, limits)
            .expect_err("comparison exceeds work quota");
        let RunError::Diagnostic(problem) = error else {
            panic!("expected a Scarp execution diagnostic");
        };
        assert_eq!(problem.kind, DiagnosticKind::ExecutionLimit);
        assert_eq!(problem.span, Span::new(at, at + 2));
        assert!(stdout.is_empty() && stderr.is_empty());
        assert_eq!(
            scarp::check_with_limits(&source, limits).unwrap_err(),
            problem,
        );

        limits.max_steps += 1;
        scarp::run_with_io_and_limits(&source, &mut stdout, &mut stderr, limits)
            .expect("one more work step permits evaluation");
        assert_eq!(stdout, b"true\n");
        assert_eq!(stderr, b"pending\n");
        scarp::check_with_limits(&source, limits).unwrap();
    }
}
