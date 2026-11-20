// Частицы оригинала — точный перенос движка game.exe (адреса — original/install/game.exe).
//
// Эмиттер (.psi → public/data/particles.json, формат в tools/export_particles.py):
//   загрузчик 0x79f760 (128 байт; speed/gravity/radial/tangential делятся на 100 — 0x888a80),
//   создание 0x7e34c0 → 0x79e840, такт 0x79eb00, тикер 0x79ea40, setPos 0x79f2b0,
//   старт 0x79f430 (duration −1 → elapsed −1, иначе 0), стоп 0x79f480 (elapsed −2),
//   отрисовка 0x79f4c0: поворот = spin·возраст, масштаб, цвет trunc(канал·255) (0x79fcd0).
// Список эмиттеров 0x7e32a0/0x7e3340: t += dt (не больше 1 с), каждый шаг 0,01 с
// (константа 0x8af1c0) — тик всех эмиттеров с dt = 0,01; закончившие (elapsed −2 и без
// частиц) удаляются. Скорости — пиксели за такт, поэтому у эмиттеров списка шаг ровно 0,01 с.
//
// Полёт приза/плода (0x426e90, 0x427530, 0x427780, 0x427930): предмет невидим, каждый кадр
// тикает эмиттер с реальным dt (0x42795f), сам движется по пути (0x46aab0) и ставит эмиттер
// в свою точку (0x79f2b0) — частицы спавнятся на отрезке «предыдущая точка → текущая».
// Путь (0x46a790 + 0x46aff0): ключевые точки A@0, M@T/2, B@T, M = середина + (−k, +k)
// (k — interpolator_k из properties_ru.xml <effects>); касательные нулевые
// (0x46a630 ставит (0,0) с флагами, tension/continuity/bias сегмента = 0), поэтому каждый
// участок — гладстеп 3u²−2u³. Масштаб/гравитация частиц зависят от оставшегося времени:
// product — scale = сохранённый · остаток, prizes — то же + 0,4 (0x880b40), water — гравитация = остаток.
import { Container, Sprite } from "pixi.js";
import { tex } from "./ui";

export interface PsiConfig {
  rate: number;
  duration: number;
  life: [number, number];
  angle: number;
  spread: number;
  relative: boolean;
  speed: [number, number];
  gravity: [number, number];
  radial: [number, number];
  tangential: [number, number];
  scale: { start: number; end: number; var: number };
  spin: { start: number; end: number; var: number };
  color_start: number[];
  color_end: number[];
  color_var: [number, number];
}

/** Шаг симуляции списка эмиттеров (0x7e3340 — константа 0x8af1c0, тик эмиттера получает 0,01). */
const SIM_STEP = 0.01;
/** Максимум частиц на эмиттер (0x79ee07: 0x1f4) и эмиттеров на систему (0x7e3504: 0x64). */
const MAX_PARTICLES = 500;
const MAX_EMITTERS = 100;
/** Разброс точки спавна (0x8ac8ac / 0x8ac8b8: −2…+2 по обеим осям). */
const JITTER = 2;

const TEXTURE: Record<string, string> = {
  "level-available": "particle_sparkle",
  "level-available-quests": "particle_sparkle",
};

/** Параметры полёта из properties_ru.xml <effects> (time / interpolator_k). */
const FLIGHTS = {
  prizes: { k: 75, time: 0.6 },
  product: { k: 85, time: 0.6 },
  water: { k: 90, time: 0.6 },
} as const;

let configs: Record<string, PsiConfig> = {};

export async function loadParticles() {
  configs = (await (await fetch("data/particles.json")).json()) as Record<string, PsiConfig>;
}

const rand = (a: number, b: number) => a + (b - a) * Math.random();

/**
 * Быстрый обратный корень из exe (0x7e4150): трюк Quake с одной итерацией Ньютона,
 * множители 0,4999 (0x8af228) и 1,5 (0x894208). Нормализация направлений идёт через него.
 */
function invSqrt(x: number): number {
  const f = new Float32Array(1);
  const i = new Int32Array(f.buffer);
  f[0] = x;
  i[0] = 0x5f3759df - (i[0] >> 1);
  const y = f[0];
  return y * (1.5 - 0.4999 * x * y * y);
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  radial: number;
  tangential: number;
  spin: number;
  dSpin: number;
  scale: number;
  dScale: number;
  color: number[];
  dColor: number[];
  age: number;
  life: number;
}

/** Эмиттер (.psi): конфиг +0x00…+0x7c, состояние +0x84… (эмиттер game.exe). */
export class Emitter {
  /** −2 неактивен (0x8ac8ac), −1 бесконечный (0x89243c), ≥ 0 — прошедшее время излучения. */
  elapsed = -2;
  /** Накопитель эмиссии (+0x90): rate·dt, дробная часть переходит на следующий такт. */
  acc = 0;
  /** Тикер (+0x84 период = 1/частота, +0x88 накопитель): 0 — тикать каждым вызовом. */
  period = 0;
  tickAcc = 0;
  /** Отрезок эмиттера: +0x94/+0x98 — предыдущая точка, +0x9c/+0xa0 — текущая. */
  segFrom: [number, number] = [0, 0];
  segTo: [number, number] = [0, 0];
  particles: Particle[] = [];
  /** Своя картинка частицы (приз, плод) вместо звёздочки по умолчанию. */
  texture?: string;

  constructor(readonly name: string, readonly cfg: PsiConfig) {}

  /** 0x79ea40: период 0 — тик каждым вызовом, иначе накопитель и догоняющие такты. */
  ticker(dt: number) {
    if (this.period === 0) {
      this.tick(dt);
      return;
    }
    this.tickAcc += dt;
    while (this.period > 0 && this.period <= this.tickAcc) {
      this.tick(this.period);
      this.tickAcc -= this.period;
    }
  }

  /** Такт эмиттера (0x79eb00): время, физика частиц, эмиссия, в конце segFrom = segTo. */
  tick(dt: number) {
    if (this.elapsed >= 0) {
      this.elapsed += dt;
      if (this.cfg.duration <= this.elapsed) this.elapsed = -2;
    }
    for (let i = 0; i < this.particles.length; ) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        // удаление — перестановкой с последней (0x80dab0), порядок отрисовки меняется
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }
      // радиальное ускорение — от эмиттера (нормаль от segTo к частице, 0x79fa20 + 0x79fb40),
      // тангенциальное — перпендикуляр (−y, x); скорость += ускорение·dt, затем гравитация
      const dx = p.x - this.segTo[0];
      const dy = p.y - this.segTo[1];
      const k = invSqrt(dx * dx + dy * dy);
      const ux = dx * k;
      const uy = dy * k;
      p.vx += (ux * p.radial - uy * p.tangential) * dt;
      p.vy += (uy * p.radial + ux * p.tangential) * dt;
      p.vy += p.gravity * dt;
      p.x += p.vx;
      p.y += p.vy;
      p.spin += p.dSpin * dt;
      p.scale += p.dScale * dt;
      for (let c = 0; c < 4; c++) p.color[c] += p.dColor[c] * dt;
      i++;
    }
    if (this.elapsed > -2 && this.particles.length < MAX_PARTICLES) {
      const total = this.cfg.rate * dt + this.acc;
      const n = Math.trunc(total); // управляющее слово 0xc00 — округление к нулю
      this.acc = total - n;
      for (let j = 0; j < n; j++) {
        if (this.particles.length >= MAX_PARTICLES) break;
        this.spawn();
      }
    }
    this.segFrom = [this.segTo[0], this.segTo[1]];
  }

  /** Спавн частицы (0x79ed88…0x79f282). */
  private spawn() {
    const c = this.cfg;
    const life = rand(c.life[0], c.life[1]);
    // позиция — на отрезке предыдущая→текущая точка эмиттера + разброс ±2 (0x79ee5d…0x79eeeb)
    const r = Math.random();
    const x = this.segFrom[0] + (this.segTo[0] - this.segFrom[0]) * r + rand(-JITTER, JITTER);
    const y = this.segFrom[1] + (this.segTo[1] - this.segFrom[1]) * r + rand(-JITTER, JITTER);
    // направление: angle − π/2 + rand(0, spread) − spread/2 (0x79eef1…0x79ef2c);
    // с флагом relative — ещё угол отрезка эмиттера, направленный назад (0x79ef3a, 0x7e4190)
    let angle = c.angle - Math.PI / 2 + rand(0, c.spread) - c.spread / 2;
    if (c.relative) {
      const dx = this.segFrom[0] - this.segTo[0];
      const dy = this.segFrom[1] - this.segTo[1];
      angle += Math.atan2(dy, dx) + Math.PI / 2;
    }
    const speed = rand(c.speed[0], c.speed[1]);
    const scaleHi = c.scale.start + (c.scale.end - c.scale.start) * c.scale.var;
    const scale = rand(c.scale.start, scaleHi);
    const spinHi = c.spin.start + (c.spin.end - c.spin.start) * c.spin.var;
    const spin = rand(c.spin.start, spinHi);
    const color = [0, 1, 2].map((ch) => {
      const hi = c.color_start[ch] + (c.color_end[ch] - c.color_start[ch]) * c.color_var[0];
      return rand(c.color_start[ch], hi);
    });
    const aHi = c.color_start[3] + (c.color_end[3] - c.color_start[3]) * c.color_var[1];
    color.push(rand(c.color_start[3], aHi));
    this.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: rand(c.gravity[0], c.gravity[1]),
      radial: rand(c.radial[0], c.radial[1]),
      tangential: rand(c.tangential[0], c.tangential[1]),
      spin,
      dSpin: (c.spin.end - spin) / life,
      scale,
      dScale: (c.scale.end - scale) / life,
      color,
      dColor: color.map((v, ch) => (c.color_end[ch] - v) / life),
      age: 0,
      life,
    });
  }

  /** 0x79f2b0: с флагом — сдвинуть частицы и отрезок на разницу, иначе продлить отрезок. */
  setPos(x: number, y: number, relative = false) {
    if (relative) {
      const dx = x - this.segTo[0];
      const dy = y - this.segTo[1];
      for (const p of this.particles) {
        p.x += dx;
        p.y += dy;
      }
      this.segFrom[0] += dx;
      this.segFrom[1] += dy;
    } else if (this.elapsed === -2) {
      this.segFrom = [x, y];
    } else {
      this.segFrom = [this.segTo[0], this.segTo[1]];
    }
    this.segTo = [x, y];
  }

  /** 0x79f3f0: перезапуск в точке — стоп без очистки, setPos, старт. */
  restart(x: number, y: number) {
    this.stop();
    this.setPos(x, y);
    this.start();
  }

  /** 0x79f430: duration −1 — elapsed −1 (бесконечный), иначе 0; накопитель тикера в 0. */
  start() {
    this.elapsed = this.cfg.duration === -1 ? -1 : 0;
    this.tickAcc = 0;
  }

  /** 0x79f480: elapsed −2; с флагом — частицы сбрасываются. */
  stop(clear = false) {
    this.elapsed = -2;
    if (clear) this.particles = [];
  }

  /** Готов к удалению из списка: не излучает и частиц нет (0x7e3830 + 0x7e3810). */
  get spent() {
    return this.elapsed === -2 && this.particles.length === 0;
  }
}

/** Список эмиттеров particle system (0x7e32a0 + 0x7e3340): фиксированный шаг 0,01 с. */
export class EmitterList {
  private t = 0;
  private emitters: Emitter[] = [];

  add(e: Emitter) {
    if (this.emitters.length >= MAX_EMITTERS) return false;
    this.emitters.push(e);
    return true;
  }

  update(dt: number) {
    this.t = Math.min(this.t + dt, 1); // догонять не больше секунды (0x880178)
    while (this.t >= SIM_STEP) {
      this.t -= SIM_STEP;
      for (let i = 0; i < this.emitters.length; i++) {
        const e = this.emitters[i];
        e.ticker(SIM_STEP);
        if (e.spent) {
          this.emitters.splice(i, 1);
          i--;
        }
      }
    }
  }

  get all() {
    return this.emitters;
  }
}

/**
 * Путь полёта к панели: прямая от точки сбора до счётчика за time секунд с плавным разгоном и торможением (3u²−2u³).
 * В exe (0x46a790 + 0x46aff0) путь шёл через промежуточную точку «середина + (−k, +k)» с нулевыми касательными: предмет
 * уходил вбок и вниз, на мгновение замирал в изломе и только потом летел к панели — на экране это выглядело кривой
 * ломаной, поэтому в порте полёт прямой (interpolator_k не используется).
 */
class FlightPath {
  private keys: { x: number; y: number; t: number }[] = [];

  build(from: [number, number], to: [number, number], time: number, _k: number) {
    this.keys = [
      { x: from[0], y: from[1], t: 0 },
      { x: to[0], y: to[1], t: time },
    ];
  }

  eval(t: number): [number, number] {
    const [a, b] = this.keys;
    if (!a || !b) return [0, 0];
    if (t <= a.t) return [a.x, a.y];
    if (t >= b.t) return [b.x, b.y];
    const u = (t - a.t) / (b.t - a.t);
    const s = u * u * (3 - 2 * u);
    return [a.x + (b.x - a.x) * s, a.y + (b.y - a.y) * s];
  }
}

/** Летящий предмет (0x426e90 + 0x427930): невидим, ведёт эмиттер по пути 0,6 с. */
class FlyItem {
  private path = new FlightPath();
  private elapsed = 0;
  private savedScale: [number, number];

  constructor(
    readonly emitter: Emitter,
    from: [number, number],
    to: [number, number],
    private kind: keyof typeof FLIGHTS,
  ) {
    const f = FLIGHTS[kind];
    this.path.build(from, to, f.time, f.k);
    this.savedScale = [emitter.cfg.scale.start, emitter.cfg.scale.end];
    emitter.restart(from[0], from[1]); // 0x427780: стоп, setPos(from), старт
  }

  /** Кадр полёта (0x427930). false — предмет закончился (elapsed > time). */
  update(dt: number): boolean {
    this.emitter.ticker(dt);
    const time = FLIGHTS[this.kind].time;
    if (this.elapsed > time) return false;
    this.elapsed += dt;
    const [x, y] = this.path.eval(this.elapsed);
    const rest = time - this.elapsed; // +0x84
    if (this.kind === "water") {
      this.emitter.cfg.gravity[1] = rest; // 0x427a3d: гравитация (макс) = остаток
    } else {
      const add = this.kind === "prizes" ? 0.4 : 0; // 0x880b40
      this.emitter.cfg.scale.start = this.savedScale[0] * rest + add; // 0x427a01
      this.emitter.cfg.scale.end = this.savedScale[1] * rest + add; // 0x427a1c
    }
    this.emitter.setPos(x, y);
    return true;
  }
}

export class ParticleLayer extends Container {
  private readonly list = new EmitterList();
  private readonly flies: FlyItem[] = [];
  private readonly sprites = new Map<Particle, Sprite>();

  constructor() {
    super();
    this.eventMode = "none";
  }

  /** Запускает эмиттер name (money-changes, water-changes, level-available…) в точке (x, y). */
  start(name: string, x: number, y: number) {
    const cfg = configs[name];
    if (!cfg) return null;
    const e = new Emitter(name, structuredClone(cfg));
    e.setPos(x, y);
    e.start();
    if (!this.list.add(e)) return null;
    return e;
  }

  /**
   * Полёт приза/плода/воды к панели: предмет летит по пути (effects time, интерполятор k)
   * частицами name с картинкой texture; эмиттер следует за предметом (0x427930).
   * Эмиттер тикается только предметом (каждый кадр), как в exe — список подключается после.
   */
  fly(
    name: string,
    texture: string,
    from: [number, number],
    to: [number, number],
    kind: keyof typeof FLIGHTS = "prizes",
  ) {
    const cfg = configs[name];
    if (!cfg) return null;
    const e = new Emitter(name, structuredClone(cfg));
    e.texture = texture;
    const fly = new FlyItem(e, from, to, kind);
    this.flies.push(fly);
    return e;
  }

  update(dt: number) {
    for (let i = this.flies.length - 1; i >= 0; i--) {
      if (!this.flies[i].update(dt)) {
        // полёт закончился (0x427d10 отделяет систему) — эмиттер доживает в списке (100 Гц)
        this.list.add(this.flies[i].emitter);
        this.flies.splice(i, 1);
      }
    }
    this.list.update(dt);
    this.draw();
  }

  /** Отрисовка (0x79f4c0): позиция, поворот spin·возраст, масштаб, цвет trunc(канал·255). */
  private draw() {
    const emitters = [...this.list.all];
    for (const f of this.flies) emitters.push(f.emitter);
    const live = new Set<Particle>();
    for (const e of emitters) {
      for (const p of e.particles) {
        live.add(p);
        let s = this.sprites.get(p);
        if (!s) {
          s = new Sprite(tex(e.texture ?? TEXTURE[e.name] ?? "particle_star"));
          s.anchor.set(0.5);
          this.addChild(s);
          this.sprites.set(p, s);
        }
        const [r, g, b, a] = p.color;
        s.position.set(p.x, p.y);
        s.rotation = p.spin * p.age;
        s.scale.set(Math.max(0, p.scale));
        s.tint = (trunc255(r) << 16) | (trunc255(g) << 8) | trunc255(b);
        s.alpha = Math.max(0, Math.min(1, a));
      }
    }
    for (const [p, s] of this.sprites) {
      if (!live.has(p)) {
        s.destroy();
        this.sprites.delete(p);
      }
    }
  }
}

/** 0x79fcd0: канал цвета → trunc(канал·255). */
function trunc255(v: number) {
  return Math.max(0, Math.min(255, Math.trunc(v * 255)));
}
