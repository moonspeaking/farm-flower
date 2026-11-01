// Левая панель Айрис (stat_control + game_screen/item_stat «Цветка Стихий»): опыт, склад, вода, деньги, день, «Меню».
import { Container, Graphics } from "pixi.js";
import type { PopLabel } from "./popfont";
import { rgb } from "./popfont";
import type { Rules } from "./rules";
import type { Game } from "./state";
import { audio } from "./audio";
import { ParticleLayer } from "./particles";
import { COLOR, image, pop, textButton } from "./ui";

export interface HudEvents {
  /** Нажали на полоску опыта (view_button) — открыть окно умений. */
  openLevelUp(): void;
  /** Свиток quest_button — окно заданий. */
  openQuests(): void;
  menu(): void;
}

export class Hud extends Container {
  private readonly values: Record<"storage" | "water" | "money" | "day" | "level", PopLabel>;
  private readonly bar = new Graphics();
  private readonly glow = new Graphics();
  private blink = 0;
  /** Можно ли сейчас улучшать умения (не во время дня) — иначе рамка опыта не мигает. */
  blinkOn = true;
  private readonly particles = new ParticleLayer();
  private shown: Record<"storage" | "water" | "money", number> | null = null;

  constructor(rules: Rules, private readonly game: Game, events: HudEvents) {
    super();
    const st = rules.texts.stats;
    this.addChild(image("stat_panel"));

    // «Цветок Стихий», game_screen/item_stat: панель 200×600 (ствол с листьями). Заголовки — stat_control_fonts_1 белым.
    // По скриншоту оригинала они стоят по центру своих рамок (хотя в XML align="left"): storage_title (12;148) 80×25,
    // water_title (12;266) 80×25, money_title (11;378) 80×30, day_title (104;16) 80×30 — так надписи посередине досок.
    // hero_title (9;7) в оригинале не виден — не рисуем
    const title = (text: string, x: number, y: number, w: number, h: number) => {
      const l = pop(text, "stat_control_fonts_1", COLOR.white, { align: "center" });
      l.anchor.set(0.5, 0.5);
      l.position.set(x + w / 2, y + h / 2);
      this.addChild(l);
    };
    title(st.storage_title, 12, 148, 80, 25);
    title(st.water_title, 12, 266, 80, 25);
    title(st.money_title, 11, 378, 80, 30);
    title(st.day_title, 104, 16, 80, 30);

    // значения — stat_control_fonts_2 (буквы своего тёмного цвета). Как в первой игре (там product_count (54;214) стоял
    // центром на x = 54 при рамке 85 px), x позиции — центр надписи, y — её верх.
    // product_count (77;235), water_count (32;350) цвет 255;255;160, money_count (83;468), day_count (106;35) align left.
    // angle в XML (0.2 / −0.2) на скриншоте оригинала не виден — числа стоят ровно, поэтому не поворачиваем
    const value = (x: number, y: number, color: number) => {
      const l = pop("", "stat_control_fonts_2", color, { align: "center" });
      l.position.set(x, y);
      this.addChild(l);
      return l;
    };
    this.values = {
      storage: value(77, 235, COLOR.white),
      water: value(32, 350, rgb(255, 255, 160)),
      money: value(83, 468, COLOR.white),
      // день — по скриншоту под словом «День», по его центру (в XML day_count (106;35) 30×30, align left)
      day: value(144, 38, COLOR.white),
      // уровень — тем же тёмным шрифтом в жёлтом кружке слева от полоски опыта (в XML experience вынесен за экран; место и шрифт — по скриншоту оригинала)
      level: value(44, 108, COLOR.white),
    };

    // полоска опыта exp (56;110) 60×10; при свободных очках умений мигает. Нажатие — view_button (19;94) 90×25
    this.addChild(this.glow, this.bar, this.particles);
    const hit = new Graphics().rect(19, 94, 90, 25).fill({ color: 0xffffff, alpha: 0.001 });
    hit.eventMode = "static";
    hit.cursor = "pointer";
    hit.on("pointertap", (e) => {
      e.stopPropagation();
      events.openLevelUp();
    });
    this.addChild(hit);

    // quest_button (88;66) 29×28 в зелёном кружке: значок свитка — глиф «q» шрифта quest (стиль quest_small), открывает окно заданий
    const quest = pop("q", "quest", COLOR.white);
    quest.position.set(88, 66);
    quest.eventMode = "static";
    quest.cursor = "pointer";
    quest.on("pointertap", (e) => {
      e.stopPropagation();
      events.openQuests();
    });
    this.addChild(quest);

    // «Меню» на шляпке гриба: menu (21;526) 70×25, стиль menu_small
    const menu = textButton(rules.texts.buttons.game_menu ?? "Меню", () => events.menu(), "menuSmall");
    menu.position.set(21 + 35, 526 + 12);
    menu.on("pointertap", (e) => e.stopPropagation());
    this.addChild(menu);
    this.update();
  }

  update() {
    const g = this.game;
    // звёздочки (water-changes, money-changes, products-changes) вылетают из счётчика, когда значение меняется
    const now = { storage: g.storageCount(), water: g.water, money: g.gold };
    if (this.shown && audio.options.sparkles) {
      if (now.storage !== this.shown.storage) this.particles.start("products-changes", 119, 245);
      if (now.water !== this.shown.water) this.particles.start("water-changes", 74, 360);
      if (now.money !== this.shown.money) this.particles.start("money-changes", 120, 478);
    }
    this.shown = now;
    this.values.storage.text = `${g.storageCount()}/${g.storageMax}`;
    this.values.water.text = `${g.water}/${g.waterMax}`;
    this.values.money.text = String(g.gold);
    this.values.day.text = String(g.day);
    this.values.level.text = String(g.level);
    const [cur, need] = g.levelProgress;
    // полоска exp (56; 110) 60×10 лежит в нарисованном на панели жёлобе — без своей дорожки, только заливка
    this.bar.clear();
    const w = 60 * Math.min(1, cur / need);
    if (w > 0) {
      this.bar.rect(56, 110, w, 10).fill(0x58c63c);
      this.bar.rect(57, 111, Math.max(0, w - 2), 4).fill({ color: 0xb6f58a, alpha: 0.7 });
    }
  }

  /** Мигание рамки, пока есть неиспользованные очки умений. */
  tick(dt: number) {
    this.blink += dt;
    this.particles.update(dt);
    this.glow.clear();
    if (this.blinkOn && this.game.skillPoints > 0) {
      const a = 0.35 + 0.35 * Math.sin(this.blink * 6);
      this.glow.roundRect(53, 107, 66, 16, 7).stroke({ color: 0xffee66, width: 3, alpha: a });
    }
  }
}
