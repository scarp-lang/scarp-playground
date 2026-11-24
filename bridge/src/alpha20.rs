//! Browser contract regressions against published Scarp v0.0.6-alpha.20.
//! Browser only uses the interpreter; native ELF64 host APIs are not exported.
use super::*;

fn request_for(source: &str) -> String {
    json!({ "entry": "main.srp", "files": { "main.srp": source } }).to_string()
}

fn assert_exact_fixture(label: &str, source: &str, expected: &str) {
    let request = request_for(source);
    for (mode, result) in [
        ("verify", verify_request(&request)),
        ("check", check_request(&request)),
    ] {
        let response: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(response["ok"], true, "{label} {mode}: {response}");
        assert_eq!(response["stdout"], "", "{label} {mode}: {response}");
        assert_eq!(response["stderr"], "", "{label} {mode}: {response}");
    }
    let response: Value = serde_json::from_str(&execute_request(&request)).unwrap();
    assert_eq!(response["ok"], true, "{label}: {response}");
    assert_eq!(response["stdout"], expected, "{label}: {response}");
    assert_eq!(response["stderr"], "", "{label}: {response}");
}

#[test]
fn alpha20_published_tuple_indexed_assignment_is_persistent() {
    assert_exact_fixture(
        "tuple_index_updates",
        include_str!("../tests/fixtures/alpha20/tuple_index_updates.srp"),
        include_str!("../tests/fixtures/alpha20/tuple_index_updates.stdout"),
    );
}

#[test]
fn alpha20_published_numeric_tuple_ordering_is_deterministic() {
    assert_exact_fixture(
        "tuple_ordering",
        include_str!("../tests/fixtures/alpha20/tuple_ordering.srp"),
        include_str!("../tests/fixtures/alpha20/tuple_ordering.stdout"),
    );
}

#[test]
fn alpha20_exact_decimal_literals_preserve_binary64_compatibility() {
    assert_exact_fixture(
        "decimal_literals",
        include_str!("../tests/fixtures/alpha20/decimal_literals.srp"),
        include_str!("../tests/fixtures/alpha20/decimal_literals.stdout"),
    );
}

#[test]
fn alpha20_incompatible_decimal_float_mix_has_no_partial_output() {
    let response: Value = serde_json::from_str(&execute_request(
        &request_for("print(\"before\"); print(0.1d + 0.2);"),
    )).unwrap();
    assert_eq!(response["ok"], false, "{response}");
    assert_eq!(response["stdout"], "", "{response}");
    assert_eq!(response["stderr"], "", "{response}");
    assert!(response["diagnostic"]["code"].as_str().is_some(), "{response}");
}
