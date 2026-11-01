// Уровни колодца «Цветка Стихий» (exe: магазин колодца 0x4f32e0, покупка 0x4333d0).
import type { Rules } from "./rules";
import type { Game } from "./state";

/** Атрибут well_object для уровня n: well / pail при n = 0, иначе well_n / pail_n (exe 0x4f2290, 0x4f2400). */
export function wellAttr(rules: Rules, kind: "well" | "pail", n: number): string | undefined {
  return rules.well_object?.[n > 0 ? `${kind}_${n}` : kind];
}

/**
 * Предложение магазина колодца. Первый колодец (уровень 0) — базовый well / pail, он покупается как обычный предмет
 * магазина (shop_items/well_00), когда есть метка shop_well. Дальше — улучшения (exe 0x4f32e0): на уровне L магазин
 * предлагает well_object[n], n = L + флаг; флаг (0x4f2ea0) — метка shop_well_<L+1> (shop_well_1…3 игра ставит сама,
 * 0x44a0cc) и разрешение покупки +0x82c (квест enable_buy_well). Ключа well_n нет — это последний уровень (берётся
 * n − 1, кнопка прячется, 0x4d7130). Так в каждой локации три колодца: базовый, well_2, well_3 (у 1-й well_00 → well_02
 * → well_03; well_01 из ключа well_1 не используется — у него нет ни картинки, ни ведра в resource.xml).
 */
export function wellOffer(rules: Rules, g: Pick<Game, "wellLevel" | "wellBuy" | "hasMark">) {
  const L = g.wellLevel;
  if (L === 0) return { name: wellAttr(rules, "well", 0) ?? "", n: 0, canBuy: g.hasMark("shop_well") && g.wellBuy };
  const n = L + 1;
  const name = wellAttr(rules, "well", n);
  if (name) return { name, n, canBuy: g.wellBuy };
  return { name: wellAttr(rules, "well", n - 1) ?? "", n: n - 1, canBuy: false };
}

/** Купленный колодец: уровень 1 — базовый, уровень L ≥ 2 — well_L (то, что предлагалось на уровне L − 1). */
export function wellName(rules: Rules, g: Pick<Game, "wellLevel">) {
  const L = g.wellLevel;
  return (L >= 2 ? wellAttr(rules, "well", L) : undefined) ?? wellAttr(rules, "well", 0) ?? "";
}
