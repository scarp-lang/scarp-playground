//! Published alpha.19 source-level function boundary fixture for the browser bridge.
//! The new Rust host APIs are deliberately not exposed as Scarp source values.
use super::*;

fn request_for(source: &str) -> String {
    json!({ "entry": "main.srp", "files": { "main.srp": source } }).to_string()
}

#[test]
fn alpha19_official_function_fixture_verifies_checks_and_executes() {
    let source = include_str!("../tests/fixtures/alpha19/callable_effect_boundaries.srp");
    let expected = include_str!("../tests/fixtures/alpha19/callable_effect_boundaries.stdout");
    let request = request_for(source);
    for (mode, output) in [
        ("verify", verify_request(&request)),
        ("check", check_request(&request)),
    ] {
        let response: Value = serde_json::from_str(&output).unwrap();
        assert_eq!(response["ok"], true, "{mode}: {response}");
        assert_eq!(response["stdout"], "", "{mode}: {response}");
        assert_eq!(response["stderr"], "", "{mode}: {response}");
    }
    let response: Value = serde_json::from_str(&execute_request(&request)).unwrap();
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["stdout"], expected, "{response}");
    assert_eq!(response["stderr"], "", "{response}");
}

#[test]
fn alpha19_host_callable_handles_are_not_source_level_function_values() {
    let source = r#"pure funcra twice(n: integer) -> integer { return n * 2; }
bind callback = twice;
print(callback(3));"#;
    let response: Value = serde_json::from_str(&execute_request(&request_for(source))).unwrap();
    assert_eq!(response["ok"], false, "{response}");
    assert_eq!(response["stdout"], "", "{response}");
    assert_eq!(response["stderr"], "", "{response}");
    assert!(response["diagnostic"]["code"].as_str().is_some(), "{response}");
}

