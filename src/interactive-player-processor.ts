/// <reference types="audioworklet" />

declare function registerProcessor(
  name: string,
  ctor: typeof AudioWorkletProcessor,
): void;

type LoadMultiMsg = {
  type: 'loadMulti';
  tracks: Array<Array<ArrayBuffer>>; // [track][channel] の ArrayBuffer
  start?: number;
  transitions?: Record<number, number | null>;
};
type PlayMsg = { type: 'play'; start?: number };
type StopMsg = { type: 'stop' };
type PauseMsg = { type: 'pause' | 'resume' };
type NextMsg = {
  type: 'next';
  next: number | null;
  currentIs?: number | null;
};
type SetFadeInMsg = {
  type: 'setFadeIn';
  fadeInSamples: number;
}
type SetFadeOutMsg = {
  type: 'setFadeOut';
  fadeOutSamples: number;
};
type ProcessorMsg = LoadMultiMsg | PlayMsg | StopMsg | PauseMsg | NextMsg | SetFadeInMsg | SetFadeOutMsg;

class Fader {

  public fadeInSamples: number;
  private fadeInStart: number = 0;
  public useFadeIn: boolean = false;
  public fadeOutSamples: number;
  private fadeOutStart: number = 0;
  public useFadeOut: boolean = false;
  private fadeOutEvent: any = null;
  
  constructor(fadeInSamples: number, fadeOutSamples: number) {
    this.fadeInSamples = fadeInSamples;
    this.fadeOutSamples = fadeOutSamples;
  }

  public startFadeIn(head: number): void {
    this.fadeInStart = head;
    this.useFadeIn = true;
  }

  public startFadeOut(head: number, event: any = null): void {
    this.fadeOutEvent = event;
    this.fadeOutStart = head;
    this.useFadeOut = true;
  }

  public getFadeInStep(head: number): number {
    if (!this.useFadeIn) return 1;
    if (head < this.fadeInStart) return 0;
    if (this.fadeInStart + this.fadeInSamples < head) {
      this.useFadeIn = false;
      return 1
    };
    const step = (head - this.fadeInStart) / this.fadeInSamples;
    return Math.min(step, 1);
  }

  public getFadeOutStep(head: number, isPause: boolean): number {
    if (!this.useFadeOut && !isPause) {
      if (this.fadeOutEvent !== null) { // 完全に停止後イベントを実行
        this.fadeOutEvent();
        this.fadeOutEvent = null;
      }
      return 1;
    }
    if (!this.useFadeOut && isPause) return 0;
    if (head < this.fadeOutStart) return 1;
    if (this.fadeOutStart + this.fadeOutSamples < head) {
      this.useFadeOut = false;
      return 0
    };
    const step = 1 - (head - this.fadeOutStart) / this.fadeOutSamples;
    return Math.max(step, 0);
  }

}

class InteractivePlayerProcessor extends AudioWorkletProcessor {
  private tracks: Float32Array[][] = [];

  private start = 0;
  private head = 0;
  private playing = false;
  private pause = false;
  private current = 0;
  private next: number | null = 0;
  private transitions: Record<number, number | null> = {};
  private fader: Fader = new Fader(440, 440);

  constructor() {
    super();

    this.port.onmessage = ({ data }: MessageEvent<ProcessorMsg>) => {
      switch (data.type) {
        case 'loadMulti':
          this.tracks = data.tracks.map(track =>
            track.map(buf => new Float32Array(buf)),
          );
          this.head = 0;
          this.start = data.start ?? 0;
          this.current = this.start;
          this.transitions = data.transitions ?? {};
          this.next = this.transitions[this.current] ?? null;
          break;

        case 'play':
          if (!this.playing) this.playing = true;
          break;

        case 'stop':
          if (this.playing) {
            this.playing = false;
            this.head = 0;
            this.current = this.start;
            this.next = this.transitions[this.current] ?? null;
          }
          break;

        case 'pause':
          if (!this.pause) {
            this.pause = data.type === 'pause';
            this.fader.startFadeOut(this.head);
          }
          break;

        case 'resume':
          if (this.pause) {
            this.pause = false;
            this.fader.startFadeIn(this.head);
          }
          break;

        case 'next':
          if (
            data.currentIs === undefined ||
            data.currentIs === null ||
            data.currentIs === this.current
          ) {
            this.next = data.next;
          }
          break;

        case 'setFadeIn':
          this.fader.fadeInSamples = data.fadeInSamples;
          break;
        
        case 'setFadeOut':
          this.fader.fadeOutSamples = data.fadeOutSamples;
          break;
      }
    };
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
  ): boolean {
    const out = outputs[0];

    if (
      (
        !this.playing || 
        this.pause || 
        this.tracks.length === 0
      ) &&
      !this.fader.useFadeOut
    ) {
      out.forEach(ch => ch.fill(0));
      return true;
    }

    for (let i = 0; i < out[0].length; i++) {
      // 遷移判定
      if (
        this.tracks[this.current].length > 0 &&
        this.head >= this.tracks[this.current][0].length &&
        !this.fader.useFadeOut
      ) {
        this.head = 0;

        if (
          this.next === null || 
          this.next === undefined
        ) {
          this.playing = false;
          this.current = this.start;
          this.next = this.transitions[this.current] ?? null;
          out.forEach(ch => (ch[i] = 0));
          continue;
        } else {
          this.current = this.next;
          this.next = this.transitions[this.current] ?? null;
        }
      }

      const fadeInStep = this.fader.getFadeInStep(this.head);
      const fadeOutStep = this.fader.getFadeOutStep(this.head, this.pause);

      // 出力
      for (let ch = 0; ch < out.length; ch++) {
        out[ch][i] = this.tracks[this.current][ch][this.head] * fadeInStep * fadeOutStep;
      }

      this.head++;
    }
    return true;
  }
}

registerProcessor(
  'interactive-player-processor',
  InteractivePlayerProcessor,
);
