//! Explicitly supplied prompt support with no ambient terminal access.
use super::*;
use std::io::Write;

fn request(source: &str, stdin: &str, allow_prompts: bool) -> String {
    json!({
        "entry": "main.srp", "files": { "main.srp": source },
        "stdin": stdin, "allowPrompts": allow_prompts,
    }).to_string()
}

#[test]
fn published_alpha17_boolean_prompt_uses_buffered_input_with_exact_stdout() {
    let source = include_str!("../tests/fixtures/alpha17/boolean_prompt.srp");
    let stdin = include_str!("../tests/fixtures/alpha17/boolean_prompt.stdin");
    let expected = include_str!("../tests/fixtures/alpha17/boolean_prompt.stdout");
    let payload = request(source, stdin, true);
    let verified: Value = serde_json::from_str(&verify_request(&payload)).unwrap();
    assert_eq!(verified["ok"], true, "{verified}");
    let result: Value = serde_json::from_str(&execute_request(&payload)).unwrap();
    assert_eq!(result["ok"], true, "{result}");
    assert_eq!(result["stdout"], expected, "{result}");
    assert_eq!(result["stderr"], "", "{result}");
}

#[test]
fn prompt_mode_is_opt_in_and_check_is_always_noninteractive() {
    let source = r#"print(input_boolean("Confirm? "));"#;
    for payload in [request(source, "true\n", false), request(source, "true\n", true)] {
        let check: Value = serde_json::from_str(&check_request(&payload)).unwrap();
        assert_eq!(check["ok"], false, "{check}");
        assert_eq!(check["diagnostic"]["code"], "E0054", "{check}");
        assert_eq!(check["stdout"], "", "{check}");
        assert_eq!(check["stderr"], "", "{check}");
    }
    let run: Value = serde_json::from_str(&execute_request(&request(source, "true\n", false))).unwrap();
    assert_eq!(run["ok"], false, "{run}");
    assert_eq!(run["diagnostic"]["code"], "E0054", "{run}");
    let permitted: Value = serde_json::from_str(&execute_request(&request(source, "false\n", true))).unwrap();
    assert_eq!(permitted["ok"], true, "{permitted}");
    assert_eq!(permitted["stdout"], "Confirm? false\n", "{permitted}");
}

#[test]
fn invalid_boolean_and_late_failure_never_leak_prompts_or_partial_output() {
    for (source, stdin, code) in [
        (r#"print("before"); print(input_boolean("Confirm? "));"#, "not boolean\n", "E0084"),
        (r#"print("before"); print(input_boolean("Confirm? "));"#, "", "E0055"),
        (r#"print("before"); bind ok = input_boolean("Confirm? "); assert(false);"#,
         "true\n", "E0065"),
    ] {
        let reply: Value = serde_json::from_str(&execute_request(&request(source, stdin, true))).unwrap();
        assert_eq!(reply["ok"], false, "{reply}");
        assert_eq!(reply["diagnostic"]["code"], code, "{reply}");
        assert_eq!(reply["stdout"], "", "{reply}");
        assert_eq!(reply["stderr"], "", "{reply}");
    }
}

#[test]
fn simultaneous_captures_have_one_independent_output_quota() {
    let total = std::rc::Rc::new(std::cell::Cell::new(0));
    let mut stdout = BrowserCapture::new(std::rc::Rc::clone(&total));
    let mut stderr = BrowserCapture::new(total);
    stdout.write_all(&vec![b'a'; MAX_CAPTURE_BYTES - 1]).unwrap();
    stderr.write_all(b"b").unwrap();
    assert!(stdout.write_all(b"over").is_err());
    assert!(stderr.write_all(b"over").is_err());
    assert_eq!(stdout.bytes.len() + stderr.bytes.len(), MAX_CAPTURE_BYTES);
}
