# Playground diagnostic guidance

The pinned Scarp compiler owns its diagnostic code, message, help and source ranges. Some published help strings describe native CLI switches or Rust embedding controls that are not available in the browser.

The Playground adds a separate local recovery paragraph for selected exact diagnostic codes. The original compiler hint is preserved in an expandable disclosure and in exported failure reports; unknown codes retain their existing rendering. The browser does not infer a quota from free-form compiler text, claim that allocation failures prove a configured limit was exceeded, or change any interpreter behavior.

For example, E0052 explains the current 2,048 decimal digit and 256 KiB cumulative BigInt limb limits. Either allowance may be reached, and other work or allocation limits still apply. E0053 remains distinct as a reservation/capacity failure. E0054 explains the different input semantics of Check and Run, including buffered prompts. Static Verify is non-executing.

The code mapping was reviewed against Scarp v0.0.7-alpha.1 at 996bd5b83c8cb26e98637563729f67bdacc61cd4 and the browser bridge configuration. Revisit the mapping when updating compiler versions or browser budgets. No user code, input or telemetry is collected by this feature.
