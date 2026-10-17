/**
 * The "🧠 Brain Active" badge shown while the autopilot drives. With the capture brain, clicking
 * the brain icon cycles its difficulty (easy -> normal -> hard -> easy): a short label floats up
 * from the icon, and the icon carries a faint glow for the level — none on normal, green on easy,
 * red on hard. The rest of the badge stays click-through so it never gets in the way of play.
 */

import type { BrainDifficulty } from '../brain/capture_loader';

const LEVEL_LABEL: Record<BrainDifficulty, string> = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
// A tight rim plus a soft halo: one drop-shadow alone is lost on an 11px emoji.
const LEVEL_GLOW: Record<BrainDifficulty, string> = {
  easy: 'drop-shadow(0 0 1px rgba(90, 255, 120, 0.9)) drop-shadow(0 0 3px rgba(90, 255, 120, 0.6))',
  normal: 'none',
  hard: 'drop-shadow(0 0 1px rgba(255, 70, 70, 0.9)) drop-shadow(0 0 3px rgba(255, 70, 70, 0.6))',
};
const NEXT_LEVEL: Record<BrainDifficulty, BrainDifficulty> = { easy: 'normal', normal: 'hard', hard: 'easy' };

/** The level after `level` in the click cycle. */
export function nextBrainDifficulty(level: BrainDifficulty): BrainDifficulty {
  return NEXT_LEVEL[level];
}

/**
 * Build the badge. `level` is the current difficulty; `onIconClick` is called on each click of the
 * icon and returns the level now in force. Without `onIconClick` (the legacy brain, which has no
 * levels) the badge is entirely click-through and shows no glow.
 */
export function createBrainIndicator(
  level: BrainDifficulty | null,
  onIconClick?: () => BrainDifficulty,
): HTMLElement {
  const el = document.createElement('div');
  el.id = 'brain-indicator';
  el.style.cssText = `
    position: fixed;
    top: 16px;
    left: 16px;
    z-index: 9000;
    background: #000;
    color: #fff;
    font-family: 'Chicago', 'Charcoal', 'Courier New', monospace;
    font-size: 11px;
    padding: 4px 10px;
    border: 2px solid #fff;
    box-shadow: 2px 2px 0 rgba(255,255,255,0.3);
    pointer-events: none;
    user-select: none;
    letter-spacing: 0.05em;
    overflow: visible;
  `;

  // The page stylesheet sets `* { overflow: hidden }`, which would clip the glow and the floating
  // label, so the badge and its icon opt out.
  const icon = document.createElement('span');
  icon.className = 'brain-indicator-icon';
  icon.textContent = '🧠';
  icon.style.cssText = 'display: inline-block; position: relative; overflow: visible;';
  el.appendChild(icon);
  el.appendChild(document.createTextNode(' Brain Active'));

  if (!onIconClick || !level) return el;

  icon.style.pointerEvents = 'auto';
  icon.style.cursor = 'pointer';
  icon.style.filter = LEVEL_GLOW[level];
  // Keep the click to the badge: the game listens for mouse input on the page underneath.
  for (const type of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick']) {
    icon.addEventListener(type, (e) => { e.stopPropagation(); e.preventDefault(); });
  }
  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const now = onIconClick();
    icon.style.filter = LEVEL_GLOW[now];
    floatLabel(icon, LEVEL_LABEL[now]);
    console.log(`[Brain] difficulty: ${now}`);
  });
  return el;
}

/** A small label that rises from just under the icon and fades out. */
function floatLabel(icon: HTMLElement, text: string): void {
  icon.querySelectorAll('.brain-indicator-float').forEach((n) => n.remove());
  const label = document.createElement('span');
  label.className = 'brain-indicator-float';
  label.textContent = text;
  label.style.cssText = `
    position: absolute;
    left: 50%;
    top: calc(100% + 6px);
    transform: translateX(-50%);
    color: #fff;
    font-size: 10px;
    white-space: nowrap;
    overflow: visible;
    pointer-events: none;
    text-shadow: 0 0 2px #000, 1px 1px 0 #000;
  `;
  icon.appendChild(label);
  if (typeof label.animate === 'function') {
    const fade = label.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 4px)' },
        { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.15 },
        { opacity: 1, transform: 'translate(-50%, -2px)', offset: 0.6 },
        { opacity: 0, transform: 'translate(-50%, -6px)' },
      ],
      { duration: 1100, easing: 'ease-out' },
    );
    fade.onfinish = () => label.remove();
  } else {
    setTimeout(() => label.remove(), 1100);
  }
}
