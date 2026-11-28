# Source text integrity

Browser editor text and imported workspace JSON use JavaScript strings.
An unmatched UTF-16 surrogate is not a Unicode scalar: encoding it with
TextEncoder or a Blob silently substitutes U+FFFD. Scarp's Rust strings
cannot represent such input. The shared workspace validator and stdin
admission now reject it before execution, persistence or source export.
An intentional U+FFFD character remains valid. The byte counter uses
actual scalar widths and does not allocate an encoded copy.

Portable project files are read with fatal UTF-8 decoding. Escaped lone
surrogates inside otherwise well-formed JSON are rejected by validation
after parsing. Legacy snippet links also enforce an encoded length bound.

The source limits remain 64 KiB per file and 128 KiB in total. Portable
and locally saved JSON permit up to six times the aggregate source byte
limit plus 4 KiB of metadata, because JSON can represent a single ASCII
control character with six bytes. The existing source limits still apply
after parsing. Browser storage quotas may independently prevent saving.
Only the validated source paths, contents and entrypoint are persisted;
extra workspace properties are not serialized.
