# Program test cases

Open **Test cases** below the buffered program input. Add up to eight
named cases. Each supplies independent stdin and an explicit prompt
mode, then expects exact successful stdout/stderr or a compiler
diagnostic code such as E0085. Include final line breaks in expected
output when the program prints them. The editor's ordinary stdin is
not changed; Copy current input copies its value into one case.

Run test cases evaluates the same source snapshot and entrypoint
sequentially through the real Scarp WebAssembly interpreter. No two
compiler workers run concurrently. Each case has the existing
12-second wall-clock limit and interpreter budgets. Test results
distinguish assertion mismatches from infrastructure failures;
the latter stop the suite. Remaining cases are explicitly not run.

Output comparison is exact, before truncating displayed previews.
Expected stdout and stderr each support up to 16 KiB; stdin is
limited to 16 KiB, and all test-case text together to 128 KiB.
A failure to load the compiler or a timeout is not a passing
expected diagnostic. Tests do not claim to verify host-native code.

Use Stop tests, Stop test cases, or edit source to cancel a running
suite and discard stale results. Editing case configuration clears
the report. The suite and results are session-only by default, never included
in source ZIP, project JSON, sharing or local workspace persistence.

## Separate case files

Use **Export test cases** to explicitly download a versioned, unencrypted
JSON file with the case definitions, including their input and expected
output. Do not share files containing private text. Source files,
ordinary editor stdin and execution results are not included.

Use **Import test cases** to review a local case file and replace the
current case list. A changed editor makes a pending preview stale.
Unknown versions, malformed UTF-8 and excessive data are rejected.
Nothing is executed automatically; Run test cases remains explicit.
