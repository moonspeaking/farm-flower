// Уровни колодца «Цветка Стихий» (exe: магазин колодца 0x4f32e0, покупка 0x4333d0).
import type { Rules } from "./rules";
import type { Game } from "./state";

/** Атрибут well_object для уровня n: well / pail при n = 0, иначе well_n / pail_n (exe 0x4f2290, 0x4f2400). */
export function wellAttr(rules: Rules, kind: "well" | "pail", n: number): string | undefined {
  return rules.well_object?.[n > 0 ? `${kind}_${n}` : kind];
}

/**
 * Предложение магазина колодца (exe 0x4f32e0): n = уровень + флаг, где флаг (0x4f2ea0) — есть метка shop_well
 * (на уровне 0) или shop_well_<уровень+1> и покупка разрешена (+0x82c). Метки shop_well_1…3 игра ставит сама при
 * создании (0x44a0cc), поэтому после первой покупки флаг зависит только от разрешения. Нет атрибута well_n / pail_n —
 * берётся n − 1 (и вызывается 0x4d7130, что он делает с кнопкой — не разобрано).
 * **Допущение**: покупать нечего, когда предлагается тот же колодец, что уже стоит. Если считать, что 0x4d7130 прячет
 * кнопку, во 2–5-й локациях (нет well_1) колодец нельзя было бы купить вовсе, а в 1-й (нет pail_1) — тоже.
 */
export function wellOffer(rules: Rules, g: Pick<Game, "wellLevel" | "wellBuy" | "hasMark">) {
  const flag = (g.wellLevel === 0 ? g.hasMark("shop_well") : true) && g.wellBuy;
  const n = g.wellLevel + (flag ? 1 : 0);
  const name = wellAttr(rules, "well", n) ?? wellAttr(rules, "well", n - 1) ?? "";
  const owned = g.wellLevel > 0 ? wellName(rules, g) : null;
  return { name, n, canBuy: flag && name !== "" && name !== owned };
}

/** Купленный колодец: уровень L — то, что предлагалось на уровне L − 1 (n = L). */
export function wellName(rules: Rules, g: Pick<Game, "wellLevel">) {
  const L = g.wellLevel;
  return wellAttr(rules, "well", L) ?? wellAttr(rules, "well", L - 1) ?? wellAttr(rules, "well", 0) ?? "";
}
