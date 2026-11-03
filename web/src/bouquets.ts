// Цветочный магазин (bouquets_screen): продажа плодов поштучно и «по одному виду», корзина с цветами,
// заказы на букеты — цветы берутся из корзины зажатой кнопкой мыши и переносятся в букет.
import { Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { audio } from "./audio";
import { rgb } from "./popfont";
import { fmt, Rules } from "./rules";
import type { BouquetOrder, Game } from "./state";
import { autoBouquetLevel } from "./autobouquet";
import { COLOR, floatPoints, image, pop, tex, textButton, toast } from "./ui";

/** Ячейки продажи (sell_products/slots «Цветка Стихий»): позиции относительно блока (122; 66). */
const SLOTS_XY: [number, number][] = [[21, 0], [89, 1], [157, 2], [231, 1], [300, 1], [370, 0], [440, 0], [510, 0], [583, 0]];
const BLOCK: [number, number] = [122, 66];

/**
 * Конусы заказов: bouquet_points bp1…bp4 (левый верх конуса) + (44; 53) — центр, от которого считаются цена и место броска
 * (совпадает с центрами первой игры). Места цветов — c3 / c4 / c5 (для букетов из 3, 4, 5 цветов) от левого верха конуса.
 */
const BP: [number, number][] = [[159, 235], [158, 379], [668, 235], [668, 377]];
const CONE_CENTER: [number, number] = [44, 53];
const CONES: [number, number][] = BP.map(([x, y]) => [x + CONE_CENTER[0], y + CONE_CENTER[1]]);
const FLOWER_POINTS: Record<number, [number, number][]> = {
  3: [[17, 38], [68, 30], [44, 58]],
  4: [[44, 18], [10, 39], [85, 37], [44, 58]],
  5: [[10, 39], [45, 20], [85, 37], [30, 60], [60, 60]],
};
/** Корзина: внутренняя область, где лежат цветы. */
const BASKET = new Rectangle(352, 308, 216, 160);
/** Куда можно опустить цветок, чтобы он лёг в корзину (чуть шире самой корзины). */
const BASKET_DROP = new Rectangle(340, 290, 240, 190);

interface Loose {
  product: string;
  sprite: Sprite;
}

export class BouquetScreen extends Container {
  private readonly slots = new Container();
  private readonly basket = new Container();
  private readonly orders = new Container();
  private readonly drag = new Container();
  private loose: Loose[] = [];
  /** slot — откуда взят цветок, если он лежал в букете (а не в корзине). */
  private held: { product: string; sprite: Sprite; from: Sprite; slot?: { oi: number; si: number } } | null = null;
  private time = 0;
  private ghosts: { sprite: Sprite; order: number; slot: number }[] = [];
  /** Подсказки туториала: цветок взят, цветок брошен (удачно или нет), заказ собран. */
  hooks: { picked?: (product: string) => void; dropped?: (ok: boolean) => void; completed?: () => void } = {};

  /** Где (в координатах экрана) лежит в корзине цветок product — для подсказки «возьмите ромашку». */
  flowerSpot(product: string): [number, number] | null {
    const l = this.loose.find((x) => x.product === product);
    if (!l) return null;
    const p = l.sprite.getGlobalPosition();
    return [p.x, p.y];
  }

  /** Куда нужно положить цветок product (пустое место в одном из заказов). */
  targetSpot(product: string): [number, number] | null {
    const g = this.ghosts.find((x) => this.game.bouquets.orders[x.order]?.items[x.slot] === product);
    if (!g) return null;
    const p = g.sprite.getGlobalPosition();
    return [p.x, p.y];
  }

  constructor(
    private readonly rules: Rules,
    private readonly game: Game,
    private readonly onClose: () => void,
  ) {
    super();
    const t = rules.texts;
    // при открытии экрана пустые места заказов заполняются (exe 0x433fc0)
    game.fillOrders();
    this.addChild(image("bq_back"), this.slots, this.orders, this.basket, this.drag);
    this.eventMode = "static";
    this.hitArea = new Rectangle(0, 0, 800, 600);

    // screen_caption (120; 47) 666×50 по центру, stat_control_fonts_menu_normal
    const caption = pop(t.bouquets_screen.flower_shop_caption ?? "Цветочный Магазин", "stat_control_fonts_menu_normal", COLOR.white, { align: "center" });
    caption.position.set(120 + 333, 47);
    this.addChild(caption);
    const back = textButton(t.buttons.back ?? "Назад", () => this.close());
    // exit (405; 525) 100×34, текст по центру
    back.position.set(405 + 50, 525 + 17);
    this.addChild(back);

    this.on("globalpointermove", (e) => this.move(e.global.x, e.global.y));
    this.on("pointerup", (e) => this.drop(e.global.x, e.global.y));
    this.on("pointerupoutside", (e) => this.drop(e.global.x, e.global.y));

    this.buildBasket();
    this.render();
    this.addChild(this.autoBar);
    this.renderAutoBar();
  }

  /** Полоса автосборки (auto_bouquet_level/control): прогресс до следующего уровня и значок уровня; подсказка при наведении. */
  private readonly autoBar = new Container();
  private autoTip: Container | null = null;

  private renderAutoBar() {
    const ab = this.rules.auto_bouquet;
    this.autoBar.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!ab) return;
    const st = autoBouquetLevel(ab.thresholds, this.game.autoSold);
    this.autoBar.position.set(...ab.position);
    if (st.max) {
      if (ab.complete) this.autoBar.addChild(image(ab.complete));
    } else {
      // exe 0x5587a0: картинка прогресса обрезается по доле, round(ширина · доля + 0.5)
      const lv = ab.levels[st.level];
      if (lv?.progress_image) {
        const t = tex(lv.progress_image);
        const w = Math.trunc(t.width * st.frac + 0.5);
        if (w > 0) {
          const bar = new Sprite(new Texture({ source: t.source, frame: new Rectangle(t.frame.x, t.frame.y, Math.min(w, t.width), t.height) }));
          bar.position.set(...lv.progress_pos);
          this.autoBar.addChild(bar);
        }
      }
      if (lv?.level_image) {
        const icon = image(lv.level_image);
        icon.position.set(...lv.level_pos);
        this.autoBar.addChild(icon);
      }
    }
    this.autoBar.eventMode = "static";
    this.autoBar.hitArea = new Rectangle(0, 0, ab.dimensions[0], ab.dimensions[1]);
    this.autoBar.removeAllListeners();
    this.autoBar.on("pointerover", () => this.showAutoTip());
    this.autoBar.on("pointerout", () => {
      this.autoTip?.destroy({ children: true });
      this.autoTip = null;
    });
  }

  /**
   * Подсказка (exe 0x558250): tooltips/auto_bouquet_<уровень> и, пока есть следующий уровень, «нужно продать %count%»
   * (count_1 при 1, count_2 при 2–4, count_less при 5 и больше — русские формы числа).
   */
  private showAutoTip() {
    const ab = this.rules.auto_bouquet;
    if (!ab || this.autoTip) return;
    const tt = this.rules.texts.tooltips ?? {};
    const st = autoBouquetLevel(ab.thresholds, this.game.autoSold);
    const lines = [tt[`auto_bouquet_${st.level}`] ?? ""];
    if (!st.max) {
      const key = st.left === 1 ? "auto_bouquet_count_1" : st.left < 5 ? "auto_bouquet_count_2" : "auto_bouquet_count_less";
      lines.push(fmt(tt[key] ?? "%count%", { count: st.left }));
    }
    const text = lines.map((l) => l.trim()).filter(Boolean).join("\n");
    if (!text) return;
    const label = pop(text, "Dialog", COLOR.white, { wrap: 260 });
    const box = new Container();
    box.addChild(new Graphics().roundRect(-8, -6, label.textWidth + 16, label.textHeight + 12, 6).fill({ color: 0x1d3a12, alpha: 0.92 }), label);
    box.position.set(ab.position[0], ab.position[1] - label.textHeight - 14);
    this.autoTip = box;
    this.addChild(box);
  }

  /**
   * Нажатие на свободное место букета (exe 0x510950). Уровень 1: нужный цветок сам переносится из корзины (0x510b80).
   * Уровень 2: то же, а если перенести не вышло (такого цветка нет) — букет заполняется всем, что есть (0x510da0).
   */
  private autoTap(oi: number, si: number) {
    const ab = this.rules.auto_bouquet;
    if (!ab) return;
    const level = autoBouquetLevel(ab.thresholds, this.game.autoSold).level;
    if (level <= 0) return;
    if (this.autoMove(oi, si)) return this.afterAuto(oi);
    if (level >= 2) {
      const o = this.game.bouquets.orders[oi];
      let moved = false;
      o.items.forEach((_, i) => {
        if (!o.placed[i] && this.autoMove(oi, i)) moved = true;
      });
      if (moved) this.afterAuto(oi);
    }
  }

  /** Перенести нужный месту si цветок из корзины: склад − 1, цветок пропадает из корзины. */
  private autoMove(oi: number, si: number) {
    const o = this.game.bouquets.orders[oi];
    const product = o?.items[si];
    if (!product || o.placed[si] || (this.game.storage.get(product) ?? 0) <= 0) return false;
    this.game.storage.set(product, (this.game.storage.get(product) ?? 0) - 1);
    const idx = this.loose.findIndex((l) => l.product === product);
    if (idx >= 0) this.loose.splice(idx, 1)[0].sprite.destroy();
    o.placed[si] = product;
    return true;
  }

  private afterAuto(oi: number) {
    audio.play("flower_put_");
    this.game.changed();
    const o = this.game.bouquets.orders[oi];
    if (o.placed.every(Boolean)) this.complete(oi, o);
    this.render();
  }

  private close() {
    audio.play("btn_simple_button_activated");
    this.destroy({ children: true });
    this.onClose();
  }

  /** Сортировка видов: по семейству и стадии (ромашка 1, 2, 3, дерево…). */
  private products() {
    return [...this.game.storage.entries()].filter(([, n]) => n > 0).map(([p]) => p).sort();
  }

  // ---------------------------------------------------------------- верхняя полка: продажа

  private render() {
    this.slots.removeChildren().forEach((c) => c.destroy({ children: true }));
    const t = this.rules.texts;
    this.products().slice(0, 9).forEach((product, i) => {
      const n = this.game.storage.get(product) ?? 0;
      const price = this.game.sellPrice(this.rules.products[product]?.price ?? 0);
      const x = BLOCK[0] + SLOTS_XY[i][0];
      const y = BLOCK[1] + SLOTS_XY[i][1];
      const slot = new Container();
      slot.position.set(x, y);
      // price_text (9; 9) 50×20, image (0; 25) 60×50, count_text (0; 75) 80×25 — чёрным шрифтом default_text (Dialog)
      const priceText = pop(fmt(t.shop.price, { price }), "Dialog", COLOR.black);
      priceText.position.set(9, 9);
      const pic = image(product);
      pic.anchor.set(0.5);
      pic.scale.set(Math.min(1, 60 / pic.texture.width, 50 / pic.texture.height));
      pic.position.set(30, 50);
      const count = pop(String(n), "Dialog", COLOR.black, { align: "center" });
      count.position.set(40, 75);
      slot.addChild(priceText, pic, count);
      // sell_all (9; 99) и sell (7; 130), обе 50×19, текст по центру — «Все» над «Один», стиль shop
      const all = textButton(t.shop_buttons.sell_all ?? "Все", () => this.sell(product, n), "shop");
      all.position.set(9 + 25, 99 + 9);
      const one = textButton(t.shop_buttons.sell ?? "Один", () => this.sell(product, 1), "shop");
      one.position.set(7 + 25, 130 + 9);
      slot.addChild(one, all);
      this.slots.addChild(slot);
    });
    this.renderOrders();
  }

  private sell(product: string, n: number) {
    const have = this.game.storage.get(product) ?? 0;
    const k = Math.min(n, have);
    if (!k) return;
    const price = this.game.sellPrice(this.rules.products[product]?.price ?? 0);
    this.game.storage.set(product, have - k);
    this.game.gold += k * price;
    this.game.trophyBook.sold(k * price);
    audio.play(k > 1 ? "sell_all" : "sell_one");
    floatPoints(this, `+${k * price}`, 469, 230, rgb(255, 230, 90));
    // убираем с корзины нужное число цветов
    for (let i = 0; i < k; i++) {
      const idx = this.loose.map((l) => l.product).lastIndexOf(product);
      if (idx >= 0) this.loose.splice(idx, 1)[0].sprite.destroy();
    }
    this.game.changed();
    this.render();
  }

  // ---------------------------------------------------------------- корзина с цветами

  private buildBasket() {
    this.basket.removeChildren().forEach((c) => c.destroy());
    this.loose = [];
    for (const [product, n] of this.game.storage) for (let i = 0; i < n; i++) this.addLoose(product);
  }

  private addLoose(product: string, at?: [number, number]) {
    const s = image(product);
    s.anchor.set(0.5);
    const [x, y] = at ?? [BASKET.x + 20 + Math.random() * (BASKET.width - 40), BASKET.y + 20 + Math.random() * (BASKET.height - 40)];
    s.position.set(x, y);
    s.eventMode = "static";
    s.cursor = "grab";
    s.on("pointerdown", (e) => {
      e.stopPropagation();
      this.pick(product, s, e.global.x, e.global.y);
    });
    // кто лежит ниже, тот рисуется позже
    this.basket.addChild(s);
    this.basket.children.sort((a, b) => a.y - b.y);
    this.loose.push({ product, sprite: s });
  }

  private pick(product: string, from: Sprite, gx: number, gy: number, slot?: { oi: number; si: number }) {
    if (this.held) return;
    audio.play("flower_get");
    if (!slot) this.hooks.picked?.(product);
    const ghost = image(product);
    ghost.anchor.set(0.5);
    ghost.scale.set(1.1);
    this.drag.addChild(ghost);
    from.alpha = 0.25;
    this.held = { product, sprite: ghost, from, slot };
    this.move(gx, gy);
  }

  private move(gx: number, gy: number) {
    if (!this.held) return;
    const p = this.toLocal({ x: gx, y: gy });
    this.held.sprite.position.set(p.x, p.y);
  }

  private drop(gx: number, gy: number) {
    const h = this.held;
    if (!h) return;
    this.held = null;
    const p = this.toLocal({ x: gx, y: gy });
    h.sprite.destroy();
    // конус заказа под курсором и первое свободное место нужного цветка
    const oi = CONES.findIndex(([cx, cy]) => Math.abs(p.x - cx) < 62 && p.y > cy - 70 && p.y < cy + 50);
    const order = oi >= 0 ? this.game.bouquets.orders[oi] : undefined;
    const si = order ? order.items.findIndex((it, i) => it === h.product && !order.placed[i]) : -1;
    if (!h.slot) this.hooks.dropped?.(!!order && si >= 0);
    if (order && si >= 0) {
      // цветок уходит в букет: из корзины или с прежнего места (в том же или другом заказе)
      if (h.slot) this.game.bouquets.orders[h.slot.oi].placed[h.slot.si] = null;
      else {
        const idx = this.loose.findIndex((l) => l.sprite === h.from);
        if (idx >= 0) this.loose.splice(idx, 1)[0].sprite.destroy();
        this.game.storage.set(h.product, Math.max(0, (this.game.storage.get(h.product) ?? 0) - 1));
      }
      order.placed[si] = h.product;
      audio.play("flower_put_");
      this.game.changed();
      if (order.placed.every(Boolean)) this.complete(oi, order);
      this.render();
      return;
    }
    // в корзину — на любое место в её пределах
    if (!order && BASKET_DROP.contains(p.x, p.y)) {
      const at: [number, number] = [Math.min(Math.max(p.x, BASKET.x + 12), BASKET.right - 12), Math.min(Math.max(p.y, BASKET.y + 12), BASKET.bottom - 12)];
      if (h.slot) {
        // снятый с букета цветок возвращается в запасы и ложится туда, где его отпустили
        this.game.bouquets.orders[h.slot.oi].placed[h.slot.si] = null;
        this.game.storage.set(h.product, (this.game.storage.get(h.product) ?? 0) + 1);
        this.addLoose(h.product, at);
        this.game.changed();
        this.render();
      } else {
        h.from.position.set(...at);
        h.from.alpha = 1;
        this.basket.children.sort((a, b) => a.y - b.y);
      }
      audio.play("flower_put_");
      return;
    }
    h.from.alpha = 1;
    // «не нужен» — только для цветка из корзины, брошенного на чужой заказ
    if (order && !h.slot) toast(this, "Этот цветок здесь не нужен", p.x, p.y - 40);
  }

  // ---------------------------------------------------------------- заказы

  private renderOrders() {
    this.orders.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.ghosts = [];
    this.game.bouquets.orders.slice(0, 4).forEach((o, oi) => {
      if (!o.items.length) return; // пустое место: букет не собрался
      const [cx, cy] = CONES[oi];
      const price = this.game.orderPrice(o);
      // цена букета: в «Цветке Стихий» раздел bouquets_shop — шрифт root/font/default (BritannicBold14), цвет 255;255;255
      // (в первой игре этого раздела нет, и там цена чёрная)
      const tag = pop(fmt(this.rules.texts.shop.price, { price }), "BritannicBold14", COLOR.white, { align: "center", scale: 1.1 });
      tag.position.set(cx - 18, cy - 62);
      // букет на 4–5 цветов — в большом кульке big-flowers со сдвигом из bouquets/size_N (exe 0x4d1800)
      const size = this.rules.bouquet_sizes?.[String(o.items.length)];
      if (size?.image) {
        const big = image(size.image);
        big.position.set(BP[oi][0] + size.offset[0], BP[oi][1] + size.offset[1]);
        this.orders.addChild(big);
      }
      o.items.forEach((product, si) => {
        const s = image(o.placed[si] ?? product);
        s.anchor.set(0.5);
        const pts = FLOWER_POINTS[o.items.length] ?? FLOWER_POINTS[3];
        const [px, py] = pts[si] ?? pts[pts.length - 1];
        s.position.set(BP[oi][0] + px, BP[oi][1] + py);
        if (o.placed[si]) {
          // уже стоящий цветок можно снять и переложить: пока букет не собран, он остаётся в заказе
          s.eventMode = "static";
          s.cursor = "grab";
          s.on("pointerdown", (e) => {
            e.stopPropagation();
            this.pick(o.placed[si]!, s, e.global.x, e.global.y, { oi, si });
          });
        } else {
          // место ещё свободно: подсказка — полупрозрачный нужный цветок
          s.alpha = 0.4;
          s.tint = 0xcfe8ff;
          this.ghosts.push({ sprite: s, order: oi, slot: si });
          // автосборка: нажатие на свободное место
          s.eventMode = "static";
          s.on("pointertap", (e) => {
            e.stopPropagation();
            this.autoTap(oi, si);
          });
        }
        this.orders.addChild(s);
      });
      // цена — поверх цветов, чтобы букет её не закрывал
      this.orders.addChild(tag);
    });
  }

  private complete(oi: number, order: BouquetOrder) {
    const price = this.game.orderPrice(order);
    this.game.gold += price;
    this.game.bouquets.done += 1;
    this.game.trophyBook.bouquetSold();
    this.game.trophyBook.sold(price);
    // автосборка: в счёт идут цветы проданного букета (exe 0x434078 — число цветов в нём)
    this.game.autoSold += order.items.length;
    this.renderAutoBar();
    // место освобождается, новый заказ встаёт на него (exe 0x434050)
    this.game.bouquets.orders[oi] = { items: [], placed: [] };
    this.game.fillOrders();
    audio.play("bouquet_submited");
    this.hooks.completed?.();
    const [cx, cy] = CONES[oi];
    floatPoints(this, `+${price}`, cx, cy - 20, rgb(255, 230, 90));
    this.game.changed();
  }

  /** Пока цветок несут, подходящие свободные места в букетах пульсируют. */
  tick(dt: number) {
    this.time += dt;
    for (const g of this.ghosts) {
      const o = this.game.bouquets.orders[g.order];
      const need = o?.items[g.slot];
      const match = !!this.held && this.held.product === need;
      g.sprite.alpha = match ? 0.55 + 0.35 * Math.sin(this.time * 8) : 0.4;
    }
  }

  /** Вызывается фермой каждый кадр, пока экран открыт. */
  update(dt: number) {
    this.tick(dt);
  }
}

export { Graphics };
