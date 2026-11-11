// Окно умений (level_up) «Цветка Стихий»: Айрис слева, Робин справа. Уровень умения — стручок на листе (10 кадров роста)
// и число на значке; очко умений вкладывается кнопкой «ОК» (level_up_button).
import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { audio } from "./audio";
import type { PopLabel } from "./popfont";
import { fmt, Rules } from "./rules";
import { Game, SKILLS, SkillName } from "./state";
import { COLOR, H, image, pop, tex, textButton, W } from "./ui";

interface Slot {
  /** progresses/<умение>: рамка полоски (позиция и размер), selected_pos — сдвиг рамок selected/overed (120×24). */
  bar: [number, number, number, number];
  selected: [number, number];
  /** progress/anim_pos — где внутри рамки стоит стручок; inv — стручок Робина отражён (bob_prog_inv). */
  anim: [number, number];
  inv: boolean;
  /** icons/<умение> 38×34 и level_texts/<умение> 25×25 (число по центру). */
  icon: [number, number];
  level: [number, number];
  side: "girl" | "helper";
}

/** Положение из properties_ru.xml «Цветка Стихий» (level_up). */
const SLOTS: Record<SkillName, Slot> = {
  trade: { bar: [70, 166, 128, 30], selected: [9, 3], anim: [4, -2], inv: false, icon: [164, 165], level: [170, 170], side: "girl" },
  farm: { bar: [63, 192, 140, 50], selected: [13, 12], anim: [2, 6], inv: false, icon: [162, 199], level: [168, 205], side: "girl" },
  attack: { bar: [56, 231, 140, 30], selected: [21, 5], anim: [5, -2], inv: false, icon: [163, 231], level: [167, 235], side: "girl" },
  helper_pour: { bar: [215, 165, 120, 30], selected: [0, 2], anim: [30, -2], inv: true, icon: [211, 162], level: [219, 167], side: "helper" },
  helper_product: { bar: [216, 198, 120, 30], selected: [0, 2], anim: [35, -2], inv: true, icon: [213, 196], level: [220, 199], side: "helper" },
  helper_attack: { bar: [216, 230, 120, 40], selected: [0, 2], anim: [36, -2], inv: true, icon: [213, 228], level: [221, 232], side: "helper" },
};

/** Кадров в полоске bob_prog (rows = 10): от пустого стручка до полного; кадр 100×49. */
const BOB_FRAMES = 10;

const ICON: Record<SkillName, string> = {
  trade: "lu_trade", farm: "lu_farm", attack: "lu_attack",
  helper_pour: "lu_helper_pour", helper_product: "lu_helper_product", helper_attack: "lu_helper_attack",
};

/** Кадр полосы, обрезанный по доле: exe рисует стручок усечённым по горизонтали — trunc(100 · доля + 0,5) px кадра (0x57b840). */
function bobFrame(name: string, frame: number, frac: number) {
  const t = tex(name);
  const h = Math.floor(t.height / BOB_FRAMES);
  const w = Math.min(t.width, Math.floor((t.width * frac) + 0.5));
  return new Texture({ source: t.source, frame: new Rectangle(t.frame.x, t.frame.y + frame * h, w, h) });
}

export class LevelUp extends Container {
  private selected: SkillName | null = null;
  private hover: SkillName | null = null;
  private readonly box = new Container();
  private desc: PopLabel;
  private readonly marks = new Container();
  private readonly buttonHolder = new Container();

  constructor(
    private readonly rules: Rules,
    private readonly game: Game,
    private readonly helperEnabled: boolean,
    private readonly onClose: () => void,
  ) {
    super();
    const shade = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.45 });
    shade.eventMode = "static";
    this.addChild(shade, this.box);
    this.box.position.set(Math.round((W - 417) / 2), Math.round((H - 497) / 2));
    this.box.addChild(image("lu_back"));

    // портреты girl (61; 58) и helper (236; 60) в рамках 120×120, картинка по центру рамки
    const portrait = (name: string, x: number, y: number) => {
      const p = image(name);
      p.position.set(x + Math.round((120 - p.texture.width) / 2), y + Math.round((120 - p.texture.height) / 2));
      this.box.addChild(p);
      return p;
    };
    portrait("lu_girl", 61, 58);
    const helper = portrait("lu_helper", 236, 60);
    // Робин ещё не пришёл — портрет притемнён
    if (!helperEnabled) helper.tint = 0x606060;

    for (const skill of SKILLS) {
      const slot = SLOTS[skill];
      const off = slot.side === "helper" && !helperEnabled;
      const icon = image(off ? `${ICON[skill]}_off` : ICON[skill]);
      icon.position.set(...slot.icon);
      this.box.addChild(icon);
      // область нажатия — вся рамка полоски умения
      const [bx, by, bw, bh] = slot.bar;
      const hit = new Graphics().rect(bx, by, bw, bh).fill({ color: 0xffffff, alpha: 0.001 });
      hit.eventMode = off ? "none" : "static";
      hit.cursor = "pointer";
      hit.on("pointerover", () => {
        this.hover = skill;
        this.render();
      });
      hit.on("pointerout", () => {
        if (this.hover === skill) this.hover = null;
        this.render();
      });
      hit.on("pointertap", (e) => {
        e.stopPropagation();
        this.selected = skill;
        this.render();
      });
      this.box.addChild(hit);
    }

    // стручки, рамки и числа уровней — поверх значков
    this.box.addChild(this.marks);

    // описание на доске: description (98; 301) 220×85, шрифт stat_control_1, цвет 210;210;210
    this.desc = pop("", "stat_control_fonts_1", 0xd2d2d2, { wrap: 220, lineOffset: -4 });
    this.desc.position.set(98, 301);
    this.box.addChild(this.desc, this.buttonHolder);
    shade.on("pointertap", () => this.close());
    this.render();
  }

  private close() {
    this.destroy({ children: true });
    this.onClose();
  }

  /** Сколько уровней у умения (skills.xml: 20 у Айрис, 10 у Робина). */
  private max(skill: SkillName) {
    return this.rules.skills[skill]?.length ?? 5;
  }

  /** Описание на доске 220×85: длинное уменьшается, чтобы не вылезать за доску. */
  private setDesc(text: string) {
    const make = (k: number) => {
      const l = pop(text, "stat_control_fonts_1", 0xd2d2d2, { wrap: 220 / k, lineOffset: -4, scale: k });
      l.position.set(98, 301);
      return l;
    };
    let l = make(1);
    if (l.textHeight > 85) {
      const k = 85 / l.textHeight;
      l.destroy();
      l = make(Math.max(0.5, k));
    }
    this.desc.destroy();
    this.desc = l;
    this.box.addChild(l);
  }

  private render() {
    const g = this.game;
    this.marks.removeChildren().forEach((c) => c.destroy());
    for (const skill of SKILLS) {
      const slot = SLOTS[skill];
      const level = g.skills[skill];
      const [bx, by] = slot.bar;
      // стручок: доля уровня от максимума. Кадр в exe ищется позицией ролика (0x57b760):
      // elapsed = play_time / rows · trunc(rows · доля + 0,5), кадр = clamp(elapsed / (play_time·1000 / rows), 0, rows−1) (0x791be0, кламп 0x4769c0);
      // ролик никогда не тикает (обёртка 0x792110 вызовов не имеет), поэтому кадр статичен. Доля = уровень / максимум.
      // Подсветка bob_prog_sel в exe не рисуется: поле +0x8c всегда 1 (0x57a6ad), ветка с роликами 0x57b990 не выполняется.
      const frac = level / this.max(skill);
      const frame = Math.min(BOB_FRAMES - 1, Math.floor(frac * BOB_FRAMES + 0.5));
      const sel = skill === this.selected;
      const bob = new Sprite(bobFrame(slot.inv ? "lu_bob_inv" : "lu_bob", frame, frac));
      bob.position.set(bx + slot.anim[0], by + slot.anim[1]);
      this.marks.addChild(bob);
      // рамки: выбранное умение — selected, под курсором — overed (120×24 в рамке + selected_pos)
      const frameImg = sel ? "lu_selected" : skill === this.hover ? "lu_overed" : null;
      if (frameImg) {
        const f = image(frameImg);
        f.position.set(bx + slot.selected[0], by + slot.selected[1]);
        this.marks.addChild(f);
      }
      // уровень числом на значке (level_texts: stat_control_fonts_2 белым, по центру 25×25)
      if (!(slot.side === "helper" && !this.helperEnabled)) {
        const n = pop(String(level), "stat_control_fonts_2", COLOR.white, { align: "center" });
        n.anchor.set(0.5, 0.5);
        n.position.set(slot.level[0] + 12.5, slot.level[1] + 12.5);
        this.marks.addChild(n);
      }
    }

    const t = this.rules.texts;
    const points = g.skillPoints;
    this.setDesc(this.selected ? fmt(t.skill_desc[this.selected]) : points > 0 ? fmt(t.tutorial.level_up) : `${t.stats.hero_title}: ${g.level}`);

    // level_up_button (271; 417) 50×33 и ok (283; 417) 26×24 — на одном листе, видна одна из них; стиль normal_small
    this.buttonHolder.removeChildren().forEach((c) => c.destroy({ children: true }));
    const can = !!this.selected && points > 0 && g.skills[this.selected] < this.max(this.selected);
    const b = can
      ? textButton(t.buttons.level_up ?? "ОК", () => this.raise(), "small")
      : textButton(t.buttons.ok ?? "OK", () => this.close(), "small");
    b.position.set(can ? 271 + 25 : 283 + 13, can ? 417 + 16 : 417 + 12);
    this.buttonHolder.addChild(b);
  }

  private raise() {
    const s = this.selected!;
    this.game.skills[s] += 1;
    audio.play("level_up");
    this.game.changed();
    this.render();
  }
}
