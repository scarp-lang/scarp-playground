# Deferred editor tools and bundle verification

The initial shell only needs the exact default Hello Scarp fixture.
The full example catalogue and source-only example-switch validation are
loaded by the deferred example browser. Its callback supplies the selected
fixture and byte-exact untouched-session decision; the existing replacement
confirmation, persistence flush, and source isolation still belong to App.

The source explorer, folder relocation, module graph and folder/ZIP import
preview load on demand. Each has an independent loading boundary; opening a
tool does not replace the editor or start a compiler worker. No new external
dependency or remote source service is used.

Production builds emit a Vite manifest for verification. The existing
400,000-byte initial JavaScript limit is unchanged. The bundle check also
walks the static import closure and requires the optional panels to be
separate dynamic entries, so splitting a large eager vendor chunk does not
silently evade the original performance guard.
