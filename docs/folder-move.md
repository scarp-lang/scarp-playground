# Move source folders

Use **Move folder** to relocate every descendant .srp module under a
virtual directory. Choose an existing folder and an unused destination
prefix, preview the complete path map and affected import lines, then
apply the move. The browser never touches a host directory.

The entrypoint follows its relocated file. Imports are rebased
simultaneously, so internal relative paths that still point to the
same original modules retain their original spelling. Incoming and
outgoing imports crossing the relocated boundary are rewritten.
Comments, string content and unrelated source bytes remain unchanged.

The preview refuses overlapping source/destination prefixes, populated
destination directories, overlong resulting paths, ambiguous import
syntax, unsupported path spellings and missing import targets. This is a
conservative lexical planner, not a compiler verification result.
The shared 120-import rewrite limit and workspace byte/file limits apply.

Apply creates one atomic in-memory undo token, independently validated
against the original source graph. Use **Undo bulk change** before
editing source to restore the previous paths, entry and contents.
Nothing executes automatically; choose Verify or Run to validate
the resulting program with the real interpreter.
