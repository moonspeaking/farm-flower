// Главное меню (main_menu) и вступительный комикс (first_comics).
import { Container, Graphics } from "pixi.js";
import type { PopLabel } from "./popfont";
import { rgb } from "./popfont";
import type { Rules } from "./rules";
import { fmt } from "./rules";
import { COLOR, dialog, H, image, pop, roundButton, textButton, W } from "./ui";

export interface MenuEvents {
  play(fresh: boolean): void;
  hasSave(): boolean;
  options(): void;
  highscores(): void;
  about(): void;
  /** Имя текущего игрока и переход к выбору игрока (main_change_user). */
  userName(): string | null;
  changeUser(): void;
}

/**
 * Кадры комикса в порядке рассказа; каждый — набор прямоугольников (x, y, ширина, высота): врезка с замком заходит на соседний кадр,
 * а нижняя кромка первого кадра ниже разделителя на 265 (она лежит у 300).
 */
const COMICS_PANELS: [number, number, number, number][][] = [
  [[0, 0, 303, 303]],
  [[304, 0, 98, 268], [376, 0, 132, 102]],
  [[402, 102, 398, 166], [508, 0, 292, 102]],
  [[0, 303, 303, 297]],
  [[304, 268, 190, 332]],
  [[494, 268, 306, 332]],
];
/** Пауза между кадрами и длительность появления кадра, с. */
const COMICS_GAP = 1.6;
const COMICS_FADE = 0.7;
/** После последнего кадра: пауза и проявление кнопки, с. */
const COMICS_BUTTON_WAIT = 0.8;
const COMICS_BUTTON_FADE = 0.6;

export class Menu extends Container {
  private readonly overlay = new Container();
  private greeting: PopLabel | null = null;

  constructor(private readonly rules: Rules, private readonly events: MenuEvents) {
    super();
    const t = rules.texts;
    const b = t.buttons_menu;
    this.addChild(image("menu_bg"));
    // логотип main_menu/logotype: data/main_menu/title в (222; -11)
    const title = image("menu_title");
    title.position.set(222, -11);
    this.addChild(title);
    // пункты main_menu на каменной плите: стиль menu (шрифт Main-normal, при наведении Main-normal-active),
    // рамка 250×40, текст по центру, наклон angle = 0.03 рад
    const item = (text: string, x: number, y: number, onTap: () => void) => {
      const l = textButton(text, onTap, "menu", 250 - 18);
      l.position.set(x + 125, y + 20);
      l.rotation = 0.03;
      this.addChild(l);
    };
    item(b.game_adventure || "Кампания", 104, 234, () => void this.adventure());
    item(b.options || "Опции", 106, 273, () => this.events.options());
    item(b.menu_highscores || "Результаты", 117, 308, () => this.events.highscores());
    // на месте «Трофеев» (118; 344) пока «Об игре»: комнаты трофеев ещё нет; «Выход» (118; 383) в браузере не нужен
    item("Об игре", 118, 344, () => this.events.about());
    this.addChild(this.overlay);
  }

  /**
   * «Приветствую, %name%, если это не Вы, нажмите сюда» (main_menu/logoff: рамка 320×72 в (230; 121), текст по центру,
   * шрифт logoff белым, при наведении logoff-active с цветом 175;125;250). Текст в ru.xml уже разбит на три строки.
   */
  refreshUser() {
    this.greeting?.destroy();
    this.greeting = null;
    const name = this.events.userName();
    if (!name) return;
    const text = fmt(this.rules.texts.users?.main_change_user ?? "Приветствую, %name%, если это не Вы, нажмите сюда", { name });
    const l = pop(text, "logoff", COLOR.white, { align: "center" });
    const hover = pop(text, "logoff-active", rgb(175, 125, 250), { align: "center" });
    hover.anchor.set(0, 0);
    hover.visible = false;
    hover.eventMode = "none";
    l.addChild(hover);
    l.anchor.set(0.5, 0.5);
    l.position.set(230 + 160, 121 + 36);
    l.eventMode = "static";
    l.cursor = "pointer";
    const glyphs = () => l.children.filter((c) => c !== hover);
    l.on("pointerover", () => ((hover.visible = true), glyphs().forEach((c) => (c.visible = false))));
    l.on("pointerout", () => ((hover.visible = false), glyphs().forEach((c) => (c.visible = true))));
    l.on("pointertap", () => this.events.changeUser());
    this.greeting = l;
    this.addChildAt(l, this.children.indexOf(this.overlay) >= 0 ? this.children.indexOf(this.overlay) : this.children.length);
  }

  private async adventure() {
    const t = this.rules.texts;
    if (!this.events.hasSave()) return this.comics();
    // new_or_continue_game «Цветка Стихий»: кнопки столбиком — новая игра, продолжить, вернуться (загрузки сохранений в порте нет)
    const r = await dialog(this.overlay, {
      body: fmt(t.new_game.text),
      stack: true,
      buttons: [
        { text: t.buttons_menu.new_game || "Новая Игра", value: "new" },
        { text: t.buttons_menu.continue_game || "Продолжить", value: "continue" },
        { text: t.buttons.return || "Вернуться", value: "cancel" },
      ],
    });
    if (r === "continue") return this.events.play(false);
    if (r !== "new") return;
    const ok = await dialog(this.overlay, {
      body: fmt(t.new_game.confirmation),
      buttons: [{ text: t.buttons.yes || "Да", value: "ok" }, { text: t.buttons.no || "Нет", value: "no" }],
    });
    if (ok === "ok") this.comics();
  }

  /** Комикс о письме слуги — перед началом новой игры. Кадры появляются по очереди; щелчок показывает следующий (или все оставшиеся сразу). */
  private comics() {
    const layer = new Container();
    layer.addChild(new Graphics().rect(0, 0, W, H).fill(0x000000));
    const panels = COMICS_PANELS.map((r, index) => {
      const c = new Container();
      const mask = new Graphics();
      for (const rect of r) mask.rect(...rect);
      mask.fill(0xffffff);
      // у последнего кадра — копия без нарисованной «лужи» кнопки (tools/make_comics_clean.py), пока кнопка не появилась
      c.addChild(image(index === COMICS_PANELS.length - 1 ? "comics_clean" : "comics"));
      c.addChild(mask);
      c.mask = mask;
      c.alpha = 0;
      layer.addChild(c);
      return c;
    });
    const ok = roundButton(this.rules.texts.buttons_menu.continue_game || "Продолжить", () => {
      layer.destroy({ children: true });
      this.events.play(true);
    });
    // first_comics/ok: 612; 517 — кнопка уходит за нижний край
    ok.position.set(612 + 103, 517 + 99);
    // подложка перевёрнута (ободок снизу), подпись остаётся прямой и лежит в видимой части экрана (y ≈ 570);
    // кнопка не «выскакивает», а плавно проявляется сразу в нормальном размере
    ok.children[0].rotation = Math.PI;
    ok.children[1].y = -36;
    ok.children[1].scale.set(1.15); // подпись в оригинале примерно на 15% крупнее и ниже, у нижнего края кнопки
    ok.alpha = 0;
    ok.eventMode = "none"; // кнопка нажимается только после появления подписи
    layer.addChild(ok);
    this.overlay.addChild(layer);

    // показ по очереди: i — сколько кадров уже начали появляться, t — время с начала появления последнего
    let shown = 0;
    let t = COMICS_GAP;
    let last = performance.now();
    const next = () => {
      if (shown >= panels.length) return;
      shown += 1;
      t = 0;
    };
    layer.eventMode = "static";
    layer.on("pointertap", () => {
      // щелчок мимо кнопки: если кадр ещё появляется — сразу весь, иначе следующий
      if (shown > 0 && t < COMICS_FADE) {
        panels[shown - 1].alpha = 1;
        t = COMICS_FADE;
      }
      if (shown >= panels.length) {
        t = Math.max(t, COMICS_FADE + COMICS_BUTTON_WAIT + COMICS_BUTTON_FADE); // кнопку сразу
        return;
      }
      next();
    });
    const tick = () => {
      if (layer.destroyed) return;
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      t += dt;
      if (shown < panels.length && t >= COMICS_GAP) next();
      for (let i = 0; i < shown; i++) panels[i].alpha = i < shown - 1 ? 1 : Math.min(1, t / COMICS_FADE);
      // комикс закончился (последний кадр проявился) — после короткой паузы плавно появляется кнопка, сразу в нормальном размере
      if (shown === panels.length) {
        const k = (t - COMICS_FADE - COMICS_BUTTON_WAIT) / COMICS_BUTTON_FADE;
        ok.alpha = Math.max(0, Math.min(1, k));
        if (k >= 1) ok.eventMode = "static";
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
