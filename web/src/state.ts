// Состояние фермы, опыт и умения Айрис, заказы на букеты; сохранение между запусками.
import { newQuestState, QuestState } from "./quests";
import { Trophies, type TrophyState } from "./trophies";
import { locationRules } from "./rules";
import { currentProfile, saveKey, slotKey } from "./profiles";
import type { ArriverState } from "./bugs";
import type { Rules } from "./rules";

export interface PlantSave {
  name: string;
  /** Потеряно жизни от жажды и от укусов вредителей (жизнь — life из XML, умноженная на умение «фермерство»). */
  thirstLost: number;
  damage: number;
  thirstIn: number;
  thirstTotal: number;
  produceIn: number;
  produceTotal: number;
  harvested: number;
  /** Сколько раз растение полили, когда оно хотело пить (рост по счётчику upgrade). */
  pours?: number;
  products: (string | null)[];
}

export type SkillName = "trade" | "farm" | "attack" | "helper_attack" | "helper_pour" | "helper_product";
export const SKILLS: SkillName[] = ["trade", "farm", "attack", "helper_pour", "helper_product", "helper_attack"];

export interface BouquetOrder {
  items: string[];
  placed: (string | null)[];
}

export type Weather = "normal" | "rain" | "sun";

/** Сколько уровней ёмкости есть у фермы с начала: подряд идущие, стоящие 0 (в локации 2 первый ящик стоит 1500 — его нет). */
export function ownedLevels(levels: { price: number }[]) {
  let n = 0;
  while (n < levels.length && levels[n].price === 0) n++;
  return n;
}

/** То, что у каждой фермы своё: вода, ящики, колодец, плоды, грядки, семена, заказы букетов. */
export interface FarmState {
  water: number;
  barrels: number;
  boxes: number;
  well: boolean;
  /** Уровень колодца (exe поле фермы +0x7f0: 0 — нет, каждая покупка +1) и разрешена ли покупка (+0x82c, enable_buy_well). */
  wellLevel?: number;
  wellBuy?: boolean;
  /** Уровень совы фермы (0 — нет); старые сохранения — теперь statues.owl. */
  owlLevel?: number;
  /** Уровни статуй фермы по виду (сова, Нептун, алтарь, горн, часы), 0 — нет. */
  statues?: Record<string, number>;
  /** Продано цветов в букетах (автосборка, exe поле фермы +0x770+0x20). */
  autoSold?: number;
  storage: Record<string, number>;
  boughtRidges: number[];
  plants: (PlantSave | null)[];
  seeds: string[];
  bouquets: { next: number; orders: BouquetOrder[]; done: number };
  /** Длина текущего дня и запас на следующий (у каждой фермы свои, exe +0x50 и +0x4c). */
  dayCur?: number;
  dayNext?: number;
}

/** Что открыто на карте мира (квесты: enable_town / enable_farm). */
export interface WorldState {
  towns: Record<string, boolean>;
  farms: Record<string, boolean>;
}

interface SaveV3 {
  version: 3;
  day: number;
  gold: number;
  exp: number;
  skills: Record<SkillName, number>;
  kills: Record<string, number>;
  gathered: Record<string, number>;
  attackSpecific: Record<string, number>;
  productSpecific: Record<string, number>;
  tutorial: string[];
  loc: number;
  farms: Record<number, FarmState>;
  weapons?: string[];
  owl?: boolean;
  medals?: Record<string, number>;
  trophies?: Record<string, TrophyState>;
  questStates: Record<number, QuestState>;
  world: WorldState;
  marks?: string[];
  difficulty?: Difficulty;
  items?: Record<string, number>;
  bugItems?: Record<string, number>;
  /** Когда сохранение записано (штамп для строки слота в save_game/load_game; у старых автосейвов нет). */
  savedAt?: number;
}

interface Save {
  version: 2;
  day: number;
  gold: number;
  water: number;
  exp: number;
  skills: Record<SkillName, number>;
  kills: Record<string, number>;
  gathered: Record<string, number>;
  attackSpecific: Record<string, number>;
  productSpecific: Record<string, number>;
  barrels: number;
  boxes: number;
  well: boolean;
  storage: Record<string, number>;
  boughtRidges: number[];
  plants: (PlantSave | null)[];
  seeds: string[];
  quests: QuestState;
  bouquets: { next: number; orders: BouquetOrder[]; done: number };
  tutorial: string[];
}

const KEY = "iris-flower-save-v2";
const KEY3 = "iris-flower-save-v3";
const OPTIONS_KEY = "iris-flower-options";

type Listener = () => void;

/** Сложность игры (exe: difficult, имена casual / hardcore); выбирается при начале новой игры. */
export type Difficulty = "casual" | "hardcore";

export interface Options {
  music: number;
  sound: number;
  cursors: boolean;
  warnings: boolean;
  /** Окно с итогами дня после «Закончить День» (в оригинале его нет). */
  dayStats: boolean;
  /** Звёздочки у счётчиков панели, когда значение меняется. */
  sparkles: boolean;
  /** «Широкий экран»: игра растягивается на всё окно, как в оригинале (картинка при этом искажается); выключено — поля 4:3. */
  wide: boolean;
}

export function loadOptions(): Options {
  const def: Options = { music: 0.5, sound: 0.7, cursors: true, warnings: true, dayStats: false, sparkles: false, wide: false };
  try {
    return { ...def, ...(JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "{}") as Partial<Options>) };
  } catch {
    return def;
  }
}

export function saveOptions(o: Options) {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(o));
  } catch {
    // без хранилища настройки просто не запоминаются
  }
}

export class Game {
  day = 1;
  gold: number;
  water: number;
  exp = 0;
  skills: Record<SkillName, number> = { trade: 0, farm: 0, attack: 0, helper_attack: 0, helper_pour: 0, helper_product: 0 };
  /** Убито вредителей по папке спрайтов (snail, pchela…) и собрано плодов по семейству (romashka…). */
  kills: Record<string, number> = {};
  gathered: Record<string, number> = {};
  /** Уровни «особых» умений: атака по виду вредителя и продуктивность вида растения. */
  attackSpecific: Record<string, number> = {};
  productSpecific: Record<string, number> = {};
  /** Куплено бочек и ящиков: первый уровень в XML стоит 0 и есть с начала игры. */
  barrels = 1;
  boxes = 1;
  /**
   * Длина дня фермы, с (exe: при загрузке +0x4c = +0x50 = min_time; когда день кончается — 0x42f1f0 —
   * следующий день берёт запас, а запас растёт на inc_time, но не выше max_time).
   */
  dayCur: number;
  dayNext: number;
  /** Колодец нужно купить (в магазине он полупрозрачен, пока не куплен). */
  well = false;
  /** Уровень колодца: 0 — не куплен, каждая покупка +1 (exe +0x7f0, 0x4333d0). */
  wellLevel = 0;
  /** Покупка и улучшение колодца разрешены (exe +0x82c, по умолчанию да; квест enable_buy_well). */
  wellBuy = true;
  /** Уровни статуй фермы по виду: 0 — нет, покупка или квест add_<вид> — +1 (у совы exe поле +0x24). */
  statues: Record<string, number> = {};
  /** Продано цветов в букетах на этой ферме — по ним растёт уровень автосборки. */
  autoSold = 0;
  get owlLevel() {
    return this.statues.owl ?? 0;
  }
  set owlLevel(v: number) {
    this.statues.owl = v;
  }
  /** Собранные плоды по имени продукта. */
  storage = new Map<string, number>();
  boughtRidges: number[] = [];
  savedPlants: (PlantSave | null)[] = [];
  /** Что продаётся в магазине семян (квесты могут добавлять и убирать растения). */
  seeds: string[];
  /** Квесты хранятся отдельно для каждой локации (в каждой свои квесты); this.quests — текущей. */
  questStates: Record<number, QuestState> = {};
  /** Состояния ферм остальных локаций (текущей — в самом объекте до switchLocation). */
  farms: Record<number, FarmState> = {};
  world: WorldState = { towns: { location_1: true }, farms: { location_1: true } };
  /** Метки квестов общие для всех локаций (например win, found_parrot ставятся в одних, а проверяются в других). */
  marks: string[] = [];
  /** Предметы квестов (ракушки, дубинки…) и сколько их ещё может выпасть из вредителей — общие для локаций. */
  items: Record<string, number> = {};
  bugItems: Record<string, number> = {};
  /** Оружие из квестов (add_weapon: лопата, меч…), сова на ферме (add_owl), медали дракона для комнаты трофеев. */
  weapons: string[] = [];
  owl = false;
  medals: Record<string, number> = {};
  /** Награды комнаты трофеев: ступень и счётчик к следующей (общие для игрока, exe — в GameHolder). */
  trophies: Record<string, TrophyState> = {};
  /** События наград и показ «Вы получили награду!» (onTrophy ставит игра). */
  readonly trophyBook = new Trophies(this, (name, level) => this.onTrophy?.(name, level));
  onTrophy?: (name: string, level: number) => void;
  /** Волны вредителей по локациям (BugArriver фермы): живут, пока идёт игра, в сохранение не пишутся — как в exe. */
  arrivers: Record<number, ArriverState> = {};
  loc = 1;
  bouquets: { next: number; orders: BouquetOrder[]; done: number } = { next: 0, orders: [], done: 0 };
  tutorial: string[] = [];
  weather: Weather = "normal";
  private listeners: Listener[] = [];

  /** Игрок, чья это игра: сохраняется только в его запись, даже если в меню выбрали другого. */
  readonly profile = currentProfile()?.id ?? "0";

  constructor(readonly base: Rules) {
    this.gold = base.start.gold;
    this.water = base.start.water;
    this.seeds = [...base.seeds];
    this.dayCur = this.dayNext = base.day_min ?? base.day_time;
    this.questStates[1] = newQuestState(base.quests);
    this.fillOrders();
  }

  /** Правила текущей локации. */
  get rules(): Rules {
    return locationRules(this.base, this.loc);
  }

  get quests(): QuestState {
    return (this.questStates[this.loc] ??= newQuestState(this.rules.quests));
  }

  set quests(v: QuestState) {
    this.questStates[this.loc] = v;
  }

  private snapshot(plants = this.savedPlants): FarmState {
    return {
      water: this.water, barrels: this.barrels, boxes: this.boxes, well: this.well, storage: Object.fromEntries(this.storage),
      boughtRidges: this.boughtRidges, plants, seeds: this.seeds, bouquets: this.bouquets,
      dayCur: this.dayCur, dayNext: this.dayNext, wellLevel: this.wellLevel, wellBuy: this.wellBuy, statues: { ...this.statues }, autoSold: this.autoSold,
    };
  }

  private restore(f: FarmState) {
    this.water = f.water;
    this.barrels = f.barrels;
    this.boxes = f.boxes;
    this.well = f.well;
    // старые сохранения: колодец куплен — первый уровень
    this.wellLevel = f.wellLevel ?? (f.well ? 1 : 0);
    this.wellBuy = f.wellBuy ?? true;
    this.autoSold = f.autoSold ?? 0;
    this.statues = { ...(f.statues ?? {}), ...(f.owlLevel && !f.statues?.owl ? { owl: f.owlLevel } : {}) };
    this.storage = new Map(Object.entries(f.storage));
    this.boughtRidges = f.boughtRidges;
    this.savedPlants = f.plants;
    this.seeds = f.seeds;
    this.bouquets = f.bouquets;
    const first = this.rules.day_min ?? this.rules.day_time;
    this.dayCur = f.dayCur ?? first;
    this.dayNext = f.dayNext ?? first;
  }

  /** Конец дня: следующий день берёт запас, запас растёт (exe 0x42f1f0). */
  advanceDayLength() {
    const r = this.rules;
    this.dayCur = this.dayNext;
    this.dayNext += r.day_inc ?? 0;
    if (this.dayNext > (r.day_max ?? r.day_time)) this.dayNext = r.day_max ?? r.day_time;
  }

  /** Переход в локацию n: состояние текущей фермы откладывается, подгружается состояние n (или начальное). */
  switchLocation(n: number) {
    if (n === this.loc) return;
    this.farms[this.loc] = this.snapshot();
    this.loc = n;
    const rules = this.rules;
    this.restore(
      this.farms[n] ?? {
        water: this.base.start.water, barrels: ownedLevels(rules.water_storage), boxes: ownedLevels(rules.product_storage), well: false, storage: {}, boughtRidges: [], plants: [],
        seeds: [...rules.seeds], bouquets: { next: 0, orders: [], done: 0 },
      },
    );
    this.fillOrders();
    this.changed();
  }

  /** Подписка на изменения; возвращает функцию отписки (уничтоженная ферма или город не должны получать события). */
  onChange(fn: Listener) {
    this.listeners.push(fn);
    return () => void (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  changed() {
    for (const fn of this.listeners) fn();
  }

  /**
   * Каждая бочка и каждый ящик — отдельный объект, их capacity складываются: покупка уровня прибавляет его вместимость
   * (exe: 0x4445d0 → 0x40f490 для воды, 0x433490 → 0x40f470 для склада). Ферма 1: 8 → 18 → 30 литров, 15 → 35 → 60 плодов.
   */
  get waterMax() {
    return this.rules.water_storage.slice(0, this.barrels).reduce((a, l) => a + l.capacity, 0);
  }

  get storageMax() {
    return this.rules.product_storage.slice(0, this.boxes).reduce((a, l) => a + l.capacity, 0);
  }

  storageCount() {
    let n = 0;
    for (const v of this.storage.values()) n += v;
    return n;
  }

  /** Сколько растений name стоит на грядках текущей фермы (ветка третьей стадии — предмет квеста); задаёт ферма при показе. */
  countPlants: (name: string) => number = () => 0;

  /** Сложность: при выборе (exe 0x44b2e0) снимается метка старой и ставится метка новой — casual / hardcore. */
  difficulty: Difficulty = "casual";

  /** Множители выбранной сложности (difficult в properties.xml). */
  get difficultyRules() {
    return this.rules.difficulty?.[this.difficulty] ?? { bug_life: 1, buy_price: 1, sell_price: 1, exp_k: 1, pour_count: 1 };
  }

  /** Порог опыта уровня: exp_levels × exp_k (exe 0x428070, результат — целое отбрасыванием дробной части). */
  private levelThreshold(i: number) {
    return Math.trunc(this.rules.exp_levels[i] * this.difficultyRules.exp_k);
  }

  /** Метка: поставлена квестом или днём (set_mark_by_day). */
  hasMark(name: string) {
    const day = this.rules.marks_by_day[name];
    if (name === "casual" || name === "hardcore") return this.difficulty === name;
    return this.marks.includes(name) || (day !== undefined && this.day >= day);
  }

  // ---------------------------------------------------------------- опыт и умения

  /** Уровень Айрис: exp_levels из skills.xml — пороги опыта для уровней 2, 3… */
  get level() {
    let l = 1;
    for (let i = 0; i < this.rules.exp_levels.length; i++) if (this.exp >= this.levelThreshold(i)) l++;
    return l;
  }

  /** Опыт на текущем уровне: [накоплено, нужно до следующего]. */
  get levelProgress(): [number, number] {
    const last = this.rules.exp_levels.length - 1;
    const i = this.level - 1;
    const from = i === 0 ? 0 : this.levelThreshold(i - 1);
    const to = this.levelThreshold(Math.min(i, last));
    return [Math.min(this.exp, to) - from, Math.max(1, to - from)];
  }

  get skillPoints() {
    const spent = Object.values(this.skills).reduce((a, b) => a + b, 0);
    return Math.max(0, this.level - 1 - spent);
  }

  /** Сумма добавок key по взятым уровням умения; не больше предела из skill_limits. */
  bonus(skill: SkillName, key: string) {
    const levels = this.rules.skills[skill] ?? [];
    let sum = 0;
    for (let i = 0; i < Math.min(this.skills[skill], levels.length); i++) sum += levels[i][key] ?? 0;
    return Math.min(sum, this.rules.skill_limits[key] ?? Infinity);
  }

  /** Возвращает, сколько уровней набрано. */
  addExp(n: number) {
    const before = this.level;
    this.exp += n;
    this.changed();
    return this.level - before;
  }

  /** Прибавка к скорости плодоношения вида: каждый уровень особого умения даёт new_product_specific. */
  productSpecificBonus(fam: string) {
    const levels = this.rules.skill_events.gather_product ?? [];
    let sum = 0;
    for (let i = 0; i < Math.min(this.productSpecific[fam] ?? 0, levels.length); i++) sum += levels[i].new_product_specific ?? 0;
    return Math.min(sum, this.rules.skill_limits.new_product_specific ?? Infinity);
  }

  /** Прибавка к атаке против вида вредителя (attack_specific за каждый уровень особого умения). */
  attackSpecificBonus(folder: string) {
    const levels = this.rules.skill_events.kill_bugs_specific ?? [];
    let sum = 0;
    for (let i = 0; i < Math.min(this.attackSpecific[folder] ?? 0, levels.length); i++) sum += levels[i].attack_specific ?? 0;
    return Math.min(sum, this.rules.skill_limits.attack_specific ?? Infinity);
  }

  /** Цена продажи с умением «торговля» (sell_goods) и покупки (buy_goods). */
  sellPrice(base: number) {
    // exe 0x4b6058: цена × умение × sell_price сложности + 0,5, целая часть
    return Math.floor(base * (1 + this.bonus("trade", "sell_goods")) * this.difficultyRules.sell_price + 0.5);
  }

  buyPrice(base: number) {
    // бесплатное (сова первого уровня, price="0") остаётся бесплатным
    if (base <= 0) return 0;
    // exe 0x4b5fb8: цена × умение × buy_price сложности + 0,5, целая часть
    return Math.max(1, Math.floor(base * (1 - this.bonus("trade", "buy_goods")) * this.difficultyRules.buy_price + 0.5));
  }

  // ---------------------------------------------------------------- заказы на букеты

  /**
   * Заказы — 4 места (exe 0x433fc0 при открытии экрана букетов заполняет пустые, 0x434050 — место проданного).
   * Место остаётся пустым (items = []), если букет не собрался: нет нужных цветов на складе.
   */
  fillOrders() {
    const b = this.bouquets;
    while (b.orders.length < 4) b.orders.push({ items: [], placed: [] });
    for (let i = 0; i < 4; i++) {
      if (b.orders[i].items.length) continue;
      const items = this.nextOrderItems();
      if (!items) continue;
      b.orders[i] = { items, placed: items.map(() => null) };
    }
  }

  /**
   * Место проданного заказа (exe 0x434050 → 0x434270): новый заказ ставится, только если он собрался; иначе в exe место
   * не трогают — проданный букет остаётся в нём тем же рецептом, цветы с него снимаются. Пустого конуса не бывает.
   */
  replaceSold(oi: number) {
    const b = this.bouquets;
    const old = b.orders[oi];
    b.orders[oi] = { items: old.items, placed: old.items.map(() => null) };
    const items = this.nextOrderItems();
    if (items) b.orders[oi] = { items, placed: items.map(() => null) };
  }

  /**
   * Следующий заказ (exe 0x434270): сначала bouquet_set по порядку; когда он кончился — случайный букет, а если тот не
   * собрался (или случайных нет) — номер в bouquet_set становится половиной длины списка и заказ берётся оттуда.
   */
  private nextOrderItems(): string[] | null {
    const b = this.bouquets;
    const fixed = this.rules.bouquets ?? [];
    if (b.next >= fixed.length) {
      const items = this.rules.bouquet_random?.entries.length ? this.randomBouquet() : null;
      if (items) return items;
      b.next = fixed.length >> 1;
    }
    if (!fixed.length) return null;
    return [...fixed[b.next++]];
  }

  /**
   * Случайный букет (exe 0x434580). Кандидаты — цветы products, которые сейчас есть на складе. Запись — последняя с day
   * не больше текущего дня. Размер: r = rand · (p3 + p4 + p5); r ≤ p3 — 3 цветка, r ≤ p3 + p4 — 4, иначе 5.
   * Каждый цветок — по весам p_<цветок> среди кандидатов; если кандидатов нет, букет не собирается.
   */
  private randomBouquet(): string[] | null {
    const rs = this.rules.bouquet_random!;
    const avail = new Set(rs.products.filter((p) => (this.storage.get(p) ?? 0) > 0));
    let cur: (typeof rs.entries)[number] | undefined;
    for (const e of rs.entries) {
      if (e.day > this.day) break;
      cur = e;
    }
    if (!cur) return null;
    const [p3, p4, p5] = cur.sizes;
    const r = Math.random() * (p3 + p4 + p5);
    const size = r <= p3 ? 3 : r <= p3 + p4 ? 4 : 5;
    const weights = Object.entries(cur.weights).filter(([p]) => avail.has(p));
    const total = weights.reduce((a, [, w]) => a + w, 0);
    const out: string[] = [];
    for (let i = 0; i < size; i++) {
      let x = Math.random() * total;
      const hit = weights.find(([, w]) => (x <= w ? true : ((x -= w), false)));
      if (!hit) return null;
      out.push(hit[0]);
    }
    return out;
  }

  orderPrice(o: BouquetOrder) {
    const sum = o.items.reduce((a, p) => a + (this.rules.products[p]?.price ?? 0), 0);
    // exe 0x4d1d5d: цена букета ещё умножается на price_k его размера (4 цветка — 1.15, 5 — 1.25)
    const k = this.rules.bouquet_sizes?.[String(o.items.length)]?.price_k ?? 1;
    return this.sellPrice(sum * this.rules.bouquet_price_k * k);
  }

  // ---------------------------------------------------------------- сохранение

  /**
   * Автосохранение (slot = null — exe поле фермы /slots.dat, пишется само) или ручной слот 1…SAVE_SLOTS
   * (save_game, exe класс SavedSlots). Список слотов читает Game.slotInfo.
   */
  save(plants: (PlantSave | null)[], slot: number | null = null) {
    this.savedPlants = plants;
    const data: SaveV3 = {
      version: 3, day: this.day, gold: this.gold, exp: this.exp, skills: this.skills,
      kills: this.kills, gathered: this.gathered, attackSpecific: this.attackSpecific, productSpecific: this.productSpecific,
      tutorial: this.tutorial, loc: this.loc, farms: { ...this.farms, [this.loc]: this.snapshot(plants) },
      questStates: this.questStates, world: this.world, marks: this.marks, items: this.items, bugItems: this.bugItems,
      weapons: this.weapons, owl: this.owl, medals: this.medals, trophies: this.trophies, difficulty: this.difficulty,
      savedAt: Date.now(),
    };
    try {
      const key = slot === null ? saveKey(KEY3, this.profile) : slotKey(KEY3, this.profile, slot);
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      // без хранилища (приватный режим) игра просто не сохраняется
    }
  }

  /** Есть ли сохранение у текущего игрока. */
  static hasSave() {
    const id = currentProfile()?.id;
    if (!id) return false;
    try {
      return !!(localStorage.getItem(saveKey(KEY3, id)) ?? localStorage.getItem(saveKey(KEY, id)));
    } catch {
      return false;
    }
  }

  /** Строка слота для списка (save_game/load_game): день, сложность и время записи; null — слот пуст. */
  static slotInfo(slot: number | null): { day: number; difficulty: Difficulty; at: number } | null {
    const id = currentProfile()?.id;
    if (!id) return null;
    try {
      const raw = slot === null ? localStorage.getItem(saveKey(KEY3, id)) : localStorage.getItem(slotKey(KEY3, id, slot));
      if (!raw) return null;
      const s = JSON.parse(raw) as SaveV3;
      if (s.version !== 3) return null;
      return { day: s.day, difficulty: s.difficulty ?? "casual", at: s.savedAt ?? 0 };
    } catch {
      return null;
    }
  }

  load(slot: number | null = null): boolean {
    try {
      const raw3 = slot === null ? localStorage.getItem(saveKey(KEY3, this.profile)) : localStorage.getItem(slotKey(KEY3, this.profile, slot));
      if (raw3) {
        const s = JSON.parse(raw3) as SaveV3;
        if (s.version !== 3) return false;
        Object.assign(this, {
          day: s.day, gold: s.gold, exp: s.exp, skills: s.skills, kills: s.kills, gathered: s.gathered,
          attackSpecific: s.attackSpecific, productSpecific: s.productSpecific, tutorial: s.tutorial,
          questStates: s.questStates, world: s.world, farms: s.farms, loc: s.loc, marks: s.marks ?? [], items: s.items ?? {}, bugItems: s.bugItems ?? {},
          weapons: s.weapons ?? [], owl: !!s.owl, medals: s.medals ?? {}, trophies: s.trophies ?? {}, difficulty: s.difficulty ?? "casual",
        });
        this.mergeOldMarks();
        this.restore(s.farms[s.loc]);
        // сохранения до уровней совы: add_owl ставил только флаг owl — сова первой фермы первого уровня
        if (this.owl && !s.farms[1]?.owlLevel && this.loc === 1) this.owlLevel = Math.max(this.owlLevel, 1);
        this.fillOrders();
        return true;
      }
      if (slot !== null) return false; // в ручных слотах сохранений старого формата нет
      // сохранение первой версии (одна ферма)
      const raw = localStorage.getItem(saveKey(KEY, this.profile));
      const s = raw ? (JSON.parse(raw) as Save) : null;
      if (s?.version !== 2) return false;
      Object.assign(this, {
        day: s.day, gold: s.gold, water: s.water, exp: s.exp, skills: s.skills, kills: s.kills, gathered: s.gathered,
        attackSpecific: s.attackSpecific, productSpecific: s.productSpecific, barrels: s.barrels, boxes: s.boxes, well: !!s.well,
        boughtRidges: s.boughtRidges, savedPlants: s.plants, seeds: s.seeds, bouquets: s.bouquets, tutorial: s.tutorial,
        loc: 1, questStates: { 1: s.quests }, marks: [], items: {}, bugItems: {},
      });
      this.mergeOldMarks();
      this.storage = new Map(Object.entries(s.storage));
      this.fillOrders();
      return true;
    } catch {
      return false;
    }
  }

  /** Метки из старых сохранений лежали в состоянии квестов каждой локации. */
  private mergeOldMarks() {
    for (const q of Object.values(this.questStates)) {
      for (const m of q.marks ?? []) if (!this.marks.includes(m)) this.marks.push(m);
      for (const [k, v] of Object.entries(q.items ?? {})) this.items[k] = Math.max(this.items[k] ?? 0, v);
      for (const [k, v] of Object.entries(q.bugItems ?? {})) this.bugItems[k] = Math.max(this.bugItems[k] ?? 0, v);
      delete q.marks;
      delete q.items;
      delete q.bugItems;
    }
  }

  /** Новая игра текущего игрока: его сохранение стирается. */
  static clearSave() {
    const id = currentProfile()?.id;
    if (!id) return;
    try {
      localStorage.removeItem(saveKey(KEY, id));
      localStorage.removeItem(saveKey(KEY3, id));
    } catch {
      // нечего удалять
    }
  }
}
