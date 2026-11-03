# Contributing

Thanks for helping build the Scarp Playground.

Use feature branches and PRs; do not commit generated `public/compiler` bundles.
Run `npm run lint`, `npm run typecheck`, `npm run test` and
`cargo test --manifest-path bridge/Cargo.toml`. Follow the commands in README
to build real WASM. Where a compiler feature is in doubt, check and pin the
actual compiler commit rather than inventing sample output.

Never replace real compiler execution with a mock production pathway.
Add regression tests for new source, import and diagnostic behavior.
Document any compatibility or release-gate change in README and
`docs/architecture.md`.

Every stable release requires a stable compiler plus independent Playground
verification. Pre-release versions must state their compiler version and SHA.
