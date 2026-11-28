# Local learning progress

After a complete public challenge run, select **Record practice attempt** to save a metadata-only result. Merely opening a challenge or running it does not write progress. Incomplete, cancelled or infrastructure-error suites cannot be recorded. A report can be recorded only once in its browser session.

The separate IndexedDB database stores challenge IDs, compiler commits, case counts, latest and best passed counts, attempt counts and timestamps. It excludes all source, input, output and compiler messages. **View saved progress** loads the record explicitly; **Clear learning progress** deletes it after confirmation. Saved projects and ordinary source autosave are independent. Transactions serialize concurrent tab writes. Results from older compiler commits or changed case counts are marked outdated and a new attempt starts that challenge's current revision.

Progress is a local practice aid, not certification. Passing public cases does not prove correctness for other inputs. Browser storage is subject to eviction and privacy settings.
