// Комната трофеев «Цветка Стихий» (trophy_room_screen/medals). exe: медали 0x506270…0x50af30 — у каждой ступень,
// счётчик и пороги; награда выдаётся (0x44b040), когда счётчик дошёл до порога текущей ступени, и счётчик обнуляется,
// так что пороги идут подряд (150 букетов, потом ещё 200, потом ещё 600).
import type { Game } from "./state";

export interface TrophyState {
  level: number;
  count: number;
}

/** Награды, у которых в данных нет порогов: ступень ставится событием (прохождение, место в таблице, квест). */
const MANUAL = new Set(["dragon_medal", "game_complete", "game_win"]);

export class Trophies {
  /** События одного дня: засохло / съедено растение, лишний клик, быстрые действия, выручка (exe: обнуляются к новому дню). */
  private day = { dry: false, eaten: false, miss: false, plants: false, fast: 0, trade: 0 };

  constructor(private readonly game: Game, private readonly awarded: (name: string, level: number) => void) {}

  private st(name: string): TrophyState {
    return (this.game.trophies[name] ??= { level: 0, count: 0 });
  }

  private thresholds(name: string) {
    return this.game.base.trophies?.[name]?.thresholds ?? [];
  }

  /** Счётчик + n; дошёл до порога ступени — награда, счётчик 0 (0x506700). */
  private add(name: string, n = 1, check = true) {
    const t = this.thresholds(name);
    const s = this.st(name);
    if (s.level >= t.length) return;
    s.count += n;
    if (check) this.check(name);
  }

  private check(name: string) {
    const t = this.thresholds(name);
    const s = this.st(name);
    if (s.level < t.length && s.count >= t[s.level]) {
      s.count = 0;
      this.award(name, s.level + 1);
    }
  }

  /** Ступень награды (не ниже уже полученной). */
  award(name: string, level: number) {
    const s = this.st(name);
    if (level <= s.level) return;
    s.level = level;
    this.awarded(name, level);
  }

  // ---------------------------------------------------------------- события игры

  /** Продан букет (bouqet_medal: 150 / 200 / 600). */
  bouquetSold() {
    this.add("bouqet_medal");
  }

  /** Убит вредитель (bug_kill: 300 / 800 / 1500; проверка — в конце дня, 0x507120). */
  bugKilled() {
    this.add("bug_kill", 1, false);
  }

  /** Растение погибло: засохло (dont_die_vegetation) или съедено (dont_hit_vegetation) — серия дней обрывается. */
  plantDied(reason: "thirst" | "eaten") {
    if (reason === "thirst") {
      this.day.dry = true;
      this.st("dont_die_vegetation").count = 0;
    } else {
      this.day.eaten = true;
      this.st("dont_hit_vegetation").count = 0;
    }
  }

  /** Быстрое или мгновенное действие (fast_reaction: 30 / 60 / 100 за день). */
  fastAction() {
    this.day.fast += 1;
  }

  /** Собран плод (gather_product: 500 плодов 1-й ступени, затем 600 — 2-й, 700 — 3-й; ступень — цифра в имени плода). */
  gathered(product: string) {
    const s = this.st("gather_product");
    if (product.endsWith(`_${s.level + 1}`)) this.add("gather_product", 1, false);
  }

  /** Выручка за плоды (trade_medal: 5 000 / 8 000 / 9 000 монет за день, проверяется сразу, 0x50ae20). */
  sold(money: number) {
    const t = this.thresholds("trade_medal");
    const s = this.st("trade_medal");
    this.day.trade += money;
    if (s.level < t.length && this.day.trade >= t[s.level]) {
      this.day.trade = 0;
      this.award("trade_medal", s.level + 1);
    }
  }

  /** Нажатие на ферме мимо всего (target_clicks: 5 дней без лишних кликов). */
  missClick() {
    this.day.miss = true;
    this.st("target_clicks").count = 0;
  }

  /** Начало дня: на ферме есть растения — дни заботы засчитываются. */
  dayStarted(plants: number) {
    this.day = { dry: false, eaten: false, miss: false, plants: plants > 0, fast: 0, trade: 0 };
  }

  /** Конец дня (0x507a50, 0x5083d0, 0x509090, 0x509ae0, 0x50a520, 0x507120). */
  dayEnded() {
    if (this.day.plants) {
      if (!this.day.dry) this.add("dont_die_vegetation");
      if (!this.day.eaten) this.add("dont_hit_vegetation");
    }
    if (!this.day.miss) this.add("target_clicks");
    const ft = this.thresholds("fast_reaction");
    const fs = this.st("fast_reaction");
    if (fs.level < ft.length && this.day.fast >= ft[fs.level]) this.award("fast_reaction", fs.level + 1);
    this.check("bug_kill");
    this.check("gather_product");
    this.day.fast = 0;
    this.day.trade = 0;
  }

  /** Место в таблице рекордов (game_complete: 3-е — 1, 2-е — 2, 1-е — 3). */
  place(place: number) {
    if (place >= 1 && place <= 3) this.award("game_complete", 4 - place);
  }

  static manual(name: string) {
    return MANUAL.has(name);
  }
}
