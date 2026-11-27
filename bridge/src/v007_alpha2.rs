//! Interpreter compatibility for source examples published with alpha.2.
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
fn published_direct_calls_run_in_the_interpreter() {
    assert_fixture(
        include_str!("../tests/fixtures/v007_alpha2/native_direct_calls.srp"),
        include_str!("../tests/fixtures/v007_alpha2/native_direct_calls.stdout"),
    );
}

#[test]
fn published_wide_named_calls_run_in_the_interpreter() {
    assert_fixture(
        include_str!("../tests/fixtures/v007_alpha2/native_wide_calls.srp"),
        include_str!("../tests/fixtures/v007_alpha2/native_wide_calls.stdout"),
    );
}
