# Duplicate a Scarp source file

The Playground now supports **Duplicate file** in the workspace editor.
This makes an independent copy of the selected virtual `.srp` file without
overwriting the original, changing the project's entrypoint, or uploading any
source code.

## Workflow

1. Select the tab for the source module you want to copy.
2. Click **Duplicate file**. The browser proposes a sibling path such as
   `lib/math_copy.srp` or `lib/math_copy2.srp` if the first copy exists.
3. Optionally change the destination to a new directory such as
   `apps/main_copy.srp`. File paths must meet the existing 128-character,
   relative `.srp` policy and must not already exist.
4. Click **Preview duplication**. The preview shows the destination, copy
   operation and complete before/after changed import lines.
5. Click **Apply duplication** to create the copy atomically. The copied file
   becomes the selected editor tab while the original remains untouched.
6. If needed, click **Undo bulk change** before making another source edit
   to remove the copied module and restore the original project snapshot.

To execute a duplicated entry file, select its tab and click **Set as entry**.
Otherwise, the existing project entrypoint continues to run unchanged.

## How import preservation works

Scarp's pinned in-memory source loader resolves module imports relative to
the *importing file*. If `main.srp` originally contains:

```scarp
import "math.srp" as math;
print(math.twice(21));
```

copying `main.srp` to `apps/main_copy.srp` produces:

```scarp
import "../math.srp" as math;
print(math.twice(21));
```

Only the copied file's recognized, top-level `import "...srp" as alias;`
strings may be rebased. The original file's source, every other project
module, import aliases, comments, regular strings, Unicode text and original
line-ending styles remain untouched. If the destination is in the same
directory and an import already resolves to the same module, its original
spelling is retained.

This is not the compiler's F2 **Rename symbol** feature or the existing
**Rename file** operation. Copying creates one additional virtual module;
it does not redirect consumers of the original.

## Safety and limitations

- The feature is **browser-only**, bounded, deterministic and **nonexecuting**.
- It rejects unsafe/duplicate destinations and an already-full 12-file
  workspace. It rejects malformed or ambiguous import syntax, missing or
  unsafe import targets, more than 120 required path rewrites, and file/total
  byte budgets that a copy would exceed.
- The preview becomes invalid after edits to the proposed path or workspace.
  Neither preview nor cancellation modifies any source.
- The one-step undo token exists only in memory and expires on subsequent
  project edits; it is not a persistent history or automatic backup.
- The import scanner is a conservative editing aid, **not a complete compiler
  validation**. Use **Check code** or **Run code** after duplication and
  select **Export project** to save the full virtual source graph as JSON.
