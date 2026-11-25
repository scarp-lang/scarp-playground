//! Browser regressions for the published v0.0.7-alpha.1 interpreter.
use super::*;

fn request(source: &str) -> String {
    json!({ "entry": "main.srp", "files": { "main.srp": source } }).to_string()
}

fn assert_fixture(source: &str, expected: &str) {
    let request = request(source);
    for response in [verify_request(&request), check_request(&request)] {
        let response: Value = serde_json::from_str(&response).unwrap();
        assert_eq!(response["ok"], true, "{response}");
        assert_eq!(response["stdout"], "", "{response}");
        assert_eq!(response["stderr"], "", "{response}");
    }
    let response: Value = serde_json::from_str(&execute_request(&request)).unwrap();
    assert_eq!(response["ok"], true, "{response}");
    assert_eq!(response["stdout"], expected, "{response}");
    assert_eq!(response["stderr"], "", "{response}");
}

#[test]
fn array_concat_fixture() {
    assert_fixture(
        include_str!("../tests/fixtures/v007_alpha1/array_concat.srp"),
        include_str!("../tests/fixtures/v007_alpha1/array_concat.stdout"),
    );
}

#[test]
fn integer_reductions_fixture() {
    assert_fixture(
        include_str!("../tests/fixtures/v007_alpha1/integer_reductions.srp"),
        include_str!("../tests/fixtures/v007_alpha1/integer_reductions.stdout"),
    );
}

#[test]
fn softplus_fixture() {
    assert_fixture(
        include_str!("../tests/fixtures/v007_alpha1/softplus.srp"),
        include_str!("../tests/fixtures/v007_alpha1/softplus.stdout"),
    );
}

#[test]
fn frame_snapshots_fixture() {
    assert_fixture(
        include_str!("../tests/fixtures/v007_alpha1/frame_snapshots.srp"),
        include_str!("../tests/fixtures/v007_alpha1/frame_snapshots.stdout"),
    );
}

#[test]
fn invalid_arguments_fail_atomically() {
    for source in [
        "print(\"before\"); print(array_concat([array:1], [array:<float>]));",
        "print(\"before\"); print(integer_hcf(1));",
        "print(\"before\"); print(integer_lcm(1, 2, false));",
        "print(\"before\"); print(softplus(1.0));",
    ] {
        let response: Value = serde_json::from_str(&execute_request(&request(source))).unwrap();
        assert_eq!(response["ok"], false, "{source}: {response}");
        assert_eq!(response["stdout"], "", "{response}");
        assert_eq!(response["stderr"], "", "{response}");
        assert!(response["diagnostic"]["code"].as_str().is_some(), "{response}");
    }
}

#[test]
fn variadic_integer_arity_boundary() {
    let arguments = vec!["0"; 1024].join(",");
    assert_fixture(&format!("print(integer_hcf({arguments}));"), "0\n");
    let arguments = vec!["0"; 1025].join(",");
    let response: Value = serde_json::from_str(&verify_request(&request(&format!("print(integer_lcm({arguments}));")))).unwrap();
    assert_eq!(response["ok"], false, "{response}");
    assert_eq!(response["stdout"], "", "{response}");
}
