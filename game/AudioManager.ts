export class AudioManager {
  private ctx: AudioContext | null = null;
  private lastHeartbeat: number = 0;
  private lastFootstep: number = 0;
  private lastBearState: string = 'PATROL';
  private chaseOscillator: OscillatorNode | null = null;
  private chaseGain: GainNode | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  update(detection: number, isMoving: boolean, bearState: string) {
    this.init();
    if (!this.ctx) return;

    const now = performance.now();

    // Heartbeat — only when detection > 20
    if (detection > 20) {
      const interval = Math.max(180, 900 - detection * 7);
      if (now - this.lastHeartbeat > interval) {
        this.playHeartbeat(detection);
        this.lastHeartbeat = now;
      }
    }

    // Footsteps
    if (isMoving) {
      const footstepInterval = 380;
      if (now - this.lastFootstep > footstepInterval) {
        this.playFootstep();
        this.lastFootstep = now;
      }
    }

    // Bear state transitions
    if (bearState !== this.lastBearState) {
      if (bearState === 'ALERT' || bearState === 'INVESTIGATE') {
        this.playAlert();
      }
      if (bearState === 'CHASE') {
        this.startChaseLoop();
      } else if (this.lastBearState === 'CHASE') {
        this.stopChaseLoop();
      }
      this.lastBearState = bearState;
    }
  }

  playPickup() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(1100, t + 0.12);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  playGameOver() {
    this.init();
    if (!this.ctx) return;
    this.stopChaseLoop();
    const t = this.ctx.currentTime;
    // Low rumble
    [80, 60, 40].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t + i * 0.1);
      gain.gain.setValueAtTime(0.3, t + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.5);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.5);
    });
  }

  playVictory() {
    this.init();
    if (!this.ctx) return;
    this.stopChaseLoop();
    const t = this.ctx.currentTime;
    [440, 550, 660, 880].forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.12);
      gain.gain.setValueAtTime(0.15, t + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.3);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.3);
    });
  }

  private playAlert() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.3);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  private startChaseLoop() {
    if (!this.ctx || this.chaseOscillator) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    this.chaseOscillator = osc;
    this.chaseGain = gain;
  }

  private stopChaseLoop() {
    if (!this.ctx || !this.chaseOscillator || !this.chaseGain) return;
    this.chaseGain.gain.linearRampToValueAtTime(0.0, this.ctx.currentTime + 0.4);
    this.chaseOscillator.stop(this.ctx.currentTime + 0.4);
    this.chaseOscillator = null;
    this.chaseGain = null;
  }

  private playHeartbeat(detection: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const vol = 0.08 + (detection / 100) * 0.2;

    const beat = (offset: number) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(65, t + offset);
      osc.frequency.exponentialRampToValueAtTime(30, t + offset + 0.08);
      gain.gain.setValueAtTime(vol, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.1);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(t + offset);
      osc.stop(t + offset + 0.1);
    };

    beat(0);
    beat(0.12); // double-beat
  }

  private playFootstep() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(90 + Math.random() * 30, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.06);
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }
}
