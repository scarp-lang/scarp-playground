# Browser operation details

The output panel shows local elapsed turnaround for Run, Check, and Verify. It includes request validation, worker creation, WASM loading, compilation, evaluation where applicable, and response delivery. It is not interpreter CPU time, a performance benchmark, or a memory measurement.

Successful Run also displays the UTF-8 byte lengths of captured stdout and stderr. Failed operations discard partial output; Check and Verify are silent and do not show output lengths. Clear, source changes, and superseded operations remove the statistics alongside the associated result. Statistics are derived on the main thread from validated results, not from worker-provided telemetry.

The expandable limits section describes selected existing quotas, including the deadline, workspace and input/output ceilings, step and print budgets, and BigInt digit and limb limits. These are independent logical quotas, not browser process-memory guarantees. The Rust bridge remains the authority for interpreter limits, and this change does not raise them.

Statistics are transient UI metadata, not included in result downloads, share URLs, or saved workspaces. No telemetry is transmitted. Static Verify no longer displays a message suggesting the program was executed.
