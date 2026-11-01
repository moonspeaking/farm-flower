// Призы из вредителей «Цветка Стихий» (root/dropped_items, farm/prizes_set). exe: выбор приза 0x431e40.
import type { DroppedItem } from "./rules";

export type PrizeSet = { k: number; prizes: string[] }[];

/**
 * Какой приз выпадает (exe 0x431e40). Вес ступени — k · множитель вредителя (prize_k, у ступени без призов — просто k);
 * r = rand · сумма весов, ступень — та, в чьём отрезке [накоплено; накоплено + вес) лежит r. force (у вредителя есть
 * гарантированные призы $) — кандидаты все призы всех ступеней. Из кандидатов берётся случайный (rand() % n); приз,
 * чья difficults не пуста и не содержит текущую сложность, выкидывается из кандидатов. null — ничего не выпало.
 */
export function rollPrize(set: PrizeSet, items: Record<string, DroppedItem>, mul: number, force: boolean, difficulty: string,
  random = Math.random): string | null {
  let cand: string[] | null = null;
  if (force) {
    cand = set.flatMap((e) => e.prizes);
  } else {
    const weight = (e: PrizeSet[number]) => (e.prizes.length ? e.k * mul : e.k);
    const total = set.reduce((a, e) => a + weight(e), 0);
    const r = random() * total;
    let acc = 0;
    for (const e of set) {
      const w = weight(e);
      if (acc <= r && r < acc + w) {
        cand = [...e.prizes];
        break;
      }
      acc += w;
    }
  }
  if (!cand) return null;
  while (cand.length) {
    const i = Math.floor(random() * cand.length);
    const name = cand[i];
    const d = items[name]?.difficults ?? [];
    if (d.length && !d.includes(difficulty)) {
      cand.splice(i, 1);
      continue;
    }
    return name;
  }
  return null;
}
