
export interface TrackInfo {
  src: string | ArrayBuffer;
  next: number | null;
}

export default class InteractivePlayer {
  private ctx = new AudioContext();
  private node!: AudioWorkletNode; // 遅延初期化
  private graph: Record<number, number | null> = {};
  private workletReady: Promise<void>;

  constructor() {
    const moduleUrl =
      // ESM (ブラウザ / Node ESM)
      (typeof import.meta !== 'undefined' && import.meta.url) ||
      `file://${__dirname}/`;
    const workletUrl = new URL(
      'interactive-player-processor.js',
      moduleUrl,
    );
    this.workletReady = this.ctx.audioWorklet
      .addModule(workletUrl.toString())
      .then(() => {
        this.node = new AudioWorkletNode(
          this.ctx,
          'interactive-player-processor',
        );
        this.node.connect(this.ctx.destination);
      });
  }

  /** 複数トラックをまとめてロード */
  async loadAll(tracks: TrackInfo[]): Promise<void> {
    this.graph = tracks.reduce<Record<number, number | null>>(
      (g, t, i) => ((g[i] = t.next ?? null), g),
      {},
    );

    const buffers = await Promise.all(
      tracks.map(async t => {
        const arr =
          typeof t.src === 'string'
            ? await (await fetch(t.src)).arrayBuffer()
            : t.src;
        return this.ctx.decodeAudioData(arr);
      }),
    );

    await this.workletReady;

    const transferables: Transferable[] = [];
    const payload = buffers.map(buf => {
      const chans: ArrayBuffer[] = [];
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const copy = new Float32Array(buf.getChannelData(ch));
        chans.push(copy.buffer);
        transferables.push(copy.buffer);
      }
      return chans;
    });

    this.node.port.postMessage(
      { type: 'loadMulti', tracks: payload, transitions: this.graph },
      transferables,
    );
  }

  /** 再生 */
  async play(startIdx = 0): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    await this.workletReady;
    this.node.port.postMessage({ type: 'play', start: startIdx });
  }

  /** 停止（頭出し） */
  async stop(): Promise<void> {
    await this.workletReady;
    this.node.port.postMessage({ type: 'stop' });
  }

  /** ポーズ／レジューム */
  async pause(isPause: boolean): Promise<void> {
    await this.workletReady;
    this.node.port.postMessage({ type: isPause ? 'pause' : 'resume' });
  }

  /** 次トラックをキューイング */
  async next(idx: number | null, currentIs: number | null = null): Promise<void> {
    await this.workletReady;
    this.node.port.postMessage({ type: 'next', next: idx, currentIs });
  }

  async setFadeInSec(sec: number): Promise<void> {
    await this.workletReady;
    this.node.port.postMessage({
      type: 'setFadeIn',
      fadeInSamples: this.secToSamples(sec),
    });
  }

  async setFadeOutSec(sec: number): Promise<void> {
    await this.workletReady;
    this.node.port.postMessage({
      type: 'setFadeOut',
      fadeOutSamples: this.secToSamples(sec),
    });
  }

  private secToSamples(sec: number): number {
    return Math.floor(sec * this.ctx.sampleRate);
  }
}
