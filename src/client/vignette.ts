/**
 * Vignette - Overlay UI for displaying messages
 */

export class Vignette {
  private container: HTMLDivElement;
  private messageLine: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'vignette';
    document.body.appendChild(this.container);

    this.messageLine = document.createElement('div');
    this.messageLine.className = 'vignette-message';
    this.container.appendChild(this.messageLine);
  }

  message(text: string): void {
    this.messageLine.textContent = text;
  }

  showProgress(): void {
    // FIXME
  }

  hideProgress(): void {
    // FIXME
  }

  progress(p: number): void {
    // FIXME
  }

  destroy(): void {
    this.container.remove();
    (this.container as any) = null;
    (this.messageLine as any) = null;
  }
}

export default Vignette;
