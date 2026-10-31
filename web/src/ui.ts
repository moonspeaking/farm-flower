// Интерфейс на графике и шрифтах «Фермы Айрис» (картинки — public/img, шрифты — public/fonts).
import { Assets, Container, Graphics, NineSliceSprite, Sprite, Texture } from "pixi.js";
import { FontName, PopLabel, PopOptions, rgb } from "./popfont";

export const W = 800;
export const H = 600;

const loaded = new Set<string>();
let sharp = false;

/** Загружает картинки, которых ещё нет (повторный вызов с теми же именами ничего не делает). */
export async function loadImages(names: string[], onProgress?: (fraction: number) => void) {
  const fresh = names.filter((n) => !loaded.has(n));
  if (!fresh.length) return void onProgress?.(1);
  await Assets.load(fresh.map((n) => ({ alias: `img:${n}`, src: `img/${n}.webp` })), onProgress);
  for (const n of fresh) {
    loaded.add(n);
    if (sharp) tex(n).source.scaleMode = "nearest";
  }
}

/** Выгружает картинки из памяти (текстуры уничтожаются); при следующем обращении их нужно загрузить заново. */
export async function unloadImages(names: string[]) {
  const gone = names.filter((n) => loaded.has(n));
  for (const n of gone) loaded.delete(n);
  if (gone.length) await Assets.unload(gone.map((n) => `img:${n}`));
}

/** Все ли картинки уже загружены. */
export const hasImages = (names: string[]) => names.every((n) => loaded.has(n));

/**
 * Оригинал рисует картинки 1:1 с точечной выборкой (линейный фильтр включается только у масштабированных, 0x4e51d0),
 * поэтому остаётся резким; при крупном масштабе экрана берём точечную выборку и мы.
 */
export function setSharp(on: boolean) {
  sharp = on;
  for (const n of loaded) tex(n).source.scaleMode = on ? "nearest" : "linear";
}

export const tex = (name: string) => Texture.from(`img:${name}`);

/** Есть ли такая картинка (в данных квестов встречаются говорящие без портрета, например pirate). */
export const hasImage = (name: string) => Assets.cache.has(`img:${name}`);

export function image(name: string) {
  return new Sprite(tex(name));
}

/** Цвета из button_styles и shop_control properties_ru.xml. */
export const COLOR = {
  normal: rgb(250, 190, 100),
  normalActive: rgb(255, 220, 150),
  small: rgb(170, 170, 255),
  smallActive: rgb(255, 255, 255),
  menu: rgb(255, 255, 100),
  menuActive: rgb(255, 255, 175),
  shop: rgb(176, 140, 64),
  shopActive: rgb(126, 100, 24),
  price: rgb(220, 236, 110),
  disabled: rgb(190, 190, 190),
  black: 0x000000,
  white: 0xffffff,
};

/** Надпись шрифтом оригинала. */
export function pop(text: string, font: FontName, color = COLOR.white, opts: PopOptions = {}) {
  return new PopLabel(font, text, { color, ...opts });
}

function press(c: Container, scale: number, onTap: () => void) {
  c.eventMode = "static";
  c.cursor = "pointer";
  c.on("pointerdown", () => c.scale.set(scale));
  c.on("pointerup", () => c.scale.set(1));
  c.on("pointerupoutside", () => c.scale.set(1));
  c.on("pointertap", (e) => {
    e.stopPropagation();
    c.scale.set(1);
    onTap();
  });
}

export interface ShopButton extends Container {
  setEnabled(on: boolean): void;
}

/**
 * Кнопка магазина оригинала (shop_button_small / medium, 100×60). Малая — две дощечки: цена сверху
 * (palatino, 220;236;110) и действие снизу (shop-стиль, 176;140;64). Средняя — одна дощечка с двумя строками.
 */
export function shopButton(kind: "small" | "medium", top: string, bottom: string | null, onTap: () => void): ShopButton {
  const c = new Container() as ShopButton;
  // средняя дощечка растягивается по ширине под длинное название, рамка не искажается (девятизонная нарезка)
  const bg: Sprite | NineSliceSprite =
    kind === "medium" ? new NineSliceSprite({ texture: tex("shop_medium"), leftWidth: 10, rightWidth: 10, topHeight: 10, bottomHeight: 10 }) : image("shop_small");
  if (bg instanceof Sprite) bg.anchor.set(0.5);
  else {
    bg.x = -bg.width / 2;
    bg.y = -bg.height / 2;
  }
  c.addChild(bg);
  const texts: PopLabel[] = [];
  if (kind === "small") {
    const price = pop(top, "palatino_14", COLOR.price, { align: "center" });
    price.anchor.set(0.5, 0.5);
    price.position.set(0, -12);
    texts.push(price);
    if (bottom) {
      const act = pop(bottom, "palatino_14", COLOR.shop, { align: "center" });
      act.anchor.set(0.5, 0.5);
      act.position.set(0, 13);
      texts.push(act);
    }
  } else {
    const t = pop(top, "palatino_14", COLOR.shop, { align: "center", lineOffset: -4 });
    t.anchor.set(0.5, 0.5);
    // длинные названия («Денежное дерево») — дощечка шире, по центру
    if (bg instanceof NineSliceSprite && t.textWidth > 80) {
      bg.width = t.textWidth + 44;
      bg.x = -bg.width / 2;
    }
    texts.push(t);
  }
  c.addChild(...texts);
  let enabled = true;
  c.setEnabled = (on) => {
    enabled = on;
    bg.texture = tex(on ? `shop_${kind}` : `shop_${kind}_cant`);
    for (const t of texts) t.alpha = on ? 1 : 0.8;
  };
  press(c, 0.95, () => enabled && onTap());
  return c;
}

/** Круглая кнопка меню оригинала (buttons/back 206×198), видна нижняя половина у края экрана. */
export function roundButton(text: string, onTap: () => void, labelY = 32) {
  const c = new Container();
  const bg = image("round_button");
  bg.anchor.set(0.5);
  const t = pop(text, "TC4_16_en", COLOR.white, { align: "center" });
  t.anchor.set(0.5, 0.5);
  t.y = labelY; // подпись начинается в 120 px от верха картинки (back_offset), то есть на y = 10 экрана
  c.addChild(bg, t);
  c.hitArea = { contains: (x: number, y: number) => x * x + y * y < 95 * 95 };
  press(c, 0.96, onTap);
  return c;
}

/**
 * Стили кнопок (button_styles в properties_ru.xml, шрифты — resource.xml «Цветка Стихий»). Шрифты меню и кнопок цветные,
 * поэтому цвет покоя/наведения у них белый или близкий к нему, а при наведении меняется сам шрифт (activeFont).
 */
const STYLES: Record<string, { font: FontName; activeFont?: FontName; color: number; active: number }> = {
  // normal: button-normal, 200;200;200 → 255;255;255
  normal: { font: "button-normal", activeFont: "button-normal-active", color: rgb(200, 200, 200), active: COLOR.white },
  // normal_small: stat_control_fonts_menu-normal-active, 170;170;255 → 255;255;255
  small: { font: "stat_control_fonts_menu-normal-active", color: COLOR.small, active: COLOR.smallActive },
  // menu: Main-normal / Main-normal-active, белым
  menu: { font: "Main-normal", activeFont: "Main-normal-active", color: COLOR.white, active: COLOR.white },
  // menu_small: stat_control_fonts_menu_normal 255;255;0 → stat_control_fonts_menu-normal-active белым
  menuSmall: { font: "stat_control_fonts_menu_normal", activeFont: "stat_control_fonts_menu-normal-active", color: rgb(255, 255, 0), active: COLOR.white },
  // shop: palatino_15
  shop: { font: "palatino_15", color: COLOR.shop, active: COLOR.shopActive },
};
export type ButtonKind = "normal" | "small" | "menu" | "menuSmall" | "shop";

/** Текстовая кнопка оригинала без подложки (button_styles: цвет в покое и при наведении). */
export function textButton(text: string, onTap: () => void, kind: ButtonKind = "normal", maxWidth = 0): PopLabel {
  const s = STYLES[kind];
  let t = pop(text, s.font, s.color, { align: "center" });
  // надпись шире отведённого места — уменьшаем шрифт, чтобы она влезла в рамку
  const k = maxWidth > 0 && t.textWidth > maxWidth ? maxWidth / t.textWidth : 1;
  if (k < 1) {
    t.destroy();
    t = pop(text, s.font, s.color, { align: "center", scale: k });
  }
  t.anchor.set(0.5, 0.5);
  // шрифт наведения — отдельная надпись поверх (в оригинале кнопка рисуется другим растровым шрифтом)
  const hover = s.activeFont ? pop(text, s.activeFont, s.active, { align: "center", scale: k }) : null;
  if (hover) {
    hover.position.set((t.textWidth - hover.textWidth) / 2, (t.textHeight - hover.textHeight) / 2);
    hover.visible = false;
    hover.eventMode = "none";
    t.addChild(hover);
  }
  const glyphs = () => t.children.filter((c) => c !== hover);
  t.on("pointerover", () => {
    if (hover) {
      hover.visible = true;
      for (const c of glyphs()) c.visible = false;
    } else t.setColor(s.active);
  });
  t.on("pointerout", () => {
    if (hover) {
      hover.visible = false;
      for (const c of glyphs()) c.visible = true;
    } else t.setColor(s.color);
  });
  press(t, 0.95, onTap);
  return t;
}

export interface DialogButton {
  text: string;
  value: string;
}

/**
 * Окно на свитке оригинала (message_screen / dialog_roll). Возвращает value нажатой кнопки,
 * или "cancel", если нажали мимо окна.
 */
export function dialog(
  parent: Container,
  opts: {
    title?: string;
    body?: string;
    content?: Container;
    buttons: DialogButton[];
    width?: number;
    /** Сдвиг по горизонтали от центра экрана (на ферме окно по центру поля правее панели). */
    offsetX?: number;
    /** Текст по левому краю (длинный текст без «висящих» слов в центрированных строках); по умолчанию по центру. */
    bodyAlign?: "left" | "center";
    /** Получает функцию закрытия окна — для кнопок внутри content. */
    bind?: (close: (value: string) => void) => void;
    /** Раскладка new_or_continue_game: кнопки столбиком посередине свитка. */
    stack?: boolean;
  },
): Promise<string> {
  return new Promise((resolve) => {
    const layer = new Container();
    const shade = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.4 });
    shade.eventMode = "static";
    layer.addChild(shade);

    // «Цветок Стихий»: свиток dialog_roll 798×531 в натуральную величину по центру экрана (message_screen);
    // текст Dialog2 чёрным с (84; 97) в рамке 630×200, кнопки на двух нарисованных листьях:
    // yes (210; 342) 29×24 — левый лист, no (596; 349) 37×24 / ok (601; 345) 25×24 — правый.
    // stack — окно new_or_continue_game: текст Dialog по центру рамки (177; 107) 400, кнопки столбиком в рамках 130×24 с (310; 140), шаг 35
    const box = new Container();
    box.position.set(Math.round((W - 798) / 2), Math.round((H - 531) / 2));
    box.addChild(image("dialog"));
    const items: Container[] = [];
    let y = opts.stack ? 107 : 97;
    if (opts.title) {
      const t = pop(opts.title, "stat_control_fonts_menu_normal", COLOR.white, { align: "center" });
      t.position.set(399, y - 34);
      items.push(t);
    }
    if (opts.body) {
      const center = opts.stack || opts.bodyAlign === "center";
      const wrap = opts.stack ? 400 : 630;
      const t = pop(opts.body, opts.stack ? "Dialog" : "Dialog2", COLOR.black, { align: center ? "center" : "left", wrap });
      t.position.set(center ? 399 : 84, y);
      y += t.textHeight + 10;
      items.push(t);
    }
    if (opts.content) {
      opts.content.position.set(399, y);
      y += opts.content.height + 10;
      items.push(opts.content);
    }
    box.addChild(...items);

    const finish = (v: string) => {
      layer.destroy({ children: true });
      resolve(v);
    };
    opts.bind?.(finish);
    const n = opts.buttons.length;
    opts.buttons.forEach((b, i) => {
      const btn = textButton(b.text, () => finish(b.value));
      if (opts.stack) btn.position.set(310 + 65, 140 + 12 + i * 35);
      else if (n === 1) btn.position.set(601 + 12, 345 + 12);
      else if (n === 2) btn.position.set(i === 0 ? 210 + 14 : 596 + 18, i === 0 ? 342 + 12 : 349 + 12);
      else btn.position.set(224 + (i * (614 - 224)) / (n - 1), 357);
      box.addChild(btn);
    });
    shade.on("pointertap", () => finish("cancel"));
    layer.addChild(box);
    parent.addChild(layer);
  });
}

/** Всплывающая надпись события (шрифт bonus_events_white: «Нет Воды», «Хранилище Заполнено»). */
export function toast(parent: Container, message: string, x = W / 2, y = 260, scale = 0.62) {
  const t = pop(message, "bonus_events_white", COLOR.white, { align: "center", scale });
  t.anchor.set(0.5, 0.5);
  t.position.set(Math.max(150, Math.min(W - 150, x)), y);
  parent.addChild(t);
  let life = 1.6;
  const tick = () => {
    life -= 1 / 60;
    t.alpha = Math.min(1, life / 0.4);
    t.y -= 0.4;
    if (life <= 0) return void t.destroy({ children: true });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Плавающие очки (шрифт float_points: «+2» у цветка). */
export function floatPoints(parent: Container, value: string, x: number, y: number, color = COLOR.white) {
  const t = pop(value, "float_points", color, { align: "center", scale: 0.7 });
  t.anchor.set(0.5, 0.5);
  t.position.set(x, y);
  parent.addChild(t);
  let life = 1.2;
  const tick = () => {
    life -= 1 / 60;
    t.alpha = Math.min(1, life / 0.4);
    t.y -= 0.6;
    if (life <= 0) return void t.destroy({ children: true });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
