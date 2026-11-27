//! Interpreter compatibility for the published alpha.3 compiler.
use super::*;

fn assert_fixture(source: &str, expected: &str) {
    let payload = json!({"entry":"main.srp","files":{"main.srp":source}}).to_string();
    for reply in [verify_request(&payload), check_request(&payload)] {
        let result: Value = serde_json::from_str(&reply).unwrap();
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "", "{result}");
        assert_eq!(result["stderr"], "", "{result}");
    }
    let result: Value = serde_json::from_str(&execute_request(&payload)).unwrap();
    assert_eq!(result["ok"], true, "{result}");
    assert_eq!(result["stdout"], expected, "{result}");
    assert_eq!(result["stderr"], "", "{result}");
}

#[test]
fn string_operators_interpreter_compatibility() {
    assert_fixture(
        include_str!("../tests/fixtures/v007_alpha3/string_operators.srp"),
        include_str!("../tests/fixtures/v007_alpha3/string_operators.stdout"),
    );
}

#[test]
fn generic_functions_interpreter_compatibility() {
    assert_fixture(
        include_str!("../tests/fixtures/v007_alpha3/generic_functions.srp"),
        include_str!("../tests/fixtures/v007_alpha3/generic_functions.stdout"),
    );
}

#[test]
fn generic_variants_interpreter_compatibility() {
    assert_fixture(
        include_str!("../tests/fixtures/v007_alpha3/generic_variants.srp"),
        include_str!("../tests/fixtures/v007_alpha3/generic_variants.stdout"),
    );
}

#[test]
fn generic_inference_failure_remains_a_static_error() {
    let source = "pure funcra empty<T>() -> list<T> { return [list: <T>]; } print(empty());";
    let payload = json!({"entry":"main.srp","files":{"main.srp":source}}).to_string();
    for reply in [verify_request(&payload), check_request(&payload)] {
        let result: Value = serde_json::from_str(&reply).unwrap();
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(result["stdout"], "", "{result}");
    }
}
