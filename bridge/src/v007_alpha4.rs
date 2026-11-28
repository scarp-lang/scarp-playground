//! Published alpha.4 source-level interpreter coverage, with unchanged browser quotas.
use super::*;

fn assert_workspace(files: BTreeMap<&str, &str>, expected: &str) {
    let payload = json!({"entry":"main.srp","files":files}).to_string();
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
fn published_native_recursive_entry() {
    assert_workspace(
        BTreeMap::from([("main.srp", include_str!("../tests/fixtures/v007_alpha4/native_recursive_entry.srp"))]),
        include_str!("../tests/fixtures/v007_alpha4/native_recursive_entry.stdout"),
    );
}

#[test]
fn published_native_nested_aggregate_locals() {
    assert_workspace(
        BTreeMap::from([("main.srp", include_str!("../tests/fixtures/v007_alpha4/native_nested_aggregate_locals.srp"))]),
        include_str!("../tests/fixtures/v007_alpha4/native_nested_aggregate_locals.stdout"),
    );
}

#[test]
fn published_bigint_wide_exponents() {
    assert_workspace(
        BTreeMap::from([("main.srp", include_str!("../tests/fixtures/v007_alpha4/bigint_wide_exponents.srp"))]),
        include_str!("../tests/fixtures/v007_alpha4/bigint_wide_exponents.stdout"),
    );
}

#[test]
fn nested_context_inference_across_modules() {
    assert_workspace(
        BTreeMap::from([
            ("main.srp", include_str!("../tests/fixtures/v007_alpha4/context/main.srp")),
            ("lib.srp", include_str!("../tests/fixtures/v007_alpha4/context/lib.srp")),
        ]),
        include_str!("../tests/fixtures/v007_alpha4/context/expected.stdout"),
    );
}

#[test]
fn missing_nested_type_context_is_not_guessed() {
    let source = r#"pure funcra blank<T>() -> list<T> { return [list: <T>]; }
pure funcra keep<T, U>(items: list<T>, tag: U) -> list<T> { return items; }
bind items = keep(blank(), 2);"#;
    let payload = json!({"entry":"main.srp","files":{"main.srp":source}}).to_string();
    for reply in [verify_request(&payload), check_request(&payload), execute_request(&payload)] {
        let result: Value = serde_json::from_str(&reply).unwrap();
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(result["stdout"], "", "{result}");
        assert_eq!(result["stderr"], "", "{result}");
    }
}
