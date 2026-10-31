// Экраны оболочки: меню игры (game_menu), опции (options), рекорды (highscores), пауза.
import { Container, Graphics, Rectangle } from "pixi.js";
import { audio } from "./audio";
import { rgb } from "./popfont";
import type { Rules } from "./rules";
import { COLOR, dialog, H, image, pop, roundButton, textButton, W } from "./ui";

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
}

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
export function recordScore(rules: Rules, name: string, days: number, money: number, finished: boolean): Score[] {
  const table = loadScores(rules).filter((s) => !s.current);
  table.push({ name, days, money, current: !finished });
  table.sort((a, b) => b.money - a.money || b.days - a.days);
  const top = table.slice(0, 10);
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
  loadScores(rules).slice(0, 10).forEach((s, i) => {
    const y = 217 + i * 16;
    const color = s.current ? rgb(255, 0, 0) : rgb(180, 180, 180);
    const place = (text: string, x: number, align: "left" | "center" = "left") => {
      const l = pop(text, "stat_control_fonts_2", color, { align, scale: 0.7 });
      l.position.set(x, y);
      layer.addChild(l);
    };
    place(s.name, 270);
    place(String(s.days), 464 + 25, "center");
    place(String(s.money), 520 + 37.5, "center");
  });
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
