//! Release-gated browser bridge checks against the annotated Scarp alpha.13 fixtures.
//! These files are copied unchanged from compiler source e755fda37cdaeed29434e848cb5dd41f2f2e7eb2.
use super::*;

fn workspace(source: &str) -> String {
    json!({ "entry": "main.srp", "files": { "main.srp": source } }).to_string()
}

#[test]
fn alpha13_official_snapshots_match_published_stdout_in_all_bridge_modes() {
    let fixtures: &[(&str, &str, &str)] = &[
        (
            "map_projection_snapshots",
            include_str!("../tests/fixtures/alpha13/map_projection_snapshots.srp"),
            include_str!("../tests/fixtures/alpha13/map_projection_snapshots.stdout"),
        ),
        (
            "aggregate_resource_boundaries",
            include_str!("../tests/fixtures/alpha13/aggregate_resource_boundaries.srp"),
            include_str!("../tests/fixtures/alpha13/aggregate_resource_boundaries.stdout"),
        ),
        (
            "persistent_list_updates",
            include_str!("../tests/fixtures/alpha13/persistent_list_updates.srp"),
            include_str!("../tests/fixtures/alpha13/persistent_list_updates.stdout"),
        ),
        (
            "semantic_cache_snapshot",
            include_str!("../tests/fixtures/alpha13/semantic_cache_snapshot.srp"),
            include_str!("../tests/fixtures/alpha13/semantic_cache_snapshot.stdout"),
        ),
    ];
    for &(name, source, expected_stdout) in fixtures {
        let input = workspace(source);
        let static_result: Value = serde_json::from_str(&verify_request(&input)).unwrap();
        assert_eq!(static_result["ok"], true, "verify {name}: {static_result}");
        assert_eq!(static_result["stdout"], "", "verify {name}");
        let checked: Value = serde_json::from_str(&check_request(&input)).unwrap();
        assert_eq!(checked["ok"], true, "check {name}: {checked}");
        assert_eq!(checked["stdout"], "", "check {name}");
        assert_eq!(checked["stderr"], "", "check {name}");
        let executed: Value = serde_json::from_str(&execute_request(&input)).unwrap();
        assert_eq!(executed["ok"], true, "run {name}: {executed}");
        assert_eq!(executed["stdout"], expected_stdout, "run {name}: {executed}");
        assert_eq!(executed["stderr"], "", "run {name}: {executed}");
    }
}

#[test]
fn alpha13_duplicate_map_keys_do_not_leak_previous_stdout() {
    let input = workspace(r#"print("uncommitted"); bind bad = [map: 1: "one", 1: "two"]; print(bad);"#);
    let result: Value = serde_json::from_str(&execute_request(&input)).unwrap();
    assert_eq!(result["ok"], false, "{result}");
    assert_eq!(result["stdout"], "", "{result}");
    assert_eq!(result["stderr"], "", "{result}");
    assert_eq!(result["diagnostic"]["code"], "E0082", "{result}");
}
