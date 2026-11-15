// Экран титров (CreditsScreen, exe 0x518aa0): открывается кнопкой version в главном меню — (25; 570), 38×25,
// стиль root/button_styles/version. Подписи у кнопки нет: exe читает ProductVersion из ресурса game.exe
// (0x6234f0), а у этой сборки ресурса VERSIONINFO нет, так что кнопка невидима, но кликабельна и открывает титры.
//
// Строки root/credits/@t%d перебираются по возрастанию номера до первой, начинающейся с «%» — t800="%end%"
// маркер конца, сама не показывается (0x518c44, 0x519da0). Шрифт root/credits/font (Dialog.txt), белый
// (0x5b7af0: 255;255;255). Одновременно не больше 5 строк (0x5191e3), новая каждые 1000 мс (0x47b380,
// порог 0x3e8; таймер заводится на 100 000 мс в будущее — 0x519d70, 0x186a0 — поэтому первая строка
// появляется сразу). Столб строк ползёт вверх со скоростью 100 px/s ([0x888a80]=100.0); в exe новая строка
// считается по сетке 90·n + 50 от низа ([0x8890d0]=90, [0x8890c8]=50), но при шаге 1 с и дрейфе 100 px/s
// это даёт схлопывание строк до 10 px — в порту шаг держится постоянным (100 px = скорость × интервал),
// сетка 90·n + 50 определяет только место первой строки. Когда строка уползла за верхний край, она
// убирается; после последней строки список начинается заново (0x51919b: сброс счётчика и очистка).
// У каждой строки ползёт жук из заставки: список loading/@bugs («boar;bug;etti;…»), имя выбирается
// случайно (0x518000: rand по размеру списка), анимация root/bugs/<имя>/anims/move со своей speed и
// play_time — в порту жук стоит слева от строки и перебирает кадры move (его смещение внутри строки и
// ходьба по горизонтали из exe не вытащены — приближение). Подсказка root/credits/@back «Нажать Escape…» —
// по центру ширины (x = 400 − w/2, 0x518f10) на y = 550 (0x226); Esc закрывает экран (0x5192c0).
// Фона у экрана нет — меню остаётся видно позади (в конструкторе задаётся только размер 800×600, 0x518bdd).
import { AnimatedSprite, Container, Rectangle, Texture } from "pixi.js";
import type { Rules } from "./rules";
import { COLOR, H, loadImages, pop, tex, W } from "./ui";

/** Список жуков заставки (properties_ru.xml loading/@bugs) — у каждого строки титров свой случайный. */
const LOADING_BUGS = ["boar", "bug", "etti", "frog", "gusenica", "helper", "kloun", "krab", "ladybird", "lemur", "parrot", "pchela", "snail", "spirit", "turtle"];

/** Кадры анимации move: вертикальная полоса bug_<имя>_move_right, anim_rows кадров (как у вредителя в bugs.ts). */
function bugFrames(rules: Rules, name: string): Texture[] {
  const def = rules.bugs[name];
  const rows = def?.anims.move?.rows ?? 1;
  const t = tex(`bug_${def?.folder ?? name}_move_right`);
  const h = Math.floor(t.height / rows);
  return Array.from({ length: rows }, (_, i) => new Texture({ source: t.source, frame: new Rectangle(0, i * h, t.width, h) }));
}

export async function creditsScreen(parent: Container, rules: Rules, onClose: () => void) {
  await loadImages(LOADING_BUGS.map((n) => `bug_${rules.bugs[n]?.folder ?? n}_move_right`)).catch(() => undefined);
  const layer = new Container();
  const credits = rules.texts.credits ?? { back: "", lines: [] };
  // подсказка рисуется первой — строки проходят поверх неё
  const hint = pop(credits.back.replace(/\\n/g, "\n"), "Dialog", COLOR.white, { align: "center" });
  hint.position.set(W / 2, 550);
  layer.addChild(hint);
  const stack = new Container();
  layer.addChild(stack);

  const lines = credits.lines.map((s) => s.replace(/\\n/g, "\n"));
  const bugs: { name: string; frames: Texture[] }[] = [];
  for (const name of LOADING_BUGS) {
    try {
      bugs.push({ name, frames: bugFrames(rules, name) });
    } catch {
      // картинки жука нет — он просто не участвует в выборе
    }
  }
  const SPEED = 100; // px/s вверх ([0x888a80])
  const BOTTOM = 50; // отступ нижней строки от низа экрана ([0x8890c8])
  const MAX = 5; // строк на экране (0x5191e3)
  let index = 0;
  let sinceLine = 1; // первая строка появляется сразу (таймер в exe заводится далеко в будущее, 0x519d70)

  const spawn = () => {
    const row = new Container();
    row.y = H - BOTTOM;
    const label = pop(lines[index], "Dialog", COLOR.white, { align: "center" });
    label.position.set(W / 2, 0);
    row.addChild(label);
    if (bugs.length) {
      // случайный жук из списка заставки слева от строки, по центру её высоты
      const pick = bugs[Math.floor(Math.random() * bugs.length)];
      const anim = rules.bugs[pick.name]?.anims.move;
      const bug = new AnimatedSprite(pick.frames, true);
      bug.play();
      bug.animationSpeed = (anim?.rows ?? 1) / (anim?.time || 1) / 60;
      bug.anchor.set(1, 0.5);
      bug.position.set(W / 2 - label.textWidth / 2 - 4, label.textHeight / 2);
      row.addChildAt(bug, 0);
    }
    stack.addChild(row);
    index++;
  };

  let last = performance.now();
  const step = (now: number) => {
    if (layer.destroyed) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    sinceLine += dt;
    if (sinceLine >= 1 && stack.children.length < MAX && index < lines.length) {
      sinceLine = 0;
      spawn();
    }
    for (const row of stack.children) row.y -= SPEED * dt;
    // строки, уползшие за верхний край, убираются
    for (const row of stack.children.slice()) {
      if (row.y + row.height < 0) {
        stack.removeChild(row);
        row.destroy({ children: true });
      }
    }
    // после последней строки список начинается заново (0x51919b)
    if (index >= lines.length && !stack.children.length) {
      index = 0;
      sinceLine = 1; // первая строка следующего круга появляется сразу
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);

  // Esc — единственный выход (0x5192c0 снимает экран со стека)
  const key = (e: KeyboardEvent) => {
    if (e.code !== "Escape") return;
    e.preventDefault();
    close();
  };
  const close = () => {
    window.removeEventListener("keydown", key);
    layer.destroy({ children: true });
    onClose();
  };
  window.addEventListener("keydown", key);
  parent.addChild(layer);
}
