// «Ферма Айрис» (Magic Farm 1) на PixiJS: главное меню → ферма ⇄ город.
import { Application, Container, Graphics } from "pixi.js";
import { audio } from "./audio";
import { installCursors } from "./cursors";
import { offerInstall } from "./install";
import { watchUpdates } from "./update";
import { currentProfile, profiles } from "./profiles";
import { newUserDialog, selectUserScreen } from "./users";
import { loadParticles } from "./particles";
import { Farm } from "./farm";
import { Menu } from "./menu";
import { QuestEngine } from "./quests";
import { QuestScreen } from "./questscreen";
import { loadRules, locationRules } from "./rules";
import { Game, type Difficulty } from "./state";
import { Town } from "./town";
import { Tutorial } from "./tutorial";
import { WorldMap } from "./worldmap";
import { loadFonts, setTextAspect } from "./popfont";
import { creditsScreen } from "./credits";
import { aboutScreen, comicsScreen, gameMenu, highscoresScreen, optionsScreen, pauseOverlay, recordScore, saveLoadScreen, trophyAwardPopup, trophyRoomScreen } from "./screens";
import { H, hasImages, loadImages, setSharp, unloadImages, W } from "./ui";

async function main() {
  const app = new Application();
  await app.init({ background: 0x0f1a08, resizeTo: window, antialias: true, autoDensity: true, resolution: devicePixelRatio });
  // оригинал под CrossOver на Mac выводит пиксели без профиля, и macOS растягивает sRGB-картинки на гамут Display P3 —
  // трава становится почти чисто зелёной. Повторяем этот вид: те же значения пикселей браузер трактует как P3
  // (на экранах без P3 ничего не меняется)
  const gl = (app.renderer as { gl?: WebGL2RenderingContext }).gl;
  if (gl && "drawingBufferColorSpace" in gl) gl.drawingBufferColorSpace = "display-p3";
  document.getElementById("game")!.appendChild(app.canvas);

  // профиль лежит в localStorage: просим браузер не вычищать его при нехватке места
  void navigator.storage?.persist?.().catch(() => undefined);
  installCursors(app, audio.options.cursors);
  const rules = await loadRules();
  // экран загрузки из index.html: картинки — основная часть (≈ 70 %), звуки ≈ 20 %, шрифты и частицы — остаток
  const loader = (window as unknown as { __loader?: { set(p: number): void; done(): void } }).__loader;
  const part = { img: 0, snd: 0, rest: 0 };
  const report = () => loader?.set(0.7 * part.img + 0.2 * part.snd + 0.1 * part.rest);
  await Promise.all([
    loadImages(rules.core_images, (f) => ((part.img = f), report())),
    loadFonts().then(() => ((part.rest += 0.5), report())),
    loadParticles().then(() => ((part.rest += 0.5), report())),
    audio.load(rules.audio, (f) => ((part.snd = f), report())),
  ]);
  // на телефонах звук включается только жестом «отпустил палец» / click — слушаем все события, пока контекст не запустится
  for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) window.addEventListener(type, () => audio.unlock(), { passive: true });
  document.addEventListener("visibilitychange", () => !document.hidden && audio.unlock());
  audio.playMusic("menu"); // музыка меню — сразу при открытии; если браузер не разрешил, начнётся с первого касания
  document.title = rules.texts.title;
  loader?.done();
  offerInstall();
  watchUpdates({ idle: () => !game, beforeReload: () => curFarm()?.persist() });

  // экран оригинала 800×600 вписывается в окно с полями (телефон в альбомной ориентации)
  const world = new Container();
  app.stage.addChild(world);
  const fit = () => {
    const k = Math.min(app.screen.width / W, app.screen.height / H);
    if (audio.options.wide) {
      // «Широкий экран»: на всё окно, масштаб по осям свой (как оригинал на весь экран)
      const kx = app.screen.width / W, ky = app.screen.height / H;
      world.scale.set(kx, ky);
      setTextAspect(ky / kx);
      setSharp(Math.min(kx, ky) * devicePixelRatio >= 1.75);
      world.position.set(0, 0);
      return;
    }
    world.scale.set(k);
    setTextAspect(1);
    setSharp(k * devicePixelRatio >= 1.75);
    world.position.set((app.screen.width - W * k) / 2, (app.screen.height - H * k) / 2);
  };
  fit();
  app.renderer.on("resize", fit);
  window.addEventListener("iris-layout", fit);
  // в портретной ориентации экран 4:3 вписывается по ширине и всё мелко — просим повернуть телефон (можно закрыть)
  const rotate = document.getElementById("rotate");
  const checkRotate = () => {
    let closed = false;
    try {
      closed = sessionStorage.getItem("rotate-closed") === "1";
    } catch {
      // без хранилища подсказка просто покажется снова
    }
    if (rotate) rotate.style.display = !closed && innerWidth < innerHeight * 0.8 && innerWidth < 700 ? "block" : "none";
  };
  document.getElementById("rotate-close")?.addEventListener("click", () => {
    try {
      sessionStorage.setItem("rotate-closed", "1");
    } catch {
      // нечего запоминать
    }
    checkRotate();
  });
  window.addEventListener("resize", checkRotate);
  checkRotate();
  // на компьютере напоминаем про клавишу F (весь экран) — как на телефоне про поворот; пропадает после входа в полноэкранный режим или по крестику
  const fshint = document.getElementById("fshint");
  const checkFs = () => {
    let closed = false;
    try {
      closed = sessionStorage.getItem("fshint-closed") === "1";
    } catch {
      // без хранилища подсказка просто покажется снова
    }
    const desktop = innerWidth >= 700 && matchMedia("(pointer: fine)").matches && !matchMedia("(display-mode: fullscreen)").matches;
    if (fshint) fshint.style.display = !closed && desktop && !document.fullscreenElement ? "block" : "none";
  };
  document.getElementById("fshint-close")?.addEventListener("click", () => {
    try {
      sessionStorage.setItem("fshint-closed", "1");
    } catch {
      // нечего запоминать
    }
    checkFs();
  });
  document.addEventListener("fullscreenchange", checkFs);
  window.addEventListener("resize", checkFs);
  checkFs();
  const frame = new Graphics().rect(0, 0, W, H).fill(0xffffff);
  world.addChild(frame);
  world.mask = frame;
  // Комиксы живут в отдельном слое: show() переключает сцены и не должен прятать/show-ить комикс —
  // иначе он становится невидимым вместе с кнопкой «Продолжить», а очередь комиксов застревает.
  const comicOverlay = new Container();
  world.addChild(comicOverlay);
  let closeComic: (() => void) | null = null;

  let game: Game | null = null;
  // у каждой локации своя ферма, город и набор квестов; создаются при первом заходе
  const farms: Record<number, Farm> = {};
  const towns: Record<number, Town> = {};
  let worldMap: WorldMap | null = null;
  // подсказки города и карты рисуются поверх всего экрана, отдельно от подсказок фермы
  let worldTut: Tutorial | null = null;
  const curFarm = () => (game ? farms[game.loc] ?? null : null);
  const curTown = () => (game ? towns[game.loc] ?? null : null);

  const show = (scene: Container) => {
    // подсказки не переходят с экрана на экран
    worldTut?.dismiss();
    for (const f of Object.values(farms)) f.dismissTutorial();
    // смена сцены закрывает висящий комикс (иначе его обещание не завершится и новые комиксы не появятся)
    closeComic?.();
    closeComic = null;
    comicOverlay.removeChildren().forEach((c) => c.destroy({ children: true }));
    for (const c of world.children) if (c !== frame && c !== worldTut && c !== comicOverlay) c.visible = c === scene;
  };

  /** Картинки локации n (вредители, фоны, портреты) грузятся при первом заходе — так в памяти нет неиспользуемых локаций; на это время виден экран загрузки. */
  const ensureLocation = async (n: number) => {
    const names = rules.location_images[String(n)] ?? [];
    if (hasImages(names)) return;
    const screen = (window as unknown as { __loader?: { show(): void; set(p: number): void; done(): void } }).__loader;
    screen?.show();
    try {
      await loadImages(names, (f) => screen?.set(f));
    } finally {
      screen?.done();
    }
  };

  // есть ли у города выгруженной локации ещё квесты (карта показывает значок только у городов с квестами)
  const questsLeft: Record<number, boolean> = {};

  /**
   * Ушли в локацию n: ферма, город и картинки остальных локаций выгружаются из памяти.
   * Состояние ферм уже сохранено в игре (persist при уходе), при возвращении всё строится заново, а картинки подгружаются с экраном загрузки.
   */
  const dropOthers = (n: number) => {
    const keep = new Set([...rules.core_images, ...(rules.location_images[String(n)] ?? [])]);
    for (const k of Object.keys(towns).map(Number).filter((k) => k !== n)) {
      questsLeft[k] = towns[k].hasQuests();
      towns[k].destroy({ children: true });
      delete towns[k];
    }
    for (const k of Object.keys(farms).map(Number).filter((k) => k !== n)) {
      farms[k].destroy({ children: true });
      delete farms[k];
    }
    const drop = Object.values(rules.location_images).flat().filter((name) => !keep.has(name));
    void unloadImages(drop);
  };

  /** Создаёт ферму и город локации n (игра уже переключена на неё). */
  const build = (g: Game, n: number) => {
    if (farms[n]) return;
    const lr = locationRules(rules, n);
    const f: Farm = new Farm(lr, g, {
      toTown: () => {
        towns[n].refresh();
        show(towns[n]);
        towns[n].entered();
      },
      toMenu: () => openMenu(f),
      dayEnded: () => recordScore(rules, profiles().find((p) => p.id === g.profile)?.name ?? "Айрис", g.day, g.gold, false, g.difficulty),
    });
    const quests = new QuestEngine(lr.quests, g, {
      removeAllVegetations: () => f.removeAllPlants(),
      marked: (m) => {
        // комикс концовки (exe 0x5226b0): при метке win_var_N вместе с win — ставится метка win_var_N_comics
        // (0x44c2c0) и показывается комикс win_var_N_comics (0x516ef0); проверка идёт при постановке любой
        // из меток, поэтому комикс ждёт обе — то есть появляется после финального диалога, а не выбора
        const winComic = (v: "win_var_1" | "win_var_2") => {
          if (g.marks.includes(v) && g.marks.includes("win") && !g.marks.includes(`${v}_comics`)) {
            g.marks.push(`${v}_comics`);
            void playComic(v);
          }
        };
        if (m === "win_var_1" || m === "win_var_2" || m === "win") {
          winComic("win_var_1");
          winComic("win_var_2");
        }
        if (m === "win") {
          g.trophyBook.award("game_win", 1);
          void comicsQueue.then(() => worldTut?.show("game_fin", 400, 300));
        }
      },
      hasEmptyRidge: () => f.hasEmptyRidge(),
      addVegetation: (v) => f.addVegetation(v),
      removeVegetation: (v) => f.removeVegetation(v),
      location: () => n,
    });
    const t: Town = new Town(lr, g, quests, {
      toFarm: () => {
        show(f);
        f.refresh();
      },
      toMap: () => {
        show(worldMap!);
        worldMap!.opened();
      },
      saved: () => f.persist(),
      menu: () => f.openMenu(),
    }, worldTut!);
    farms[n] = f;
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__farm = f; // отладка в браузере
    towns[n] = t;
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__town = t; // отладка в браузере
    world.addChild(f, t);
  };

  /** Переход в локацию n: ферма текущей сохраняется, состояние игры переключается. */
  let entering = false;
  /** Комиксы показываются по очереди, в отдельном слое поверх сцен. */
  let comicsQueue: Promise<void> = Promise.resolve();
  const playComic = (key: string) => {
    closeComic?.(); // если предыдущий комикс ещё висит, закрываем его — иначе очередь встанет
    comicsQueue = comicsQueue.then(async () => {
      world.setChildIndex(comicOverlay, world.children.length - 1);
      await comicsScreen(comicOverlay, rules, key, (close) => { closeComic = close; });
      closeComic = null;
    });
    return comicsQueue;
  };
  if (import.meta.env.DEV) Object.assign(window, {
    __comics: (key: string) => playComic(key), // отладка: показать комикс
    __closeComic: () => closeComic?.(), // отладка: закрыть висящий комикс
  });
  const enter = async (g: Game, n: number, scene: "farm" | "town") => {
    if (entering) return;
    entering = true;
    try {
      await ensureLocation(n);
    } finally {
      entering = false;
    }
    curFarm()?.persist();
    g.switchLocation(n);
    build(g, n);
    dropOthers(n);
    show(scene === "farm" ? farms[n] : towns[n]);
    farms[n].refresh();
    towns[n].refresh();
    if (scene === "town") towns[n].entered();
    // первый приход в локацию 2–5 — комикс location_N_comix (exe 0x524600: метка location_N_comix, показ - 0x516ef0).
    // Метку ставим только перед самим показом: если комикс не дошёл (перезагрузка, смена сцены), он покажется при следующем входе.
    if (n >= 2 && !g.marks.includes(`comix_${n}`)) {
      void comicsQueue.then(async () => {
        if (g.marks.includes(`comix_${n}`)) return;
        g.marks.push(`comix_${n}`);
        await playComic(String(n));
      });
    }
  };

  const levelsOf = (g: Game) => Object.fromEntries(Object.entries(g.trophies).map(([k, v]) => [k, v.level]));
  const menu = new Menu(rules, {
    hasSave: () => Game.hasSave(),
    options: () => optionsScreen(world, rules, () => undefined),
    highscores: () => highscoresScreen(world, rules, () => undefined),
    trophies: () => {
      const saved = new Game(rules);
      if (Game.hasSave()) saved.load();
      void trophyRoomScreen(world, rules, levelsOf(saved), () => undefined);
    },
    about: () => void aboutScreen(world, rules),
    credits: () => void creditsScreen(world, rules, () => undefined),
    play: (fresh, difficulty, slot) => void start(fresh, difficulty, slot ?? null),
    userName: () => currentProfile()?.name ?? null,
    changeUser: () => selectUserScreen(world, rules, () => menu.refreshUser()),
  });
  const start = async (fresh: boolean, difficulty: Difficulty = "casual", slot: number | null = null) => {
    if (fresh) Game.clearSave();
    const g = new Game(rules);
    if (slot !== null) {
      if (!g.load(slot)) return; // слот не читается — остаёмся в меню
    } else if (!fresh) g.load();
    else g.difficulty = difficulty;
    await ensureLocation(g.loc);
    for (const f of Object.values(farms)) f.destroy({ children: true });
    for (const t of Object.values(towns)) t.destroy({ children: true });
    worldMap?.destroy({ children: true });
    for (const k of Object.keys(farms)) delete farms[Number(k)];
    for (const k of Object.keys(towns)) delete towns[Number(k)];
    for (const k of Object.keys(questsLeft)) delete questsLeft[Number(k)];
    game = g;
    g.onTrophy = (name, level) => void trophyAwardPopup(world, rules, name, level);
    worldTut?.destroy({ children: true });
    worldTut = new Tutorial(rules, g, () => audio.options.warnings);
    build(g, g.loc);
    dropOthers(g.loc);
    worldMap = new WorldMap(rules, g, {
      openTown: (n) => enter(g, n, "town"),
      openFarm: (n) => enter(g, n, "farm"),
      close: () => show(towns[g.loc]),
      hasQuests: (n) => (towns[n] ? towns[n].hasQuests() : questsLeft[n] ?? true),
    }, worldTut);
    world.addChild(worldMap, worldTut);
    audio.playMusic("game");
    // новая игра начинается в городе: слуга ждёт Айрис с письмом (квест old_servant)
    show(fresh ? towns[g.loc] : farms[g.loc]);
    if (fresh) towns[g.loc].entered();
  };
  world.addChild(menu);
  show(menu);
  // как в оригинале: без игрока сначала спрашиваем имя (старое сохранение достанется этому игроку)
  if (!currentProfile()) {
    if (profiles().length) selectUserScreen(world, rules, () => menu.refreshUser());
    else void newUserDialog(world, rules, false).then(() => menu.refreshUser());
  }
  if (import.meta.env.DEV) Object.assign(window, { __game: { app, get farm() { return curFarm(); }, get town() { return curTown(); }, get game() { return game; }, get map() { return worldMap; }, enter: (n: number, scene: "farm" | "town") => game && enter(game, n, scene), menu, has: (names: string[]) => hasImages(names) } });

  // пауза: пробел — «Пауза», Esc и кнопка «Меню» — меню игры; пока висит любое из них, игровые таймеры (и Робин) стоят
  let paused: Container | null = null;
  let closeMenu: (() => void) | null = null;
  let slotsClose: (() => void) | null = null;
  const resume = () => {
    paused?.destroy({ children: true });
    paused = null;
  };
  /** Экран слотов сохранений поверх меню игры; игра стоит, пока открыто меню (closeMenu). */
  const openSlots = (f: Farm, mode: "save" | "load") => {
    slotsClose?.();
    slotsClose = saveLoadScreen(world, rules, mode, {
      confirm: mode === "load",
      pick: (slot) => {
        if (mode === "save") return f.persist(slot);
        closeMenu?.(); // меню закрывается — загруженная игра начинается
        void start(false, undefined, slot);
      },
      close: () => (slotsClose = null),
    });
  };
  function openMenu(f: Farm) {
    if (closeMenu || paused || !game) return;
    const cur = game;
    const done = () => (closeMenu = null);
    closeMenu = gameMenu(world, rules, {
      options: () => optionsScreen(world, rules, done),
      save: () => openSlots(f, "save"),
      load: () => openSlots(f, "load"),
      quests: () => {
        // журнал заданий (quest 159; 290) — как окно паузы: Space/Esc его закрывают
        paused = new QuestScreen(cur, () => (paused = null));
        world.addChild(paused);
      },
      exit: () => {
        done();
        f.persist();
        audio.playMusic("menu");
        show(menu);
      },
      closed: done,
    });
  }
  window.addEventListener("keydown", (e) => {
    // F — полный экран и обратно (работает и в меню); на iPhone Fullscreen API нет — тогда игра ставится на главный экран как PWA
    if (e.code === "KeyF" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
      else void document.documentElement.requestFullscreen?.().catch(() => undefined);
      return;
    }
    if (e.code !== "Space" && e.code !== "Escape") return;
    const farm = curFarm();
    if (!farm || !(farm.visible || curTown()?.visible)) return;
    e.preventDefault();
    if (e.code === "Escape") {
      if (slotsClose) slotsClose();
      else if (closeMenu) closeMenu();
      else if (!paused) openMenu(farm);
      return;
    }
    if (!farm.visible || closeMenu) return;
    if (paused) resume();
    else paused = pauseOverlay(world, rules);
  });
  document.addEventListener("visibilitychange", () => document.hidden && curFarm()?.persist());

  // ?speed=10 ускоряет игровые таймеры (для отладки)
  const speed = Number(new URLSearchParams(location.search).get("speed")) || 1;
  app.ticker.add((t) => {
    const dt = Math.min(t.deltaMS, 100) / 1000;
    worldTut?.update(dt);
    if (worldMap?.visible) worldMap.update(dt);
    if (!paused && !closeMenu) {
      curFarm()?.update(dt * speed);
      if (curTown()?.visible) curTown()!.update(dt);
    }
  });
}

main().catch((e) => {
  (window as unknown as { __loader?: { fail(t: string): void } }).__loader?.fail(`Ошибка: ${e}`);
  console.error(e);
});
