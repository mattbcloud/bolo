// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createBrainIndicator, nextBrainDifficulty } from './brain_indicator';
import type { BrainDifficulty } from '../brain/capture_loader';

describe('brain indicator', () => {
  it('cycles easy -> normal -> hard -> easy', () => {
    expect(nextBrainDifficulty('normal')).toBe('hard');
    expect(nextBrainDifficulty('hard')).toBe('easy');
    expect(nextBrainDifficulty('easy')).toBe('normal');
  });

  it('clicking the icon changes the level, its glow, and floats the label', () => {
    let level: BrainDifficulty = 'normal';
    const el = createBrainIndicator(level, () => (level = nextBrainDifficulty(level)));
    const icon = el.querySelector('.brain-indicator-icon') as HTMLElement;
    expect(el.textContent).toBe('🧠 Brain Active');
    expect(icon.style.filter).toBe('none');

    icon.click();
    expect(level).toBe('hard');
    expect(icon.style.filter).toContain('255, 70, 70');
    expect(icon.querySelector('.brain-indicator-float')?.textContent).toBe('Hard');

    icon.click();
    expect(level).toBe('easy');
    expect(icon.style.filter).toContain('90, 255, 120');
    expect(icon.querySelectorAll('.brain-indicator-float')).toHaveLength(1);

    icon.click();
    expect(level).toBe('normal');
    expect(icon.style.filter).toBe('none');
  });

  it('the legacy badge is click-through with no glow', () => {
    const el = createBrainIndicator(null);
    const icon = el.querySelector('.brain-indicator-icon') as HTMLElement;
    expect(el.style.pointerEvents).toBe('none');
    expect(icon.style.pointerEvents).toBe('');
    expect(icon.style.filter).toBe('');
  });
});
