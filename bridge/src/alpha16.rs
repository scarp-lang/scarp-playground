//! Exact-source regression checks for published Scarp alpha.16.
use super::*;

fn workspace(source: &str) -> String {
    json!({ "entry": "main.srp", "files": { "main.srp": source } }).to_string()
}

#[test]
fn alpha16_official_statistics_and_modules_verify_check_and_run() {
    let cases = [
        (
            "order_statistics",
            include_str!("../tests/fixtures/alpha16/order_statistics.srp"),
            None,
            include_str!("../tests/fixtures/alpha16/order_statistics.stdout"),
        ),
        (
            "core_collections",
            include_str!("../tests/fixtures/alpha16/core_collections.srp"),
            Some(include_str!("../tests/fixtures/alpha16/modules/collection_tools.srp")),
            include_str!("../tests/fixtures/alpha16/core_collections.stdout"),
        ),
    ];
    for (name, main, module, stdout) in cases {
        let files = match module {
            Some(source) => json!({
                "main.srp": main, "modules/collection_tools.srp": source,
            }),
            None => json!({ "main.srp": main }),
        };
        let request = json!({ "entry": "main.srp", "files": files }).to_string();
        for (mode, response) in [
            ("verify", verify_request(&request)),
            ("check", check_request(&request)),
        ] {
            let result: Value = serde_json::from_str(&response).unwrap();
            assert_eq!(result["ok"], true, "{name} {mode}: {result}");
            assert_eq!(result["stdout"], "", "{name} {mode}: {result}");
            assert_eq!(result["stderr"], "", "{name} {mode}: {result}");
        }
        let result: Value = serde_json::from_str(&execute_request(&request)).unwrap();
        assert_eq!(result["ok"], true, "{name}: {result}");
        assert_eq!(result["stdout"], stdout, "{name}: {result}");
        assert_eq!(result["stderr"], "", "{name}: {result}");
    }
}

#[test]
fn alpha16_invalid_quantile_rolls_back_both_output_streams() {
    let request = workspace(
        "print(\"uncommitted\"); eprint(\"private\"); print(quantile([1.0, 2.0], 1.5));"
    );
    let verified: Value = serde_json::from_str(&verify_request(&request)).unwrap();
    assert_eq!(verified["ok"], true, "{verified}");
    for (mode, response) in [
        ("check", check_request(&request)),
        ("run", execute_request(&request)),
    ] {
        let result: Value = serde_json::from_str(&response).unwrap();
        assert_eq!(result["ok"], false, "{mode}: {result}");
        assert_eq!(result["diagnostic"]["code"], "E0034", "{mode}: {result}");
        assert_eq!(result["stdout"], "", "{mode}: {result}");
        assert_eq!(result["stderr"], "", "{mode}: {result}");
    }
}

#[test]
fn alpha16_invalid_unicode_codepoint_is_atomic() {
    let request = workspace("print(\"uncommitted\"); print(text_from_codepoint(0x110000));");
    let result: Value = serde_json::from_str(&execute_request(&request)).unwrap();
    assert_eq!(result["ok"], false, "{result}");
    assert_eq!(result["stdout"], "", "{result}");
    assert_eq!(result["stderr"], "", "{result}");
}
