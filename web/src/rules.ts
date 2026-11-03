// Правила «Фермы Айрис» из xml/ оригинала (выгружает tools/export_mf1.py).
import type { Quest } from "./quests";

export interface Vegetation {
  exp_for_pour?: number;
  price_buy: number;
  price_sell: number;
  life: number;
  hunger_min: number;
  hunger_max: number;
  min_product_delay: number;
  max_product_delay: number;
  /** Сколько плодов собрать до перехода на следующую стадию (-1 — последняя стадия). */
  upgrade: number;
  upgrade_to_vegetation?: string;
  image_offset: [number, number];
  nodes: [number, number][];
  products: string[];
  probabilities: number[];
}

export interface Product {
  price: number;
  exp: number;
  offset: [number, number];
}

export interface Place {
  position: [number, number];
  dimensions: [number, number];
  /** Растение, которое стоит на грядке с начала игры (дерево-идол и ветки в 5-й локации). */
  veg?: string;
  /** Грядка без картинки: игрок на ней ничего не сажает, продаёт и улучшает (дерево-идол и ветки). */
  plain?: boolean;
}

export interface StorageLevel extends Place {
  object: string;
  /** Левый верх препятствия объекта (position — где рисуется картинка). */
  obstacle: [number, number];
  capacity: number;
  price: number;
  /** На сколько пикселей опускается содержимое при пустой ёмкости (progress_height). */
  progress_height: number;
  image_offset: [number, number];
}

export interface BugAnim {
  rows: number;
  time: number;
  loop: boolean;
}

export interface BugDef {
  folder: string;
  attack?: number;
  click_radius?: number;
  obst_radius?: number;
  life?: number;
  speed?: number;
  exp?: number;
  /** Множитель приза (bugs/<вид>/@prize_k, exe поле +0x100). */
  prize_k?: number;
  items: string;
  reincorn: string;
  anims: Record<string, BugAnim>;
}

/** Что отличает ферму и город локации 2–4 от локации 1 (корень rules.json описывает локацию 1). */
export interface LocationRules {
  day_time: number;
  /** Длина дня: первая — day_min, после каждого дня запас растёт на day_inc, не выше day_max. */
  day_min: number;
  day_max: number;
  day_inc: number;
  seeds: string[];
  ridges: Place[];
  ridges_for_sale: Place[];
  water_storage: StorageLevel[];
  product_storage: StorageLevel[];
  well: Rules["well"];
  well_object: Rules["well_object"];
  well_items: Rules["well_items"];
  statues?: Rules["statues"];
  prizes_set?: Rules["prizes_set"];
  auto_bouquet?: Rules["auto_bouquet"];
  prices: { ridge: number; water: number };
  waves: Rules["waves"];
  wave_delays: number[];
  wave_keys: string[];
  wave_loop: number;
  arrive_positions: [number, number][];
  bouquets: string[][];
  bouquet_random: Rules["bouquet_random"];
  shop_positions: Rules["shop_positions"];
  obstacles: Place[];
  quests: Record<string, Quest>;
  holders: Record<string, Place>;
}

export type WellDef = Place & {
  image_offset: [number, number]; pail: Place; delay: number; fill_time: number; water_capacity: number; price: number; pail_height: number;
  /** Картинка колодца (resource.xml root/obstacles/<имя>; у 2–5-й локаций пусто — виден только «ведро»-фонтан). */
  image?: string;
  /** «Ведро»: картинка, вода, маска (root/<ведро>/pail|water|mask) и где оно стоит (game_screen/well_ctrl/<ведро>). */
  pail_images?: string[];
  pail_pos?: [number, number] | null;
};

export interface DroppedItem {
  kind: "exp" | "gold" | "water";
  value: number;
  image: string;
  color: [number, number, number];
  difficults: string[];
}

export interface StatueLevel {
  price: number;
  /** Время покоя и активности: от min до max, с. */
  stand: [number, number];
  active: [number, number];
  offset: [number, number];
  images: { stand: string; active: string; action: string };
  action_time: number;
  /** Параметры эффекта: exp (сова), min/max_damage (Нептун), slow_k, max_activete_time (часы), items (алтарь), bugs (горн). */
  params: Record<string, number | string>;
}

/** Статуя фермы (root/shop/location_N/<вид>): сова, Нептун, алтарь, горн, часы. */
export interface StatueDef {
  position: [number, number];
  dimensions: [number, number];
  levels: StatueLevel[];
}

export interface Rules {
  /** Имена картинок фона фермы, ящиков и города: у локации 1 — bg, box…, у остальных — farm_bg_N и т. д. */
  bg_image: string;
  box_image: string;
  box_content_image: string;
  box_mask_image: string;
  town_bg_image: string;
  /** Номер локации, для которой собраны эти правила. */
  location: number;
  /** Верхние левые углы кнопок «Продать плоды» и «Купить воду» и кнопки колодца (shop_control локации). */
  shop_positions: { sell_prod: [number, number]; buy_water: [number, number]; well: [number, number] } & Partial<Record<string, [number, number]>>;
  /** Статуи фермы по виду (сова, Нептун, алтарь, горн, часы). */
  statues?: Record<string, StatueDef>;
  /** Призы из вредителей фермы (farm/prizes_set): ступени с вероятностью k и призами (пусто — ничего). */
  prizes_set?: { k: number; prizes: string[] }[];
  /** Автосборка букетов: пороги уровней, полоса на экране букетов и её картинки. */
  auto_bouquet?: {
    thresholds: number[]; position: [number, number]; dimensions: [number, number]; complete: string;
    levels: { level_image: string; level_pos: [number, number]; progress_image: string; progress_pos: [number, number] }[];
  } | null;
  /** Награды комнаты трофеев: место, пороги ступеней, число картинок (ступень 0 — пустое место). */
  trophies?: Record<string, { position: [number, number]; dimensions: [number, number]; thresholds: number[]; images: number }>;
  /** Сложность (difficult): множители по именам casual / hardcore. */
  difficulty?: Record<string, { bug_life: number; buy_price: number; sell_price: number; exp_k: number; pour_count: number }>;
  /** Серии ударов (combo_set): с какого удара подряд какой множитель урона. */
  combo_set?: { count: number; damage: number }[];
  /** Призы (root/dropped_items): вид, значение, картинка, цвет надписи, сложности. */
  dropped_items?: Record<string, DroppedItem>;
  locations: Record<string, LocationRules>;
  global_map: Record<string, { position: [number, number]; dimensions: [number, number]; image: string }>;
  start: { gold: number; water: number; vegetations: string[] };
  day_time: number;
  /** Длина дня: первая — day_min, после каждого дня запас растёт на day_inc, не выше day_max. */
  day_min: number;
  day_max: number;
  day_inc: number;
  seeds: string[];
  vegetations: Record<string, Vegetation>;
  products: Record<string, Product>;
  ridges: Place[];
  /** Метки-препятствия (marks_obstacle): картинка встаёт на ферму, пока поставлена метка (дерево-идол: treemark_1…6). */
  marks_obstacle?: { mark: string; position: [number, number]; dimensions: [number, number]; image: string }[];
  obstacles: Place[];
  ridges_for_sale: Place[];
  water_storage: StorageLevel[];
  product_storage: StorageLevel[];
  well: WellDef;
  /** well_object фермы: well / pail — первый колодец, well_N / pail_N — уровень N (exe 0x4f2290, 0x4f2400). */
  well_object: Record<string, string>;
  /** Свойства колодцев по имени (items/wells) с препятствием на ферме. */
  well_items: Record<string, WellDef>;
  prices: { ridge: number; water: number };
  /** Все картинки; при запуске грузятся только core_images, остальное — по локациям (location_images) при первом заходе. */
  images: string[];
  core_images: string[];
  location_images: Record<string, string[]>;
  quests: Record<string, Quest>;
  holders: Record<string, Place>;
  bugs: Record<string, BugDef>;
  /** Волны по порядку: группы вредителей, delay — пауза после группы. */
  waves: { bugs: string[]; delay: number }[][];
  /** Пауза после волны (delay у wave.), отсчитывается, когда группы вышли и на поле нет вредителей. */
  wave_delays: number[];
  /** Ключ волны: играют только волны, чей ключ равен ключу вредителей фермы (set_pests_key, по умолчанию ""). */
  wave_keys: string[];
  /** wave_loop: с какой волны идёт круг после последней. */
  wave_loop: number;
  arrive_positions: [number, number][];
  helper: { attack: number; attack_period: number; attack_range: number; speed: number; radius: number; click_radius: number; hunger_min: number; hunger_max: number; start_skill_prob: number; per_level_skill_prob: number; icon_offset: [number, number] };
  /** Метки, которые игра ставит по дню (set_mark_by_day): shop_barrel — с 5-го дня и т. д. */
  marks_by_day: Record<string, number>;
  weapon_attack: number;
  /** Шаги туториала из properties_ru.xml → tutorial: позиция пузыря и светлая картинка под затемнением. */
  tutorial_steps: Record<string, { pos: [number, number]; alpha: number; pointer: boolean; image: string | null; image_pos: [number, number] }>;
  default_scores: { name: string; days: number; money: number }[];
  audio: string[];
  exp_levels: number[];
  skill_limits: Record<string, number>;
  skills: Record<string, Record<string, number>[]>;
  skill_events: Record<string, ({ value: number } & Record<string, number>)[]>;
  bouquets: string[][];
  /** Случайные букеты bouquet_random_set: цветы-кандидаты и записи по дням (вероятности размеров 3/4/5, веса цветов). */
  /** Размеры букетов: множитель цены и картинка большого кулька со сдвигом (bouquets/size_N). */
  bouquet_sizes?: Record<string, { price_k: number; offset: [number, number]; image: string }>;
  bouquet_random?: { products: string[]; entries: { day: number; sizes: [number, number, number]; weights: Record<string, number> }[] } | null;
  bouquet_price_k: number;
  progresses: Record<string, { image: string; max: number; offset: [number, number] }>;
  strong_heart: number;
  weather: Record<string, { bug_arrive: number; hungry: number; product: number }>;
  texts: {
    title: string;
    /** Окно заданий: заголовок и разделитель тысяч в числах. */
    quest_title?: string;
    tooltips?: Record<string, string>;
    medals?: Record<string, string>;
    medal_header?: string;
    /** Подписи комиксов: 1 — вступление, 2–5 — между локациями, win_var_1/2 — концовки. */
    comics?: Record<string, string>;
    delimiter?: string;
    names: Record<string, string>;
    stats: Record<string, string>;
    warnings: Record<string, string>;
    events: Record<string, string>;
    shop: Record<string, string>;
    desc: Record<string, string>;
    buttons: Record<string, string>;
    shop_buttons: Record<string, string>;
    buy_water: Record<string, string>;
    new_game: Record<string, string>;
    characters: Record<string, string>;
    global_map: Record<string, string>;
    buttons_menu: Record<string, string>;
    bug_names: Record<string, string>;
    skill_names: Record<string, string>;
    skill_characteristics: Record<string, string>;
    skill_desc: Record<string, string>;
    skill_up: Record<string, string>;
    bonus_events: Record<string, string>;
    bouquets_screen: Record<string, string>;
    tutorial: Record<string, string>;
    headers: Record<string, string>;
    options: Record<string, string>;
    game_menu: Record<string, string>;
    pause: Record<string, string>;
    highscores: Record<string, string>;
    /** Игроки: подтверждение удаления и приветствие в главном меню (ru.xml delete_confirmation, main_change_user). */
    users?: Record<string, string>;
  };
}

export async function loadRules(): Promise<Rules> {
  const res = await fetch("data/rules.json");
  const rules = (await res.json()) as Rules;
  Object.assign(rules, { bg_image: "bg", box_image: "box", box_content_image: "box_content", box_mask_image: "box_mask", town_bg_image: "town_bg", location: 1 });
  return rules;
}

const overlays = new Map<string, Rules>();

/** Правила локации n: общие + то, что задано для неё отдельно. Локация 1 — сами правила. */
export function locationRules(base: Rules, n: number): Rules {
  if (n === 1) return base;
  const key = `${n}`;
  let r = overlays.get(key);
  if (!r) {
    r = {
      ...base, ...base.locations[key], location: n,
      bg_image: `farm_bg_${n}`, box_image: `box_${n}`, box_content_image: `box_content_${n}`, box_mask_image: `box_mask_${n}`, town_bg_image: `town_bg_${n}`,
    };
    overlays.set(key, r);
  }
  return r;
}

/** Случайное число между a и b (в XML бывает min > max — берём как есть, порядок не важен). */
export const rand = (a: number, b: number) => Math.min(a, b) + Math.random() * Math.abs(b - a);

/** Подстановка %ключей% и переводы строк «\n» из строк оригинала. */
export function fmt(s: string | undefined, vars: Record<string, string | number> = {}) {
  let out = (s ?? "").replace(/\\n/g, "\n");
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`%${k}%`, String(v));
  return out.trim();
}
