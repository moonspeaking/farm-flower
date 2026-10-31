// Экраны игроков «Цветка Стихий»: «Выберите игрока» (select_user, 349×450) и «Введите ваше имя.» (new_user, 503×215).
import { Container, Graphics, Rectangle } from "pixi.js";
import { rgb } from "./popfont";
import { createProfile, currentProfile, deleteProfile, NAME_MAX, profiles, selectProfile } from "./profiles";
import type { Rules } from "./rules";
import { fmt } from "./rules";
import { COLOR, dialog, H, image, pop, textButton, W } from "./ui";

function shade() {
  const s = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.45 });
  s.eventMode = "static";
  return s;
}

/**
 * Ввод имени нового игрока. Поле — HTML-input поверх холста (на телефоне так открывается клавиатура),
 * в рамке edit_x/edit_y (150; 90) 240 × 24. true — игрок создан и стал текущим; false — «Отмена» (при cancelable = false отменить нельзя).
 */
export function newUserDialog(parent: Container, rules: Rules, cancelable = true): Promise<boolean> {
  return new Promise((resolve) => {
    const layer = new Container();
    layer.addChild(shade());
    const box = new Container();
    box.position.set(Math.round((W - 503) / 2), Math.round((H - 215) / 2));
    box.addChild(image("new_user_bg"));
    // title: stat_control_fonts_menu_normal белым по центру окна, y = 48
    const header = pop(rules.texts.headers.enter_new_user_name ?? "Введите ваше имя.", "stat_control_fonts_menu_normal", COLOR.white, { align: "center" });
    header.position.set(251, 48);
    box.addChild(header);

    const input = document.createElement("input");
    input.maxLength = NAME_MAX;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.enterKeyHint = "done";
    Object.assign(input.style, {
      position: "fixed", zIndex: "20", border: "0", outline: "none", background: "transparent",
      color: "#b4b4b4", // text_color 180; 180; 180 fontFamily: '"Comic Sans MS", "Comic Neue", cursive', fontWeight: "bold", padding: "0 4px", boxSizing: "border-box",
    });
    // поле следует за холстом: координаты окна → экранные (масштаб и поля вокруг 800×600)
    const place = () => {
      const canvas = document.querySelector<HTMLCanvasElement>("#game canvas");
      if (!canvas || box.destroyed) return;
      const r = canvas.getBoundingClientRect();
      const a = box.toGlobal({ x: 150, y: 90 });
      const b = box.toGlobal({ x: 150 + 240, y: 90 + 24 });
      const k = r.width / canvas.clientWidth || 1;
      Object.assign(input.style, {
        left: `${r.left + a.x * k}px`, top: `${r.top + a.y * k}px`,
        width: `${(b.x - a.x) * k}px`, height: `${(b.y - a.y) * k}px`, fontSize: `${(b.y - a.y) * k * 0.72}px`,
      });
    };
    document.body.appendChild(input);
    requestAnimationFrame(() => {
      place();
      input.focus();
    });
    addEventListener("resize", place);

    const finish = (ok: boolean) => {
      removeEventListener("resize", place);
      input.remove();
      layer.destroy({ children: true });
      resolve(ok);
    };
    const submit = () => {
      if (createProfile(input.value)) return finish(true);
      input.focus(); // пустое или уже занятое имя — ждём другое
      input.select();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
      else if (e.key === "Escape" && cancelable) finish(false);
      e.stopPropagation(); // F и пробел в поле — это буквы, а не полный экран и пауза
    });
    const ok = textButton(rules.texts.buttons.ok ?? "OK", submit);
    ok.position.set(71 + 12, 117 + 12); // ok (71; 117) 25×24 — на левом листе
    box.addChild(ok);
    if (cancelable) {
      const cancel = textButton(rules.texts.buttons.cancel ?? "Отмена", () => finish(false));
      cancel.position.set(325 + 36, 127 + 12); // cancel (325; 127) 73×24 — на правом листе
      box.addChild(cancel);
    }
    layer.addChild(box);
    parent.addChild(layer);
  });
}

/** Список игроков на свитке: выбор, «Создать», «Удалить», OK. onClose вызывается, когда выбран текущий игрок. */
export function selectUserScreen(parent: Container, rules: Rules, onClose: () => void) {
  const layer = new Container();
  layer.addChild(shade());
  const box = new Container();
  box.position.set(Math.round((W - 349) / 2), Math.round((H - 450) / 2));
  // фон 417×497 игра растягивает до размеров окна 349×450 (как в опциях)
  const bg = image("select_user_bg");
  bg.width = 349;
  bg.height = 450;
  box.addChild(bg);
  const header = pop(rules.texts.headers.select_user ?? "Выберите игрока", "stat_control_fonts_menu_normal", COLOR.white, { align: "center" });
  header.position.set(5 + 174.5, 64); // title (5; 64) 349 по центру
  box.addChild(header);

  // list_box_x/y (90; 105) 170 × 190, шрифт stat_control_1 цвета 180; выбранная строка — заливка 245; 215; 109
  const ROW = 25;
  const VISIBLE = Math.floor(190 / ROW);
  const list = new Container();
  list.position.set(90, 105);
  list.hitArea = new Rectangle(0, 0, 170, 190);
  list.eventMode = "static";
  box.addChild(list);
  let selected = currentProfile()?.id ?? profiles()[0]?.id ?? null;
  let scroll = 0;
  const render = () => {
    list.removeChildren().forEach((c) => c.destroy({ children: true }));
    const users = profiles();
    scroll = Math.max(0, Math.min(scroll, users.length - VISIBLE));
    users.slice(scroll, scroll + VISIBLE).forEach((u, i) => {
      const row = new Container();
      row.y = i * ROW;
      const on = u.id === selected;
      row.addChild(new Graphics().rect(0, 0, 170, ROW - 1).fill({ color: rgb(245, 215, 109), alpha: on ? 1 : 0.001 }));
      const l = pop(u.name, "stat_control_fonts_1", rgb(180, 180, 180));
      l.position.set(6, 2);
      row.addChild(l);
      row.eventMode = "static";
      row.cursor = "pointer";
      row.on("pointertap", () => {
        selected = u.id;
        render();
      });
      list.addChild(row);
    });
  };
  list.on("wheel", (e) => {
    scroll += Math.sign(e.deltaY);
    render();
  });

  const close = () => {
    layer.destroy({ children: true });
    onClose();
  };
  const create = async () => {
    if (await newUserDialog(parent, rules)) selected = currentProfile()?.id ?? selected;
    render();
  };
  const remove = async () => {
    const u = profiles().find((p) => p.id === selected);
    if (!u) return;
    const r = await dialog(parent, {
      body: fmt(rules.texts.users?.delete_confirmation ?? "Удалить игрока %name%?", { name: u.name }),
      buttons: [{ text: rules.texts.buttons.yes ?? "Да", value: "ok" }, { text: rules.texts.buttons.no ?? "Нет", value: "no" }],
    });
    if (r !== "ok") return;
    deleteProfile(u.id);
    selected = currentProfile()?.id ?? profiles()[0]?.id ?? null;
    render();
  };
  const ok = () => {
    if (!selected) return void create(); // без игроков играть нельзя — сначала имя
    selectProfile(selected);
    close();
  };
  // new (136; 322) 78×24, delete (132; 344) 87×24, ok (161; 367) 25×24 — текст по центру рамок
  const button = (text: string, x: number, y: number, w: number, fn: () => void) => {
    const b = textButton(text, fn);
    b.position.set(x + w / 2, y + 12);
    box.addChild(b);
  };
  button(rules.texts.buttons.new_user ?? "Создать", 136, 322, 78, () => void create());
  button(rules.texts.buttons.delete ?? "Удалить", 132, 344, 87, () => void remove());
  button(rules.texts.buttons.ok ?? "OK", 161, 367, 25, ok);
  render();
  layer.addChild(box);
  parent.addChild(layer);
}
