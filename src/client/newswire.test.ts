import { describe, it, expect, beforeEach } from 'vitest';

import {
  NewswireTicker, NEWSWIRE_COLUMNS, NEWSWIRE_SCROLL_TICKS, NEWSWIRE_QUEUE_LIMIT, NEWSWIRE_GAP,
  NEWSWIRE_HEADER_HOLD_TICKS, NEWSWIRE_HEADER_FADE_TICKS,
} from './newswire';
import { formatNewswire, NEWSWIRE_CHANNEL_LABELS } from '../newswire';
import { teamTextColor } from '../team_colors';

const BLUE = { name: 'Bravo', team: 1 };
const RED = { name: 'Redshirt', team: 0 };

const LEAD = formatNewswire('lead_change', { name: 'Team Purple', team: 5 });
const CAPTURE = formatNewswire('base_capture', BLUE);           // "Bravo captured a Neutral Base"
const CAPTURE_TEXT = 'Bravo captured a Neutral Base';
const QUIT = formatNewswire('player_quit', RED);                // "Redshirt has quit game"
const QUIT_TEXT = 'Redshirt has quit game';

function makeTicker(): NewswireTicker {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new NewswireTicker(el);
}

function step(ticker: NewswireTicker, columns: number): void {
  for (let i = 0; i < columns; i++) ticker.update();
}

/** Run whole world ticks — the header's hold and fade are counted in these, not in columns. */
function ticks(ticker: NewswireTicker, count: number): void {
  for (let i = 0; i < count; i++) ticker.tick();
}

/** Drain the crawl completely, leaving the header parked. */
function drain(ticker: NewswireTicker, messageLength: number): void {
  step(ticker, messageLength + NEWSWIRE_COLUMNS);
}

describe('NewswireTicker', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('starts as a blank 67-column window', () => {
    const ticker = makeTicker();
    expect(ticker.lineText(0)).toBe(' '.repeat(NEWSWIRE_COLUMNS));
    expect(ticker.lineText(1)).toBe(' '.repeat(NEWSWIRE_COLUMNS));
    expect(NEWSWIRE_COLUMNS).toBe(67);
  });

  it('scrolls a message in from the right, one column at a time', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE);

    step(ticker, 3);
    expect(ticker.lineText(1)).toBe(' '.repeat(64) + 'Bra');

    step(ticker, CAPTURE_TEXT.length - 3);
    expect(ticker.lineText(1)).toBe(' '.repeat(NEWSWIRE_COLUMNS - CAPTURE_TEXT.length) + CAPTURE_TEXT);
    // The header rides in on the top line, padded to the length of the message below it.
    expect(ticker.lineText(0)).toBe(
      ' '.repeat(NEWSWIRE_COLUMNS - CAPTURE_TEXT.length) + 'NEWSWIRE' + ' '.repeat(CAPTURE_TEXT.length - 8)
    );
  });

  it('keeps a name coloured while it is half-scrolled off the left edge', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE);
    // 69 columns in, "Br" has walked off and the window opens on the "avo" of "Bravo".
    step(ticker, 69);

    expect(ticker.lineText(1)).toBe('avo captured a Neutral Base' + ' '.repeat(40));

    const blue = teamTextColor(1);
    const colors = ticker.lineColors(1);
    expect(colors.slice(0, 3)).toEqual([blue, blue, blue]);  // a, v, o — still blue
    expect(colors[3]).toBe(null);                            // the space after the name is prose
  });

  it('collapses same-coloured columns into a handful of spans', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE);
    step(ticker, CAPTURE_TEXT.length);

    // leading padding | "Bravo" | the rest of the prose
    expect(ticker.spanCount(1)).toBe(3);
    expect(ticker.element.querySelectorAll('.newswire-line')[1].children.length).toBe(3);
    expect(ticker.element.textContent).toContain(CAPTURE_TEXT);
  });

  it('paints names with the team colour and prose with none', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE);
    step(ticker, CAPTURE_TEXT.length);

    const spans = ticker.element.querySelectorAll('.newswire-line')[1].children;
    expect((spans[1] as HTMLElement).textContent).toBe('Bravo');
    expect((spans[1] as HTMLElement).style.color.replace(/\s/g, '')).toBe(teamTextColor(1));
    expect((spans[2] as HTMLElement).style.color).toBe('');
  });

  it('separates back-to-back messages instead of running them together', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE);
    ticker.add(QUIT);

    // Read the rightmost column on each step: that is the stream as it enters the window.
    let stream = '';
    for (let i = 0; i < CAPTURE_TEXT.length + NEWSWIRE_GAP + QUIT_TEXT.length; i++) {
      ticker.update();
      stream += ticker.lineText(1)[NEWSWIRE_COLUMNS - 1];
    }
    expect(stream).toBe(CAPTURE_TEXT + ' '.repeat(NEWSWIRE_GAP) + QUIT_TEXT);
  });

  it('does not put a gap in front of a message that opens a run', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE);
    ticker.update();
    // First column in is the "B" of Bravo, not a blank.
    expect(ticker.lineText(1)[NEWSWIRE_COLUMNS - 1]).toBe('B');
  });

  it('shows the header once per run, not once per message', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE);
    ticker.add(QUIT);          // still busy — this one gets no header

    let seen = '';
    for (let i = 0; i < 300; i++) {
      step(ticker, 1);
      seen += ticker.lineText(0)[NEWSWIRE_COLUMNS - 1];
    }
    expect(seen.replace(/ /g, '')).toBe('NEWSWIRE');
  });

  it('parks the header against the left edge and leaves it there', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE);

    // Sweeping in: it travels one column per scroll step, alongside the message it announces.
    step(ticker, 1);
    expect(ticker.headerState).toBe('entering');
    expect(ticker.lineText(0)[NEWSWIRE_COLUMNS - 1]).toBe('N');

    step(ticker, 20);
    expect(ticker.headerState).toBe('entering');
    expect(ticker.lineText(0)).toBe(' '.repeat(46) + 'NEWSWIRE' + ' '.repeat(13));

    // 67 steps from entering, its first character reaches column 0 and it stops.
    step(ticker, NEWSWIRE_COLUMNS - 21);
    expect(ticker.headerState).toBe('parked');
    expect(ticker.lineText(0)).toBe('NEWSWIRE'.padEnd(NEWSWIRE_COLUMNS));

    // And it does not drift once parked, however long the crawl runs on.
    step(ticker, 200);
    expect(ticker.headerState).toBe('parked');
    expect(ticker.lineText(0)).toBe('NEWSWIRE'.padEnd(NEWSWIRE_COLUMNS));
  });

  it('holds the parked header for two seconds after the last message, then fades it', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE);
    drain(ticker, CAPTURE_TEXT.length);
    expect(ticker.headerState).toBe('parked');
    expect(ticker.lineText(1).trim()).toBe('');

    // One tick short of the hold: still up, still fully opaque.
    ticks(ticker, NEWSWIRE_HEADER_HOLD_TICKS - 1);
    expect(ticker.headerState).toBe('parked');
    expect(ticker.headerOpacity).toBe('1');

    ticks(ticker, 1);
    expect(ticker.headerState).toBe('fading');
    expect(ticker.headerOpacity).toBe('0');

    // Once the fade is done the header is gone and the strip is completely empty.
    ticks(ticker, NEWSWIRE_HEADER_FADE_TICKS);
    expect(ticker.headerState).toBe('absent');
    expect(ticker.lineText(0).trim()).toBe('');
  });

  it('keeps the header up while news is still moving, however long the run lasts', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE);
    drain(ticker, CAPTURE_TEXT.length);

    // Sit through most of the hold, then post more news: the hold restarts from full.
    ticks(ticker, NEWSWIRE_HEADER_HOLD_TICKS - 5);
    ticker.add(QUIT);
    ticks(ticker, NEWSWIRE_HEADER_HOLD_TICKS);
    expect(ticker.headerState).toBe('parked');
    expect(ticker.headerOpacity).toBe('1');
  });

  it('pulls the header back if news arrives mid-fade, without re-running the sweep', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE);
    drain(ticker, CAPTURE_TEXT.length);
    ticks(ticker, NEWSWIRE_HEADER_HOLD_TICKS);
    expect(ticker.headerState).toBe('fading');

    ticker.add(QUIT);
    step(ticker, 1);   // the header follows the message's leading character, not the enqueue
    expect(ticker.headerState).toBe('parked');
    expect(ticker.headerOpacity).toBe('1');
    expect(ticker.lineText(0)).toBe('NEWSWIRE'.padEnd(NEWSWIRE_COLUMNS));
  });

  it('sweeps the header in again for a run that starts after it has gone', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE);
    drain(ticker, CAPTURE_TEXT.length);
    ticks(ticker, NEWSWIRE_HEADER_HOLD_TICKS + NEWSWIRE_HEADER_FADE_TICKS);
    expect(ticker.headerState).toBe('absent');

    ticker.add(QUIT);
    step(ticker, 1);
    expect(ticker.headerState).toBe('entering');
    expect(ticker.lineText(0)[NEWSWIRE_COLUMNS - 1]).toBe('N');
  });

  it('scrolls one column every four world ticks', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE);

    for (let i = 0; i < NEWSWIRE_SCROLL_TICKS - 1; i++) ticker.tick();
    expect(ticker.lineText(1).trim()).toBe('');

    ticker.tick();
    expect(ticker.lineText(1)).toBe(' '.repeat(NEWSWIRE_COLUMNS - 1) + 'B');
    expect(NEWSWIRE_SCROLL_TICKS).toBe(4);
  });

  it('caps the queue, dropping the oldest news first', () => {
    const ticker = makeTicker();
    for (let i = 0; i < 200; i++) ticker.add(CAPTURE);
    expect(ticker.queueLength).toBeLessThanOrEqual(NEWSWIRE_QUEUE_LIMIT);
    expect(ticker.queueLength).toBeGreaterThan(0);
  });

  it('stops repainting once it has drained, and wakes on the next event', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE);
    drain(ticker, CAPTURE_TEXT.length);

    const drained = ticker.element.innerHTML;
    step(ticker, 50);
    expect(ticker.element.innerHTML).toBe(drained);

    ticker.add(QUIT);
    step(ticker, 1);
    expect(ticker.lineText(1)[NEWSWIRE_COLUMNS - 1]).toBe('R');
  });

  // ── Channels ───────────────────────────────────────────────────────────────

  /** A header lane is 67 columns wide; spell the expected contents without counting spaces. */
  const lane = (text: string) => text.padEnd(NEWSWIRE_COLUMNS);

  /** Column of the first non-blank character on a line, or -1. */
  const firstInk = (ticker: NewswireTicker, index: 0 | 1) => ticker.lineText(index).search(/\S/);

  it('gives a lead change the SCORELINE header instead of NEWSWIRE', () => {
    const ticker = makeTicker();
    ticker.add(LEAD, 'lead_change');
    step(ticker, 1);
    expect(ticker.headerChannelName).toBe('score');
    step(ticker, NEWSWIRE_COLUMNS - 1);
    expect(ticker.lineText(0)).toBe(lane(NEWSWIRE_CHANNEL_LABELS.score));
  });

  it('brings the label in level with the message it announces', () => {
    // The whole point of deferring the sweep: on a quiet wire the label and the first character
    // of the text enter together and stay in step all the way across.
    const ticker = makeTicker();
    ticker.add(LEAD, 'lead_change');
    for (let i = 1; i <= 40; i++) {
      step(ticker, 1);
      expect(firstInk(ticker, 0)).toBe(firstInk(ticker, 1));
    }
  });

  it('stays level even when the message waits behind a queue', () => {
    // A message enqueued behind other traffic does not reach the window for many columns. A
    // label started at enqueue time would set off without it; this one waits.
    const ticker = makeTicker();
    ticker.add(CAPTURE, 'base_capture');
    step(ticker, NEWSWIRE_COLUMNS);          // NEWSWIRE parked, crawl still on screen

    ticker.add(LEAD, 'lead_change');         // queued behind the inter-message gap
    step(ticker, NEWSWIRE_GAP);
    expect(ticker.headerChannelName).toBe('news');   // not started yet

    step(ticker, 1);                          // the lead line's first character lands
    expect(ticker.headerChannelName).toBe('score');
    expect(ticker.lineText(0)[NEWSWIRE_COLUMNS - 1]).toBe('S');
    expect(ticker.lineText(1)[NEWSWIRE_COLUMNS - 1]).toBe('T');   // "Team Purple…"

    // Both leading edges advance one column per step, together. Compare the edges rather than
    // whole words: each line reveals one character at a time, so the shorter label finishes
    // entering well before the longer message does.
    for (let k = 1; k <= 30; k++) {
      const col = NEWSWIRE_COLUMNS - k;
      expect(ticker.lineText(0)[col]).toBe('S');
      expect(ticker.lineText(1)[col]).toBe('T');
      step(ticker, 1);
    }
  });

  it('eats the parked label one character at a time as the new one wipes in', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE, 'base_capture');
    step(ticker, NEWSWIRE_COLUMNS);
    expect(ticker.lineText(0)).toBe(lane('NEWSWIRE'));

    ticker.add(LEAD, 'lead_change');
    step(ticker, NEWSWIRE_GAP);              // the gap goes by first; the label waits for the text
    expect(ticker.headerChannelName).toBe('news');

    // First character appears at the right-hand edge; the parked label is untouched so far.
    step(ticker, 1);
    expect(ticker.headerState).toBe('entering');
    expect(ticker.lineText(0)).toBe('NEWSWIRE'.padEnd(NEWSWIRE_COLUMNS - 1) + 'S');

    // Butted up against the parked label, still not overlapping it.
    step(ticker, 58);
    expect(ticker.lineText(0)).toBe(lane('NEWSWIRESCORELINE'));

    // One more column and NEWSWIRE's last character is gone — consumed, not covered.
    step(ticker, 1);
    expect(ticker.lineText(0)).toBe(lane('NEWSWIRSCORELINE'));

    step(ticker, 1);
    expect(ticker.lineText(0)).toBe(lane('NEWSWISCORELINE'));

    // Parked: nothing of the old label survives.
    step(ticker, 6);
    expect(ticker.lineText(0)).toBe(lane('SCORELINE'));
    expect(ticker.headerState).toBe('parked');
  });

  it('leaves nothing behind when the shorter label wipes over the longer one', () => {
    // SCORELINE is 9 columns and NEWSWIRE 8. Because the label blanks the column it vacates
    // rather than merely covering it, the trailing "E" is erased instead of being stranded.
    const ticker = makeTicker();
    ticker.add(LEAD, 'lead_change');
    step(ticker, NEWSWIRE_COLUMNS);
    expect(ticker.lineText(0)).toBe(lane('SCORELINE'));

    ticker.add(CAPTURE, 'base_capture');
    step(ticker, NEWSWIRE_GAP);
    step(ticker, NEWSWIRE_COLUMNS - 1);
    expect(ticker.lineText(0)).toBe(lane('SNEWSWIRE'));

    step(ticker, 1);
    expect(ticker.lineText(0)).toBe(lane('NEWSWIRE'));
    expect(ticker.lineText(0)[8]).toBe(' ');
  });

  it('does not re-sweep for another message on the channel already showing', () => {
    const ticker = makeTicker();
    ticker.add(CAPTURE, 'base_capture');
    step(ticker, NEWSWIRE_COLUMNS);
    expect(ticker.headerState).toBe('parked');

    ticker.add(QUIT, 'player_quit');
    expect(ticker.headerState).toBe('parked');
    expect(ticker.lineText(0)).toBe(lane('NEWSWIRE'));
  });

  it('starts a mid-sweep channel change level with its own message, not after the last one', () => {
    // The case that was wrong: SCORELINE arrives and sweeps in cleanly, then a news message
    // follows while it is still crossing. Deferring the NEWSWIRE label until SCORELINE parked
    // put it wildly out of step with the text it announces. It must set off with its message.
    const ticker = makeTicker();
    ticker.add(LEAD, 'lead_change');
    step(ticker, 1);
    expect(ticker.headerChannelName).toBe('score');

    step(ticker, 20);                       // SCORELINE still crossing
    expect(ticker.headerState).toBe('entering');

    ticker.add(CAPTURE, 'base_capture');

    // Step until the capture line's leading "B" reaches the right-hand column. Asserting on
    // that rather than on a step count keeps the test honest about the one thing that matters:
    // the label must appear in the SAME step as the character it announces, whatever is queued
    // in front of it.
    let landed = 0;
    for (let k = 1; k <= 60 && !landed; k++) {
      step(ticker, 1);
      if (ticker.lineText(1)[NEWSWIRE_COLUMNS - 1] === 'B') landed = k;
    }
    expect(landed).toBeGreaterThan(0);
    expect(ticker.headerChannelName).toBe('news');
    expect(ticker.headerLabelCount).toBe(2);          // both labels on the lane at once
    expect(ticker.lineText(0)[NEWSWIRE_COLUMNS - 1]).toBe('N');

    // …and they stay level all the way across.
    for (let k = 1; k <= 30; k++) {
      const col = NEWSWIRE_COLUMNS - k;
      expect(ticker.lineText(0)[col]).toBe('N');
      expect(ticker.lineText(1)[col]).toBe('B');
      step(ticker, 1);
    }
  });

  it('parks the older label first, then lets the newer one eat it', () => {
    const ticker = makeTicker();
    ticker.add(LEAD, 'lead_change');
    step(ticker, 1);
    step(ticker, 20);

    ticker.add(CAPTURE, 'base_capture');
    for (let k = 1; k <= 60; k++) {
      step(ticker, 1);
      if (ticker.lineText(1)[NEWSWIRE_COLUMNS - 1] === 'B') break;
    }
    expect(ticker.headerLabelCount).toBe(2);

    // SCORELINE reaches the left edge well before NEWSWIRE does, and waits there.
    step(ticker, 40);
    expect(ticker.lineText(0).startsWith('SCORELINE')).toBe(true);
    expect(ticker.headerLabelCount).toBe(2);

    // NEWSWIRE arrives, consumes it, and is left alone on the lane — no stray "E".
    step(ticker, NEWSWIRE_COLUMNS);
    expect(ticker.lineText(0)).toBe(lane('NEWSWIRE'));
    expect(ticker.headerLabelCount).toBe(1);
    expect(ticker.headerChannelName).toBe('news');
  });

  it('clears the lane completely once the header has faded', () => {
    const ticker = makeTicker();
    ticker.add(LEAD, 'lead_change');
    drain(ticker, 'Team Purple takes the lead'.length);
    ticks(ticker, NEWSWIRE_HEADER_HOLD_TICKS + NEWSWIRE_HEADER_FADE_TICKS);
    expect(ticker.headerState).toBe('absent');
    expect(ticker.headerChannelName).toBe(null);
    expect(ticker.lineText(0)).toBe(lane(''));
  });

  it('persists the visibility toggle', () => {
    const first = makeTicker();
    expect(first.isVisible()).toBe(true);
    first.toggle();
    expect(first.isVisible()).toBe(false);
    expect(first.element.style.display).toBe('none');

    const second = makeTicker();
    expect(second.isVisible()).toBe(false);
    second.setVisible(true);
    expect(makeTicker().isVisible()).toBe(true);
  });
});
