//! Exact alpha.17 fixed-array regression coverage against the alpha.18 compiler pin.
use super::*;

fn payload(source: &str) -> String {
    json!({ "entry": "main.srp", "files": { "main.srp": source } }).to_string()
}

#[test]
fn official_alpha17_traversal_verifies_checks_and_executes_exactly() {
    let source = include_str!("../tests/fixtures/alpha17/array_traversal.srp");
    let expected = include_str!("../tests/fixtures/alpha17/array_traversal.stdout");
    let input = payload(source);
    for (name, result) in [
        ("verify", verify_request(&input)),
        ("check", check_request(&input)),
    ] {
        let reply: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(reply["ok"], true, "{name}: {reply}");
        assert_eq!(reply["stdout"], "", "{name}: {reply}");
        assert_eq!(reply["stderr"], "", "{name}: {reply}");
    }
    let reply: Value = serde_json::from_str(&execute_request(&input)).unwrap();
    assert_eq!(reply["ok"], true, "{reply}");
    assert_eq!(reply["stdout"], expected, "{reply}");
    assert_eq!(reply["stderr"], "", "{reply}");
}

#[test]
fn alpha17_out_of_bounds_read_reports_e0063_without_partial_output() {
    let input = payload(
        r#"print("uncommitted"); eprint("pending"); bind a = [array: 4, 8]; print(a[9]);"#
    );
    for (name, response) in [
        ("check", check_request(&input)),
        ("run", execute_request(&input)),
    ] {
        let reply: Value = serde_json::from_str(&response).unwrap();
        assert_eq!(reply["ok"], false, "{name}: {reply}");
        assert_eq!(reply["diagnostic"]["code"], "E0063", "{name}: {reply}");
        assert_eq!(reply["stdout"], "", "{name}: {reply}");
        assert_eq!(reply["stderr"], "", "{name}: {reply}");
    }
}

#[test]
fn alpha17_interactive_boolean_prompt_is_not_available_to_browser_stdin() {
    let mut input: Value = serde_json::from_str(&payload(
        r#"print("uncommitted"); print(input_boolean("Continue? "));"#
    )).unwrap();
    input["stdin"] = json!("true");
    let reply: Value = serde_json::from_str(&execute_request(&input.to_string())).unwrap();
    assert_eq!(reply["ok"], false, "{reply}");
    assert_eq!(reply["diagnostic"]["code"], "E0054", "{reply}");
    assert_eq!(reply["stdout"], "", "{reply}");
    assert_eq!(reply["stderr"], "", "{reply}");
}
