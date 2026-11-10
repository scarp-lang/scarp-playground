# Beginner programs in the Scarp Playground

These examples are sourced directly from the official Scarp compiler's
`examples/` fixtures and run locally through the pinned Rust/WebAssembly
interpreter. They demonstrate **features that exist now**, not language
proposals or unimplemented syntax.

| Playground example | Compiler source | What it demonstrates | Expected output |
| --- | --- | --- | --- |
| If / elif / else | [`examples/decisions.srp`](https://github.com/scarp-lang/scarp/blob/main/examples/decisions.srp) | Choose a branch using boolean conditions | "B\nSelected safely.\n" |
| While loops | [`examples/loops.srp`](https://github.com/scarp-lang/scarp/blob/main/examples/loops.srp) | Mutate a counter; use break and continue | "12\n" |
| Counted repeat | [`examples/repeat.srp`](https://github.com/scarp-lang/scarp/blob/main/examples/repeat.srp) | Run a fixed number of iterations | "8\n0\n" |
| Typed functions | [`examples/functions.srp`](https://github.com/scarp-lang/scarp/blob/main/examples/functions.srp) | Use funcra, parameters, return and pure | "35\nHello Scarp\n6\n" |
| Writing output | [`examples/output.srp`](https://github.com/scarp-lang/scarp/blob/main/examples/output.srp) | Compare print, write and newlines | "Hello, Scarp 3 true\n\ndone" |

## Recommended order

Start with **Hello, Scarp** and **Bindings & arithmetic**, then work through
the five samples above. The language uses `funcra` for functions, `var`
for mutable bindings, and both bounded `while` and counted `repeat`
loops. Run each sample and change small inputs to see how the output changes.

These examples rely on Scarp `v0.0.6-alpha.5`, which is the compiler
currently pinned by the Playground. Changes to the language are tested
against the actual interpreter; proposed features such as future composite
types should not appear as runnable samples until released.

Click **Save locally** to keep an edited workspace in this browser, or
**Export project** to preserve it as a source-only JSON file. Built-in
example selection does not overwrite a previously saved project.
