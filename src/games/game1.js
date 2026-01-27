/*
  Lumoland – Glühwürmchen-Jagd
  Komplett ohne Frameworks. Fokus auf verständliche, kommentierte Struktur.
*/

(() => {
  "use strict";

  // -----------------------------
  // Hilfsfunktionen
  // -----------------------------
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const lerp = (a, b, t) => a + (b - a) * t;

  const prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const now = () => performance.now();

  const formatTimestamp = (date) => {
    const pad = (num) => String(num).padStart(2, "0");
    return (
      date.getFullYear() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      "_" +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds())
    );
  };

  const getPalette = () => {
    const styles = getComputedStyle(document.documentElement);
    return {
      nightBg: styles.getPropertyValue("--night-bg").trim(),
      nightBg2: styles.getPropertyValue("--night-bg-2").trim(),
      nightPrimary: styles.getPropertyValue("--night-primary").trim(),
      accentWarm: styles.getPropertyValue("--accent-warm").trim(),
      accentGreen: styles.getPropertyValue("--accent-green").trim(),
      cream: styles.getPropertyValue("--cream").trim(),
      textSoft: styles.getPropertyValue("--text-soft").trim(),
    };
  };

  const mixColors = (colorA, colorB, t) => {
    const parse = (hex) => {
      const cleaned = hex.replace("#", "");
      return {
        r: parseInt(cleaned.slice(0, 2), 16),
        g: parseInt(cleaned.slice(2, 4), 16),
        b: parseInt(cleaned.slice(4, 6), 16),
      };
    };
    const a = parse(colorA);
    const b = parse(colorB);
    const r = Math.round(lerp(a.r, b.r, t));
    const g = Math.round(lerp(a.g, b.g, t));
    const bVal = Math.round(lerp(a.b, b.b, t));
    return `rgb(${r}, ${g}, ${bVal})`;
  };

  // -----------------------------
  // Settings: persistente Optionen
  // -----------------------------
  class Settings {
    constructor() {
      this.storageKey = "lumoland-settings";
      this.state = {
        grade: "pre",
        mute: false,
        ttsAuto: true,
      };
      this.load();
    }

    load() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (raw) {
          this.state = { ...this.state, ...JSON.parse(raw) };
        }
      } catch (error) {
        console.warn("Settings load failed", error);
      }
    }

    save() {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    }

    set(key, value) {
      this.state[key] = value;
      this.save();
    }

    get(key) {
      return this.state[key];
    }
  }

  // -----------------------------
  // AudioBus: einfache WebAudio-Sounds
  // -----------------------------
  class AudioBus {
    constructor(settings) {
      this.settings = settings;
      this.context = null;
      this.master = null;
      this.ambientOsc = null;
    }

    init() {
      if (this.context) return;
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.context.createGain();
      this.master.gain.value = this.settings.get("mute") ? 0 : 0.4;
      this.master.connect(this.context.destination);
      this.startAmbient();
    }

    setMute(muted) {
      if (!this.master) return;
      this.master.gain.value = muted ? 0 : 0.4;
    }

    startAmbient() {
      if (!this.context) return;
      this.ambientOsc = this.context.createOscillator();
      const gain = this.context.createGain();
      this.ambientOsc.type = "sine";
      this.ambientOsc.frequency.value = 96;
      gain.gain.value = 0.02;
      this.ambientOsc.connect(gain);
      gain.connect(this.master);
      this.ambientOsc.start();
    }

    playTone({ frequency = 440, duration = 0.2, type = "sine", gain = 0.2 }) {
      if (!this.context || this.settings.get("mute")) return;
      const osc = this.context.createOscillator();
      const amp = this.context.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      amp.gain.value = gain;
      osc.connect(amp);
      amp.connect(this.master);
      osc.start();
      osc.stop(this.context.currentTime + duration);
    }

    jump() {
      this.playTone({ frequency: 520, duration: 0.12, type: "triangle", gain: 0.12 });
    }

    success() {
      this.playTone({ frequency: 740, duration: 0.2, type: "sine", gain: 0.18 });
      this.playTone({ frequency: 980, duration: 0.3, type: "sine", gain: 0.12 });
    }

    camera() {
      this.playTone({ frequency: 420, duration: 0.2, type: "sawtooth", gain: 0.08 });
    }

    softPop() {
      this.playTone({ frequency: 360, duration: 0.15, type: "triangle", gain: 0.1 });
    }
  }

  // -----------------------------
  // Speech: Web Speech Wrapper
  // -----------------------------
  class Speech {
    constructor(settings) {
      this.settings = settings;
      this.available = "speechSynthesis" in window;
      this.voice = null;
      this.lumiVoice = [
        "Hilfst du mir?",
        "Fast! Lass uns nochmal schauen.",
        "Wow! Jetzt leuchtet der Wald ✨",
      ];
      if (this.available) {
        window.speechSynthesis.onvoiceschanged = () => this.loadVoice();
        this.loadVoice();
      }
    }

    loadVoice() {
      if (!this.available) return;
      const voices = window.speechSynthesis.getVoices();
      this.voice = voices.find((v) => v.lang === "de-DE") || voices[0];
    }

    speak(text) {
      if (!this.available || this.settings.get("mute")) return false;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "de-DE";
      if (this.voice) utterance.voice = this.voice;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      return true;
    }

    speakLumi(index = 0) {
      const sentence = this.lumiVoice[index % this.lumiVoice.length];
      return this.speak(sentence);
    }

    toWord(value) {
      const words = {
        "+": "plus",
        "-": "minus",
        "×": "mal",
        "÷": "geteilt durch",
        "=": "gleich",
      };
      return words[value] || value;
    }
  }

  // -----------------------------
  // MathEngine: Aufgabenlogik
  // -----------------------------
  class MathEngine {
    constructor(settings) {
      this.settings = settings;
    }

    createTask() {
      const grade = this.settings.get("grade");
      if (grade === "pre") return this.createCounting();
      if (grade === "1-2") return this.createAddSub(20);
      if (grade === "3-4") return this.createAddSub(100, true);
      return this.createAdvanced();
    }

    createCounting() {
      const count = Math.floor(Math.random() * 8) + 2;
      return {
        prompt: `Wie viele Glühwürmchen leuchten? (${count} leuchtende Punkte)`,
        answer: count,
        speech: `Zähle die Glühwürmchen. Wie viele sind es?`,
      };
    }

    createAddSub(max, includeMultiplication = false) {
      const useAdd = Math.random() > 0.4;
      let a = Math.floor(Math.random() * max) + 1;
      let b = Math.floor(Math.random() * max) + 1;
      if (!useAdd && a < b) [a, b] = [b, a];
      const op = useAdd ? "+" : "-";
      const answer = useAdd ? a + b : a - b;
      const speech = `${a} ${useAdd ? "plus" : "minus"} ${b}`;
      if (includeMultiplication && Math.random() > 0.7) {
        a = Math.floor(Math.random() * 8) + 2;
        b = Math.floor(Math.random() * 8) + 2;
        return {
          prompt: `${a} × ${b}`,
          answer: a * b,
          speech: `${a} mal ${b}`,
        };
      }
      return { prompt: `${a} ${op} ${b}`, answer, speech };
    }

    createAdvanced() {
      const useText = Math.random() > 0.6;
      if (useText) {
        const a = Math.floor(Math.random() * 6) + 3;
        const b = Math.floor(Math.random() * 5) + 2;
        return {
          prompt: `Lumi sammelt ${a} Glühwürmchen pro Ast. Wie viele sind es nach ${b} Ästen?`,
          answer: a * b,
          speech: `Rechne ${a} mal ${b}.`,
        };
      }
      const useDivide = Math.random() > 0.5;
      if (useDivide) {
        const b = Math.floor(Math.random() * 8) + 2;
        const answer = Math.floor(Math.random() * 8) + 2;
        const a = b * answer;
        return {
          prompt: `${a} ÷ ${b}`,
          answer,
          speech: `${a} geteilt durch ${b}`,
        };
      }
      return this.createAddSub(60, true);
    }

    getSamples() {
      const grade = this.settings.get("grade");
      const samples = [];
      for (let i = 0; i < 3; i += 1) {
        const task = this.createTask();
        samples.push({ text: task.prompt, speech: task.speech || task.prompt });
      }
      if (grade === "pre") {
        samples[0].text = "Zähle bis 5: •••••";
        samples[1].text = "Wie viele Sterne siehst du? (7)";
        samples[2].text = "Zähle bis 10: ⭐⭐⭐⭐⭐⭐⭐⭐⭐⭐";
      }
      return samples;
    }
  }

  // -----------------------------
  // PlayerLumi: Steuerung & Physik
  // -----------------------------
  class PlayerLumi {
    constructor(audio) {
      this.audio = audio;
      this.reset();
    }

    reset() {
      this.x = 120;
      this.y = 280;
      this.vx = 0;
      this.vy = 0;
      this.width = 42;
      this.height = 48;
      this.onGround = false;
      this.speed = 140;
      this.jumpStrength = 320;
    }

    update(dt, input, platforms, spawnPlatform) {
      const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      this.vx = move * this.speed;
      if (input.jump && this.onGround) {
        this.vy = -this.jumpStrength;
        this.onGround = false;
        this.audio.jump();
      }
      this.vy += 620 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      this.onGround = false;
      platforms.forEach((platform) => {
        const withinX =
          this.x + this.width > platform.x && this.x < platform.x + platform.width;
        const hittingY =
          this.y + this.height > platform.y &&
          this.y + this.height < platform.y + platform.height + 8 &&
          this.vy >= 0;
        if (withinX && hittingY) {
          this.y = platform.y - this.height;
          this.vy = 0;
          this.onGround = true;
        }
      });

      this.x = clamp(this.x, 20, 900);
      if (this.y > 480 && spawnPlatform) {
        this.x = spawnPlatform.x + spawnPlatform.width * 0.3;
        this.y = spawnPlatform.y - this.height;
        this.vy = 0;
        this.onGround = true;
      } else if (this.y > 460) {
        this.y = 460;
        this.vy = 0;
        this.onGround = true;
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.fillStyle = "rgba(243,210,122,0.9)";
      ctx.shadowColor = "rgba(243,210,122,0.6)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(this.x, this.y, this.width, this.height, 12);
      ctx.fill();
      ctx.restore();
    }
  }

  // -----------------------------
  // FireflySystem: leuchtende Helfer
  // -----------------------------
  class FireflySystem {
    constructor() {
      this.fireflies = [];
    }

    spawn(count, area, lightProgress) {
      for (let i = 0; i < count; i += 1) {
        this.fireflies.push({
          x: area.x + Math.random() * area.width,
          y: area.y + Math.random() * area.height,
          radius: 6 + Math.random() * 6,
          alpha: 0.6 + Math.random() * 0.3,
          targetX: area.x + Math.random() * area.width,
          targetY: area.y + Math.random() * area.height,
          lightBoost: 0.8 + 0.4 * lightProgress,
        });
      }
    }

    update(dt) {
      this.fireflies.forEach((fly) => {
        fly.x = lerp(fly.x, fly.targetX, dt * 1.5);
        fly.y = lerp(fly.y, fly.targetY, dt * 1.5);
        if (Math.random() > 0.98) {
          fly.targetX += (Math.random() - 0.5) * 80;
          fly.targetY += (Math.random() - 0.5) * 40;
        }
      });
    }

    draw(ctx, lightProgress) {
      this.fireflies.forEach((fly) => {
        const glow = fly.radius * (0.8 + 0.4 * lightProgress) * fly.lightBoost;
        ctx.save();
        ctx.fillStyle = `rgba(243, 210, 122, ${fly.alpha})`;
        ctx.shadowColor = "rgba(243,210,122,0.8)";
        ctx.shadowBlur = glow * 2;
        ctx.beginPath();
        ctx.arc(fly.x, fly.y, glow, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }
  }

  // -----------------------------
  // KonfettiEmitter
  // -----------------------------
  class KonfettiEmitter {
    constructor() {
      this.particles = [];
    }

    burst(x, y) {
      for (let i = 0; i < 40; i += 1) {
        this.particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 200,
          vy: -Math.random() * 200,
          life: 1,
          size: 4 + Math.random() * 3,
          color: Math.random() > 0.5 ? "#F3D27A" : "#FFFFFF",
        });
      }
    }

    update(dt) {
      this.particles.forEach((p) => {
        p.vy += 260 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1.2;
      });
      this.particles = this.particles.filter((p) => p.life > 0);
    }

    draw(ctx) {
      this.particles.forEach((p) => {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.restore();
      });
    }
  }

  // -----------------------------
  // Level: Hintergrund & Plattformen
  // -----------------------------
  class Level {
    constructor(palette) {
      this.palette = palette;
      this.backgroundImage = new Image();
      this.backgroundImageLoaded = false;
      this.maxBackgroundIndex = 8;
      this.groundPlatform = null;
      this.platforms = this.generatePlatforms();
      this.updateBackgroundForProgress();
    }

    updateBackgroundForProgress() {
      const unlockedCount = this.platforms.filter((platform) => platform.unlocked).length;
      const index = clamp(unlockedCount, 1, this.maxBackgroundIndex);
      const suffix = index === 1 ? "" : String(index);
      const src = `/public/assets/forest-night${suffix}.png`;
      this.backgroundImageLoaded = false;
      this.backgroundImage.src = src;
      this.backgroundImage.onload = () => {
        this.backgroundImageLoaded = true;
      };
      this.backgroundImage.onerror = () => {
        this.backgroundImageLoaded = false;
      };
    }

    generatePlatforms() {
      const count = 5 + Math.floor(Math.random() * 3);
      const platforms = [];
      const minX = 70;
      const maxX = 860;
      const baseY = 300;
      const height = 20;
      const minVerticalGap = 42;
      const minPlatformY = 190;
      const maxPlatformY = 300;
      let lastY = baseY + minVerticalGap;
      let lastX = minX + Math.random() * (maxX - minX);
      let direction = Math.random() > 0.5 ? 1 : -1;
      for (let i = 0; i < count; i += 1) {
        if (i > 0 && Math.random() > 0.6) direction *= -1;
        const width = 110 + Math.random() * 80;
        const stepX = 140 + Math.random() * 140;
        let x = clamp(
          lastX + direction * stepX + (Math.random() - 0.5) * 40,
          40,
          920 - width
        );
        const targetY = baseY - (i + 1) * 48 + (Math.random() - 0.5) * 8;
        const clampedY = clamp(targetY, minPlatformY, maxPlatformY);
        let y = Math.min(clampedY, lastY - minVerticalGap);
        if (Math.abs(x - lastX) < 100 && Math.abs(y - lastY) < minVerticalGap + 6) {
          x = clamp(x + direction * 120, 40, 920 - width);
          y = Math.min(y, lastY - minVerticalGap);
        }
        lastX = x;
        lastY = y;
        platforms.push({
          x,
          y,
          width,
          height,
          unlocked: i === 0,
          task: null,
        });
      }
      this.groundPlatform = {
        x: 0,
        y: 345,
        width: 960,
        height,
        unlocked: true,
        task: null,
      };
      return platforms;
    }

    getSolidPlatforms() {
      const unlockedPlatforms = this.platforms.filter((platform) => platform.unlocked);
      return this.groundPlatform ? [this.groundPlatform, ...unlockedPlatforms] : unlockedPlatforms;
    }

    getNextLockedPlatform() {
      return this.platforms.find((platform) => !platform.unlocked) || null;
    }

    getSpawnPlatform() {
      return this.groundPlatform || this.platforms.find((platform) => platform.unlocked);
    }

    unlockPlatform(platform) {
      if (!platform) return;
      platform.unlocked = true;
      platform.task = null;
      this.updateBackgroundForProgress();
    }

    drawBackground(ctx, lightProgress) {
      if (this.backgroundImageLoaded) {
        ctx.drawImage(this.backgroundImage, 0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.save();
        ctx.globalAlpha = 0.02;
        this.drawGradientOverlay(ctx, lightProgress);
        ctx.restore();
        return;
      }
      this.drawGradientOverlay(ctx, lightProgress);
    }

    drawGradientOverlay(ctx, lightProgress) {
      const topColor = mixColors(this.palette.nightBg, this.palette.cream, lightProgress);
      const midColor = mixColors(
        this.palette.nightBg2,
        this.palette.textSoft,
        lightProgress * 0.8
      );
      const botColor = mixColors(
        this.palette.nightPrimary,
        this.palette.textSoft,
        lightProgress * 0.6
      );
      const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
      gradient.addColorStop(0, topColor);
      gradient.addColorStop(0.5, midColor);
      gradient.addColorStop(1, botColor);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    drawVignette(ctx, darkness) {
      const radius = ctx.canvas.width * 0.7;
      const centerX = ctx.canvas.width / 2;
      const centerY = ctx.canvas.height / 2;
      const gradient = ctx.createRadialGradient(
        centerX,
        centerY,
        radius * 0.2,
        centerX,
        centerY,
        radius
      );
      const vignetteStrength = darkness * 0.3;
      gradient.addColorStop(0, `rgba(31,42,56,${0.03 * vignetteStrength})`);
      gradient.addColorStop(1, `rgba(12,16,22,${0.2 * vignetteStrength})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    drawPlatforms(ctx) {
      const moonColor = "rgba(244, 214, 140, 0.9)";
      const moonColorMuted = "rgba(244, 214, 140, 0.35)";
      this.platforms.forEach((platform) => {
        ctx.fillStyle = platform.unlocked ? moonColor : moonColorMuted;
        ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
      });
    }
  }

  // -----------------------------
  // Game: zentrale Schleife
  // -----------------------------
  class Game {
    constructor({ canvas, meterFill, meterEl, lumiText, taskText }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.meterFill = meterFill;
      this.meterEl = meterEl;
      this.lumiText = lumiText;
      this.taskText = taskText;
      this.settings = new Settings();
      this.audio = new AudioBus(this.settings);
      this.speech = new Speech(this.settings);
      this.palette = getPalette();
      this.level = new Level(this.palette);
      this.player = new PlayerLumi(this.audio);
      this.fireflies = new FireflySystem();
      this.confetti = new KonfettiEmitter();
      this.math = new MathEngine(this.settings);
      this.input = { left: false, right: false, jump: false };
      this.lightProgress = 0.1;
      this.targetLight = 0.1;
      this.lastTime = now();
      this.currentTask = null;
      this.activePlatform = null;
      this.taskActive = false;
      this.mathBox = document.querySelector(".math-box");
      this.taskBubbleText = "";
      this.currentAnswerText = "";
      this.completionImage = new Image();
      this.completionImageLoaded = false;
      this.completionImage.src = "/public/assets/lumigluewuermchenfreundschaft.png";
      this.completionImage.onload = () => {
        this.completionImageLoaded = true;
      };
      this.completionImage.onerror = () => {
        this.completionImageLoaded = false;
      };
      this.completionStart = 0;
      this.completionReadyAt = 0;
      this.completionFadeMs = 2000;
      this.finalPlatformUnlocked = false;
      this.setDialog("");
      this.setTaskVisible(false);
      this.spawnPlayerAtGround();
    }

    start() {
      this.audio.init();
      this.bindKeys();
      this.updateTask();
      requestAnimationFrame((time) => this.loop(time));
    }

    spawnPlayerAtGround() {
      const platform = this.level.getSpawnPlatform();
      if (!platform) return;
      this.player.x = platform.x + platform.width * 0.2;
      this.player.y = platform.y - this.player.height + 27;
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.onGround = true;
    }

    bindKeys() {
      window.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft" || event.key === "a") this.input.left = true;
        if (event.key === "ArrowRight" || event.key === "d") this.input.right = true;
        if (event.key === " " || event.key === "ArrowUp" || event.key === "w")
          this.input.jump = true;
      });
      window.addEventListener("keyup", (event) => {
        if (event.key === "ArrowLeft" || event.key === "a") this.input.left = false;
        if (event.key === "ArrowRight" || event.key === "d") this.input.right = false;
        if (event.key === " " || event.key === "ArrowUp" || event.key === "w")
          this.input.jump = false;
      });
      window.addEventListener("keydown", () => {
        this.handleCompletionExit();
      });
      window.addEventListener("click", () => {
        this.handleCompletionExit();
      });
    }

    setDialog(text) {
      if (this.lumiText) this.lumiText.textContent = text;
    }

    updateTask() {
      if (!this.activePlatform) return;
      if (!this.activePlatform.task) {
        this.activePlatform.task = this.math.createTask();
      }
      this.currentTask = this.activePlatform.task;
      this.taskBubbleText = this.currentTask.prompt;
      if (this.taskText) {
        this.taskText.textContent = this.taskActive ? "" : this.currentTask.prompt;
      }
      if (this.settings.get("ttsAuto") && this.taskActive) {
        this.speech.speak(this.currentTask.speech || this.currentTask.prompt);
      }
    }

    checkAnswer(value) {
      if (!this.currentTask || !this.activePlatform) return false;
      if (Number(value) === Number(this.currentTask.answer)) {
        this.audio.success();
        this.setDialog("Wow! Jetzt leuchtet der Wald ✨");
        this.level.unlockPlatform(this.activePlatform);
        this.fireflies.spawn(2 + Math.floor(Math.random() * 2), {
          x: 200,
          y: 160,
          width: 500,
          height: 120,
        }, this.lightProgress);
        this.confetti.burst(this.canvas.width * 0.5, this.canvas.height * 0.3);
        this.increaseLight();
        this.currentTask = null;
        this.activePlatform = null;
        this.currentAnswerText = "";
        this.setTaskVisible(false);
        if (!this.level.getNextLockedPlatform()) {
          this.finalPlatformUnlocked = true;
        }
        return true;
      }
      this.audio.softPop();
      return false;
    }

    setTaskVisible(active) {
      this.taskActive = active;
      if (this.mathBox) this.mathBox.hidden = false;
      if (this.taskText && this.currentTask) {
        this.taskText.textContent = active ? "" : this.currentTask.prompt;
      }
      if (this.keypad) this.keypad.hidden = active;
      if (this.answerInput) this.answerInput.hidden = active;
    }

    isPlayerNearPlatform(platform) {
      const playerRight = this.player.x + this.player.width;
      const playerLeft = this.player.x;
      const closeX =
        playerRight > platform.x - 24 && playerLeft < platform.x + platform.width + 24;
      const closeY = this.player.y + this.player.height > platform.y - 120;
      return closeX && closeY;
    }

    updateTaskGate() {
      const nextPlatform = this.level.getNextLockedPlatform();
      if (!nextPlatform) {
        this.setTaskVisible(false);
        return;
      }
      const shouldShow = this.isPlayerNearPlatform(nextPlatform);
      if (shouldShow) {
        if (this.activePlatform !== nextPlatform) {
          this.activePlatform = nextPlatform;
          this.setTaskVisible(true);
          this.updateTask();
        } else if (!this.taskActive) {
          this.setTaskVisible(true);
          this.updateTask();
        }
      } else if (this.taskActive) {
        this.setTaskVisible(false);
      }
    }

    increaseLight() {
      this.targetLight = clamp(this.targetLight + 0.15, 0.1, 1);
      if (prefersReducedMotion()) {
        this.lightProgress = this.targetLight;
      }
    }

    loop(time) {
      const dt = Math.min(0.033, (time - this.lastTime) / 1000);
      this.lastTime = time;
      if (!prefersReducedMotion()) {
        this.lightProgress = lerp(this.lightProgress, this.targetLight, dt * 2.5);
      }

      this.player.update(
        dt,
        this.input,
        this.level.getSolidPlatforms(),
        this.level.getSpawnPlatform()
      );
      this.checkCompletionLanding();
      this.fireflies.update(dt);
      this.confetti.update(dt);
      this.updateTaskGate();

      this.draw();
      requestAnimationFrame((t) => this.loop(t));
    }

    draw() {
      this.level.drawBackground(this.ctx, this.lightProgress);
      this.level.drawPlatforms(this.ctx);
      this.fireflies.draw(this.ctx, this.lightProgress);
      this.confetti.draw(this.ctx);
      this.drawTaskBubble();
      this.player.draw(this.ctx);
      this.level.drawVignette(this.ctx, 1 - this.lightProgress);
      this.drawCompletionOverlay();
      this.updateMeter();
    }

    startCompletion() {
      if (this.completionStart) return;
      this.completionStart = now();
      this.completionReadyAt = this.completionStart + 2000;
      this.taskActive = false;
    }

    handleCompletionExit() {
      if (!this.completionStart || now() < this.completionReadyAt) return;
      window.location.href = "http://localhost:3000/public/lumoland";
    }

    checkCompletionLanding() {
      if (!this.finalPlatformUnlocked || this.completionStart) return;
      const lastPlatform = this.level.platforms[this.level.platforms.length - 1];
      if (!lastPlatform) return;
      const playerBottom = this.player.y + this.player.height;
      const withinX =
        this.player.x + this.player.width > lastPlatform.x &&
        this.player.x < lastPlatform.x + lastPlatform.width;
      const onPlatform =
        withinX && Math.abs(playerBottom - lastPlatform.y) < 4 && this.player.onGround;
      if (onPlatform) {
        this.startCompletion();
      }
    }

    drawCompletionOverlay() {
      if (!this.completionStart || !this.completionImageLoaded) return;
      const elapsed = now() - this.completionStart;
      const fadeProgress = prefersReducedMotion()
        ? 1
        : clamp(elapsed / this.completionFadeMs, 0, 1);
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = fadeProgress;
      ctx.drawImage(this.completionImage, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.font = '28px "Fable", system-ui, "Segoe UI", Arial, sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.shadowColor = "rgba(12,16,22,0.6)";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "#FFF6EC";
      ctx.strokeStyle = "rgba(12,16,22,0.75)";
      ctx.lineWidth = 4;
      ctx.strokeText("Schön! Jetzt leuchtet der Wald!", ctx.canvas.width / 2, 36);
      ctx.fillText("Schön! Jetzt leuchtet der Wald!", ctx.canvas.width / 2, 36);
      ctx.restore();
    }

    drawTaskBubble() {
      if (!this.taskActive || !this.taskBubbleText || !this.activePlatform) return;
      const ctx = this.ctx;
      const padding = 12;
      const maxWidth = 260;
      const lineHeight = 20;
      ctx.save();
      ctx.font = '16px "Fable", system-ui, "Segoe UI", Arial, sans-serif';
      ctx.textBaseline = "top";
      const lines = [];
      const bubblePrompt = `${this.taskBubbleText} =`;
      const words = bubblePrompt.split(" ");
      let line = "";
      words.forEach((word) => {
        const testLine = line ? `${line} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = testLine;
        }
      });
      if (line) lines.push(line);
      if (this.currentAnswerText) {
        lines.push(this.currentAnswerText);
      }
      const textWidth = Math.min(
        maxWidth,
        Math.max(...lines.map((l) => ctx.measureText(l).width), 0)
      );
      const bubbleWidth = textWidth + padding * 2;
      const bubbleHeight = lines.length * lineHeight + padding * 2;

      const anchorX = this.activePlatform.x + this.activePlatform.width * 0.5;
      const anchorY = this.activePlatform.y;
      let bubbleX = anchorX - bubbleWidth * 0.5;
      let bubbleY = anchorY - bubbleHeight - 12;
      bubbleX = clamp(bubbleX, 12, ctx.canvas.width - bubbleWidth - 12);
      bubbleY = Math.max(12, bubbleY);

      ctx.fillStyle = "rgba(46, 63, 82, 0.95)";
      ctx.strokeStyle = "rgba(243,210,122,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#FFF6EC";
      lines.forEach((text, index) => {
        ctx.fillText(text, bubbleX + padding, bubbleY + padding + index * lineHeight);
      });
      ctx.restore();
    }

    updateMeter() {
      if (!this.meterFill || !this.meterEl) return;
      const percentage = `${Math.round(this.lightProgress * 100)}%`;
      this.meterFill.style.width = percentage;
      this.meterEl.setAttribute("aria-valuenow", this.lightProgress.toFixed(2));
    }

    takePhoto() {
      if (prefersReducedMotion()) {
        this.downloadCanvas();
        return;
      }
      const flash = document.createElement("div");
      flash.style.position = "absolute";
      flash.style.inset = "0";
      flash.style.background = "rgba(255,255,255,0.9)";
      flash.style.pointerEvents = "none";
      flash.style.transition = "opacity 0.4s ease";
      this.canvas.parentElement.appendChild(flash);
      requestAnimationFrame(() => {
        flash.style.opacity = "0";
      });
      setTimeout(() => {
        flash.remove();
        this.downloadCanvas();
      }, 420);
    }

    downloadCanvas() {
      const link = document.createElement("a");
      link.download = `lumoland_schnappschuss_${formatTimestamp(new Date())}.png`;
      link.href = this.canvas.toDataURL("image/png");
      link.click();
      this.audio.camera();
    }
  }

  // -----------------------------
  // UI: Bedienung & Gamebindung
  // -----------------------------
  class UI {
    constructor(game, settings, speech) {
      this.game = game;
      this.settings = settings;
      this.speech = speech;
      this.keypad = document.getElementById("keypad");
      this.answerInput = document.getElementById("answer-input");
      this.muteToggle = document.getElementById("mute-toggle");
      this.speakBtn = document.getElementById("speak-btn");
      this.photoBtn = document.getElementById("photo-btn");
      this.touchButtons = document.querySelectorAll(".touch-btn");
      this.inputValue = "";
    }

    init() {
      if (this.muteToggle) {
        this.muteToggle.checked = this.settings.get("mute");
        this.muteToggle.addEventListener("change", () => {
          this.settings.set("mute", this.muteToggle.checked);
          this.game.audio.setMute(this.muteToggle.checked);
        });
      }

      if (this.keypad) this.buildKeypad();

      if (this.speakBtn) {
        this.speakBtn.addEventListener("click", () => {
          this.speech.speak(this.game.currentTask.speech || this.game.currentTask.prompt);
        });
      }

      if (this.photoBtn) {
        this.photoBtn.addEventListener("click", () => this.game.takePhoto());
        window.addEventListener("keydown", (event) => {
          if (event.key.toLowerCase() === "p") this.game.takePhoto();
        });
      }

      window.addEventListener("keydown", (event) => {
        if (!this.game.taskActive) return;
        if (event.key === "Enter") {
          event.preventDefault();
          this.handleKey("OK");
          return;
        }
        if (event.key === "Backspace") {
          event.preventDefault();
          this.handleKey("←");
          return;
        }
        if (/^\d$/.test(event.key)) {
          this.handleKey(event.key);
        }
      });

      this.touchButtons.forEach((button) => {
        const action = button.dataset.action;
        const setState = (state) => {
          this.game.input[action] = state;
        };
        button.addEventListener("pointerdown", () => setState(true));
        button.addEventListener("pointerup", () => setState(false));
        button.addEventListener("pointerleave", () => setState(false));
      });
    }

    buildKeypad() {
      const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", "←", "OK"];
      keys.forEach((key) => {
        const btn = document.createElement("button");
        btn.textContent = key;
        if (key === "OK") btn.classList.add("secondary");
        btn.addEventListener("click", () => this.handleKey(key));
        this.keypad.appendChild(btn);
      });
    }

    handleKey(key) {
      if (!this.answerInput) return;
      if (key === "←") {
        this.inputValue = this.inputValue.slice(0, -1);
      } else if (key === "OK") {
        const isCorrect = this.game.checkAnswer(this.inputValue);
        if (isCorrect) this.inputValue = "";
      } else {
        this.inputValue += key;
      }
      this.answerInput.textContent = this.inputValue || " ";
      this.game.currentAnswerText = this.inputValue;
    }
  }

  // -----------------------------
  // Intro-Seite Logik
  // -----------------------------
  const initIntro = () => {
    const settings = new Settings();
    const speech = new Speech(settings);
    const math = new MathEngine(settings);
    const gradeSelect = document.getElementById("grade-select");
    const muteToggle = document.getElementById("mute-toggle");
    const sampleList = document.getElementById("sample-list");
    const ttsNote = document.getElementById("tts-note");
    const tabs = document.querySelectorAll(".chip");
    const aboutModal = document.getElementById("about-modal");

    const renderSamples = () => {
      if (!sampleList) return;
      sampleList.innerHTML = "";
      const samples = math.getSamples();
      samples.forEach((sample) => {
        const li = document.createElement("li");
        li.className = "sample-item";
        const text = document.createElement("span");
        text.textContent = sample.text;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Anhören";
        btn.addEventListener("click", () => {
          const spoken = speech.speak(sample.speech);
          if (!spoken && ttsNote) {
            ttsNote.textContent = "TTS ist hier leider nicht verfügbar.";
          }
        });
        li.appendChild(text);
        li.appendChild(btn);
        sampleList.appendChild(li);
      });
      if (ttsNote) {
        ttsNote.textContent = speech.available
          ? "Tipp: Du kannst jede Aufgabe vorlesen lassen."
          : "TTS ist hier leider nicht verfügbar.";
      }
    };

    if (gradeSelect) {
      gradeSelect.value = settings.get("grade");
      gradeSelect.addEventListener("change", () => {
        settings.set("grade", gradeSelect.value);
        renderSamples();
      });
    }

    if (muteToggle) {
      muteToggle.checked = settings.get("mute");
      muteToggle.addEventListener("change", () => settings.set("mute", muteToggle.checked));
    }

    tabs.forEach((tab) => {
      if (tab.dataset.grade === settings.get("grade")) tab.classList.add("active");
      tab.addEventListener("click", () => {
        settings.set("grade", tab.dataset.grade);
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        if (gradeSelect) gradeSelect.value = tab.dataset.grade;
        renderSamples();
      });
    });

    if (aboutModal) {
      const openBtn = document.getElementById("about-btn");
      const closeBtn = document.getElementById("close-modal");
      const toggleModal = (open) => {
        aboutModal.classList.toggle("open", open);
        aboutModal.setAttribute("aria-hidden", open ? "false" : "true");
      };
      openBtn?.addEventListener("click", () => toggleModal(true));
      closeBtn?.addEventListener("click", () => toggleModal(false));
      aboutModal.addEventListener("click", (event) => {
        if (event.target === aboutModal) toggleModal(false);
      });
    }

    renderSamples();
  };

  // -----------------------------
  // Game-Seite Logik
  // -----------------------------
  const initGame = () => {
    const canvas = document.getElementById("game-canvas");
    if (!canvas) return;
    const meterFill = document.getElementById("meter-fill");
    const meterEl = document.querySelector(".meter");
    const lumiText = document.getElementById("lumi-text");
    const taskText = document.getElementById("task-text");

    const game = new Game({ canvas, meterFill, meterEl, lumiText, taskText });
    const ui = new UI(game, game.settings, game.speech);
    ui.init();
    game.start();
  };

  if (document.querySelector(".intro")) initIntro();
  if (document.querySelector(".game-layout")) initGame();
})();
