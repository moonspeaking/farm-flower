// Окно заданий «Цветка Стихий» (quest_screen): журнал, который ведут действия квестов add_quest / add_task / add_task_count.
// Раскладка — properties_ru.xml (quest_screen) и properties.xml (count_text, quests_tasks); строка задания — exe 0x57cb40.
import { Container, Graphics, Sprite, Rectangle } from "pixi.js";
import { rgb } from "./popfont";
import type { JournalEntry } from "./quests";
import type { Game } from "./state";
import { COLOR, H, image, pop, tex, textButton, W } from "./ui";

/** Фон Quest_back 660×455 по центру экрана. */
const BACK_W = 660;
const BACK_H = 455;
/** q_control (80; 80) 500×260 — область списка. */
const LIST = { x: 80, y: 80, w: 500, h: 260 };
/** quests_tasks: отступ первого значка от портрета, между значками, текста от значка. */
const OFFSET_TASK_X = 5;
const OFFSET_PER_X = 20;
const OFFSET_TEXT_X = 5;
/** Портреты и значки заданий (miniimages) — 44×44. */
const ICON = 44;
/** exe 0x57d2e3: больше 5 заданий — со 6-го новая строка ниже портрета на его высоту + 0x14. */
const PER_ROW = 5;
const ROW_GAP = 0x14;

export class QuestScreen extends Container {
  private readonly list = new Container();
  private readonly listMask = new Graphics();
  private scroll = 0;
  private contentH = 0;

  constructor(private readonly game: Game, private readonly onClose: () => void) {
    super();
    const shade = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.45 });
    shade.eventMode = "static";
    this.addChild(shade);
    const box = new Container();
    box.position.set(Math.round((W - BACK_W) / 2), Math.round((H - BACK_H) / 2));
    this.addChild(box);
    box.addChild(image("quest_back"));
    const t = game.rules.texts;

    // header_text (167; 37) 400×50: «Окно заданий» шрифтом stat_control_fonts_menu_normal по центру рамки
    const title = pop(t.quest_title || "Окно заданий", "stat_control_fonts_menu_normal", COLOR.white, { align: "center" });
    title.position.set(BACK_W / 2, 37); // по центру рамки (в XML 167 + 200 при rect_alignment center — смещение от иной опоры, на рамке выходило правее)
    box.addChild(title);

    this.list.position.set(LIST.x, LIST.y);
    this.listMask.rect(LIST.x, LIST.y, LIST.w, LIST.h).fill(0xffffff);
    this.list.mask = this.listMask;
    box.addChild(this.list, this.listMask);
    this.build();

    // prev (543; 73) и next (541; 320) 25×25 — листание списка
    const arrow = (dir: "prev" | "next", x: number, y: number, step: number) => {
      const b = new Sprite(tex(`quest_${dir}_normal`));
      b.position.set(x, y);
      b.eventMode = "static";
      b.cursor = "pointer";
      b.on("pointerover", () => (b.texture = tex(`quest_${dir}_active`)));
      b.on("pointerout", () => (b.texture = tex(`quest_${dir}_normal`)));
      b.on("pointertap", (e) => {
        e.stopPropagation();
        this.scrollBy(step);
      });
      box.addChild(b);
    };
    arrow("prev", 543, 73, -ICON);
    arrow("next", 541, 320, ICON);

    // колесо мыши листает список (шаг — одна строка), на сенсорном экране список тянется пальцем
    this.eventMode = "static";
    this.on("wheel", (e) => {
      e.preventDefault?.();
      this.scrollBy(Math.sign(e.deltaY) * ICON);
    });
    let drag: { y: number; scroll: number } | null = null;
    box.on("pointerdown", (e) => (drag = { y: e.global.y, scroll: this.scroll }));
    box.eventMode = "static";
    box.hitArea = new Rectangle(0, 0, BACK_W, BACK_H);
    box.on("pointermove", (e) => {
      if (drag && e.pointerType !== "mouse") this.scrollBy(drag.scroll - e.global.y + drag.y - this.scroll);
    });
    for (const ev of ["pointerup", "pointerupoutside"]) box.on(ev, () => (drag = null));

    // ok (320; 363) 25×24, стиль normal
    const ok = textButton(t.buttons.ok ?? "OK", () => this.close());
    ok.position.set(320 + 12, 363 + 12);
    box.addChild(ok);
    shade.on("pointertap", () => this.close());
  }

  private close() {
    this.destroy({ children: true });
    this.onClose();
  }

  private scrollBy(dy: number) {
    this.scroll = Math.max(0, Math.min(Math.max(0, this.contentH - LIST.h), this.scroll + dy));
    this.list.y = LIST.y - this.scroll;
  }

  /** Сколько у игрока предмета задания: деньги, плоды на складе текущей фермы или предметы квестов. */
  private have(item: string) {
    const g = this.game;
    if (item === "money") return g.gold;
    if (g.storage.has(item)) return g.storage.get(item) ?? 0;
    if (g.rules.vegetations[item]) return g.countPlants(item);
    return g.items[item] ?? 0;
  }

  /** Заголовок квеста из ru.xml (root/quests/<локация>/quests/<квест>/@header). */
  private header(e: JournalEntry) {
    const n = Number(e.location.replace("location_", ""));
    const quests = n === 1 ? this.game.base.quests : this.game.base.locations[`${n}`]?.quests;
    const quest = quests?.[e.quest];
    return (e.titleFrom && quest?.sub_quests[e.titleFrom]?.header) || quest?.header || "";
  }

  private entries(): JournalEntry[] {
    // журналы всех локаций: запись живёт в состоянии той локации, где её завели
    return Object.values(this.game.questStates).flatMap((q) => Object.values(q.journal ?? {}));
  }

  private build() {
    const delim = this.game.rules.texts.delimiter ?? ",";
    const num = (v: number) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, delim);
    let y = 0;
    for (const e of this.entries()) {
      const row = new Container();
      row.y = y;
      this.list.addChild(row);
      // header_quest_text (−1; −2) 400×40: заголовок серым (155) шрифтом stat_control_fonts_1
      const head = pop(this.header(e), "stat_control_fonts_1", rgb(155, 155, 155));
      head.position.set(-1, -2);
      row.addChild(head);
      const top = Math.max(0, Math.round(head.textHeight) - 2);
      // портрет персонажа (miniimages/<person>)
      if (this.has(`mini_${e.person}`)) {
        const p = image(`mini_${e.person}`);
        p.position.set(0, top);
        row.addChild(p);
      }
      let bottom = top + ICON;
      e.tasks.forEach((task, i) => {
        const col = i % PER_ROW;
        const line = Math.floor(i / PER_ROW);
        const x = ICON + OFFSET_TASK_X + col * (ICON + OFFSET_PER_X);
        const ty = top + line * (ICON + ROW_GAP);
        if (this.has(`need_${task.item}`)) {
          const icon = image(`need_${task.item}`);
          icon.position.set(x, ty);
          row.addChild(icon);
        }
        // count_text: «есть/нужно» шрифтом stat_control_2, белым; выполнено — зелёным (0;255;0). У «поговорить» числа нет
        if (task.count !== undefined) {
          const have = this.have(task.item);
          const done = have >= task.count;
          const c = pop(`${num(Math.min(have, task.count))}/${num(task.count)}`, "stat_control_fonts_2",
            done ? rgb(0, 255, 0) : COLOR.white, { align: "center", scale: 0.7 });
          c.position.set(x + ICON / 2, ty + ICON - OFFSET_TEXT_X);
          row.addChild(c);
          bottom = Math.max(bottom, ty + ICON - OFFSET_TEXT_X + c.textHeight);
        }
      });
      y += bottom;
    }
    this.contentH = y;
  }

  private has(name: string) {
    return this.game.base.images.includes(name);
  }
}
