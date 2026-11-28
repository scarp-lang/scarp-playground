# Exact test output differences and report exports

Failed output assertions now retain a bounded window around the first mismatching Unicode scalar in stdout or stderr, even when the mismatch falls beyond the ordinary output preview. The display distinguishes spaces, tabs, CR/LF, invisible control characters and EOF. Offsets are UTF-16; line and scalar column are 1-based. Comparison remains exact and includes final newlines.

Manual tests and learning challenges can export versioned JSON or JUnit XML reports. The default summary contains case names, compiler version/commit, statuses and counts, but omits freeform messages and output. An explicit checkbox enables bounded captured output and diagnostic text. Neither mode serializes source or input fields; names and output may themselves contain private text. Review before sharing. Unexecuted cases remain skipped, not passed, and infrastructure errors remain distinct from failed assertions.
