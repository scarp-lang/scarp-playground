# BigInt browser capacity evidence

Reviewed against the published compiler v0.0.7-alpha.1 (996bd5b83c8cb26e98637563729f67bdacc61cd4). The browser limits remain 2,048 decimal digits, 256 KiB cumulative limb reservations, 200,000 deterministic steps, 1 MiB combined captured output and a 12-second worker deadline. No larger runtime profile is enabled.

## Why digits alone do not define capacity

The released compiler represents magnitudes in base-10^9 u32 limbs. Parsing and direct decimal formatting are linear in digit count; balanced multiplication is schoolbook and general division performs quotient-digit binary search. Allocation quotas include intermediate reservations and scratch, not only the final normalized value. The compiler's native test for a 65,536-bit value uses 19,729 decimal digits and a 30-million-step allowance; this is not a browser capability claim.

For positive operands of d digits, the limb count is ceil(d/9). A 1,024 by 1,024-digit product therefore prepays 114*114 + 228 + 1 = 13,225 multiplication-kernel steps, excluding parsing, formatting and dispatch. The result may have up to 2,048 digits. A 2,048-digit dividend and 1,024-digit divisor have 228 and 114 limbs respectively; general division prepays 64*115*114 + 4*228 = 839,952 steps, exceeding the entire browser budget before other costs. This is an analytical estimate from the pinned implementation, not a time measurement.

## Acceptance matrix

The bridge tests verify exact signed round-trip and balanced multiplication at the existing ceiling, raw leading-zero input rejection, carry overflow past the digit limit, expensive division refusal, static Verify versus runtime Check semantics, and fresh execution recovery. Browser tests use the real WASM worker in Chromium, Firefox and WebKit. They compare exact stdout including the final newline, confirm atomic failures and attach local turnaround observations. Chromium memory-pressure tests also cover BigInt rejection and worker cleanup, with provenance read from the current compatibility metadata instead of an obsolete hard-coded compiler version.

The CI evidence is not a physical memory cap, an OOM certification, or proof that all operations on 2,048-digit values succeed. Do not extrapolate timings to 100 million or billion-digit calculations. The published compiler has a one-million-digit implementation ceiling and the Playground has independent source, text, work and output limits.

## Next capacity gate

Before changing browser defaults, evaluate a separately bounded experimental profile with explicit work and allocation ceilings, test both linear and superlinear algorithms, verify worker cleanup and responsiveness, and measure actual browser-process and WASM-memory behavior. Keep normal Run defaults unchanged until evidence supports a reviewed change. Do not expose native CLI flags in the browser or promise unlimited computation.
