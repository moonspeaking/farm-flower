// Статуи фермы «Цветка Стихий» (root/shop/location_N/<вид>): сова, Нептун, алтарь, горн, часы. exe: общий класс —
// загрузка 0x4fa680, смена состояний 0x4fb590, нажатие 0x4fcad0 (эффект — виртуальный метод +0x20 вида);
// сова — свой класс: 0x4ff3b0, 0x5002f0, 0x501580.
import { Container, Sprite } from "pixi.js";
import type { StatueDef, StatueLevel } from "./rules";
import { rand } from "./rules";
import { tex } from "./ui";

type State = "stand" | "active" | "action";

export class Statue extends Container {
  private readonly sprite = new Sprite();
  private state: State = "stand";
  /** Таймер состояния и длина текущей активности (у совы +0x44 и +0x50, у остальных +0x68). */
  private timer = 0;
  private activeTotal = 1;
  private lv: StatueLevel | null = null;
  /** Доля оставшейся активности на момент нажатия (сова считает по ней опыт). */
  leftAtTap = 0;

  /** Ключ порядка рисования на ферме — нижний край статуи. */
  get depth() {
    return this.y + this.def.dimensions[1];
  }

  constructor(readonly kind: string, private readonly def: StatueDef) {
    super();
    this.addChild(this.sprite);
    this.position.set(...def.position);
    this.hitArea = { contains: (x: number, y: number) => x >= 0 && y >= 0 && x < def.dimensions[0] && y < def.dimensions[1] };
  }

  /** Свойства текущего уровня (null — статуи нет). */
  get level() {
    return this.lv;
  }

  /** Уровень 1…N (0 — статуи нет). Новый уровень начинает с покоя на rand(min_stand..max_stand). */
  setLevel(level: number) {
    this.lv = level > 0 ? this.def.levels[level - 1] ?? null : null;
    if (!this.lv) return;
    this.sprite.position.set(...this.lv.offset);
    this.toStand();
  }

  /** Полупрозрачная статуя уровня level — пока её можно купить. */
  showGhost(level: number) {
    const d = this.def.levels[level - 1];
    if (!d) return;
    this.sprite.texture = tex(d.images.stand);
    this.sprite.position.set(...d.offset);
  }

  private toStand() {
    this.state = "stand";
    this.timer = rand(this.lv!.stand[0], this.lv!.stand[1]);
    this.sprite.texture = tex(this.lv!.images.stand);
  }

  /**
   * Кадр: покой → активна на rand(min_active..max_active) → покой. После нажатия («action») сова (0x5002f0) ждёт конца
   * анимации (play_time); у остальных статуй (0x4fb590) проверка конца анимации обратная — в покой на следующем кадре.
   */
  update(dt: number) {
    if (!this.lv) return;
    this.timer -= dt;
    if (this.state === "stand" && this.timer <= 0) {
      this.state = "active";
      this.timer = this.activeTotal = rand(this.lv.active[0], this.lv.active[1]);
      this.sprite.texture = tex(this.lv.images.active);
    } else if (this.state === "active" && this.timer <= 0) {
      this.toStand();
    } else if (this.state === "action" && (this.kind !== "owl" || this.timer <= 0)) {
      this.toStand();
    }
  }

  get active() {
    return this.state === "active";
  }

  /** Нажатие: только в активности — анимация «action». true — эффект срабатывает. */
  tap(): boolean {
    if (!this.lv || this.state !== "active") return false;
    this.leftAtTap = Math.max(0, this.timer) / this.activeTotal;
    this.state = "action";
    this.timer = this.lv.action_time;
    this.sprite.texture = tex(this.lv.images.action);
    return true;
  }
}
