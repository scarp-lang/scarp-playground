//! Repeatable boundary mutation tests for the pinned, real Scarp interpreter.
//!
//! No rand crate, system clock, external corpus or network is needed. The
//! seed and corpus size are constants so every CI run covers the same inputs.
//! These are bounded regressions, not coverage-guided or process-OOM fuzzing.
use super::*;
use std::panic::{catch_unwind, AssertUnwindSafe};

const SEED: u64 = 0x5CA2_2026_1106_0003;
const PROGRAM_CASES: usize = 256;
const WIRE_CASES: usize = 128;
const TOKENS: &[char] = &[
    '(', ')', '[', ']', '{', '}', '"', '\\', ';', ':', '=', '/', '?', '!',
    '+', '-', '*', '.', '0', '9', ' ', '\n', '\t', '\0', 'é', '😀',
];

const PROGRAMS: &[&str] = &[
    "print(1);",
    "bind n = 3; print(n + 2);",
    "var n = 0; repeat 4 as index { n += index; } print(n);",
    "pure funcra twice(n: integer) -> integer { return n * 2; } print(twice(21));",
    "print(\"😀漢字\"); print(missing);",
    "import \"lib/ops.srp\" as ops; print(ops.twice(21));",
    "print(rms([2.0, -2.0]));",
    "bind text = \"hello\"; print(text);",
    "print(text_repeat(\"x\", 4));",
    "print([1, 2, 3]);",
    "bind n = 1; while n < 5 { n += 1; } print(n);",
    "import \"missing.srp\" as missing; print(1);",
];

fn next(state: &mut u64) -> u64 {
    let mut x = *state;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    *state = x;
    x
}

/// Mutate only at Unicode scalar boundaries, then let the UTF-8 JSON encoder
/// represent the resulting arbitrary, potentially invalid Scarp input.
fn mutate(state: &mut u64, original: &str, rounds: usize) -> String {
    let mut chars: Vec<char> = original.chars().collect();
    for _ in 0..rounds {
        let position = (next(state) as usize) % (chars.len() + 1);
        let token = TOKENS[(next(state) as usize) % TOKENS.len()];
        match next(state) % 4 {
            0 => chars.insert(position, token),
            1 if position < chars.len() => { chars.remove(position); }
            2 if position < chars.len() => chars[position] = token,
            _ if position < chars.len() && chars.len() < 512 => {
                let existing = chars[position];
                chars.insert(position, existing);
            }
            _ => chars.push(token),
        }
    }
    chars.into_iter().collect()
}

/// A bridge panic or malformed/out-of-budget reply is a reproducible test
/// failure. Include the source or wire input and the fixed seed for replay.
fn inspect(
    operation: &str,
    case: usize,
    input: &str,
    action: fn(&str) -> String,
    navigation: bool,
) -> Value {
    let response = catch_unwind(AssertUnwindSafe(|| action(input))).unwrap_or_else(|_| {
        panic!("{operation} panicked: seed={SEED:#x}, case={case}, input={input:?}")
    });
    let value: Value = serde_json::from_str(&response).unwrap_or_else(|problem| {
        panic!("{operation} returned invalid JSON: seed={SEED:#x}, case={case}, {problem}: {response:?}")
    });
    assert!(
        value["ok"].is_boolean(),
        "{operation} returned no boolean ok flag: seed={SEED:#x}, case={case}, response={value}"
    );
    if navigation {
        if value["ok"] == true {
            let target = &value["target"];
            assert!(
                target.is_null()
                    || (target["path"].is_string()
                        && target["start"]["line"].is_u64()
                        && target["start"]["column"].is_u64()
                        && target["end"]["line"].is_u64()
                        && target["end"]["column"].is_u64()),
                "invalid navigation target: seed={SEED:#x}, case={case}, response={value}"
            );
        }
    } else {
        let stdout = value["stdout"].as_str().unwrap_or_else(|| {
            panic!("{operation} invalid stdout: seed={SEED:#x}, case={case}, response={value}")
        });
        let stderr = value["stderr"].as_str().unwrap_or_else(|| {
            panic!("{operation} invalid stderr: seed={SEED:#x}, case={case}, response={value}")
        });
        assert!(
            stdout.len() + stderr.len() <= 1024 * 1024,
            "{operation} exceeded output allowance: seed={SEED:#x}, case={case}"
        );
        if operation == "check" || value["ok"] == false {
            assert_eq!(stdout, "", "leaked stdout: seed={SEED:#x}, case={case}");
            assert_eq!(stderr, "", "leaked stderr: seed={SEED:#x}, case={case}");
        }
    }
    if value["ok"] == false {
        assert!(
            value["error"].is_string(),
            "{operation} failed without error: seed={SEED:#x}, case={case}, response={value}"
        );
    }
    value
}

#[test]
fn seeded_source_mutations_preserve_bridge_safety_and_atomic_output() {
    let mut state = SEED;
    for case in 0..PROGRAM_CASES {
        let baseline = PROGRAMS[(next(&mut state) as usize) % PROGRAMS.len()];
        let source = mutate(&mut state, baseline, 1 + case % 4);
        let mut files = BTreeMap::new();
        files.insert("main.srp".to_owned(), source.clone());
        if case % 3 != 0 {
            let module = mutate(
                &mut state,
                "pub pure funcra twice(n: integer) -> integer { return n * 2; }",
                case % 3,
            );
            files.insert("lib/ops.srp".to_owned(), module);
        }
        let request = json!({ "entry": "main.srp", "files": files }).to_string();
        inspect("execute", case, &request, execute_request, false);
        inspect("check", case, &request, check_request, false);

        // Exercise valid UTF-8 byte positions, EOF, and offsets landing inside
        // multi-byte characters. No JavaScript/UTF-16 offset guesses here.
        let offset = if case % 7 == 0 {
            source.len() + 1
        } else {
            (next(&mut state) as usize) % (source.len() + 1)
        };
        let lookup = json!({
            "entry": "main.srp", "files": files,
            "path": "main.srp", "offset": offset
        }).to_string();
        inspect("definition", case, &lookup, definition_request, true);
    }
}

#[test]
fn seeded_json_wire_mutations_remain_bounded_and_parseable() {
    let baseline = json!({
        "entry": "main.srp",
        "files": { "main.srp": "print(\"😀\");" }
    }).to_string();
    let mut state = SEED ^ 0xA110_CA7E;
    for case in 0..WIRE_CASES {
        let raw = mutate(&mut state, &baseline, 1 + case % 5);
        inspect("execute", case, &raw, execute_request, false);
        inspect("check", case, &raw, check_request, false);
        inspect("definition", case, &raw, definition_request, true);
    }
}

#[test]
fn malformed_boundaries_and_followup_recovery_are_deterministic() {
    let bad = [
        "{",
        "null",
        "[]",
        "{}",
        "{\"entry\":5,\"files\":{}}",
        "{\"entry\":\"main.srp\",\"files\":{\"main.srp\":null}}",
        "{\"entry\":\"../main.srp\",\"files\":{\"main.srp\":\"print(1);\"}}",
    ];
    for (case, raw) in bad.into_iter().enumerate() {
        for (operation, action) in [
            ("execute", execute_request as fn(&str) -> String),
            ("check", check_request as fn(&str) -> String),
            ("definition", definition_request as fn(&str) -> String),
        ] {
            let value = inspect(operation, case, raw, action, operation == "definition");
            assert_eq!(value["ok"], false, "{operation}, case={case}");
        }
        // A rejected request must not poison the next genuine compiler use.
        let good = json!({
            "entry": "main.srp",
            "files": { "main.srp": "print(\"recovered\");" }
        }).to_string();
        let response = inspect("execute", case, &good, execute_request, false);
        assert_eq!(response["ok"], true, "case={case}: {response}");
        assert_eq!(response["stdout"], "recovered\n");
    }
}
