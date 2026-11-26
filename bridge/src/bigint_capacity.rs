//! Exact browser-quota regressions using the published compiler and real bridge.
use super::*;

fn request(source: &str) -> String {
    json!({"entry":"main.srp","files":{"main.srp":source}}).to_string()
}

fn decode(reply: String) -> Value {
    serde_json::from_str(&reply).unwrap()
}

fn exact(source: &str, stdout: &str) {
    let payload = request(source);
    for reply in [verify_request(&payload), check_request(&payload)] {
        let result = decode(reply);
        assert_eq!(result["ok"], true, "{result}");
        assert_eq!(result["stdout"], "", "{result}");
        assert_eq!(result["stderr"], "", "{result}");
    }
    let result = decode(execute_request(&payload));
    assert_eq!(result["ok"], true, "{result}");
    assert_eq!(result["stdout"], stdout, "{result}");
    assert_eq!(result["stderr"], "", "{result}");
}

fn bounded_failure(source: &str, code: &str) {
    let payload = request(source);
    let verification = decode(verify_request(&payload));
    assert_eq!(verification["ok"], true, "{verification}");
    for reply in [check_request(&payload), execute_request(&payload)] {
        let result = decode(reply);
        assert_eq!(result["ok"], false, "{result}");
        assert_eq!(result["diagnostic"]["code"], code, "{result}");
        assert_eq!(result["stdout"], "", "{result}");
        assert_eq!(result["stderr"], "", "{result}");
    }
}

#[test]
fn exact_signed_decimal_round_trip_at_browser_ceiling() {
    let expected = format!("-{}\n", "9".repeat(2048));
    exact(
        r#"bind n=bigint(text_concat("-",text_repeat("9",2048))); print(n);"#,
        &expected,
    );
}

#[test]
fn exact_balanced_multiplication_at_browser_ceiling() {
    // (10^1024 - 1)^2 = 10^2048 - 2*10^1024 + 1.
    let expected = format!("{}8{}1\n", "9".repeat(1023), "0".repeat(1023));
    exact(r#"bind n=bigint(text_repeat("9",1024)); print(n*n);"#, &expected);
}

#[test]
fn input_and_result_digit_limits_are_independent_of_raw_source_length() {
    for source in [
        r#"print("before"); print(bigint(text_repeat("9",2049)));"#,
        r#"print("before"); print(bigint(text_repeat("0",2049)));"#,
        r#"print("before"); print(bigint(text_repeat("9",2048)) + bigint("1"));"#,
    ] {
        bounded_failure(source, "E0052");
    }
}

#[test]
fn legal_operands_can_exceed_general_division_work_budget() {
    bounded_failure(
        r#"bind a=bigint(text_repeat("9",2048)); bind b=bigint(text_repeat("7",1024)); print("before"); print(a/b);"#,
        "E0017",
    );
    exact(r#"print(bigint("9223372036854775808") + bigint("1"));"#, "9223372036854775809\n");
}
