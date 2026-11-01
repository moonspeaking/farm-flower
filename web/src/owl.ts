// Мудрая сова на ферме (root/shop/location_1/owl). exe: загрузка уровня 0x4ff3b0, смена состояний 0x5002f0,
// нажатие 0x501580, опыт за нажатие 0x569750.
import { Container, Sprite } from "pixi.js";
import type { OwlDef, OwlLevel } from "./rules";
import { rand } from "./rules";
import { tex } from "./ui";

type State = "stand" | "active" | "action";

export class Owl extends Container {
  private readonly sprite = new Sprite();
  private state: State = "stand";
  /** Таймер состояния (+0x44) и длина текущей активности (+0x50). */
  private timer = 0;
  private activeTotal = 1;
  private def: OwlLevel | null = null;

  /** Ключ порядка рисования на ферме — нижний край статуи. */
  get depth() {
    return this.y + this.owl.dimensions[1];
  }

  constructor(private readonly owl: OwlDef) {
    super();
    this.addChild(this.sprite);
    this.position.set(...owl.position);
    this.hitArea = { contains: (x: number, y: number) => x >= 0 && y >= 0 && x < owl.dimensions[0] && y < owl.dimensions[1] };
  }

  /** Уровень 1…N (0 — совы нет). Новый уровень начинает с покоя на rand(min_stand..max_stand) (0x4ffc8b). */
  setLevel(level: number) {
    this.def = level > 0 ? this.owl.levels[level - 1] ?? null : null;
    if (!this.def) return;
    this.sprite.position.set(...this.def.offset);
    this.toStand();
  }

  /** Полупрозрачная сова первого уровня — пока её можно купить. */
  showGhost(level: number) {
    const d = this.owl.levels[level - 1];
    if (!d) return;
    this.sprite.texture = tex(d.images.stand);
    this.sprite.position.set(...d.offset);
  }

  private toStand() {
    this.state = "stand";
    this.timer = rand(this.def!.stand[0], this.def!.stand[1]);
    this.sprite.texture = tex(this.def!.images.stand);
  }

  /** Кадр (0x5002f0): покой → активность на rand(min_active..max_active) → покой; после «action» — покой. */
  update(dt: number) {
    if (!this.def) return;
    this.timer -= dt;
    if (this.state === "stand" && this.timer <= 0) {
      this.state = "active";
      this.timer = this.activeTotal = rand(this.def.active[0], this.def.active[1]);
      this.sprite.texture = tex(this.def.images.active);
    } else if (this.state === "active" && this.timer <= 0) {
      this.toStand();
    } else if (this.state === "action" && this.timer <= 0) {
      // «action» не зациклена: когда она проиграла (play_time), сова возвращается в покой
      this.toStand();
    }
  }

  get active() {
    return this.state === "active";
  }

  /**
   * Нажатие (0x501580): только пока глаза горят. Опыт (0x569750) — ⌊exp · оставшееся время / длина активности⌋ + 1:
   * чем раньше нажать, тем больше. Возвращает опыт или 0.
   */
  tap(): number {
    if (!this.def || this.state !== "active") return 0;
    const exp = Math.trunc(this.def.exp * (Math.max(0, this.timer) / this.activeTotal)) + 1;
    this.state = "action";
    this.timer = this.def.action_time;
    this.sprite.texture = tex(this.def.images.action);
    return exp;
  }
}
