// Движок квестов «Фермы Айрис»: условия и действия из xml/locations/location_1_quests.xml.
import type { Game } from "./state";

export interface Cond {
  type: string;
  [k: string]: string;
}

export type Action = Cond;

export interface DialogNode {
  kind: "phrase" | "question";
  talker: string;
  text: string;
  answers?: Answer[];
}

export interface Answer {
  text: string;
  active_if: Cond[];
  dialog: DialogNode[];
  actions: Action[];
}

export interface SubQuest {
  holder: string;
  header: string;
  dialog: DialogNode[];
  actions: Action[];
}

export interface Quest {
  header: string;
  enabled_sub_quests: string[];
  enable_condition: Cond[];
  sub_quests: Record<string, SubQuest>;
}

/** Сохраняемое состояние квестов. */
export interface QuestState {
  enabled: Record<string, string[]>;
  status: Record<string, string>;
  /** Устарело: метки теперь общие для всех локаций (Game.marks); поле нужно старым сохранениям. */
  marks?: string[];
  /** day_delay: день, когда условие впервые стало выполнимым. */
  delays: Record<string, number>;
  /** Записи об открытии городов, ферм и т. п. (устаревшее поле старых сохранений). */
  unlocks: string[];
  /** Предметы квестов (не плоды и не деньги): ракушки улиток и т. п. */
  /** Устарело: предметы квестов теперь общие (Game.items) — их приносят из одной локации в другую. */
  items?: Record<string, number>;
  /** enable_bug_item: сколько ещё предметов может выпасть из вредителей. */
  bugItems?: Record<string, number>;
  /** disable_bug_wave: названия вредителей, которые пока не появляются (enable_bug_wave возвращает их). */
  bugsOff?: string[];
  /** enable_helper: Робин живёт на ферме. */
  helper?: boolean;
  /** enable_buy_water: можно ли покупать воду (по умолчанию да). */
  waterBuy?: boolean;
  /** enable_manual_work: могут ли игрок поливать и собирать плоды сам (false — работает только Робин; экзамен в 3-й локации). */
  manualWork?: boolean;
  /** set_max_barrels / set_max_boxes: сколько уровней бочек и ящиков можно докупить (до этого числа включительно). */
  maxBarrels?: number;
  maxBoxes?: number;
  /** set_ridges: сколько грядок из начальных остаётся (installed) и сколько всего можно докупить (installed + not_installed). */
  ridgeCap?: number;
  saleCap?: number;
  /**
   * Журнал заданий (экран квестов): add_quest заводит запись «локация/квест» у персонажа, add_task / add_task_count —
   * строки заданий, remove_quest / remove_all_task их убирают. На ход квестов журнал не влияет (exe 0x482a6e…0x4837bb).
   */
  journal?: Record<string, JournalEntry>;
  /** set_pests_key: играют только волны с этим ключом (exe 0x480d7b, выбор волны 0x41c400); по умолчанию "". */
  pestsKey?: string;
  /** store_state: снимок фермы перед испытанием (exe 0x47ef60), restore_state возвращает его (0x47f9e0). */
  stored?: StoredState;
}

export interface JournalEntry {
  person: string;
  location: string;
  quest: string;
  /** item = "talk" — «поговорить»; иначе принести count штук item (прогресс — сколько их есть). */
  tasks: { item: string; count?: number }[];
  /** update_quest_title: заголовок берётся у этой части квеста. */
  titleFrom?: string;
}

/** Что сохраняет store_state: деньги, вода и уровни хранилищ, колодец, грядки, открытые города и фермы. */
export interface StoredState {
  gold: number;
  water: number;
  barrels: number;
  boxes: number;
  well: boolean;
  wellLevel: number;
  owlLevel?: number;
  statues?: Record<string, number>;
  boughtRidges: number[];
  /** Ключ вредителей, Робин и ограничения магазина, которые меняют квесты этапов (exe: снимок шире, 0x47ef60). */
  limits?: Pick<QuestState, "pestsKey" | "ridgeCap" | "saleCap" | "maxBarrels" | "maxBoxes" | "waterBuy" | "manualWork" | "helper"> & { wellBuy: boolean };
  world: { towns: Record<string, boolean>; farms: Record<string, boolean> };
}

export function newQuestState(quests: Record<string, Quest>): QuestState {
  return {
    enabled: Object.fromEntries(Object.entries(quests).map(([k, q]) => [k, [...q.enabled_sub_quests]])),
    status: {}, delays: {}, unlocks: [],
  };
}

export interface QuestHooks {
  /** Убрать все растения с грядок (remove_all_vegetations). */
  removeAllVegetations(): void;
  /** add_vegetation: посадить растение name на свободную грядку (false — места нет или такого растения нет). */
  addVegetation(name: string): boolean;
  /** remove_vegetation: убрать с грядок все растения name. */
  removeVegetation(name: string): void;
  /** Поставлена метка (set_mark): win — конец основной игры, показывается подсказка game_fin. */
  marked(mark: string): void;
  /** have_empty_ridge: есть ли свободная грядка. */
  hasEmptyRidge(): boolean;
  /** Номер текущей локации (для add_quest / add_task без атрибута location). */
  location(): number;
}

export class QuestEngine {
  constructor(
    readonly quests: Record<string, Quest>,
    private readonly game: Game,
    private readonly hooks: QuestHooks,
  ) {}

  private get st() {
    return this.game.quests;
  }

  // ---------------------------------------------------------------- условия

  private count(name: string) {
    if (name === "money") return this.game.gold;
    if (this.game.storage.has(name)) return this.game.storage.get(name) ?? 0;
    // ветка дерева-идола считается предметом, когда выросла (have_items green_branch_3)
    if (this.game.rules.vegetations[name]) return this.game.countPlants(name);
    return this.game.items[name] ?? 0;
  }

  check(c: Cond, questName: string): boolean {
    switch (c.type) {
      case "have_mark":
        return this.game.hasMark(c.mark);
      case "have_items":
        return this.count(c.name) >= Number(c.count);
      case "quest_status":
        return (this.st.status[c.name] ?? "") === c.status;
      case "have_empty_ridge":
        return this.hooks.hasEmptyRidge();
      case "day_delay": {
        const key = `${questName}:${c.id}`;
        if (this.st.delays[key] === undefined) this.st.delays[key] = this.game.day;
        return this.game.day >= this.st.delays[key] + Number(c.delay);
      }
      default:
        return false;
    }
  }

  /**
   * Условия проверяются по порядку из XML до первого невыполненного (так в exe); day_delay запоминает день своей
   * первой проверки, поэтому отсчёт идёт с момента, когда выполнены условия, стоящие перед ним.
   */
  private enabledQuest(name: string) {
    const q = this.quests[name];
    // статус «done» — лишь флаг для условий других квестов: пока у квеста есть включённые части, они доступны
    // (в loc4 afterparty2/d2w ставит done и тут же включает d2e, который ставит метку dragon_sick)
    return q.enable_condition.every((c) => this.check(c, name));
  }

  answerActive(a: Answer, questName: string) {
    return a.active_if.every((c) => this.check(c, questName));
  }

  /** Задания, которые сейчас может выдать персонаж. */
  available(holder: string): { quest: string; sub: string; data: SubQuest }[] {
    const out = [];
    for (const [name, q] of Object.entries(this.quests)) {
      if (!this.enabledQuest(name)) continue;
      for (const sub of this.st.enabled[name] ?? []) {
        const data = q.sub_quests[sub];
        if (data?.holder === holder) out.push({ quest: name, sub, data });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- действия

  /** current — часть квеста, чьи действия выполняются (для next_sub_quest и disable_sub_quest без имени). */
  run(actions: Action[], questName: string, current = "") {
    const g = this.game;
    const st = this.st;
    const enable = (sub: string) => (st.enabled[questName] = [...new Set([...(st.enabled[questName] ?? []), sub])]);
    const disable = (sub: string) => (st.enabled[questName] = (st.enabled[questName] ?? []).filter((s) => s !== sub));
    const here = () => `location_${this.hooks.location()}`;
    for (const a of actions) {
      const n = Number(a.count ?? 0);
      switch (a.type) {
        case "enable_sub_quest":
          enable(a.name);
          break;
        // exe 0x5a8a11: пустое имя — текущая часть
        case "disable_sub_quest":
          disable(a.name || current);
          break;
        // exe 0x5a8ac8: включить названную часть и выключить текущую. open_next_sub_quest (0x5a8b89) делает то же
        // и ещё ставит новой части флаг +0x58; где флаг читается, не найдено — здесь не используется
        case "next_sub_quest":
        case "open_next_sub_quest":
          if (a.name) enable(a.name);
          if (current && current !== a.name) disable(current);
          break;
        // exe 0x481721: метка ставится, только если уже есть condition_mark (casual / hardcore — сложность)
        case "set_mark_if_mark":
          if (g.hasMark(a.condition_mark) && !g.marks.includes(a.mark)) {
            g.marks.push(a.mark);
            this.hooks.marked(a.mark);
          }
          break;
        case "store_state":
          st.stored = {
            gold: g.gold, water: g.water, barrels: g.barrels, boxes: g.boxes, well: g.well, wellLevel: g.wellLevel, statues: { ...g.statues },
            boughtRidges: [...g.boughtRidges], world: structuredClone(g.world),
            limits: {
              pestsKey: st.pestsKey, ridgeCap: st.ridgeCap, saleCap: st.saleCap, maxBarrels: st.maxBarrels, maxBoxes: st.maxBoxes,
              waterBuy: st.waterBuy, manualWork: st.manualWork, wellBuy: g.wellBuy, helper: st.helper,
            },
          };
          break;
        case "restore_state":
          if (st.stored) {
            const v = st.stored;
            Object.assign(g, { gold: v.gold, water: v.water, barrels: v.barrels, boxes: v.boxes, well: v.well, wellLevel: v.wellLevel ?? (v.well ? 1 : 0) });
            if (v.statues) g.statues = { ...v.statues };
            else if (v.owlLevel !== undefined) g.owlLevel = v.owlLevel;
            g.boughtRidges = [...v.boughtRidges];
            g.world = structuredClone(v.world);
            if (v.limits) {
              const { wellBuy, helper, ...rest } = v.limits;
              g.wellBuy = wellBuy;
              Object.assign(st, { pestsKey: undefined, ridgeCap: undefined, saleCap: undefined, maxBarrels: undefined, maxBoxes: undefined, waterBuy: undefined, manualWork: undefined }, rest);
              // exe 0x47f9e0: +0x9c хранит наличие Робина; restore удаляет или создаёт его заново
              if (helper !== undefined) st.helper = helper;
            }
          }
          break;
        // exe 0x483b34: атрибут enable (bool) читается в заранее обнулённый байт (0x5ac260) —
        // без атрибута покупка колодца запрещается
        case "enable_buy_well":
          g.wellBuy = a.enable ? a.enable !== "false" : false;
          break;
        case "set_pests_key":
          st.pestsKey = a.key ?? "";
          break;
        case "add_quest": {
          const location = a.location || here();
          (st.journal ??= {})[`${location}/${a.quest_name}`] = { person: a.person, location, quest: a.quest_name, tasks: [] };
          break;
        }
        case "add_task":
        case "add_task_count": {
          // exe читает только атрибут item; записи с name= (в loc4 exams) игра пропускает
          const e = a.item ? st.journal?.[`${a.location || here()}/${a.quest_name}`] : undefined;
          if (e) e.tasks.push(a.type === "add_task" ? { item: a.item } : { item: a.item, count: n });
          break;
        }
        case "remove_all_task": {
          const e = st.journal?.[`${a.location || here()}/${a.quest_name}`];
          if (e) e.tasks = [];
          break;
        }
        case "remove_quest":
          if (st.journal) delete st.journal[`${a.location || here()}/${a.quest_name}`];
          break;
        // перестройка фермы на этапах квестов (3-я и 4-я локации: store_state → set_* → restore_state).
        // Диспетчер действий — 0x4808f0 (огромная цепочка сравнений имени узла). set_barrels 0x483dcd и
        // set_boxes 0x484015 ставят счётчик (count, без атрибута — 0x7fffffff) и уведомляют ферму
        // (0x4a9f80/0x47d2a0): бочки и ящики стоят на стандартных местах из XML (бочки exe расставляет
        // циклом 0x483e79 — позиции те же, что в water_storage). set_max_barrels 0x483d20 / set_max_boxes
        // 0x483f68 — предел докупки.
        case "set_barrels":
          g.barrels = n;
          break;
        case "set_boxes":
          g.boxes = n;
          break;
        case "set_max_barrels":
          st.maxBarrels = a.count === undefined ? undefined : n;
          break;
        case "set_max_boxes":
          st.maxBoxes = a.count === undefined ? undefined : n;
          break;
        // exe атрибутов не читает: remove_well (0x48229c → 0x433560) убирает колодец целиком — count="1"
        // в данных игнорируется; add_well (0x482312 → 0x4334b0) ставит колодец заново, только если его нет
        // (проверка 0x436f90) — базовый
        case "remove_well":
          g.well = false;
          g.wellLevel = 0;
          break;
        case "add_well":
          if (!g.well) {
            g.well = true;
            g.wellLevel = 1;
          }
          break;
        case "enable_buy_water":
          // exe 0x483bd8: тот же обнулённый байт — без атрибута покупка воды запрещается
          st.waterBuy = a.enable ? a.enable !== "false" : false;
          break;
        case "enable_manual_work":
          // exe 0x483c7c: без атрибута ручная работа запрещается
          st.manualWork = a.enable ? a.enable !== "false" : false;
          break;
        case "set_ridges": {
          // exe 0x4840c2: installed — сколько грядок стоит, not_installed — сколько можно докупить
          // (0x44afc0 → уведомление 0x434f20)
          const at = g.rules.ridges.length;
          const installed = Number(a.installed ?? 0);
          st.ridgeCap = Math.min(at, installed);
          st.saleCap = Math.max(0, installed - at) + Number(a.not_installed ?? 0);
          g.boughtRidges = Array.from({ length: Math.max(0, Math.min(installed - at, g.rules.ridges_for_sale.length)) }, (_, i) => i);
          break;
        }
        // exe 0x4809b5 → 0x44b430: запись о предмете в списке падающих обнуляется — предмет перестаёт падать
        // (инвентарь не трогается)
        case "reset_bug_item":
          g.bugItems[a.item] = 0;
          break;
        case "update_quest_title": {
          const e = st.journal?.[`${a.location || here()}/${a.quest_name}`];
          if (e) e.titleFrom = a.title_from;
          break;
        }
        case "change_quest_person": {
          const e = st.journal?.[`${a.location || here()}/${a.quest_name}`];
          if (e) e.person = a.person;
          break;
        }
        case "add_dragon_medal3":
          g.trophyBook.award("dragon_medal", 3);
          break;
        case "add_weapon":
          if (!g.weapons.includes(a.name)) g.weapons.push(a.name);
          break;
        // exe 0x433670 (сова), 0x433720 (Нептун)…: у совы — бесплатно на уровень выше; остальные статуи открываются в магазине для покупки
        case "add_owl":
        case "add_neptun":
        case "add_altar":
        case "add_horn":
        case "add_clock": {
          const kind = a.type.slice(4);
          if (kind === "owl") {
            // сову квест дарит: бесплатно на уровень выше
            g.owl = true;
            g.statues[kind] = Math.min(g.rules.statues?.[kind]?.levels.length ?? 3, (g.statues[kind] ?? 0) + 1);
          } else {
            // остальные статуи квест лишь открывает в магазине — первый уровень покупается (метка shop_<вид>_1), а не выдаётся
            const first = `shop_${kind}_1`;
            if (!g.marks.includes(first)) {
              g.marks.push(first);
              this.hooks.marked(first);
            }
          }
          break;
        }
        // медали дракона (exe 0x481307/0x481400): берётся медаль «dragon_medal» (0x4f58e0) и проверяется уровень (0x4f6a70):
        // medal1 — награда, только если уровня ещё нет (ja → пропустить); medal2 — только если уровень ≤ 1 (cmp 1, ja).
        // Награда 0x44b040 кладёт медаль в список +0x1d8 (439210 — вставка), а ступень/счётчик растёт отдельно (0x4f6a50).
        case "add_dragon_medal1":
        case "add_dragon_medal2":
          g.medals[a.type] = (g.medals[a.type] ?? 0) + 1;
          g.trophyBook.award("dragon_medal", a.type === "add_dragon_medal1" ? 1 : Math.min(3, (g.trophies.dragon_medal?.level ?? 0) + 1));
          break;
        case "set_quest_status":
          st.status[questName] = a.status;
          // выполненная часть закрывается: иначе персонаж снова предлагает то же задание (например, «50 монет на сыщика»),
          // а запись в журнале остаётся висеть; названные далее enable_sub_quest / next_sub_quest включат следующую часть
          if (a.status === "done") {
            if (current) disable(current);
            if (st.journal) delete st.journal[`${here()}/${questName}`];
          }
          break;
        case "set_mark":
          if (!g.marks.includes(a.mark)) {
            g.marks.push(a.mark);
            this.hooks.marked(a.mark);
          }
          break;
        case "reset_mark":
          g.marks = g.marks.filter((m) => m !== a.mark);
          break;
        // exe 0x480a21 → 0x44be90 (money) / 0x44bb70 (items): только меняет деньги/инвентарь, без всплывашки.
        case "add_items":
          if (a.name === "money") g.gold += n;
          else if (g.rules.products[a.name]) g.storage.set(a.name, (g.storage.get(a.name) ?? 0) + n);
          else g.items[a.name] = (g.items[a.name] ?? 0) + n;
          break;
        case "remove_items":
          if (a.name === "money") g.gold = Math.max(0, g.gold - n);
          else if (g.storage.has(a.name)) g.storage.set(a.name, Math.max(0, (g.storage.get(a.name) ?? 0) - n));
          else g.items[a.name] = Math.max(0, (g.items[a.name] ?? 0) - n);
          break;
        case "set_money":
          g.gold = n;
          break;
        case "enable_buy_vegetation":
          if (!g.seeds.includes(a.name)) g.seeds.push(a.name);
          break;
        case "disable_buy_vegetation":
          g.seeds = g.seeds.filter((s) => s !== a.name);
          break;
        case "add_vegetation":
          this.hooks.addVegetation(a.name);
          break;
        case "remove_vegetation":
          this.hooks.removeVegetation(a.name);
          break;
        // Волны в данных безымянные (wave.0…); по exe enable/disable_bug_wave принимают name — здесь это имя вредителя.
        case "enable_bug_wave":
          st.bugsOff = (st.bugsOff ?? []).filter((b) => b !== a.name);
          break;
        case "disable_bug_wave":
          st.bugsOff = [...new Set([...(st.bugsOff ?? []), a.name])];
          break;
        case "remove_all_vegetations":
          this.hooks.removeAllVegetations();
          break;
        // exe 0x481871: enable_helper только создаёт Робина (0x4c6ce0/0x45a5f0) — без окна и надписи.
        case "enable_helper":
          st.helper = true;
          break;
        case "disable_helper":
          st.helper = false;
          break;
        case "clear_bouquets":
          // испытания детектива начинают ферму заново: заказы букетов и собранные цветы пропадают
          g.bouquets = { next: 0, orders: [], done: 0 };
          break;
        case "enable_bug_item":
          // exe 0x480926 → 0x44b550: запись создаётся или обновляется — лимит назначается, а не прибавляется
          g.bugItems[a.item] = n;
          break;
        case "enable_town":
        case "disable_town":
          g.world.towns[a.name] = a.type === "enable_town";
          break;
        case "enable_farm":
        case "disable_farm":
          g.world.farms[a.name] = a.type === "enable_farm";
          break;
      }
    }
    g.changed();
  }
}
