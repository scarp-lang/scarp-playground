//! Execute every public learning challenge reference solution through the real bridge.
use super::{execute_request, verify_request};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::{BTreeMap, BTreeSet}, fs, path::PathBuf};

#[derive(Deserialize)]
struct Challenge {
    id: String,
    entry: String,
    files: Vec<String>,
    cases: Vec<Case>,
}
#[derive(Deserialize)]
struct Case {
    name: String,
    stdin: String,
    stdout: String,
    stderr: String,
}

fn catalogue() -> Vec<Challenge> {
    serde_json::from_str(include_str!("../../src/challenges/catalogue.json")).unwrap()
}

fn sources(challenge: &Challenge, variant: &str) -> BTreeMap<String, String> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../src/challenges/fixtures").join(&challenge.id).join(variant);
    challenge.files.iter().map(|path| {
        let text = fs::read_to_string(root.join(path)).unwrap_or_else(|problem| {
            panic!("{} {variant} {path}: {problem}", challenge.id)
        });
        (path.clone(), text)
    }).collect()
}

fn response(challenge: &Challenge, files: &BTreeMap<String, String>, case: &Case) -> Value {
    let request = json!({ "entry": challenge.entry, "files": files, "stdin": case.stdin, "allowPrompts": false });
    serde_json::from_str(&execute_request(&request.to_string())).unwrap()
}

#[test]
fn reference_solutions_match_every_public_case() {
    let catalogue = catalogue();
    assert!(catalogue.len() >= 20);
    let mut ids = BTreeSet::new();
    for challenge in &catalogue {
        assert!(ids.insert(&challenge.id));
        assert!(!challenge.cases.is_empty() && challenge.cases.len() <= 8);
        let files = sources(challenge, "solution");
        for case in &challenge.cases {
            let result = response(challenge, &files, case);
            assert_eq!(result["ok"], true, "{} / {}: {result}", challenge.id, case.name);
            assert_eq!(result["stdout"], case.stdout, "{} / {}", challenge.id, case.name);
            assert_eq!(result["stderr"], case.stderr, "{} / {}", challenge.id, case.name);
        }
    }
}

#[test]
fn starter_sources_are_valid_and_require_actual_work() {
    for challenge in catalogue() {
        let files = sources(&challenge, "starter");
        let request = json!({ "entry": challenge.entry, "files": files });
        let verified: Value = serde_json::from_str(&verify_request(&request.to_string())).unwrap();
        assert_eq!(verified["ok"], true, "{} starter: {verified}", challenge.id);
        assert!(challenge.cases.iter().any(|case| {
            let result = response(&challenge, &files, case);
            result["ok"] != true || result["stdout"] != case.stdout || result["stderr"] != case.stderr
        }), "{} starter already passes all cases", challenge.id);
    }
}
