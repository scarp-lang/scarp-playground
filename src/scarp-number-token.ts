// Keep this Monaco-only highlighter aligned with the published lexer.
// A lowercase d is an opt-in exact base-ten decimal suffix (alpha.20).
// Exponent notation remains binary64-only: 1e3d is not a valid number.
// Reject trailing identifier bytes so malformed literals are not styled as valid.
export const SCARP_NUMBER_TOKEN = /\b(?:0x[0-9a-fA-F]+|0b[01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+|d)?)(?![\w])/;
