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
type ProcessorMsg = LoadMultiMsg | PlayMsg | StopMsg | PauseMsg | NextMsg;

class InteractivePlayerProcessor extends AudioWorkletProcessor {
  private tracks: Float32Array[][] = [];

  private start = 0;
  private head = 0;
  private playing = false;
  private pause = false;
  private current = 0;
  private next: number | null = 0;
  private transitions: Record<number, number | null> = {};

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
          this.playing = true;
          break;

        case 'stop':
          this.playing = false;
          this.head = 0;
          this.current = this.start;
          this.next = this.transitions[this.current] ?? null;
          break;

        case 'pause':
          this.pause = data.type === 'pause';
          break;

        case 'resume':
          this.pause = false;
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
      }
    };
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
  ): boolean {
    const out = outputs[0];

    if (!this.playing || this.pause || this.tracks.length === 0) {
      out.forEach(ch => ch.fill(0));
      return true;
    }

    for (let i = 0; i < out[0].length; i++) {
      // 遷移判定
      if (
        this.tracks[this.current].length > 0 &&
        this.head >= this.tracks[this.current][0].length
      ) {
        this.head = 0;

        if (this.next === null || this.next === undefined) {
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

      // 出力
      for (let ch = 0; ch < out.length; ch++) {
        out[ch][i] = this.tracks[this.current][ch][this.head];
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
