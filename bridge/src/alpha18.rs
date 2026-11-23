//! Exact alpha.18 fixed arrays and Lifetime observable browser regression tests.
use super::*;

fn payload(source: &str) -> String {
    json!({ "entry": "main.srp", "files": { "main.srp": source } }).to_string()
}

#[test]
fn alpha18_official_snapshots_and_windows_pass_all_browser_modes() {
    for (name, source, expected) in [
        (
            "array_updates",
            include_str!("../tests/fixtures/alpha18/array_updates.srp"),
            include_str!("../tests/fixtures/alpha18/array_updates.stdout"),
        ),
        (
            "lifetime_windows",
            include_str!("../tests/fixtures/alpha18/lifetime_windows.srp"),
            include_str!("../tests/fixtures/alpha18/lifetime_windows.stdout"),
        ),
    ] {
        let input = payload(source);
        for (mode, response) in [
            ("verify", verify_request(&input)),
            ("check", check_request(&input)),
        ] {
            let reply: Value = serde_json::from_str(&response).unwrap();
            assert_eq!(reply["ok"], true, "{name} {mode}: {reply}");
            assert_eq!(reply["stdout"], "", "{name} {mode}: {reply}");
            assert_eq!(reply["stderr"], "", "{name} {mode}: {reply}");
        }
        let reply: Value = serde_json::from_str(&execute_request(&input)).unwrap();
        assert_eq!(reply["ok"], true, "{name}: {reply}");
        assert_eq!(reply["stdout"], expected, "{name}: {reply}");
        assert_eq!(reply["stderr"], "", "{name}: {reply}");
    }
}

#[test]
fn alpha18_array_set_out_of_bounds_rolls_back_output_and_error_stream() {
    let input = payload(
        r#"print("uncommitted"); eprint("pending"); bind a = [array: 1, 2]; print(array_set(a, 9, 7));"#
    );
    for (mode, response) in [
        ("check", check_request(&input)),
        ("run", execute_request(&input)),
    ] {
        let reply: Value = serde_json::from_str(&response).unwrap();
        assert_eq!(reply["ok"], false, "{mode}: {reply}");
        assert_eq!(reply["diagnostic"]["code"], "E0063", "{mode}: {reply}");
        assert_eq!(reply["stdout"], "", "{mode}: {reply}");
        assert_eq!(reply["stderr"], "", "{mode}: {reply}");
    }
}

#[test]
fn alpha18_failed_update_does_not_affect_the_next_workspace() {
    let bad: Value = serde_json::from_str(
        &execute_request(&payload("print(array_set([array: 1], -1, 2));"))
    ).unwrap();
    assert_eq!(bad["ok"], false, "{bad}");
    assert_eq!(bad["diagnostic"]["code"], "E0063", "{bad}");
    let healthy: Value = serde_json::from_str(
        &execute_request(&payload("print(array_set([array: 1], 0, 2));"))
    ).unwrap();
    assert_eq!(healthy["ok"], true, "{healthy}");
    assert_eq!(healthy["stdout"], "[array: 2]\n", "{healthy}");
}
