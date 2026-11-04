// Экраны оболочки: меню игры (game_menu), опции (options), рекорды (highscores), пауза.
import { Container, Graphics, Rectangle } from "pixi.js";
import { audio } from "./audio";
import type { Difficulty } from "./state";
import { rgb } from "./popfont";
import type { Rules } from "./rules";
import { COLOR, dialog, H, hasImage, image, loadImages, pop, roundButton, textButton, W } from "./ui";

function shade(onTap?: () => void) {
  const s = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.45 });
  s.eventMode = "static";
  if (onTap) s.on("pointertap", onTap);
  return s;
}

/** Меню игры: «Вернуться», «Опции», «Выйти» на картинке game_menu (225×304). */
export function gameMenu(parent: Container, rules: Rules, actions: { options(): void; exit(): void; closed(): void }) {
  const layer = new Container();
  const t = rules.texts.game_menu;
  let alive = true;
  const dispose = () => {
    if (!alive) return;
    alive = false;
    layer.destroy({ children: true });
  };
  /** «Вернуться», щелчок мимо меню или Esc: меню закрыто, игра продолжается. */
  const close = () => {
    if (!alive) return;
    dispose();
    actions.closed();
  };
  layer.addChild(shade(close));
  // «Цветок Стихий»: фон game_menu 417×497 по центру экрана, кнопки стиля normal в рамках 210×34, текст по центру:
  // back (97; 131), options (95; 168), exit (96; 329). Сохранения/загрузки (save, load) и квестов (quest) в порте нет — игра сохраняется сама
  const box = new Container();
  box.position.set(Math.round((W - 417) / 2), Math.round((H - 497) / 2));
  box.addChild(image("game_menu_bg"));
  const item = (text: string, x: number, y: number, fn: () => void) => {
    const b = textButton(text, fn, "normal", 200);
    b.position.set(x + 105, y + 17);
    box.addChild(b);
  };
  item(t.game_menu_back ?? "Вернуться", 97, 131, close);
  item(t.game_menu_options ?? "Опции", 95, 168, () => {
    dispose();
    actions.options();
  });
  item(t.game_menu_exit ?? "Выйти", 96, 329, () => {
    dispose();
    actions.exit();
  });
  layer.addChild(box);
  parent.addChild(layer);
  return close;
}

/** Окно опций 346×450: громкость музыки и звуков, полный экран, особые курсоры, предупреждения. */
export function optionsScreen(parent: Container, rules: Rules, onClose: () => void) {
  const layer = new Container();
  const t = rules.texts.options;
  const cur = { ...audio.options };
  const done = () => {
    layer.destroy({ children: true });
    onClose();
  };
  layer.addChild(shade());
  // «Цветок Стихий»: окно options 346×450 по центру; фон (417×497) игра растягивает до размеров окна — тогда пазы на досках
  // ложатся ровно под ползунки из XML
  const box = new Container();
  box.position.set(Math.round((W - 346) / 2), Math.round((H - 450) / 2));
  const bg = image("options_bg");
  bg.width = 346;
  bg.height = 450;
  box.addChild(bg);
  // заголовок и подписи громкости — stat_control_fonts_menu_normal по центру рамки 346: title (2; 53), music (1; 124), sound (4; 201)
  const caption = (text: string, x: number, y: number) => {
    const l = pop(text, "stat_control_fonts_menu_normal", COLOR.white, { align: "center" });
    l.position.set(x + 173, y);
    box.addChild(l);
  };
  caption(t.title ?? "Опции", 2, 53);
  caption(t.music ?? "Музыка", 1, 124);
  caption(t.sound ?? "Звуки", 4, 201);

  // ползунок music_slider_x/y/width/height: (108; 98) 140×24 и (108; 168); дорожка нарисована на фоне, бегунок thumb 28×26
  const slider = (x0: number, y: number, value: number, set: (v: number) => void) => {
    const span = 140 - 28;
    const area = new Graphics().rect(x0, y, 140, 24).fill({ color: 0xffffff, alpha: 0.001 });
    const thumb = image("options_thumb");
    thumb.position.set(x0 + span * value, y - 1);
    thumb.eventMode = "static";
    thumb.cursor = "pointer";
    let drag = false;
    const move = (gx: number) => {
      const p = box.toLocal({ x: gx, y: 0 });
      const v = Math.max(0, Math.min(1, (p.x - 14 - x0) / span));
      thumb.x = x0 + span * v;
      set(v);
    };
    thumb.on("pointerdown", () => (drag = true));
    layer.eventMode = "static";
    layer.hitArea = new Rectangle(0, 0, W, H);
    layer.on("globalpointermove", (e) => drag && move(e.global.x));
    layer.on("pointerup", () => (drag = false));
    layer.on("pointerupoutside", () => (drag = false));
    area.eventMode = "static";
    area.on("pointerdown", (e) => move(e.global.x));
    box.addChild(area, thumb);
  };
  slider(108, 98, cur.music, (v) => {
    cur.music = v;
    audio.setOptions({ ...cur });
  });
  slider(108, 168, cur.sound, (v) => {
    cur.sound = v;
    audio.setOptions({ ...cur });
    audio.play("flower_get");
  });

  // флажки: надпись stat_control_fonts_1 слева (левый верх из XML), квадратик 28×24 справа:
  // fullscreen текст (102; 233) / флажок (247; 230), acc_3d (101; 255) / (247; 253), custom_cursor (98; 275) / (245; 282),
  // game_warnings (97; 314) / (245; 312). Строки acc_3d (3D-ускоритель) в вебе нет — на её месте «Блестки»; «Итоги дня» — ниже
  const check = (text: string, tx: number, ty: number, cx: number, cy: number, get: () => boolean, set: (v: boolean) => void) => {
    const l = pop(text, "stat_control_fonts_1", COLOR.white, { wrap: 160 }); // рамки надписей 150–160 px
    l.position.set(tx, ty);
    box.addChild(l);
    const on = image("options_check");
    const off = image("options_check_off");
    for (const s of [on, off]) s.position.set(cx, cy);
    box.addChild(off, on);
    const sync = () => {
      on.visible = get();
      off.visible = !get();
    };
    off.eventMode = on.eventMode = "static";
    off.cursor = on.cursor = "pointer";
    for (const s of [on, off]) s.on("pointertap", () => (set(!get()), sync()));
    sync();
    return sync;
  };
  const fullscreenCheck = check(t.fullscreen ?? "На весь экран", 102, 233, 247, 230, () => !!document.fullscreenElement, (v) => {
    if (v) void document.documentElement.requestFullscreen?.().catch(() => undefined);
    else void document.exitFullscreen?.().catch(() => undefined);
  });
  // полный экран включается не мгновенно (и клавишей F тоже) — флажок обновляется, когда режим действительно сменился
  document.addEventListener("fullscreenchange", fullscreenCheck);
  layer.once("destroyed", () => document.removeEventListener("fullscreenchange", fullscreenCheck));
  check("Блестки", 101, 255, 247, 253, () => cur.sparkles, (v) => {
    cur.sparkles = v;
    audio.setOptions({ ...cur });
  });
  check(t.custom_cursor ?? "Специальные курсоры", 98, 275, 245, 282, () => cur.cursors, (v) => {
    cur.cursors = v;
    audio.setOptions({ ...cur });
  });
  check(t.game_warnings ?? "Предупреждения", 97, 314, 245, 312, () => cur.warnings, (v) => {
    cur.warnings = v;
    audio.setOptions({ ...cur });
  });
  check("Итоги дня", 97, 336, 245, 334, () => cur.dayStats, (v) => {
    cur.dayStats = v;
    audio.setOptions({ ...cur });
  });

  // ok (37; 370) 146×34, текст по центру; на месте credits (192; 357) 96×44 — «Об игре»
  const ok = textButton(rules.texts.buttons.ok ?? "OK", done);
  ok.position.set(37 + 73, 370 + 17);
  const about = textButton("Об игре", () => void aboutScreen(parent, rules), "normal", 96);
  about.position.set(192 + 48, 357 + 22);
  box.addChild(ok, about);
  layer.addChild(box);
  parent.addChild(layer);
}

// ---------------------------------------------------------------- рекорды

export interface Score {
  name: string;
  days: number;
  money: number;
  /** Текущая игра — помечается значком «В Игре». */
  current?: boolean;
  /** Сложность игры: таблицы рекордов раздельные (highscores_difficult); без значения — легкая. */
  difficulty?: Difficulty;
}

const scoreDifficulty = (s: Score): Difficulty => s.difficulty ?? "casual";

const SCORES_KEY = "iris-flower-scores";

export function loadScores(rules: Rules): Score[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SCORES_KEY) ?? "null") as Score[] | null;
    if (raw) return raw;
  } catch {
    // без хранилища показываем стандартную таблицу
  }
  return rules.default_scores.map((s) => ({ ...s }));
}

/** Записывает результат игры в таблицу (одна запись на игру); возвращает таблицу. */
export function recordScore(rules: Rules, name: string, days: number, money: number, finished: boolean, difficulty: Difficulty = "casual"): Score[] {
  // «В Игре» — только у текущей игры своей сложности; остальные таблицы не трогаем
  const rest = loadScores(rules).filter((s) => !(s.current && scoreDifficulty(s) === difficulty));
  rest.push({ name, days, money, current: !finished, difficulty });
  const sort = (a: Score, b: Score) => b.money - a.money || b.days - a.days;
  const top = (["casual", "hardcore"] as Difficulty[]).flatMap((d) => rest.filter((s) => scoreDifficulty(s) === d).sort(sort).slice(0, 10));
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(top));
  } catch {
    // нечего сохранять
  }
  return top;
}

export function highscoresScreen(parent: Container, rules: Rules, onClose: () => void) {
  const layer = new Container();
  const t = rules.texts.headers;
  layer.addChild(image("highscores_bg"));
  // «Цветок Стихий», highscores: заголовок (47; 158) 800 по центру шрифтом stat_control_fonts_menu_normal;
  // шапки колонок stat_control_fonts_1 по центру рамок: игрок (256; 197) 200, дни (464; 195) 50, деньги (520; 194) 75;
  // строки шрифтом stat_control_1 цвета 180;180;180 (текущий игрок — 255;0;0), первая в first_line_pos (270; 217), шаг 16
  const caption = pop(t.highscore_header ?? "Рекорды", "stat_control_fonts_menu_normal", COLOR.white, { align: "center" });
  caption.position.set(47 + 400, 158);
  layer.addChild(caption);
  const head = (text: string, x: number, y: number) => {
    const l = pop(text, "stat_control_fonts_1", COLOR.white, { align: "center" });
    l.position.set(x, y);
    layer.addChild(l);
  };
  head(t.highscore_player_header ?? "Игрок", 256 + 100, 197);
  head(t.highscore_day_header ?? "Дни", 464 + 25, 195);
  head(t.highscore_money_header ?? "Деньги", 520 + 37.5, 194);
  // таблицы раздельные по сложности (highscores_difficult): стрелки prev (271; 414) и next (524; 410) переключают, между ними — название
  let view: Difficulty = "casual";
  const rows = new Container();
  const name = pop("", "stat_control_fonts_1", COLOR.white, { align: "center" });
  name.position.set(400, 414);
  layer.addChild(rows, name);
  const draw = () => {
    rows.removeChildren().forEach((c) => c.destroy({ children: true }));
    const mine = loadScores(rules).filter((s) => scoreDifficulty(s) === view);
    // у сложности без своих записей — стандартная таблица
    const table: Score[] = mine.length ? mine : rules.default_scores.map((s) => ({ ...s }));
    name.text = rules.texts.buttons_menu?.[view] ?? view;
    table.slice(0, 10).forEach((s, i) => {
      const y = 217 + i * 16;
      const color = s.current ? rgb(255, 0, 0) : rgb(180, 180, 180);
      const place = (text: string, x: number, align: "left" | "center" = "left") => {
        const l = pop(text, "stat_control_fonts_2", color, { align, scale: 0.7 });
        l.position.set(x, y);
        rows.addChild(l);
      };
      place(s.name, 270);
      place(String(s.days), 464 + 25, "center");
      place(String(s.money), 520 + 37.5, "center");
    });
  };
  const flip = () => {
    view = view === "casual" ? "hardcore" : "casual";
    draw();
  };
  const prev = textButton("<", flip);
  prev.position.set(271 + 12, 414 + 12);
  const next = textButton(">", flip);
  next.position.set(524 + 12, 410 + 12);
  layer.addChild(prev, next);
  draw();
  // ok (233; 451) 410×34
  const ok = textButton(rules.texts.buttons.ok ?? "OK", () => {
    layer.destroy({ children: true });
    onClose();
  });
  ok.position.set(233 + 205, 451 + 17);
  layer.addChild(ok);
  parent.addChild(layer);
}

// ---------------------------------------------------------------- пауза

export function pauseOverlay(parent: Container, rules: Rules) {
  const layer = new Container();
  layer.addChild(shade());
  // pause_screen 503×215 по центру, текст (250; 95) — по центру окна, шириной до 380
  const back = image("pause_bg");
  back.position.set(Math.round((W - 503) / 2), Math.round((H - 215) / 2));
  layer.addChild(back);
  const text = pop((rules.texts.pause.text ?? "Пауза").replace(/\\n/g, "\n"), "stat_control_fonts_1", COLOR.white, { align: "center", wrap: 380 });
  text.anchor.set(0.5, 0.5);
  text.position.set(back.x + 250, back.y + 95);
  layer.addChild(text);
  parent.addChild(layer);
  return layer;
}

/**
 * continue_day_screen (Esc): день стоит, поле затемнено, по центру круглая кнопка «Закончить День» (позиция 347; 197, 206 × 198);
 * щелчок мимо неё возвращает в игру.
 */
export function continueDayOverlay(parent: Container, rules: Rules, actions: { resume(): void; endDay(): void }) {
  const layer = new Container();
  layer.addChild(shade(actions.resume));
  const end = roundButton(rules.texts.buttons.cancel_day ?? "Закончить День", actions.endDay, 4);
  end.position.set(347 + 103, 197 + 99);
  layer.addChild(end);
  parent.addChild(layer);
  return layer;
}

// ---------------------------------------------------------------- об игре

/** Страницы свитка «Об игре»: как играть, что откуда открывается, управление, авторство. Без кавычек-ёлочек и тире — их нет в растровых шрифтах. */
const ABOUT_PAGES: { title: string; body: string }[] = [
  {
    title: "Как играть",
    body:
      "Выращивайте цветы, продавайте их и развивайте ферму. Перед днем купите растение на грядке и воду, потом нажмите Начать День.\n" +
      "День на ферме короткий: пока он идет, растения хотят пить, а на них созревают цветы.\n" +
      "Когда около растения появляются капли, его надо полить, иначе оно засохнет. Чем быстрее вы полили или собрали цветок, тем больше опыта. " +
      "Собранные цветы продавайте в цветочном магазине по одному или букетами.",
  },
  {
    title: "Вредители и помощники",
    body:
      "Вредители ползут к растениям и едят их. Нажимайте на вредителя, пока он не исчезнет. " +
      "С опытом открываются умения: торговля, садоводство и борьба с вредителями.\nДракончик Робин поливает растения, собирает цветы и бьет вредителей, его умения тоже растут.\n" +
      "Новое открывается по дням: бочка с 5 дня, ящик с 6, другие растения с 7, грядки с 10, колодец с 12.",
  },
  {
    title: "Управление",
    body:
      "Мышь или касание: основное действие. Esc: меню. Пробел: пауза. F: полный экран. Клик по экрану загрузки ускоряет ее.\n" +
      "В Опциях можно выключить блестки у счетчиков, включить итоги дня, настроить звук и курсоры. " +
      "Игра сохраняется сама. Прогресс хранится в браузере на этом устройстве, поэтому не очищайте данные сайта.",
  },
  {
    title: "Об игре",
    body:
      "Ферма Айрис (Magic Farm) для браузера. Это личный порт: картинки и анимации взяты из оригинальной игры.\n" +
      "Автор порта: moonspeaking\ngithub.com/moonspeaking/farm",
  },
];

/** Свиток «Об игре» в стиле игры: листается кнопками «Назад» и «Далее»; щелчок мимо закрывает. */
export async function aboutScreen(parent: Container, rules: Rules) {
  let page = 0;
  for (;;) {
    const last = page === ABOUT_PAGES.length - 1;
    const buttons = [
      ...(page > 0 ? [{ text: rules.texts.buttons.back ?? "Назад", value: "prev" }] : []),
      { text: last ? (rules.texts.buttons.tutorial_baloon_close ?? "Закрыть") : "Далее", value: last ? "cancel" : "next" },
    ];
    const r = await dialog(parent, { title: `${ABOUT_PAGES[page].title} (${page + 1}/${ABOUT_PAGES.length})`, body: ABOUT_PAGES[page].body, bodyAlign: "left", buttons, width: 660 }); // 550 px под текст: «…борьба с вредителями.» (535 px) влезает в строку
    if (r === "next") page += 1;
    else if (r === "prev") page -= 1;
    else return;
  }
}

// ---------------------------------------------------------------- комната трофеев

/** Картинки награды: ступень 0 — пустое место, дальше — полученные; _o — с подсветкой под курсором. */
function trophyImages(rules: Rules, name: string, level: number) {
  const def = rules.trophies?.[name];
  const lv = Math.min(level, (def?.images ?? 1) - 1);
  return { lv, normal: `tr_${name}_${lv}`, over: `tr_${name}_${lv}_o` };
}

/** Картинки наград: обычные обязательны, подсвеченные есть не у всех ступеней — отсутствующие молча пропускаются. */
async function loadTrophyImages(rules: Rules) {
  const defs = Object.entries(rules.trophies ?? {});
  await loadImages(defs.flatMap(([name, d]) => Array.from({ length: d.images }, (_, i) => `tr_${name}_${i}`)));
  await Promise.all(defs.flatMap(([name, d]) => Array.from({ length: d.images }, (_, i) => loadImages([`tr_${name}_${i}_o`]).catch(() => undefined))));
}

/**
 * Комната трофеев (trophy_room_screen): фон trophy_room_back, награды на местах из medals (position/dimensions),
 * неполученные — пустые места ступени 0. Под курсором награда подсвечивается (_overed) и внизу появляется её описание
 * (`trophy_room_rect` в XML — 97×194 в (50; 35) — в exe не найден и экспортером пропускается; считается неиспользуемым, описание по центру внизу).
 * «Назад» — back (358; 567).
 */
export async function trophyRoomScreen(parent: Container, rules: Rules, levels: Record<string, number>, onClose: () => void) {
  await loadImages(["trophy_back"]);
  await loadTrophyImages(rules);
  const layer = new Container();
  layer.addChild(image("trophy_back"));
  const caption = pop("", "stat_control_fonts_1", COLOR.white, { align: "center", wrap: 640 });
  caption.anchor.set(0.5, 0.5);
  caption.position.set(W / 2, 520);
  // подложка под описанием: на тёмном сукне и полу белая надпись иначе не читается
  const plate = new Graphics();
  const setCaption = (text: string) => {
    caption.text = text;
    plate.clear();
    if (text) plate.roundRect(W / 2 - 330, 520 - caption.textHeight / 2 - 8, 660, caption.textHeight + 16, 8).fill({ color: 0x000000, alpha: 0.6 });
  };
  layer.addChild(plate);
  const medals = rules.texts.medals ?? {};
  for (const [name, def] of Object.entries(rules.trophies ?? {})) {
    const { lv, normal, over } = trophyImages(rules, name, levels[name] ?? 0);
    const holder = new Container();
    const base = image(normal);
    holder.addChild(base);
    holder.position.set(def.position[0], def.position[1]);
    holder.eventMode = "static";
    holder.hitArea = new Rectangle(0, 0, base.width, base.height);
    const hover = tryImage(over);
    if (hover) {
      hover.visible = false;
      holder.addChild(hover);
    }
    holder.on("pointerover", () => {
      if (hover) hover.visible = true;
      setCaption((medals[`${name}_${lv}`] ?? "").replace(/\\n/g, "\n"));
    });
    holder.on("pointerout", () => {
      if (hover) hover.visible = false;
      setCaption("");
    });
    layer.addChild(holder);
  }
  layer.addChild(caption);
  const back = textButton(rules.texts.buttons.back ?? "Назад", () => {
    layer.destroy({ children: true });
    onClose();
  });
  back.position.set(W / 2, 580);
  layer.addChild(back);
  parent.addChild(layer);
}

function tryImage(name: string) {
  try {
    return hasImage(name) ? image(name) : null;
  } catch {
    return null;
  }
}

/** «Вы получили награду!» (medal_header_text): медаль новой ступени и её описание; закрывается щелчком. */
export async function trophyAwardPopup(parent: Container, rules: Rules, name: string, level: number) {
  const { normal } = trophyImages(rules, name, level);
  await loadImages([normal]);
  const layer = new Container();
  layer.addChild(shade());
  const header = pop(rules.texts.medal_header || "Вы получили награду!", "stat_control_fonts_menu_normal", COLOR.white, { align: "center" });
  header.anchor.set(0.5, 0.5);
  header.position.set(W / 2, 150);
  const medal = image(normal);
  medal.anchor.set(0.5, 0.5);
  medal.position.set(W / 2, 300);
  const text = pop(((rules.texts.medals ?? {})[`${name}_${Math.min(level, (rules.trophies?.[name]?.images ?? 1) - 1)}`] ?? "").replace(/\\n/g, "\n"), "stat_control_fonts_1", COLOR.white, { align: "center", wrap: 560 });
  text.anchor.set(0.5, 0);
  text.position.set(W / 2, 420);
  const ok = textButton(rules.texts.buttons.ok ?? "OK", () => layer.destroy({ children: true }));
  ok.position.set(W / 2, 540);
  layer.addChild(header, medal, text, ok);
  parent.addChild(layer);
}

// ---------------------------------------------------------------- выбор сложности

/**
 * select_difficult_screen: свиток dialog_roll, заголовок (80; 97) 650 по центру, «Легкий» (70; 154) и «Сложный» (70; 185) —
 * кнопки 650×34 по центру, ниже флажок «Включить Туториал» (флажок (85; 225) 28×24, надпись (114; 225)).
 * Флажок — тот же переключатель подсказок, что «Предупреждения» в опциях. Щелчок мимо свитка — отмена (null).
 */
export function selectDifficultyScreen(parent: Container, rules: Rules): Promise<Difficulty | null> {
  return new Promise((resolve) => {
    const layer = new Container();
    const finish = (v: Difficulty | null) => {
      layer.destroy({ children: true });
      resolve(v);
    };
    layer.addChild(shade(() => finish(null)));
    const box = new Container();
    box.position.set(Math.round((W - 798) / 2), Math.round((H - 531) / 2));
    box.addChild(image("dialog"));
    const t = rules.texts;
    const title = pop(t.headers.difficult ?? "Выберите уровень сложности", "Dialog2", COLOR.black, { align: "center", wrap: 650 });
    title.position.set(80 + 325, 97);
    box.addChild(title);
    const item = (key: Difficulty, fallback: string, y: number) => {
      const b = textButton(t.buttons_menu?.[key] ?? fallback, () => finish(key));
      b.position.set(70 + 325, y + 17);
      box.addChild(b);
    };
    item("casual", "Легкий", 154);
    item("hardcore", "Сложный", 185);
    const label = pop(t.headers.enable_tutorial_check_box ?? "Включить Туториал", "Dialog", COLOR.black);
    label.position.set(114, 225);
    const on = image("options_check");
    const off = image("options_check_off");
    for (const s of [on, off]) {
      s.position.set(85, 225);
      s.eventMode = "static";
      s.cursor = "pointer";
      s.on("pointertap", () => {
        audio.setOptions({ ...audio.options, warnings: !audio.options.warnings });
        sync();
      });
    }
    const sync = () => {
      on.visible = audio.options.warnings;
      off.visible = !audio.options.warnings;
    };
    sync();
    box.addChild(label, off, on);
    layer.addChild(box);
    parent.addChild(layer);
  });
}

// ---------------------------------------------------------------- комиксы между локациями и концовки

/** Подпись под комиксом: description в (29; 539) 600×150, чёрным шрифтом Dialog (в XML лежит как root/font/default_text). */
export function comicsCaption(rules: Rules, key: string) {
  const text = (rules.texts.comics?.[key] ?? "").replace(/\\n/g, "\n");
  let l = pop(text, "Dialog", COLOR.black, { wrap: 600 });
  // под картинкой остаётся полоса 61 px: длинная подпись (концовки) уменьшается, чтобы влезть
  if (l.textHeight > 58) {
    const k = 58 / l.textHeight;
    l.destroy();
    l = pop(text, "Dialog", COLOR.black, { wrap: 600 / k, scale: k });
  }
  l.position.set(29, 539);
  return l;
}

/**
 * Комикс целиком (location_N_comix при первом приходе в локацию N, win_var_N_comics в концовке): картинка 800×600, подпись
 * и круглая кнопка «Продолжить» (ok (611; 517) 206×199, как у вступительного комикса). Разрешается, когда кнопку нажали.
 */
export async function comicsScreen(parent: Container, rules: Rules, key: string): Promise<void> {
  await loadImages([`comics_${key}`]);
  return new Promise((resolve) => {
    const layer = new Container();
    layer.addChild(image(`comics_${key}`), comicsCaption(rules, key));
    layer.eventMode = "static";
    const ok = roundButton(rules.texts.buttons_menu.continue_game || "Продолжить", () => {
      layer.destroy({ children: true });
      resolve();
    });
    ok.position.set(611 + 103, 517 + 99);
    // подложка перевёрнута (ободок снизу), подпись лежит в видимой части экрана — как у вступительного комикса
    ok.children[0].rotation = Math.PI;
    ok.children[1].y = -36;
    ok.children[1].scale.set(1.15);
    layer.addChild(ok);
    layer.alpha = 0;
    parent.addChild(layer);
    // плавное появление за 0,7 с
    let t = 0;
    const tick = () => {
      if (layer.destroyed) return;
      t += 1 / 60;
      layer.alpha = Math.min(1, t / 0.7);
      if (layer.alpha < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
