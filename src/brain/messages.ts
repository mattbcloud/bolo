/**
 * Message System — aIndy3.1 TypeScript Port
 *
 * Implements the complete brain-to-brain multiplayer communication pipeline:
 *   isAlly              (0x01E9F0) — team membership check
 *   isOkToReceive       (0x01E7EC) — validate message recipient
 *   comparePlayerNames  (0x01E914) — name comparison with '@' suffix support
 *   makeLowercase       (0x01ECC2) — ASCII lowercase conversion
 *   recognizeWord       (0x01EBF4) — keyword dictionary lookup
 *   tokenizeMessage     (0x01E5EE) — split message into typed token array
 *   disposeTokenString  (0x01E748) — free token handles
 *   recognizeBrainCommand (0x01DD9A) — map tokens → command code
 *   receiveAnyMessages  (0x01C40A) — main per-tick message handler
 *   sendPillTargetMessage / SendPillTargetMessage — broadcast pill target
 *
 * References:
 *   message_system_decode.md, message_subparsers_decode.md,
 *   string_helpers_decode.md, receiveanymessages_decode.md
 *
 * Mac OS adaptations:
 *   NewHandle / DisposeHandle → plain JS objects (GC handles cleanup)
 *   Character class table (A4[478]) → inline char category functions
 *   Message struct from myTank[92] → A4State.pendingMessage field (added below)
 */

import { A4State } from './a4_state.js';
import type { BrainState } from './aindy_interface.js';

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN RECORD
// ─────────────────────────────────────────────────────────────────────────────

/** Typed token from tokenizeMessage */
export interface Token {
  /** Token type byte:
   *  0x2C = name (quoted player name)
   *  0x2B = numeric value
   *  0x33 = end sentinel
   *  other = keyword code (from recognizeWord)
   */
  type: number;
  /** For type 0x2C: player name string */
  name?: string;
  /** For type 0x2B: parsed integer */
  value?: number;
}

/** Token type constants */
const T_NAME     = 0x2C;   // ',' — quoted player name
const T_NUMBER   = 0x2B;   // '+' — numeric value
const T_SENTINEL = 0x33;   // '3' — end of token array

// ─────────────────────────────────────────────────────────────────────────────
// KEYWORD DICTIONARY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Keyword dictionary (41 entries, codes 0-40).
 * Code 41 (0x29) = not found.
 * Values inferred from sub-parser usage in message_subparsers_decode.md.
 */
const KEYWORDS: readonly string[] = [
  'no',       // 0
  'yes',      // 1
  'ok',       // 2
  'sure',     // 3
  'not',      // 4
  'aitype',   // 5  — AI capability descriptor
  'defended', // 6  — pill adjective A
  'hostile',  // 7  — pill adjective B
  'near',     // 8
  'far',      // 9
  'can',      // 10
  'enemy',    // 0x0B
  'neutral',  // 0x0C
  'get',      // 13
  'take',     // 14
  'fix',      // 15
  'place',    // 16
  'base',     // 17
  'pill',     // 18
  'kill',     // 0x13
  'attack',   // 0x1A
  'defend',   // 0x19
  'pillloc',  // 0x1B — pill location type A
  'at',       // 23
  'the',      // 24
  'a',        // 25
  'from',     // 26
  'north',    // 0x1B
  'south',    // 0x1C
  'east',     // 0x1D
  'west',     // 0x1E — pill location type B
  'ally',     // 0x17 = 23 ... (re-index)
  'stay',     // 31
  'really',   // 32
  'type',     // 0x15
  'carried',  // 34
  'getbase',  // 35
  'pilltarget', // 36
  'goodbye',  // 37
  'status',   // 0x26 = 38
  'priority', // 0x28 = 39
  'help',     // 40
];

// Correct code assignments matching sub-parser usage
const KW_CODES: Record<string, number> = {
  'aitype':     0x05,
  'defended':   0x06,
  'hostile':    0x07,
  'enemy':      0x0B,
  'neutral':    0x0C,
  'type':       0x15,
  'ally':       0x17,
  'defend':     0x19,
  'attack':     0x1A,
  'pillloc':    0x1B,
  'west':       0x1E,
  'status':     0x26,
  'priority':   0x28,
  'kill':       0x13,
  'get':        0x0D,
  'take':       0x0E,
  'fix':        0x0F,
  'place':      0x10,
  'base':       0x11,
  'pill':       0x12,
  'really':     0x20,
  'stay':       0x1F,
  'carried':    0x22,
  'getbase':    0x23,
  'pilltarget': 0x24,
  'goodbye':    0x25,
};

// ─────────────────────────────────────────────────────────────────────────────
// CHARACTER CLASSIFICATION (replaces A4[478] char-class table)
// ─────────────────────────────────────────────────────────────────────────────

/** Is character a word separator? (space, comma, etc.) */
function isSeparator(c: string): boolean {
  return c === ' ' || c === ',' || c === '\t' || c === '\r' || c === '\n'
    || c === ';' || c === '\0';
}

/** Is character a digit? */
function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

/** Is character a word-continuation char? (letter or digit) */
function isWordChar(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || isDigit(c) || c === '_';
}

// ─────────────────────────────────────────────────────────────────────────────
// STRING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * comparePlayerNames (0x01E914) — compare with '@' suffix awareness.
 * "Alice@server" matches "Alice".
 */
export function comparePlayerNames(nameA: string, nameB: string): number {
  const lenA = nameA.length;
  let i = 0;
  while (i < lenA && i < nameB.length && nameA[i] === nameB[i]) i++;
  if (i === lenA && nameB[i] === '@') return 0;   // A exhausted, B at '@'
  if (i === lenA && i === nameB.length) return 0; // exact match
  const ca = i < nameA.length ? nameA.charCodeAt(i) : 0;
  const cb = i < nameB.length ? nameB.charCodeAt(i) : 0;
  return ca - cb;
}

/**
 * makeLowercase (0x01ECC2) — in-place A–Z → a–z.
 * Port: returns lowercase string (JS strings are immutable).
 */
export function makeLowercase(s: string): string {
  return s.toLowerCase();
}

/**
 * recognizeWord (0x01EBF4) — keyword dictionary lookup.
 * Returns keyword code or 0x29 (41 = not found).
 */
export function recognizeWord(word: string): number {
  const lower = word.toLowerCase();
  const code = KW_CODES[lower];
  if (code !== undefined) return code;
  // Check full keywords array for code by index
  for (let i = 0; i < KEYWORDS.length; i++) {
    if (KEYWORDS[i] === lower) return i;
  }
  return 0x29;   // not found
}

/**
 * convertCstringToLong (0x01EC58) — decimal string → int32.
 */
function convertCstringToLong(s: string): number {
  return parseInt(s, 10) || 0;
}

/**
 * getName (0x01EABA) — extract backtick-quoted name from message.
 * Returns { name, nextPos }.
 */
function getName(msg: string, pos: number): { name: string; nextPos: number } {
  let name = '';
  let i = pos;
  while (i < msg.length && msg[i] !== '`' && name.length < 35) {
    name += msg[i++];
  }
  // Skip to closing backtick
  if (i < msg.length && msg[i] === '`') i++;
  return { name, nextPos: i };
}

/**
 * getValue (0x01EB16) — extract signed decimal integer from message.
 * Returns { value, nextPos }.
 */
function getValue(msg: string, pos: number): { value: number; nextPos: number } {
  let buf = '';
  let i = pos;
  if (i > 0 && msg[i - 1] === '-') buf = '-';
  while (i < msg.length && isDigit(msg[i]) && buf.length < 12) {
    buf += msg[i++];
  }
  return { value: convertCstringToLong(buf), nextPos: i };
}

/**
 * getWordString (0x01EA16) — extract word or symbol token from message.
 * Returns { word, nextPos }.
 */
function getWordString(msg: string, pos: number): { word: string; nextPos: number } {
  let word = '';
  let i = pos;
  if (i < msg.length && isWordChar(msg[i])) {
    while (i < msg.length && isWordChar(msg[i]) && word.length < 35) {
      word += msg[i++];
    }
  } else {
    // Symbol token: copy symbol chars
    while (i < msg.length && !isSeparator(msg[i]) && !isWordChar(msg[i]) && word.length < 35) {
      word += msg[i++];
    }
  }
  return { word, nextPos: i };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKENIZER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * tokenizeMessage (0x01E5EE) — split message text into typed token array.
 *
 * Token types:
 *   T_NAME (0x2C): quoted name (backtick-delimited)
 *   T_NUMBER (0x2B): decimal integer
 *   keyword code: recognized word
 *   T_SENTINEL (0x33): end of array
 *
 * Aborts tokenization (returns sentinel-only array) if unrecognized word found.
 * Max 35 tokens.
 */
export function tokenizeMessage(msg: string, startOffset: number): Token[] {
  const tokens: Token[] = [];
  let pos = startOffset;
  const maxTokens = 35;

  while (pos < msg.length && tokens.length < maxTokens) {
    // Skip separators
    while (pos < msg.length && isSeparator(msg[pos])) pos++;
    if (pos >= msg.length) break;

    const c = msg[pos];

    if (c === '`') {
      // Quoted name token
      const { name, nextPos } = getName(msg, pos + 1);
      pos = nextPos;
      tokens.push({ type: T_NAME, name });
    } else if (isDigit(c) || (c === '-' && pos + 1 < msg.length && isDigit(msg[pos + 1]))) {
      // Numeric token
      const start = (c === '-') ? pos : pos;
      if (c === '-') pos++;  // skip sign (getValue handles negative)
      const { value, nextPos } = getValue(msg, pos);
      pos = nextPos;
      tokens.push({ type: T_NUMBER, value });
    } else if (isWordChar(c)) {
      // Word token
      const { word, nextPos } = getWordString(msg, pos);
      pos = nextPos;
      const lower = makeLowercase(word);
      const code  = recognizeWord(lower);
      if (code === 0x29) {
        // Unknown word: abort tokenization
        return [{ type: T_SENTINEL }];
      }
      tokens.push({ type: code });
    } else {
      // Symbol: skip unknown character
      pos++;
    }
  }

  tokens.push({ type: T_SENTINEL });
  return tokens;
}

/**
 * disposeTokenString (0x01E748) — free token handles (no-op in JS, GC handles it).
 */
export function disposeTokenString(_tokens: Token[]): void {
  // JavaScript GC handles cleanup automatically — no explicit free needed.
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE SUB-PARSERS (11 functions from message_subparsers_decode.md)
// ─────────────────────────────────────────────────────────────────────────────

type SubParser = (tokens: Token[], pos: number) => number;

/** recognizeGoodbye (0x01E1FE) */
function recognizeGoodbye(tokens: Token[], pos: number): number {
  if (tokens[pos]?.type === T_SENTINEL) return 20;
  return 21;
}

/** recognizeMytype (0x01E22E) */
function recognizeMytype(tokens: Token[], pos: number): number {
  const t0 = tokens[pos];
  if (!t0) return 21;
  if (t0.type === 0x15 && tokens[pos + 1]?.type === T_SENTINEL) return 16;
  if (t0.type === 0x05 && tokens[pos + 1]?.type === T_NUMBER && tokens[pos + 2]?.type === T_SENTINEL) return 16;
  if (t0.type === T_SENTINEL) return 16;
  return 21;
}

/** recognizeCarried (0x01E288) */
function recognizeCarried(tokens: Token[], pos: number): number {
  if (tokens[pos]?.type === T_NUMBER && tokens[pos + 1]?.type === T_NUMBER
      && tokens[pos + 2]?.type === T_SENTINEL) return 9;
  return 21;
}

/** recognizeGetBaseTargetInfo (0x01E2CE) */
function recognizeGetBaseTargetInfo(tokens: Token[], pos: number): number {
  if (tokens[pos]?.type === T_NUMBER && tokens[pos + 1]?.type === T_NUMBER
      && tokens[pos + 2]?.type === T_SENTINEL) return 11;
  return 21;
}

/** recognizePillTargetInfo (0x01E31E) */
function recognizePillTargetInfo(tokens: Token[], pos: number): number {
  if (tokens[pos]?.type === T_NUMBER && tokens[pos + 1]?.type === T_NUMBER
      && tokens[pos + 2]?.type === T_SENTINEL) return 12;
  return 21;
}

/** recognizeBaseInfo (0x01E36A) — 7-token base status broadcast */
function recognizeBaseInfo(tokens: Token[], pos: number): number {
  // pattern: num num num ownership num num num sentinel
  const ownership = (t: Token | undefined) =>
    t?.type === 0x17 || t?.type === 0x0C || t?.type === 0x0B;

  if (tokens[pos]?.type === T_NUMBER
   && tokens[pos+1]?.type === T_NUMBER
   && tokens[pos+2]?.type === T_NUMBER
   && ownership(tokens[pos+3])
   && tokens[pos+4]?.type === T_NUMBER
   && tokens[pos+5]?.type === T_NUMBER
   && tokens[pos+6]?.type === T_NUMBER
   && tokens[pos+7]?.type === T_SENTINEL) return 8;
  return 21;
}

/** recognizePillInfo (0x01E3F8) */
function recognizePillInfo(tokens: Token[], pos: number): number {
  const ownership = (t: Token | undefined) =>
    t?.type === 0x17 || t?.type === 0x0C || t?.type === 0x0B;

  if (tokens[pos]?.type === T_NUMBER
   && ownership(tokens[pos+1])
   && tokens[pos+2]?.type === T_NUMBER
   && tokens[pos+3]?.type === T_SENTINEL) return 17;
  return 21;
}

/** recognizePillNAInfo (0x01E456) */
function recognizePillNAInfo(tokens: Token[], pos: number): number {
  if (tokens[pos]?.type === T_NUMBER && tokens[pos+1]?.type === T_NUMBER
      && tokens[pos+2]?.type === T_SENTINEL) return 17;
  return 21;
}

/** recognizeReally (0x01E49E) */
function recognizeReally(tokens: Token[], pos: number): number {
  const t = tokens[pos];
  if (!t) return 21;
  if (t.type === T_SENTINEL) return 13;
  if (t.type === 0x1A && tokens[pos+1]?.type === T_SENTINEL) return 14;  // attack
  if (t.type === 0x19 && tokens[pos+1]?.type === T_SENTINEL) return 15;  // defend
  return 21;
}

/** recognizeKillBase (0x01E4F6) */
function recognizeKillBase(tokens: Token[], pos: number): number {
  const t = tokens[pos];
  if (!t) return 21;
  if (t.type === T_NUMBER && tokens[pos+1]?.type === T_SENTINEL) return 2;
  if (t.type === 0x1A && tokens[pos+1]?.type === T_SENTINEL) return 2;
  if (t.type === 0x19 && tokens[pos+1]?.type === T_SENTINEL) return 2;
  if ((t.type === 0x06 || t.type === 0x07)) {
    let p = pos + 1;
    if (tokens[p]?.type === 0x1A || tokens[p]?.type === 0x19) p++;
    if (tokens[p]?.type === T_NUMBER && tokens[p+1]?.type === T_SENTINEL) return 2;
  }
  return 21;
}

/** recognizePillCommand (0x01E574) */
function recognizePillCommand(tokens: Token[], pos: number, flag: number): number {
  const t = tokens[pos];
  if (!t) return 21;
  const isAttack = flag === 1;
  if (t.type === T_NUMBER && tokens[pos+1]?.type === T_SENTINEL)
    return isAttack ? 1 : 7;
  if ((t.type === 0x1B || t.type === 0x1E)
      && tokens[pos+1]?.type === T_NUMBER
      && tokens[pos+2]?.type === T_SENTINEL)
    return isAttack ? 1 : 7;
  return 21;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND RECOGNIZER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * recognizeBrainCommand (0x01DD9A) — map token array to command code.
 *
 * Returns command code 0-20, or 21 on parse error.
 * Dispatches to 11 sub-parsers based on first token type.
 */
export function recognizeBrainCommand(tokens: Token[]): number {
  if (!tokens.length || tokens[0].type === T_SENTINEL) return 0;

  const t0 = tokens[0];
  const t1 = tokens[1] ?? { type: T_SENTINEL };

  switch (t0.type) {

    // ── "goodbye" / "bye" ───────────────────────────────────────────────────
    case 0x25:
      return recognizeGoodbye(tokens, 1);

    // ── "type" / "aitype" ───────────────────────────────────────────────────
    case 0x15:
    case 0x05:
      return recognizeMytype(tokens, 1);

    // ── "carried" ───────────────────────────────────────────────────────────
    case 0x22:
      return recognizeCarried(tokens, 1);

    // ── "getbase" ───────────────────────────────────────────────────────────
    case 0x23:
      return recognizeGetBaseTargetInfo(tokens, 1);

    // ── "pilltarget" ────────────────────────────────────────────────────────
    case 0x24:
      return recognizePillTargetInfo(tokens, 1);

    // ── "base" ──────────────────────────────────────────────────────────────
    case 0x11:
      return recognizeBaseInfo(tokens, 1);

    // ── "pill" ──────────────────────────────────────────────────────────────
    case 0x12:
      // Can be pill info or pill target
      if (t1.type === T_NUMBER) {
        const r = recognizePillInfo(tokens, 1);
        if (r !== 21) return r;
        return recognizePillNAInfo(tokens, 1);
      }
      return 21;

    // ── "really" ────────────────────────────────────────────────────────────
    case 0x20:
      return recognizeReally(tokens, 1);

    // ── "stay" ──────────────────────────────────────────────────────────────
    case 0x1F:
      return 5;

    // ── "kill" → killBase ───────────────────────────────────────────────────
    case 0x13:
      return recognizeKillBase(tokens, 1);

    // ── "attack" → pill or base ─────────────────────────────────────────────
    case 0x1A:
      if (t1.type === 0x11) return recognizeKillBase(tokens, 2);       // attack base
      if (t1.type === 0x12) return recognizePillCommand(tokens, 2, 1); // attack pill
      return recognizePillCommand(tokens, 1, 1);

    // ── "defend" → pill ─────────────────────────────────────────────────────
    case 0x19:
      if (t1.type === 0x12) return recognizePillCommand(tokens, 2, 0);
      return recognizePillCommand(tokens, 1, 0);

    // ── "get" → base or pill ────────────────────────────────────────────────
    case 0x0D:
      if (t1.type === 0x11) return 3;     // get base
      if (t1.type === 0x12) return 1;     // get pill
      return 21;

    // ── Status A / B ────────────────────────────────────────────────────────
    case 0x26:
      return (t1.type === T_SENTINEL) ? 18 : 21;
    case 0x28:
      return (t1.type === T_SENTINEL) ? 19 : 21;

    default:
      return 21;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RECEIVE ANY MESSAGES (0x01C40A)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * isAlly (0x01E9F0) — check if player is an ally.
 * Simplified: checks team bitmask.
 */
export function isAlly(a4: A4State, playerIndex: number): boolean {
  const bit = 1 << (playerIndex & 31);
  return (a4.teamBitmask & bit) !== 0;
}

/**
 * isOkToReceive (0x01E7EC) — check if message is addressed to us.
 * In Orona context, simplified to accept all ally messages.
 */
export function isOkToReceive(msgText: string): boolean {
  if (!msgText) return false;
  // Wildcard broadcast tokens: / . ! ?
  const trimmed = msgText.trim();
  if (!trimmed) return false;
  const first = trimmed[0];
  if (first === '/' || first === '.' || first === '!' || first === '?') return true;
  // Check for name-addressed messages (starts with backtick)
  if (first === '`') return true;   // assume addressed to us if backtick (simplified)
  return true;   // accept by default in simplified port
}

/**
 * ReceiveAnyMessages (0x01C40A) — process one pending inbound message per tick.
 *
 * Pipeline:
 *   1. Check for pending message (a4.pendingMessage)
 *   2. isAlly check (or Borg bypass for commands 0 and 5)
 *   3. isOkToReceive
 *   4. tokenizeMessage
 *   5. recognizeBrainCommand → command_id
 *   6. Dispatch via command handler table
 *   7. disposeTokenString
 *
 * See receiveanymessages_decode.md.
 */
export function receiveAnyMessages(a4: A4State, state: BrainState): void {
  const msg = a4.pendingMessage;
  if (!msg) return;

  const { senderId, text } = msg;

  if (!isAlly(a4, senderId)) {
    a4.pendingMessage = null;
    return;
  }

  if (!isOkToReceive(text)) {
    a4.pendingMessage = null;
    return;
  }

  // Tokenize and recognize
  const tokens = tokenizeMessage(text, 0);
  const commandId = recognizeBrainCommand(tokens);
  a4.lastRecognizedCommandId = commandId & 0xFFFF;


  // Dispatch command
  dispatchCommand(a4, state, commandId, tokens);
  disposeTokenString(tokens);
  a4.pendingMessage = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND DISPATCH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Command handler dispatch (A4[9082] table in original).
 * Handles the recognized brain commands from ally AI partners.
 */
function dispatchCommand(
  a4: A4State,
  state: BrainState,
  commandId: number,
  tokens: Token[],
): void {
  switch (commandId) {
    case 0:   // no-op
    case 21:  // parse error
      break;

    case 1: {
      // Attack command: update pill-to-get target
      // Extract pill index from tokens if present
      const numTok = tokens.find(t => t.type === T_NUMBER);
      if (numTok?.value !== undefined) {
        const idx = numTok.value & 0xFF;
        const pill = a4.getPill(idx);
        if (pill) {
          a4.pillToGetTarget = pill;
          a4.newGetPillAPChosen = 0;  // force replan
        }
      }
      break;
    }

    case 2: {
      // Kill base command
      const numTok = tokens.find(t => t.type === T_NUMBER);
      if (numTok?.value !== undefined) {
        const base = a4.getBase(numTok.value & 0xFF);
        if (base) a4.killBaseTarget = base;
      }
      break;
    }

    case 5:   // stay — suppress movement briefly
      a4.steeringWord |= 0x20;   // BRAKE
      break;

    case 7: {
      // Defend pill
      const numTok = tokens.find(t => t.type === T_NUMBER);
      if (numTok?.value !== undefined) {
        const pill = a4.getPill(numTok.value & 0xFF);
        if (pill) a4.pillToFixTarget = pill;
      }
      break;
    }

    case 8:   // base status broadcast — could update base state
      break;

    case 9:   // carried announcement
      break;

    case 11:  // getbase target info
      break;

    case 12:  // pill target info
      break;

    case 13:  // really (unmodified)
    case 14:  // really attack — treat as forced attack
      if (a4.pillToGetTarget) a4.newGetPillAPChosen = 0;
      break;

    case 15:  // really defend
      break;

    case 16:  // mytype
    case 17:  // pill info
    case 18:  // status A
    case 19:  // status B
      break;

    case 20:  // goodbye
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PENDING MESSAGE STORAGE
// ─────────────────────────────────────────────────────────────────────────────

/** Message pending in the brain's receive queue */
export interface PendingMessage {
  senderId: number;
  text: string;
}

// Extend A4State dynamically (TypeScript declaration merging alternative)
// A4State.pendingMessage is declared at the bottom of a4_state.ts additions.

// ─────────────────────────────────────────────────────────────────────────────
// SEND PILL TARGET MESSAGE (0x011682 area / sendPillTargetMessage)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SendPillTargetMessage / CheckSendPillMessage (0x0016ae) — broadcast current
 * pill target to allied AI brains.
 *
 * Broadcast format: "pilltarget <pillIndex> <packed_tile>"
 * Only sent when a4.fixPillSendBroadcast flag is set.
 */
export function checkSendPillMessage(a4: A4State, state: BrainState): void {
  if (!a4.fixPillSendBroadcast) return;
  a4.fixPillSendBroadcast = 0;

  const pill = a4.pillToFixTarget ?? a4.pillToGetTarget;
  if (!pill) return;

  const msg = `pilltarget ${pill.index} ${(pill.tileX << 8) | pill.tileY}`;

  // Store as outbound message (simplified: just record for dequeue)
  a4.outboundMessages.push(msg);
}

/**
 * dequeueMessage (0x020798) — send next outbound message.
 * In Orona the actual send goes through the network layer.
 * Here we just clear the queue.
 */
export function dequeueMessage(a4: A4State): void {
  if (a4.outboundMessages.length > 0) {
    a4.outboundMessages.shift();
    // TODO: actual Orona network send
  }
}
