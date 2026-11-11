// Вредители на ферме и помощник Робин. Параметры — из properties_ru.xml (bugs, bug_arriver, common/helper).
import { AnimatedSprite, Circle, Container, Rectangle, Sprite, Texture, type Ticker } from "pixi.js";
import { audio } from "./audio";
import { IconRow } from "./effects";
import { CELL_H, CELL_W, type Cell, cellNear, type PathGrid, pathToPlant, startCellOf, wanderPath } from "./pathgrid";
import type { RidgeView } from "./ridge";
import type { BugDef, Rules } from "./rules";
import type { Game } from "./state";
import { hasImage, image, pop, tex } from "./ui";

const DIRS = ["right", "right_down", "down", "right_up", "up"] as const;
const framesCache = new Map<string, Texture[]>();

/** Кадры из вертикальной полосы оригинала: anim_rows кадров друг под другом. */
function frames(folder: string, anim: string, dir: string, rows: number): Texture[] {
  const key = `bug_${folder}_${anim}_${dir}`;
  let list = framesCache.get(key);
  if (!list) {
    const t = tex(key);
    const h = Math.floor(t.height / rows);
    list = Array.from({ length: rows }, (_, i) => new Texture({ source: t.source, frame: new Rectangle(0, i * h, t.width, h) }));
    framesCache.set(key, list);
  }
  return list;
}

/** Кадры ауры уровня (@, exe 0x402040 → properties.xml root/aura/aura_N): полоса rows=12 кадров, play_time 1 с. */
function auraFrames(level: number): Texture[] {
  const key = `aura_${level}`;
  let list = framesCache.get(key);
  if (!list) {
    const t = tex(key);
    const rows = 12;
    const h = Math.floor(t.height / rows);
    list = Array.from({ length: rows }, (_, i) => new Texture({ source: t.source, frame: new Rectangle(0, i * h, t.width, h) }));
    framesCache.set(key, list);
  }
  return list;
}

/** Направление полосы по вектору движения; левые — зеркальные правым. */
function direction(dx: number, dy: number): { dir: (typeof DIRS)[number]; flip: boolean } {
  const flip = dx < 0;
  const a = Math.atan2(dy, Math.abs(dx)); // от -π/2 (вверх) до π/2 (вниз)
  const deg = (a * 180) / Math.PI;
  const dir = deg < -67.5 ? "up" : deg < -22.5 ? "right_up" : deg < 22.5 ? "right" : deg < 67.5 ? "right_down" : "down";
  return { dir, flip };
}

/** Анимированный персонаж с полосами кадров по направлениям. */
class Actor extends Container {
  protected readonly view: AnimatedSprite;
  protected anim = "";
  protected dir: string = "down";

  /** Глубина для сортировки на ферме — по ногам персонажа. */
  get depth() {
    return this.y;
  }

  constructor(protected def: BugDef) {
    super();
    this.view = new AnimatedSprite({ textures: [Texture.EMPTY], autoUpdate: false });
    this.view.anchor.set(0.5, 0.9);
    this.addChild(this.view);
  }

  /** Кадры идут по игровому времени, а не по таймеру Pixi: на паузе персонаж замирает. */
  protected advance(dt: number) {
    this.view.update({ deltaTime: dt * 60 } as unknown as Ticker);
  }

  protected play(anim: string, dx = 0, dy = 0, force = false) {
    const a = this.def.anims[anim] ?? this.def.anims.stand;
    if (dx || dy) {
      const d = direction(dx, dy);
      this.view.scale.x = d.flip ? -1 : 1;
      if (d.dir !== this.dir) force = true;
      this.dir = d.dir;
    }
    if (anim === this.anim && !force) return;
    this.anim = anim;
    this.view.textures = frames(this.def.folder, this.def.anims[anim] ? anim : "stand", this.dir, a.rows);
    // play_time — длительность всей полосы
    this.view.animationSpeed = a.rows / a.time / 60;
    this.view.loop = a.loop;
    this.view.gotoAndPlay(0);
  }
}

export interface BugEvents {
  ridges(): RidgeView[];
  /** Сетка проходимости фермы (стены, колодец, бочки, ящики, грядки). */
  grid(self?: Bug): PathGrid;
  say(text: string, x: number, y: number): void;
  /** Вредитель убит (byHelper — Робином): опыт, счётчики особых умений, звук. */
  killed(bug: Bug, byHelper: boolean): void;
  /** Вредитель получил удар. */
  hurt(bug: Bug): void;
  /** Вредитель укусил растение. */
  bit(bug: Bug): void;
  /** Множитель жизни вредителей сложности (bug_life, exe 0x40eb60: жизнь = жизнь из bugs × множитель). */
  lifeK?: number;
  /** Из вредителя может выпасть предмет (если квест включил enable_bug_item). */
  drop(item: string, x: number, y: number): void;
}

/** Модификаторы вредителя из строки волны или горна (exe 0x401fa0): @уровень, *жизнь, #скорость, $призы, +атака. */
export interface BugMods {
  level: number;
  life: number;
  speed: number;
  prizes: number;
  attack: number;
}

/**
 * Годна ли строка волны/горна для сложности (exe 0x419650, точное правило): на сложном подходят все строки;
 * на лёгком — все, кроме начинающихся с точного «hardcore-» (приставки без «-» годны для любой сложности;
 * опечатка данных «hardocre-» под это правило не подпадает). Для волн правила применяет экспортёр:
 * bugs — набор лёгкого (без hardcore), specs — все записи с mode.
 */
export function bugForDifficulty(spec: string, difficulty: string) {
  if (difficulty === "hardcore") return true;
  return !spec.trim().startsWith("hardcore-");
}

/**
 * Строка вредителя «casual-snail!@1*2$3»: приставка сложности, имя и модификаторы после «!» (exe 0x41bad0, 0x4197a0).
 * Числа — после своего символа: @ и $ целые, * # + дробные (по умолчанию 1). Модификаторы действуют, только если @ > 0.
 * bang — была ли в строке «!» (exe 0x4197a0 ищет символ в строке): такой вредитель не замирает на время анимации удара.
 */
export function parseBugSpec(spec: string): { name: string; mods: BugMods | null; bang: boolean } {
  // приставка срезается в exe до первого '-' (0x40e2a0: find('-') → erase(0, idx+1) перед поиском определения root/bugs/<имя>),
  // а не по списку известных приставок — «hardocre-» срезается так же
  const whole = spec.trim();
  const dash = whole.indexOf("-");
  const raw = dash >= 0 ? whole.slice(dash + 1) : whole;
  const bang = raw.includes("!");
  const bangAt = raw.indexOf("!");
  const name = (bangAt >= 0 ? raw.slice(0, bangAt) : raw).replace(/[^a-z_0-9].*$/, "");
  const num = (ch: string, def: number) => {
    const m = raw.match(new RegExp(`\\${ch}(-?[0-9]*\\.?[0-9]+)`));
    return m ? Number(m[1]) : def;
  };
  const level = Math.trunc(num("@", 0));
  if (level <= 0) return { name, mods: null, bang };
  return { name, mods: { level, life: num("*", 1), speed: num("#", 1), prizes: Math.trunc(num("$", 0)), attack: num("+", 1) }, bang };
}

export class Bug extends Actor {
  /** Через сколько секунд после появления показать подсказку «bug» (exe: поле +0x3c = 3,0). */
  hintIn = 3;
  life: number;
  maxLife: number;
  dead = false;
  private readonly hearts: IconRow;
  private target: RidgeView | null = null;
  private eatTimer = 0;
  private busy = 0;
  /** Путь по клеткам сетки (exe: список путевых точек +0x14) и цель пути; атакует, когда путь пройден. */
  private path: Cell[] = [];
  private goal: [number, number] = [0, 0];
  private attacking = false;
  private retry = 0;
  /** Во что превратится после анимации reincorn (улитка без панциря). */
  private reincornTo = "";
  /** Свойства этого вредителя (из bugs + модификаторы): скорость, атака, опыт за убийство. */
  speed: number;
  attack: number;
  exp: number;
  /** Мишень серии ударов (exe: флаг +0x8a, точка +0x64): левый верх в своих координатах вредителя. */
  private comboMark: Sprite | null = null;
  /** Гарантированных призов при смерти ($, exe поле +0x6c+0xc) и множитель приза (prize_k, поле +0x100). */
  prizes = 0;
  prizeMul: number;
  /** Уровень модификатора (@). */
  bugLevel = 0;
  /**
   * Флаг «!» из строки волны (exe поле +0x8b, сеттер 0x410560): вредитель не замирает на время анимации удара —
   * в exe тик спрайта 0x58e8d0 (движение, укусы, звуки) пропускается, только пока играет анимация удара
   * (флаг +0x88, снимается по её концу 0x40fbde), а у «!»-вредителя он продолжается.
   */
  hasBang = false;
  /** Аура уровня (@, exe поле +0x1fc): играет, пока вредитель жив. */
  private aura: AnimatedSprite | null = null;
  /** Ролики-оверлеи (анимация удара «!»-вредителей): тикают по игровому времени, снимаются по концу. */
  private overlays: AnimatedSprite[] = [];

  /** Анимация удара отдельным роликом поверх основного спрайта (как список +0x174 в exe). */
  private playHitOverlay() {
    const a = this.def.anims.hit;
    if (!a) return;
    const ov = new AnimatedSprite({ textures: frames(this.def.folder, "hit", this.dir, a.rows), autoUpdate: false });
    ov.anchor.set(0.5, 0.9);
    ov.animationSpeed = a.rows / a.time / 60;
    ov.loop = false;
    ov.gotoAndPlay(0);
    this.addChild(ov);
    this.overlays.push(ov);
  }

  constructor(
    public kind: string,
    private readonly rules: Rules,
    private readonly events: BugEvents,
    x: number,
    y: number,
  ) {
    super(rules.bugs[kind]);
    this.life = (this.def.life ?? 1) * (events.lifeK ?? 1);
    this.maxLife = this.life;
    this.speed = this.def.speed ?? 40;
    this.attack = this.def.attack ?? 1;
    this.exp = this.def.exp ?? 0;
    this.prizeMul = this.def.prize_k ?? 1;
    // progresses: сердечки над вредителем (attack_bug, у сильных — attack_bug_strong), смещение (0; −50)
    const strong = this.maxLife >= rules.strong_heart;
    const pr = rules.progresses[strong ? "attack_bug_strong" : "attack_bug"];
    this.hearts = new IconRow(pr.image, pr.max, 0, 1);
    this.hearts.position.set(pr.offset[0], pr.offset[1]);
    this.addChild(this.hearts);
    this.position.set(x, y);
    this.eventMode = "static";
    this.cursor = "attack";
    const r = this.def.click_radius ?? 25;
    this.hitArea = { contains: (px: number, py: number) => px * px + (py + r) * (py + r) < r * r * 1.6 };
    this.play("move", x < 400 ? 1 : -1, 0, true);
  }

  /**
   * Модификаторы (exe 0x40e0a0): жизнь × *; опыт = ⌊опыт · (1 + * / 3 + # / 3)⌋; скорость = round(скорость · #);
   * атака = round(атака · +); $ — сколько гарантированных призов выпадет при смерти.
   */
  applyMods(m: BugMods) {
    this.bugLevel = m.level;
    if (m.level > 0) {
      // Аура уровня (exe 0x402040 → properties.xml root/aura/aura_N): полоса 12 кадров, play_time 1 с,
      // offset "-45;-20" — левый верхний угол кадра относительно точки вредителя (exe поле +0x80/+0x84).
      if (hasImage(`aura_${m.level}`)) {
        const aura = new AnimatedSprite({ textures: auraFrames(m.level), autoUpdate: false });
        aura.animationSpeed = aura.textures.length / 60; // 12 кадров за play_time 1 с
        aura.loop = true;
        aura.gotoAndPlay(0);
        aura.position.set(-45, -20);
        this.addChildAt(aura, 0);
        this.aura = aura;
      } else {
        const lbl = pop(`@${m.level}`, "bonus_events_white", 0xffd700);
        lbl.position.set(0, -80);
        this.addChild(lbl);
      }
    }
    this.life *= m.life;
    this.maxLife = this.life;
    this.exp = Math.trunc(this.exp * (1 + m.life / 3 + m.speed / 3));
    this.speed = Math.trunc(this.speed * m.speed + 0.5);
    this.attack = Math.trunc(this.attack * m.attack + 0.5);
    this.prizes = m.prizes;
  }

  /**
   * Новая мишень серии (exe 0x410070): случайная точка (rand % (2r − 25)) по обеим осям в квадрате радиуса нажатия
   * (центр — середина зоны нажатия). Картинка root/bug/target.
   */
  setComboTarget() {
    const r = this.def.click_radius ?? 25;
    const span = Math.max(1, 2 * r - 25);
    this.comboMark ??= this.addChild(new Sprite(tex("bug_target")));
    this.comboMark.position.set(-r + Math.floor(Math.random() * span), -2 * r + Math.floor(Math.random() * span));
  }

  clearComboTarget() {
    this.comboMark?.destroy();
    this.comboMark = null;
  }

  /** Попадание по мишени: квадрат 25 × 25 от её левого верхнего угла (exe 0x430d19). Мишени нет — любое попадание. */
  hitsComboTarget(lx: number, ly: number) {
    const t = this.comboMark;
    return !t || (lx >= t.x && lx < t.x + 25 && ly >= t.y && ly < t.y + 25);
  }

  /** Удар: игрок (оружие simple_sword и умения) или Робин. */
  hit(n: number, byHelper = false) {
    if (this.dead || this.reincornTo) return;
    this.life -= n;
    this.hearts.set(this.life > 0 ? (this.life / this.maxLife) * this.hearts.max : 0);
    this.events.hurt(this);
    if (this.life > 0) {
      if (this.hasBang) {
        // «!»-вредитель (exe +0x8b) не замирает: анимация удара играется отдельным роликом (+0x174), поведение продолжается
        this.playHitOverlay();
      } else {
        this.play("hit", 0, 0, true);
        this.busy = this.def.anims.hit?.time ?? 0.3;
      }
      return;
    }
    if (this.def.reincorn) {
      // хитрая улитка теряет панцирь и бежит дальше уже без него
      this.reincornTo = this.def.reincorn;
      this.play("reincorn", 0, 0, true);
      this.busy = this.def.anims.reincorn?.time ?? 1;
      this.dropItem();
      this.hearts.set(0);
      audio.play("bug_changing");
      return;
    }
    this.dropItem();
    this.dead = true;
    this.hearts.set(0);
    this.events.killed(this, byHelper);
  }

  private dropItem() {
    if (this.def.items) this.events.drop(this.def.items, this.x, this.y);
  }

  update(dt: number) {
    this.advance(dt);
    this.aura?.update({ deltaTime: dt * 60 } as unknown as Ticker);
    for (let i = this.overlays.length - 1; i >= 0; i--) {
      const ov = this.overlays[i];
      ov.update({ deltaTime: dt * 60 } as unknown as Ticker);
      if (!ov.playing) {
        ov.destroy();
        this.overlays.splice(i, 1);
      }
    }
    if (this.dead) {
      this.alpha -= dt * 2;
      if (this.alpha <= 0) this.destroy({ children: true });
      return;
    }
    if (this.busy > 0) {
      this.busy -= dt;
      if (this.busy > 0) return;
      if (this.reincornTo) {
        this.kind = this.reincornTo;
        this.def = this.rules.bugs[this.reincornTo];
        this.life = (this.def.life ?? 1) * (this.events.lifeK ?? 1);
        this.maxLife = this.life;
        this.speed = this.def.speed ?? 40;
        this.attack = this.def.attack ?? 1;
        this.exp = this.def.exp ?? 0;
        this.reincornTo = "";
      }
      this.anim = "";
      return;
    }
    if (this.target && !this.target.plant) {
      this.target = null;
      this.attacking = false;
    }
    if (this.attacking && this.target) {
      // ест: в exe (0x4b2a16) каждый кадр растение теряет attack·dt жизни — урон идёт непрерывно, без заживления
      const [tx] = this.target.base();
      this.play("eat", tx - this.x || 1, 0);
      this.eatTimer += dt;
      const period = this.def.anims.eat?.time ?? 1;
      if (this.eatTimer >= period) {
        this.eatTimer -= period;
        this.events.bit(this); // звук bug_attack раз в проход анимации
      }
      if (this.target.bite(this.attack * dt)) {
        this.target = null;
        this.attacking = false;
      }
      return;
    }
    // выбор цели (0x4b2620): случайное растение, путь до клетки рядом с ним; без цели — блуждание (0x4b23d0)
    if (!this.target && this.retry <= 0) this.chooseTarget();
    this.retry -= dt;
    this.follow(this.speed, dt);
  }

  /** Занятые вредителем клетки: вокруг следующей путевой точки, а без пути — вокруг текущей клетки (0x4b2290). */
  footprint(): [number, number, number] {
    const cell: Cell = this.path.length ? this.path[0] : [Math.floor(this.x / CELL_W), Math.floor(this.y / CELL_H)];
    return [cell[0], cell[1], this.def.obst_radius ?? 25];
  }

  private startCell(grid: PathGrid): Cell {
    return startCellOf(grid, this.x, this.y);
  }

  private chooseTarget() {
    const grid = this.events.grid(this);
    const from = this.startCell(grid);
    const all = this.events.ridges().filter((r) => r.plant);
    if (all.length) {
      const target = all[Math.floor(Math.random() * all.length)];
      const [w, h] = target.place.dimensions;
      const found = pathToPlant(grid, from, [target.place.position[0] + w / 2, target.place.position[1] + h / 2], [w, h]);
      if (found) {
        this.target = target;
        this.path = found.path;
        this.goal = [found.goal[0] * CELL_W, found.goal[1] * CELL_H];
        return;
      }
      this.retry = 0.5;
    } else if (!this.path.length) {
      const wandering = wanderPath(grid, from);
      if (wandering) this.path = wandering;
      else this.retry = 0.5;
    }
  }

  /** Движение по путевым точкам (0x4b2a10): точка засчитывается, когда до неё остаётся меньше шага. */
  private follow(speed: number, dt: number) {
    if (!this.path.length) return;
    const step = speed * dt;
    const grid = this.events.grid(this);
    const wp = () => [this.path[0][0] * CELL_W, this.path[0][1] * CELL_H] as const;
    if (!grid.walkable(this.path[0][0], this.path[0][1])) {
      // путь перекрыт (купили грядку, встал объект) — цель сбрасывается, путь строится заново
      this.path = [];
      this.target = null;
      return;
    }
    let [wx, wy] = wp();
    let d = Math.hypot(wx - this.x, wy - this.y);
    while (d < step) {
      this.x = wx;
      this.y = wy;
      this.path.shift();
      if (!this.path.length) {
        if (this.target) {
          [this.x, this.y] = this.goal;
          this.attacking = true;
        }
        return;
      }
      [wx, wy] = wp();
      d = Math.hypot(wx - this.x, wy - this.y);
    }
    this.x += ((wx - this.x) / d) * step;
    this.y += ((wy - this.y) / d) * step;
    this.play("move", wx - this.x, wy - this.y);
  }
}

/**
 * Помощник Робин (common/helper). Выбор цели — по exe (HelperTarget*): вероятность каждого дела (полив, сбор, атака) =
 * start_skill_prob + per_level_skill_prob × уровень соответствующего умения; из разрешённых целей берётся ближайшая.
 * Бьёт вредителя на attack_range раз в attack_period; на цель летит со скоростью speed.
 */
export class Helper extends Actor {
  private cooldown = 0;
  private task: { kind: "pour" | "product"; ridge: RidgeView } | { kind: "attack"; bug: Bug } | { kind: "walk"; left: number } | null = null;
  /** Путь по сетке к цели текущей задачи; клетка цели при построении (для атаки — чтобы перестроить, когда вредитель сдвинулся); паузы. */
  private path: Cell[] = [];
  private planned: Cell = [0, 0];
  private retry = 0;
  private replan = 0;
  private readonly icon: Sprite;
  /**
   * Жажда Робина (exe: Helper 0x4c7670 обновление, 0x4c87b0 новый срок, 0x4c80b0 «напоить»). Срок — случайное целое
   * round(hunger_min) … round(hunger_max) секунд, на лёгком уровне ×10 (дольше дня, поэтому на лёгком Робин жаждет редко);
   * хочет пить, когда осталось меньше половины срока (поле +0xe1), на нуле улетает до конца дня (+0xe2); срок заводится заново
   * каждый день (0x4c75a0) и когда его напоили.
   */
  private hungerIn = Infinity;
  private hungerTotal = Infinity;
  private away = false;
  private readonly drops: IconRow;
  /**
   * Ускорение по нажатию (exe 0x4c8020): 5 секунд после нажатия (0x4c8130) скорость полёта растёт на 0,5 к множителю задачи
   * (0x4c7870) и удар вдвое сильнее (0x4c7d10); снова нажать можно, когда с прошлого нажатия прошло больше 15 с (0x4c7fa0)
   * и Робин не хочет пить. **Допущение**: в начале дня счётчик на нуле — первые 5 с Робин ускорен, нажимать можно с 15-й секунды.
   */
  private sinceBoost = 0;

  get boosted() {
    return this.sinceBoost < 5;
  }

  get canBoost() {
    return !this.thirsty && !this.away && this.sinceBoost > 15;
  }

  boost() {
    this.sinceBoost = 0;
    audio.play("helper_click");
  }

  /** Нажали на Робина — Farm решает, можно ли напоить (нужна вода). */
  onClick: () => void = () => undefined;

  /** Робин улетел до конца дня. */
  get gone() {
    return this.away;
  }

  /** Хочет пить (только на сложном). */
  get thirsty() {
    return !this.away && this.hungerIn < this.hungerTotal / 2;
  }

  /** Робин летает над растениями и вредителями — рисуется поверх всего на ферме. */
  get depth() {
    return 1e6;
  }

  constructor(private readonly rules: Rules, private readonly game: Game, private readonly home: [number, number]) {
    super(rules.bugs.helper);
    this.position.set(...home);
    this.icon = image("helper_attack_icon");
    // мысль рисуется в натуральную величину (62 × 78) в точке icon_offset от Робина
    this.icon.position.set(...this.rules.helper.icon_offset);
    this.icon.visible = false;
    this.addChild(this.icon);
    const hunger = rules.progresses.helper_hunger;
    this.drops = new IconRow(hunger.image, hunger.max);
    this.drops.position.set(...hunger.offset);
    this.addChild(this.drops);
    // нажатие по Робину (click_radius): напоить, если хочет пить
    this.eventMode = "static";
    this.hitArea = new Circle(0, -30, rules.helper.click_radius);
    this.on("pointertap", (e) => {
      e.stopPropagation();
      this.onClick();
    });
    this.play("stand", 0, 1, true);
  }

  private rollHunger() {
    const h = this.rules.helper;
    const lo = Math.round(h.hunger_min);
    const hi = Math.round(h.hunger_max);
    this.hungerTotal = (lo + Math.floor(Math.random() * (hi - lo + 1))) * (this.game.difficulty === "casual" ? 10 : 1);
    this.hungerIn = this.hungerTotal;
    this.drops.set(0);
  }

  /** Напоить Робина: жажда начинается заново. */
  drink() {
    if (this.thirsty) this.rollHunger();
  }

  update(dt: number, bugs: Bug[], ridges: RidgeView[], onWater: (r: RidgeView) => void, grid: () => PathGrid) {
    const h = this.rules.helper;
    if (this.away) return;
    this.sinceBoost += dt;
    this.advance(dt);
    this.hungerIn -= dt;
    if (this.hungerIn <= 0) {
      // не напоили — улетает до конца дня
      this.away = true;
      this.task = null;
      this.path = [];
      this.drops.set(0);
      this.showIcon(null);
      return;
    }
    if (this.thirsty) this.drops.setValue(this.hungerIn, this.hungerTotal / 10);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.retry -= dt;
    this.replan -= dt;
    // exe (0x45a260): задача идёт, пока не «закончена»; когда её нет или она закончилась — выбор цели заново (0x459420)
    const task = this.task;
    if (!task) {
      this.showIcon(null);
      if (this.retry > 0) return this.play("stand", 0, 1);
      return this.begin(this.pickTask(bugs, ridges) ?? this.newWalk(grid()), grid);
    }
    if (task.kind === "walk") {
      // прогулка (0x45a5d0 / 0x45a5e0): таймер 1 с, закончена по таймеру или когда путь пройден
      task.left -= dt;
      this.showIcon(null);
      this.follow(dt, grid);
      const arrived = !this.path.length;
      if (task.left > 0 && !arrived) return;
      // нашлось дело — берём; нет — идём к той же точке ещё секунду (таймер снова 1,0) или выбираем новую
      const next = this.pickTask(bugs, ridges);
      if (next) return this.begin(next, grid);
      if (arrived) return this.begin(this.newWalk(grid()), grid);
      task.left = 1;
      return;
    }
    if (task.kind === "attack") {
      const bug = task.bug;
      if (bug.dead || bug.destroyed) {
        this.task = null;
        return;
      }
      this.showIcon("attack");
      const d = Math.hypot(bug.x - this.x, bug.y - 30 - this.y);
      if (d <= h.attack_range * 0.8) {
        // цель в пределах attack_range — стоит и бьёт
        this.path = [];
        this.play("stand", bug.x - this.x, 0);
        if (this.cooldown <= 0) {
          // exe 0x456820: урон = attack · значение(helper_attack), таймер удара каждый раз заново = attack_period (умение его не ускоряет)
          bug.hit(h.attack * (this.boosted ? 2 : 1) * (1 + this.game.bonus("helper_attack", "helper_attack")), true);
          this.cooldown = h.attack_period;
        }
        return;
      }
      // вредитель ушёл в другую клетку (или путь кончился) — путь строится заново
      const cell = grid().cellOf(bug.x, bug.y);
      if (this.replan <= 0 && (!this.path.length || this.planned[0] !== cell[0] || this.planned[1] !== cell[1])) {
        this.replan = 0.3;
        if (!this.plan(grid(), [bug.x, bug.y])) {
          this.task = null;
          this.retry = 0.5;
          return;
        }
      }
      this.follow(dt, grid);
      return;
    }
    const r = task.ridge;
    const valid = task.kind === "pour" ? r.thirsty : r.readyProduct() >= 0;
    if (!valid) {
      this.task = null;
      return;
    }
    this.showIcon(task.kind);
    this.follow(dt, grid);
    if (this.path.length) return;
    // пришёл (путь пройден) — действие при пустом списке путевых точек (0x45a2d0, 0x4570a0): полив только этого растения;
    // сбор — всех спелых плодов на этом растении, пока в ящиках есть место (шанса «полить / собрать всё» в exe нет)
    if (task.kind === "pour") onWater(r);
    else while (r.readyProduct() >= 0 && this.game.storageCount() < this.game.storageMax) r.collect(r.readyProduct(), false);
    this.task = null;
  }

  /** Каждый день Робин начинает с одного и того же места — у дома — и сразу летит по делам или гулять. */
  startDay() {
    this.rest();
    this.cooldown = 0;
    this.away = false;
    this.sinceBoost = 0;
    this.rollHunger();
  }

  /** Начинает задачу: строит путь по сетке (как у вредителей); если пути нет, задача отбрасывается и выбор повторится через полсекунды. */
  private begin(task: Helper["task"], grid: () => PathGrid) {
    this.task = task;
    if (!task) {
      this.path = [];
      this.retry = 0.5;
      return;
    }
    if (task.kind === "walk") return; // путь уже построен в newWalk
    this.path = [];
    const target: [number, number] = task.kind === "attack" ? [task.bug.x, task.bug.y] : task.ridge.base();
    if (!this.plan(grid(), target)) {
      this.task = null;
      this.retry = 0.5;
    }
  }

  /** Путь к клетке рядом с целью (0x41a350 ищет свободную клетку в радиусе 3, 0x43b000 строит путь волной). */
  private plan(grid: PathGrid, target: [number, number]) {
    const goal = cellNear(grid, grid.cellOf(target[0], target[1]), 3);
    if (!goal) return false;
    const path = grid.path(startCellOf(grid, this.x, this.y), goal);
    if (!path) return false;
    this.path = path;
    this.planned = grid.cellOf(target[0], target[1]);
    return true;
  }

  /** Скорость полёта: speed из XML × значение умения «скорость» задачи (слот скорости в vtable задач: 0x45a4f0 полив,
   *  0x4574a0 / 0x456fd0 сбор, 0x456ae0 атака — helper_attack_speed ускоряет полёт к вредителю, а не удары). */
  private speed() {
    const t = this.task;
    const skill = t?.kind === "pour" ? this.game.bonus("helper_pour", "helper_pour_speed")
      : t?.kind === "product" ? this.game.bonus("helper_product", "helper_product_speed")
      : t?.kind === "attack" ? this.game.bonus("helper_attack", "helper_attack_speed") : 0;
    return this.rules.helper.speed * (1 + skill + (this.boosted ? 0.5 : 0));
  }

  /**
   * Движение по путевым точкам (Helper, 0x4547e0; вызывается из 0x454a20, пока путь не пуст): шаг = speed · скорость задачи · dt.
   * В отличие от вредителей, остаток шага переносится: пройдя точку, Робин идёт дальше к следующей. Следующая точка
   * проверяется на проходимость, когда до неё дошла очередь; занята — путь просто сбрасывается (0x43aaf0), без перестройки.
   */
  private follow(dt: number, grid: () => PathGrid) {
    if (!this.path.length) return;
    let step = this.speed() * dt;
    const wp = () => [this.path[0][0] * CELL_W, this.path[0][1] * CELL_H] as const;
    let [wx, wy] = wp();
    let d = Math.hypot(wx - this.x, wy - this.y);
    while (d < step) {
      step -= d;
      this.x = wx;
      this.y = wy;
      this.path.shift();
      if (!this.path.length) return;
      if (!grid().walkable(this.path[0][0], this.path[0][1])) {
        this.path = [];
        return;
      }
      [wx, wy] = wp();
      d = Math.hypot(wx - this.x, wy - this.y);
    }
    this.x += ((wx - this.x) / d) * step;
    this.y += ((wy - this.y) / d) * step;
    this.play("move", wx - this.x, wy - this.y);
  }

  /** HelperTargetWalk (0x45a600): случайная ячейка поля, до 20 попыток найти проходимую; путь к ней по сетке, идёт не дольше секунды за раз. */
  private newWalk(grid: PathGrid): { kind: "walk"; left: number } | null {
    for (let i = 0; i < 20; i++) {
      const cx = Math.floor(Math.random() * grid.cols);
      const cy = Math.floor(Math.random() * grid.rows);
      if (!grid.walkable(cx, cy)) continue;
      const path = grid.path(startCellOf(grid, this.x, this.y), [cx, cy]);
      if (path) {
        this.path = path;
        return { kind: "walk", left: 1 };
      }
    }
    return null;
  }

  /** Занятые Робином клетки (0x4545c0): как у вредителей — квадрат вокруг следующей путевой точки, без пути — вокруг своей клетки; радиус — helper/radius. */
  footprint(): [number, number, number] {
    const cell: Cell = this.path.length ? this.path[0] : [Math.floor(this.x / CELL_W), Math.floor(this.y / CELL_H)];
    return [cell[0], cell[1], this.rules.helper.radius];
  }

  /** Между днями Робин отдыхает у дома (на экране его нет). */
  rest() {
    this.task = null;
    this.path = [];
    this.retry = 0;
    this.position.set(...this.home);
    this.showIcon(null);
    this.play("stand", 0, 1, true);
  }

  /** Вероятность дела (exe, 0x459420): start_skill_prob + per_level_skill_prob × уровень умения Робина; не ограничивается единицей. */
  private chance(skill: "helper_pour" | "helper_product" | "helper_attack") {
    const h = this.rules.helper;
    return h.start_skill_prob + h.per_level_skill_prob * this.game.skills[skill];
  }

  /**
   * Выбор цели по exe (0x459420): для каждого вида дела собирается ближайший кандидат (ключи map: 0 — сбор, 1 — полив, 2 — атака);
   * затем виды с кандидатами идут в этом порядке, и первый, у кого `rand < вероятность`, побеждает — берётся его ближайшая цель.
   * Не сработал ни один — отдельной задачи ожидания нет: идущая прогулка продолжается с таймером 1,0 (0x45a5c0),
   * а если Робин не гулял или путь кончился — начинается новая прогулка (0x45a600).
   */
  private pickTask(bugs: Bug[], ridges: RidgeView[]): NonNullable<Helper["task"]> | null {
    type Task = NonNullable<Helper["task"]>;
    const dist = (x: number, y: number) => Math.hypot(x - this.x, y - this.y);
    const nearest = (list: { d: number; task: Task }[]) => list.reduce<{ d: number; task: Task } | null>((a, c) => (!a || c.d < a.d ? c : a), null);
    const product: { d: number; task: Task }[] = [];
    if (this.game.storageCount() < this.game.storageMax) {
      for (const r of ridges) if (r.readyProduct() >= 0) product.push({ d: dist(...r.base()), task: { kind: "product", ridge: r } });
    }
    const pour: { d: number; task: Task }[] = [];
    {
      for (const r of ridges) if (r.thirsty) pour.push({ d: dist(...r.base()), task: { kind: "pour", ridge: r } });
    }
    const attack = bugs.filter((b) => !b.dead && !b.destroyed).map((b) => ({ d: dist(b.x, b.y), task: { kind: "attack", bug: b } as Task }));
    const kinds: [{ d: number; task: Task } | null, number][] = [
      [nearest(product), this.chance("helper_product")],
      [nearest(pour), this.chance("helper_pour")],
      [nearest(attack), this.chance("helper_attack")],
    ];
    for (const [cand, p] of kinds) if (cand && Math.random() < p) return cand.task;
    return null;
  }

  private showIcon(kind: "attack" | "pour" | "product" | null) {
    this.icon.visible = !!kind;
    if (kind) this.icon.texture = tex(`helper_${kind}_icon`);
  }
}

/** Состояние BugArriver одной фермы: живёт, пока идёт игра (между днями не сбрасывается, при загрузке начинается заново). */
export interface ArriverState {
  /** Номер следующей волны. */
  next: number;
  /** До начала следующей волны, с. */
  wait: number;
  /** Группы текущей волны: ещё не вышедшие вредители и пауза после группы. */
  groups: { bugs: string[]; delay: number; wait: number }[];
}

export function newArriverState(): ArriverState {
  return { next: 0, wait: 0, groups: [] };
}

/**
 * Появление вредителей по волнам bug_arriver (exe: BugArriver, обновление 0x40ced0, запуск волны 0x40cda0).
 * Волны идут по кругу, а не по одной на день. У группы все вредители выходят сразу (по одному за кадр, в случайном
 * порядке), затем пауза delay группы. Когда группы кончились, ждём delay волны — но только пока на поле нет вредителей
 * (0x40f570) — и запускаем следующую. Паузы волны и группы умножаются на whether/bug_arrive (в дождь 0,8 — чаще).
 */
export class BugArriver {
  constructor(private readonly state: ArriverState) {}

  /**
   * Выбор следующей волны «Цветка Стихий» (exe 0x41c400): если номер вышел за последнюю волну — переход на wave_loop;
   * волны, чей ключ не равен ключу вредителей (set_pests_key), пропускаются; при выходе за конец во время пропуска —
   * на wave_loop − 1 при пустом ключе и на 0 при заданном (особые волны с ключом идут по кругу с начала). −1 — волны нет.
   */
  static pick(rules: Rules, s: ArriverState, key: string): number {
    const n = rules.waves.length;
    if (!n) return -1;
    const keys = rules.wave_keys ?? [];
    const loop = rules.wave_loop ?? 0;
    if (s.next > n - 1) s.next = loop;
    // в exe поиск без ограничения; здесь — не больше 2n шагов, чтобы ключ без своих волн не повесил игру
    for (let step = 0; (keys[s.next] ?? "") !== key; step++) {
      if (step > 2 * n) return -1;
      s.next += 1;
      if (s.next > n - 1) s.next = key === "" ? loop - 1 : 0;
    }
    const picked = s.next;
    s.next += 1;
    return picked;
  }

  /** Имя вредителя, которому пора появиться (не больше одного за кадр), или null. */
  tick(rules: Rules, dt: number, fieldEmpty: boolean, arrive: number, key = "", difficulty = "casual"): string | null {
    const s = this.state;
    const g = s.groups[0];
    if (!g) {
      if (!fieldEmpty) return null;
      s.wait -= dt;
      if (s.wait > 0) return null;
      const i = BugArriver.pick(rules, s, key);
      if (i < 0) return null;
      const wave = rules.waves[i] ?? [];
      s.wait = (rules.wave_delays?.[i] ?? 0) * arrive;
      // наборы по сложности (exe 0x419650): на сложном играются все записи волны (specs — включая casual-
      // и элитные «!@…»), на лёгком — готовый набор без hardcore-записей (bugs, его собирает экспортёр)
      s.groups = wave.map((x) => ({
        bugs: difficulty === "hardcore" ? x.specs.map((sp) => sp.name + sp.mods) : x.bugs.filter((sp) => bugForDifficulty(sp, difficulty)),
        delay: x.delay,
        wait: x.delay,
      }));
      return null;
    }
    if (!g.bugs.length) {
      g.wait -= dt;
      if (g.wait <= 0) s.groups.shift();
      return null;
    }
    const name = g.bugs.splice(Math.floor(Math.random() * g.bugs.length), 1)[0];
    if (!g.bugs.length) g.wait = g.delay * arrive;
    return name;
  }
}
