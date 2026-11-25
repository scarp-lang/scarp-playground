# Scarp v0.0.7-alpha.1 browser integration

The compiler pin is [v0.0.7-alpha.1](https://github.com/scarp-lang/scarp/releases/tag/v0.0.7-alpha.1), commit `996bd5b83c8cb26e98637563729f67bdacc61cd4`. The tag points to this commit and the compiler manifest declares the same version. Its crate has no external dependencies, so the proposed Cargo lock update changes the compiler entry only; CI must validate the locked build.

## Browser features

- `array_concat(left, right)`: matching element types, inferred fixed-size output length, persistent inputs and typed empty arrays. The official example and stdout are copied byte-for-byte.
- `integer_gcd`, `integer_hcf`, `integer_lcm`: checked integer reductions over 2–1024 positional arguments; HCF is an alias.
- `softplus(values)`: stable finite vector activation; the example checks inequalities rather than depending on platform-specific last-bit formatting.
- Frame-buffer reuse is internal to the interpreter; returned immutable arrays must survive subsequent calls. The example exercises this contract, not a performance claim.

The integer reduction example follows the compiler's regression case; the softplus and snapshot examples are Playground-authored. Regression coverage includes native bridge Verify/Check/Run, exact fixture output, invalid types and arity, frontend fixture consistency, and browser execution in Chromium, Firefox and WebKit. CI results are required before declaring the integration verified.

## Preserved limitations

Browser execution still uses the disposable Rust/WASM worker. No host terminal, native ELF64 emission, CLI project discovery, persistent token cache or native linker is provided. Existing logical BigInt, allocation, input, output and work limits remain unchanged; they are not physical process-memory limits. No existing Playground release archive changes.
