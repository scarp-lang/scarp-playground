//! Browser bridge checks against the published Scarp alpha.14 source 43627b74af5fccccc5e233e98207413983ebafc1.
use super::*;

fn workspace(source: &str) -> String {
    json!({ "entry": "main.srp", "files": { "main.srp": source } }).to_string()
}

#[test]
fn official_alpha14_examples_verify_check_and_execute_exact_stdout() {
    for (name, source, expected) in [
        (
            "structured_pattern_coverage",
            include_str!("../tests/fixtures/alpha14/structured_pattern_coverage.srp"),
            include_str!("../tests/fixtures/alpha14/structured_pattern_coverage.stdout"),
        ),
        (
            "map_string_projection_snapshots",
            include_str!("../tests/fixtures/alpha14/map_string_projection_snapshots.srp"),
            include_str!("../tests/fixtures/alpha14/map_string_projection_snapshots.stdout"),
        ),
    ] {
        let payload = workspace(source);
        for (operation, response) in [
            ("verify", verify_request(&payload)),
            ("check", check_request(&payload)),
        ] {
            let result: Value = serde_json::from_str(&response).unwrap();
            assert_eq!(result["ok"], true, "{name} {operation}: {result}");
            assert_eq!(result["stdout"], "", "{name} {operation}");
            assert_eq!(result["stderr"], "", "{name} {operation}");
        }
        let result: Value = serde_json::from_str(&execute_request(&payload)).unwrap();
        assert_eq!(result["ok"], true, "{name}: {result}");
        assert_eq!(result["stdout"], expected, "{name}");
        assert_eq!(result["stderr"], "", "{name}");
    }
}

#[test]
fn alpha14_pattern_punctuation_errors_do_not_leak_stdout() {
    for (source, expected) in [
        (r#"print("before"); bind (first second) = (1, 2);"#, "expected ',' between destructuring pattern members"),
        (r#"print("before"); bind (first, [second, third)) = item;"#, "expected ']'"),
        (r#"print("before"); bind (left,, right) = (1, 2);"#, "where a destructuring pattern member is required"),
    ] {
        let payload = workspace(source);
        for response in [verify_request(&payload), check_request(&payload), execute_request(&payload)] {
            let result: Value = serde_json::from_str(&response).unwrap();
            assert_eq!(result["ok"], false, "{result}");
            assert_eq!(result["stdout"], "", "{result}");
            assert_eq!(result["stderr"], "", "{result}");
            assert!(result.to_string().contains(expected), "missing {expected:?}: {result}");
        }
    }
    let next: Value = serde_json::from_str(&execute_request(&workspace("print(\"recovered\");"))).unwrap();
    assert_eq!(next["ok"], true, "{next}");
    assert_eq!(next["stdout"], "recovered\n");
}
