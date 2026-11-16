// Город первой локации (town_screen): персонажи с заданиями, продавцы, возврат на ферму.
import { Container, Graphics } from "pixi.js";
import { Hud } from "./hud";
import type { QuestEngine } from "./quests";
import type { Rules } from "./rules";
import type { Game } from "./state";
import { Talk } from "./talk";
import { Reminder, type Tutorial } from "./tutorial";
import { QuestScreen } from "./questscreen";
import { COLOR, image, pop, roundButton, textButton, toast, H, W } from "./ui";

export interface TownEvents {
  toFarm(): void;
  toMap(): void;
  saved(): void;
  /** Кнопка «Меню» левой панели. */
  menu(): void;
}

export class Town extends Container {
  /** Картинка и подпись каждого персонажа — прячутся, пока у него нет заданий. */
  private readonly people: Record<string, Container[]> = {};
  private readonly overlay = new Container();
  private busy = false;
  private readonly reminder = new Reminder("town");
  private readonly hud: Hud;
  private readonly nameTip = new Container();

  private unsubscribe: () => void = () => undefined;

  destroy(options?: Parameters<Container["destroy"]>[0]) {
    this.unsubscribe();
    super.destroy(options);
  }

  constructor(
    private readonly rules: Rules,
    game: Game,
    private readonly quests: QuestEngine,
    private readonly events: TownEvents,
    private readonly tut: Tutorial,
  ) {
    super();
    const t = rules.texts;
    this.addChild(image(rules.town_bg_image));

    // персонажи — quest_holders первой локации; ниже на экране — ближе
    const holders = Object.entries(rules.holders).sort((a, b) => a[1].position[1] - b[1].position[1]);
    for (const [name, h] of holders) {
      const s = image(`holder_${name}`);
      s.position.set(h.position[0], h.position[1]);
      // персонажи стоят у нижнего края экрана: подрезанные снизу позиции поднимаем, чтобы были видны целиком
      s.y = Math.min(s.y, 600 - s.height - 4);
      s.eventMode = "static";
      s.cursor = "talk";
      s.on("pointertap", () => void this.talk(name));
      // имя персонажа — плашка у курсора при наведении (курсор «губы» задан cursor = "talk")
      s.on("pointerover", (e) => this.showName(name, e.global.x, e.global.y));
      s.on("pointermove", (e) => this.showName(name, e.global.x, e.global.y));
      s.on("pointerout", () => this.hideName());
      this.people[name] = [s];
      this.addChild(s);
    }

    // круглые кнопки town_screen, как на ферме: to_global_map (193; -110) и shop_screen_farm (527; -110)
    const map = roundButton(t.buttons.town_to_global_map ?? "На Карту", () => this.events.toMap());
    map.position.set(193 + 103, -110 + 99);
    const farm = roundButton(t.buttons.shop_screen_farm ?? "На Ферму", () => this.events.toFarm());
    farm.position.set(527 + 103, -110 + 99);
    this.addChild(map, farm);
    // левая панель Айрис — та же, что на ферме
    this.hud = new Hud(rules, game, {
      openLevelUp: () => undefined,
      openQuests: () => this.overlay.addChild(new QuestScreen(game, () => undefined)),
      menu: () => this.events.menu(),
    });
    this.hud.blinkOn = false; // в городе умения не улучшаются
    this.addChild(this.hud, this.overlay, this.nameTip);
    this.unsubscribe = game.onChange(() => this.hud.update());
    this.hud.update();
    this.nameTip.eventMode = "none";
    this.nameTip.visible = false;
    this.refresh();
  }

  update(dt: number) {
    this.hud.tick(dt);
    // «Нажмите сюда для перехода на ферму» каждые 10 с, пока в городе нечем заняться (exe 0x492b40)
    this.reminder.tick(dt, this.tut, !this.busy, () => this.tut.show("town_show_farm_baloon", 630, 60, true));
  }

  /** Плашка с именем у курсора: тёмно-зелёная, белый жирный текст (на скриншоте оригинала). */
  private showName(holder: string, gx: number, gy: number) {
    const name = this.rules.texts.characters[holder] ?? "";
    if (!name || !this.people[holder][0].visible) return;
    if (this.nameTip.name !== holder) {
      this.nameTip.removeChildren().forEach((c) => c.destroy());
      const text = pop(name, "Dialog", COLOR.white, { align: "center" }); // show_farm_tt: шрифт Dialog
      text.anchor.set(0.5, 0.5);
      const w = text.textWidth + 24;
      const h = text.textHeight + 12;
      const box = new Graphics().rect(-w / 2, -h, w, h).fill(0x006400).stroke({ color: 0x000000, width: 1 });
      text.position.set(0, -h / 2);
      this.nameTip.addChild(box, text);
      this.nameTip.name = holder;
    }
    const p = this.toLocal({ x: gx, y: gy });
    // над курсором-губами (его картинка поднимается на 20 px над точкой), в пределах экрана
    const half = this.nameTip.width / 2;
    this.nameTip.position.set(Math.max(half + 4, Math.min(800 - half - 4, p.x)), Math.max(this.nameTip.height + 4, p.y - 22));
    this.nameTip.visible = true;
  }

  private hideName() {
    this.nameTip.visible = false;
    this.nameTip.name = "";
  }

  /** Есть персонаж с доступным заданием. */
  hasQuests() {
    return Object.keys(this.people).some((name) => this.quests.available(name).length > 0);
  }

  /** Город показали игроку: слуга с заданием — подсказка town_talker (первый раз). */
  entered() {
    // подсказки про персонажей — часть обучения первой локации, в остальных городах их нет
    if (this.rules.location !== 1 || !this.quests.available("old_servant").length) return;
    this.tut.show("town_talker", 0, 0);
  }

  /** Персонаж стоит в городе, только когда у него есть задание (сыщик «приезжает» на следующий день и т. д.). */
  refresh() {
    for (const name of Object.keys(this.people)) {
      const has = this.quests.available(name).length > 0;
      for (const c of this.people[name]) c.visible = has;
    }
  }

  private async talk(holder: string) {
    if (this.busy) return;
    const list = this.quests.available(holder);
    if (!list.length) {
      const name = this.rules.texts.characters[holder] ?? "";
      return toast(this.overlay, `${name}: заданий пока нет`);
    }
    // у персонажа несколько заданий сразу — окно выбора (select_quest_screen, exe 0x543b30)
    let pick: (ReturnType<QuestEngine["available"]>[number]) | null = list[0];
    if (list.length > 1) {
      pick = await this.selectQuest(holder, list);
      if (!pick) return;
    }
    // первый разговор: персонаж выходит на передний план (крупный портрет, фигура в городе скрыта) и показывается town_talker_large;
    // сам разговор начинается после закрытия подсказки
    const sprite = this.people[holder]?.[0];
    const first = this.tut.show("town_talker_large", 0, 0, false, () => void this.startTalk(holder, pick));
    if (first) {
      if (sprite) sprite.visible = false;
      this.nameTip.visible = false;
      return;
    }
    void this.startTalk(holder, pick);
  }

  /**
   * Окно выбора задания (select_quest_screen, exe 0x543b30). Кнопки доступных подзаданий стилем
   * root/button/normal стеком вокруг точки center (360; 170) из XML: x = 360 − w/2, y от 170 − суммы
   * высот, без зазора (0x544129). Панели фона нет — экран 739×426 рисуется по центру контрола
   * персонажа (ComeUpControlFromPointController 0x557230: прямоугольник = центр B ± половина
   * содержимого, альфа = прогресс · 255 за 0,25 с), поэтому точка экрана (px; py) ложится в
   * (cx − 369.5 + px; cy − 213 + py). Подпись кнопки — header подзадания (загрузчик 0x5aff9c читает
   * "header" → sub+0x20 → кнопка 0x7c3720), последняя кнопка — «Вернуться»
   * (root/button/return/@label). Клик запоминается в +0xc (0x544250) и экран закрывается; щелчки мимо
   * кнопок до города не доходят — экран поверх.
   */
  private selectQuest(holder: string, list: ReturnType<QuestEngine["available"]>): Promise<ReturnType<QuestEngine["available"]>[number] | null> {
    type Entry = ReturnType<QuestEngine["available"]>[number];
    return new Promise((resolve) => {
      const layer = new Container();
      const finish = (v: Entry | null) => {
        layer.destroy({ children: true });
        resolve(v);
      };
      const catcher = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.001 });
      catcher.eventMode = "static";
      layer.addChild(catcher);
      const sprite = this.people[holder]?.[0];
      const cx = sprite ? sprite.x + sprite.width / 2 : W / 2;
      const cy = sprite ? sprite.y + sprite.height / 2 : H / 2;
      const box = new Container();
      box.position.set(Math.round(cx - 739 / 2), Math.round(cy - 426 / 2));
      layer.addChild(box);
      const entries: { text: string; pick: Entry | null }[] = [
        ...list.map((q) => ({ text: q.data.header || this.rules.quests[q.quest]?.header || q.quest, pick: q as Entry })),
        { text: this.rules.texts.buttons.return || "Вернуться", pick: null },
      ];
      const buttons = entries.map((e) => ({ e, b: textButton(e.text, () => finish(e.pick), "normal") }));
      const total = buttons.reduce((a, x) => a + x.b.textHeight, 0);
      let y = 170 - total / 2;
      for (const { b } of buttons) {
        b.anchor.set(0.5, 0.5);
        b.position.set(360, y + b.textHeight / 2);
        y += b.textHeight;
        box.addChild(b);
      }
      // проявление за 0,25 с (альфа = прогресс · 255)
      box.alpha = 0;
      let t = 0;
      const tick = () => {
        if (layer.destroyed) return;
        t = Math.min(1, t + 1 / 60 / 0.25);
        box.alpha = t;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      this.overlay.addChild(layer);
    });
  }

  private async startTalk(holder: string, { quest, sub, data }: ReturnType<QuestEngine["available"]>[number]) {
    if (this.busy) return;
    this.busy = true;
    // в разговоре персонаж нарисован крупно на переднем плане — фигуру в городе прячем, чтобы он не двоился
    const figure = this.people[holder]?.[0];
    if (figure) figure.visible = false;
    this.nameTip.visible = false;
    const talk = new Talk(this.rules.texts.buttons.ok || "OK");
    this.overlay.addChild(talk);
    await talk.play(
      data.dialog,
      (a) => this.quests.answerActive(a, quest),
      (a) => this.quests.run(a.actions, quest, sub),
    );
    this.quests.run(data.actions, quest, sub);
    talk.destroy({ children: true });
    this.busy = false;
    this.refresh();
    this.events.saved();
    // после первого разговора — на ферму (town_show_farm_baloon)
    this.tut.show("town_show_farm_baloon", 630, 60);
  }
}
