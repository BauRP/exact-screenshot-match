/**
 * JavaScript timeouts do not cancel work already running in native ML Kit.
 * Allow only one scan until all of its native promises settle.
 */
export class OcrSessionGate {
  private active = false;
  get busy(): boolean { return this.active; }
  enter(): () => void {
    if (this.active) throw new Error("OCR_SCAN_BUSY");
    this.active = true;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active = false;
    };
  }
}
