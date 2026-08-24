/**
 * Newswire ticker.
 *
 * A two-line strip, ported from WinBolo's `messages.c`. Self-contained DOM module in the style
 * of `death_overlay.ts`: it owns an element, it is fed events, and it is stepped from the world
 * tick.
 *
 * The bottom line is the crawl proper, faithful to the original
 * (`brains/winbolo/winbolo/src/bolo/messages.c`):
 *
 *  - The visible window is 67 columns, not 68. `messageUpdate` (:433-462) writes the incoming
 *    character at index 67, shifts the array one to the left — landing it at 66 — then writes
 *    `'\0'` back into 67. Column 67 is therefore always the terminator and never shows.
 *  - One column per `MESSAGE_SCROLL_TIME` = 4 ticks. `TICK_LENGTH_MS` is 20 in both games, so
 *    this is 12.5 columns/sec and a ~5.4s traverse, exactly as the original.
 *
 * The top line is not a crawl. WinBolo scrolled the channel's name through it as part of the
 * message queue, so the label swept past once and was gone. Here it is a channel bug instead:
 * it rides in from the right alongside the first message of a run, parks against the left edge,
 * and stays there for as long as news keeps moving — then holds two seconds past the last
 * message and fades out. It says "this wire is live" for the whole run rather than for five
 * seconds at the start of it.
 *
 * When the channel changes — a lead change on SCORELINE arriving over a parked NEWSWIRE — the
 * incoming label does not simply cover the old one, it CONSUMES it: as the label travels left
 * it erases the column it vacates, so the old label is eaten a character at a time from its
 * right-hand end. That is why the lane is a persistent 67-column buffer rather than a label and
 * a position, and it is also what makes the length mismatch a non-issue: SCORELINE is nine
 * characters and NEWSWIRE eight, but a shorter label wiping over a longer one blanks the column
 * it leaves behind, so nothing of the old word survives in either direction.
 *
 * The other addition is colour: each column of the crawl carries its own CSS colour, so a
 * player's name keeps its team colour all the way across — including while half of it has
 * scrolled off the left edge. Colours are stamped into the message when it is enqueued, never
 * resolved at paint time.
 */

import { TICK_LENGTH_MS } from '../constants';
import {
  NEWSWIRE_CHANNEL_LABELS, channelOf, NewswireChannel, NewswireKind, NewswireSegment,
} from '../newswire';
import { teamTextColor } from '../team_colors';

/** Visible columns. WinBolo's MESSAGE_WIDTH is 68; the 68th is the NUL terminator. */
export const NEWSWIRE_COLUMNS = 67;

/** World ticks per column of scroll. WinBolo's MESSAGE_SCROLL_TIME. */
export const NEWSWIRE_SCROLL_TICKS = 4;

/**
 * Blank columns inserted between one message and the next.
 *
 * A deviation from the original, and a necessary one. WinBolo padded each message only to the
 * longer of its own two lines (`messageAddItem`, messages.c:357) and queued the next one
 * directly behind it, so once more than one thing is happening the crawl arrives as an
 * unbroken wall — the full stop of one event and the first letter of the next are a single
 * column apart. A few blank columns give each event its own beat without costing real width;
 * at 12.5 col/s this is well under half a second of quiet between lines.
 */
export const NEWSWIRE_GAP = 5;

/** How long the header stays parked after the last message has scrolled clear. */
export const NEWSWIRE_HEADER_HOLD_MS = 2000;

/** How long the header takes to fade once the hold expires. Must match the CSS transition. */
export const NEWSWIRE_HEADER_FADE_MS = 600;

/**
 * The hold and fade are counted in world ticks rather than wall clock, so they freeze and
 * resume with the crawl. A backgrounded tab stalls both together instead of fading the header
 * out over a strip that is not moving.
 */
export const NEWSWIRE_HEADER_HOLD_TICKS = Math.round(NEWSWIRE_HEADER_HOLD_MS / TICK_LENGTH_MS);
export const NEWSWIRE_HEADER_FADE_TICKS = Math.round(NEWSWIRE_HEADER_FADE_MS / TICK_LENGTH_MS);

/**
 * Hard cap on queued columns (~160s of crawl at 12.5 col/s). A backgrounded tab freezes
 * outright for 10-30s at a stretch in this project, and the autopilot demo generates real
 * news the whole time — without a cap the queue would grow without bound. Oldest first:
 * stale news is worth less than recent news.
 */
export const NEWSWIRE_QUEUE_LIMIT = 2000;

const BLANK = ' ';

/** One character cell of the crawl. `color` of null means "use the strip's default colour". */
interface Cell {
  c: string;
  color: string | null;
  /**
   * Set on the first character of a message, naming its channel. The header's sweep is started
   * from here rather than from `add()` so the label enters the strip in the same step as the
   * text it announces, and the two travel left together — see `update()`.
   */
  channel?: NewswireChannel;
}

function blankCell(): Cell {
  return { c: BLANK, color: null };
}

function blankLine(): Cell[] {
  return Array.from({ length: NEWSWIRE_COLUMNS }, blankCell);
}

function blankHeaderLine(): string[] {
  return new Array(NEWSWIRE_COLUMNS).fill(BLANK);
}

/** Explode coloured segments into one cell per character. */
function cellsOf(segments: NewswireSegment[]): Cell[] {
  const cells: Cell[] = [];
  for (const segment of segments) {
    const color = segment.team == null ? null : teamTextColor(segment.team);
    for (const c of segment.t) cells.push({ c, color });
  }
  return cells;
}

/** One channel label on the header lane. */
interface HeaderLabel {
  channel: NewswireChannel;
  text: string;
  /** Column its first character sits in. `NEWSWIRE_COLUMNS` is fully off-screen right. */
  col: number;
}

/** Where the header is in its life cycle. */
type HeaderPhase =
  | 'absent'    // not on screen; the next message starts a fresh run
  | 'entering'  // sweeping in from the right edge
  | 'parked'    // pinned against the left edge while news keeps moving
  | 'fading';   // held its two seconds, now on the way out

export class NewswireTicker {
  readonly element: HTMLElement;

  private line: Cell[] = blankLine();
  private queue: Cell[] = [];
  private headerElement!: HTMLElement;
  private crawlElement!: HTMLElement;
  private tickCounter = 0;
  /** True while nothing is queued and the crawl is entirely blank — skips repainting. */
  private idle = true;
  private visible = true;

  // ── Header state ───────────────────────────────────────────────────────────
  /**
   * Labels currently on the lane, oldest first.
   *
   * More than one at a time is normal and is the whole point: a label must set off level with
   * the message it announces, so if a second channel's message arrives while the first label is
   * still crossing, the second sets off immediately rather than waiting its turn. They travel
   * at the same speed, so the newer one never catches the older; the older parks at the left
   * edge first and is then eaten by the newer as it arrives.
   */
  private headers: HeaderLabel[] = [];
  /** The lane itself: what is on the top line right now, one character per column. */
  private headerLine: string[] = blankHeaderLine();
  private headerFading = false;
  private headerHold = 0;
  private headerFade = 0;

  constructor(element: HTMLElement) {
    this.element = element;

    this.headerElement = document.createElement('div');
    this.headerElement.className = 'newswire-line newswire-header';
    this.element.appendChild(this.headerElement);

    this.crawlElement = document.createElement('div');
    this.crawlElement.className = 'newswire-line newswire-crawl';
    this.element.appendChild(this.crawlElement);

    this.visible = readVisiblePreference();
    this.applyVisibility();
    this.paintHeader();
    this.paintCrawl();
  }

  // ── Feeding ────────────────────────────────────────────────────────────────

  /**
   * Enqueue one event. `segments` are already coloured and already formatted — see
   * `formatNewswire()`. `kind` decides which channel's label the top line shows; an untagged
   * line is treated as news.
   */
  add(segments: NewswireSegment[], kind?: NewswireKind): void {
    // Anything already on the wire — still queued, or still scrolling across the window — gets
    // a gap before this message so the two do not read as one sentence. A message that opens a
    // run needs no gap: there is nothing in front of it.
    if (!this.isQuiet()) {
      for (let i = 0; i < NEWSWIRE_GAP; i++) this.queue.push(blankCell());
    }

    // Mark the leading character with its channel. The header is NOT started here: this message
    // may sit behind a queue hundreds of columns deep, and a label that set off on enqueue would
    // arrive long before the words it announces. Marking the cell defers the sweep to the moment
    // that character enters the window, which is what keeps the label's leading edge aligned
    // with the message's — the alignment the original got for free by queueing the header as
    // part of the message itself.
    const cells = cellsOf(segments);
    if (cells.length > 0) cells[0] = { ...cells[0], channel: kind ? channelOf(kind) : 'news' };
    this.queue.push(...cells);

    if (this.queue.length > NEWSWIRE_QUEUE_LIMIT) {
      this.queue.splice(0, this.queue.length - NEWSWIRE_QUEUE_LIMIT);
    }

    this.idle = false;
  }

  /**
   * Ask for a channel's label to be on the top line.
   *
   * WinBolo's rule was "show the label when the previous message came from another channel"
   * (`messages.c:121-135`); this is the same rule, with the label staying up for the whole run
   * rather than sweeping past once. A message on the channel already showing costs nothing but
   * a refreshed hold.
   */
  private requestHeader(channel: NewswireChannel): void {
    // Any message at all means the wire is live, so a fade in progress is cancelled and the
    // hold restarts — whichever channel the message came from.
    this.headerFade = 0;
    this.headerFading = false;
    this.headerHold = NEWSWIRE_HEADER_HOLD_TICKS;
    this.headerElement.style.opacity = '1';

    // A message on the channel already newest on the lane needs no new label; the one that is
    // there — parked or still arriving — already speaks for it.
    const newest = this.headers[this.headers.length - 1];
    if (newest && newest.channel === channel) return;

    // Otherwise set off NOW, from the right-hand edge, level with the message whose leading
    // character has just landed. Never deferred behind a label already in flight: waiting would
    // put the label out of step with its own message, which is the one thing it must not do.
    this.headers.push({
      channel,
      text: NEWSWIRE_CHANNEL_LABELS[channel],
      col: NEWSWIRE_COLUMNS,
    });
  }

  /** Advance every label one column, and drop any that a newer one has just landed on top of. */
  private advanceLabels(): void {
    for (const header of this.headers) {
      if (header.col > 0) header.col--;
    }

    // A label that reaches the left edge supersedes everything older than it: those are already
    // fully covered, since a newer label is always at least as far right and at least as long
    // in the lane. Dropping them is what erases the last of the old word — the trailing "E" of
    // SCORELINE when the shorter NEWSWIRE parks over it.
    for (let i = this.headers.length - 1; i >= 0; i--) {
      if (this.headers[i].col === 0) {
        if (i > 0) this.headers.splice(0, i);
        break;
      }
    }
  }

  /**
   * Redraw the lane from the labels on it, oldest first so the newest wins any overlap.
   *
   * Painting from scratch each step is what produces the eating effect: a column stops being
   * drawn the moment no label covers it any more, so a label consumes what it crosses rather
   * than merely covering it.
   */
  private redrawHeaderLine(): void {
    this.headerLine = blankHeaderLine();
    for (const header of this.headers) {
      for (let i = 0; i < header.text.length; i++) {
        const c = header.col + i;
        if (c >= 0 && c < NEWSWIRE_COLUMNS) this.headerLine[c] = header.text[i];
      }
    }
  }

  /** True when nothing is queued and the crawl holds nothing but blanks. */
  private isQuiet(): boolean {
    if (this.queue.length > 0) return false;
    for (const cell of this.line) if (cell.c !== BLANK) return false;
    return true;
  }

  // ── Scrolling ──────────────────────────────────────────────────────────────

  /**
   * Call once per world tick. Scrolls one column every `NEWSWIRE_SCROLL_TICKS`, and runs the
   * header's hold-and-fade on every tick.
   *
   * Deliberately driven from the world tick and not `requestAnimationFrame`: a hidden tab
   * suspends rAF entirely and freezes timers for tens of seconds. Under the world tick the
   * crawl simply stops and resumes with its queue intact — the correct degradation. It must
   * never try to catch up by fast-forwarding, which would flush the queue past unread.
   */
  tick(): void {
    this.advanceHeader();
    if (++this.tickCounter < NEWSWIRE_SCROLL_TICKS) return;
    this.tickCounter = 0;
    this.update();
  }

  /** Advance the crawl exactly one column, and the header with it. */
  update(): void {
    if (this.idle) return;

    const next = this.queue.shift();
    this.line.shift();
    this.line.push(next ?? blankCell());

    // The leading character of a message has just landed in the right-hand column; bring its
    // channel's label in alongside it. Both then shift one column per step, so the label's
    // leading edge tracks the message's exactly until it parks.
    if (next?.channel) this.requestHeader(next.channel);

    // Labels travel at the crawl's pace, one column per scroll step, so each stays level with
    // the message it announces — then stops dead at the left edge.
    if (this.headers.length > 0) {
      this.advanceLabels();
      this.redrawHeaderLine();
      this.paintHeader();
    }

    this.paintCrawl();

    // Once the wire has drained and the last character has walked off the left edge there is
    // nothing left to animate; stop repainting until the next event arrives. The header keeps
    // its own clock — it is still on screen, counting down its hold.
    if (this.isQuiet()) this.idle = true;
  }

  /**
   * Hold the header up while news is moving; once the last message has scrolled clear, count
   * down the hold and then the fade.
   */
  private advanceHeader(): void {
    if (this.headers.length === 0) return;

    if (this.headerFading) {
      if (--this.headerFade <= 0) {
        this.headerFading = false;
        this.headers = [];
        this.headerLine = blankHeaderLine();
        this.paintHeader();
      }
      return;
    }

    // Nothing to hold until the newest label has actually landed.
    if (this.headers[this.headers.length - 1].col > 0) return;

    // Parked. Any news still in flight refreshes the hold, so the bug stays up for the whole
    // run however long it lasts.
    if (!this.isQuiet()) {
      this.headerHold = NEWSWIRE_HEADER_HOLD_TICKS;
      return;
    }
    if (--this.headerHold <= 0) {
      this.headerFading = true;
      this.headerFade = NEWSWIRE_HEADER_FADE_TICKS;
      this.headerElement.style.opacity = '0';
    }
  }

  // ── Painting ───────────────────────────────────────────────────────────────

  /**
   * Rebuild the crawl. Adjacent columns sharing a colour are collapsed into a single span —
   * typically three to five spans per line rather than 67 — so a repaint at 12.5/sec costs
   * nothing and never flickers.
   */
  private paintCrawl(): void {
    this.crawlElement.textContent = '';
    for (const run of runsOf(this.line)) {
      const span = document.createElement('span');
      span.textContent = run.text;
      if (run.color !== null) {
        span.style.color = run.color;
        // Tagged so the stylesheet can compensate for how much dimmer a team colour is than
        // the white prose around it — see `.newswire-name` in css/bolo.css.
        span.className = 'newswire-name';
      }
      this.crawlElement.appendChild(span);
    }
  }

  /**
   * The header is one flat run of text, so it is written straight to `textContent`. Always
   * padded to the full column count: the strip is `text-align: right`, so a short string would
   * be flung to the right-hand edge instead of sitting where its column says.
   */
  private paintHeader(): void {
    this.headerElement.textContent = this.headerText();
  }

  private headerText(): string {
    return this.headerLine.join('');
  }

  // ── Visibility ─────────────────────────────────────────────────────────────

  isVisible(): boolean {
    return this.visible;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.applyVisibility();
    try {
      localStorage.setItem(VISIBLE_KEY, visible ? '1' : '0');
    } catch {
      // Private browsing / storage disabled — the toggle just won't persist.
    }
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  private applyVisibility(): void {
    this.element.style.display = this.visible ? '' : 'none';
  }

  // ── Test / debug accessors ─────────────────────────────────────────────────

  /**
   * The rendered text of one line, exactly `NEWSWIRE_COLUMNS` characters wide.
   * Line 0 is the header, line 1 the crawl.
   */
  lineText(index: 0 | 1): string {
    return index === 0 ? this.headerText() : this.line.map((cell) => cell.c).join('');
  }

  /** The per-column colours of the crawl; null means the strip's default colour. */
  lineColors(index: 0 | 1): (string | null)[] {
    if (index === 0) return new Array(NEWSWIRE_COLUMNS).fill(null);
    return this.line.map((cell) => cell.color);
  }

  /** How many spans the current contents of one line would collapse to. */
  spanCount(index: 0 | 1): number {
    return index === 0 ? 1 : runsOf(this.line).length;
  }

  /** Where the header is in its life cycle — 'absent' | 'entering' | 'parked' | 'fading'. */
  get headerState(): HeaderPhase {
    if (this.headerFading) return 'fading';
    if (this.headers.length === 0) return 'absent';
    return this.headers[this.headers.length - 1].col > 0 ? 'entering' : 'parked';
  }

  /** The channel whose label is in the lane, or null when the lane is empty. */
  get headerChannelName(): NewswireChannel | null {
    const newest = this.headers[this.headers.length - 1];
    return newest ? newest.channel : null;
  }

  /** How many labels are on the lane at once — more than one during a channel handover. */
  get headerLabelCount(): number {
    return this.headers.length;
  }

  get headerOpacity(): string {
    return this.headerElement.style.opacity;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  destroy(): void {
    this.element.textContent = '';
  }
}

const VISIBLE_KEY = 'hud-newswire-visible';

function readVisiblePreference(): boolean {
  try {
    return localStorage.getItem(VISIBLE_KEY) !== '0';
  } catch {
    return true;
  }
}

/** Run-length collapse a line into maximal same-colour runs. */
function runsOf(line: Cell[]): { text: string; color: string | null }[] {
  const runs: { text: string; color: string | null }[] = [];
  for (const cell of line) {
    const last = runs[runs.length - 1];
    if (last && last.color === cell.color) last.text += cell.c;
    else runs.push({ text: cell.c, color: cell.color });
  }
  return runs;
}

export default NewswireTicker;
