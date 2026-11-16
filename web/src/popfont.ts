// Растровые шрифты оригинала (tools/export_fonts.py → public/fonts): белые глифы с обводкой, красятся цветом.
import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";

type Glyph = [number, number, number, number, number, number, number]; // x, y, w, h, ширина, dx, dy

interface FontData {
  image: string;
  ascent: number;
  height: number;
  glyphs: Record<string, Glyph>;
  space: number;
}

export type FontName =
  | "BritannicBold14" | "TC4_16_en" | "Verdana14" | "ComicSansMS18" | "comic_18"
  | "rubius_20" | "rubius_24" | "rubius_30" | "arial_narrow_bold_24" | "palatino_14"
  | "comic_stroke_white_14" | "comic_stroke_white_18" | "comic_stroke_white_24"
  | "float_points" | "bonus_events_white" | "time"
  // интерфейс «Цветка Стихий» (resource.xml): цветные шрифты меню, кнопок и панели
  | "Main-normal" | "Main-normal-active" | "button-normal" | "button-normal-active"
  | "stat_control_fonts_1" | "stat_control_fonts_2" | "stat_control_fonts_menu_normal"
  | "stat_control_fonts_menu-normal-active" | "stat_control_fonts_menu_deactive"
  | "palatino_15" | "Dialog" | "Dialog2" | "logoff" | "logoff-active" | "quest";

const fonts = new Map<string, FontData>();
const sheets = new Map<string, Texture>();
const cells = new Map<string, Texture>();

export async function loadFonts() {
  const data = (await (await fetch("fonts/fonts.json")).json()) as Record<string, FontData>;
  const images = [...new Set(Object.values(data).map((f) => f.image))];
  await Assets.load(images.map((n) => ({ alias: `font:${n}`, src: `fonts/${n}.webp` })));
  for (const n of images) sheets.set(n, Texture.from(`font:${n}`));
  for (const [name, f] of Object.entries(data)) fonts.set(name, f);
}

/** Глиф символа; в части шрифтов «Цветка Стихий» (Dialog, Dialog2…) нет «ё» — тогда «е», как в книжном наборе. */
function glyph(font: FontData, ch: string): Glyph | undefined {
  return font.glyphs[ch] ?? (ch === "ё" ? font.glyphs["е"] : ch === "Ё" ? font.glyphs["Е"] : undefined);
}

function cell(font: FontData, g: Glyph) {
  const key = `${font.image}:${g[0]},${g[1]},${g[2]},${g[3]}`;
  let t = cells.get(key);
  if (!t) {
    t = new Texture({ source: sheets.get(font.image)!.source, frame: new Rectangle(g[0], g[1], g[2], g[3]) });
    cells.set(key, t);
  }
  return t;
}

export interface PopOptions {
  color?: number;
  align?: "left" | "center" | "right";
  /** Ширина, после которой строки переносятся по словам. */
  wrap?: number;
  /** Добавка к высоте строки (line_offset в XML). */
  lineOffset?: number;
  scale?: number;
}

/**
 * Надпись шрифтом оригинала. Начало координат — левый край (align=left), центр (center) или правый край (right)
 * блока; anchor.set(ax, ay) задаёт другую точку привязки, как у обычного текста.
 */
/** «Широкий экран»: масштаб мира по осям разный, буквы сжимаются по X на ky/kx, чтобы не растягиваться (в обычном режиме 1). */
let textAspect = 1;
export function setTextAspect(v: number) {
  textAspect = v;
}

export class PopLabel extends Container {
  private readonly body = new Container();
  private value = "";
  private ax = 0;
  private ay = 0;
  private color: number;
  readonly anchor = {
    set: (x: number, y: number = x) => {
      this.ax = x;
      this.ay = y;
      this.place();
    },
  };
  textWidth = 0;
  textHeight = 0;

  constructor(readonly font: FontName, text: string, private readonly opts: PopOptions = {}) {
    super();
    this.addChild(this.body);
    // буквы лежат в body: его сжимают по X вокруг точки привязки надписи
    this.body.onRender = () => {
      this.body.scale.x = textAspect;
      this.body.x = this.pivot.x * (1 - textAspect);
    };
    this.color = opts.color ?? 0xffffff;
    // по умолчанию точка привязки — по краю выравнивания: left — слева, center — по центру, right — справа
    this.ax = opts.align === "center" ? 0.5 : opts.align === "right" ? 1 : 0;
    this.text = text;
  }

  get text() {
    return this.value;
  }

  set text(v: string) {
    if (v === this.value && this.body.children.length) return;
    this.value = v;
    this.layout();
  }

  setColor(color: number) {
    this.color = color;
    for (const c of this.body.children) (c as Sprite).tint = color;
  }

  private lines(f: FontData): string[] {
    const width = (s: string) => [...s].reduce((a, ch) => a + this.advance(f, ch), 0);
    const out: string[] = [];
    for (const raw of this.value.split("\n")) {
      if (!this.opts.wrap) {
        out.push(raw);
        continue;
      }
      let line = "";
      for (const word of raw.split(" ")) {
        const test = line ? `${line} ${word}` : word;
        if (line && width(test) > this.opts.wrap) {
          out.push(line);
          line = word;
        } else line = test;
      }
      out.push(line);
    }
    return out;
  }

  private advance(f: FontData, ch: string) {
    if (ch === " ") return f.space;
    const g = glyph(f, ch) ?? f.glyphs["?"];
    return g ? g[4] : f.space;
  }

  private layout() {
    const f = fonts.get(this.font);
    this.body.removeChildren().forEach((c) => c.destroy());
    if (!f) return;
    const k = this.opts.scale ?? 1;
    const lineH = (f.height + (this.opts.lineOffset ?? 0)) * k;
    const lines = this.lines(f);
    const widths = lines.map((l) => [...l].reduce((a, ch) => a + this.advance(f, ch), 0) * k);
    this.textWidth = Math.max(0, ...widths);
    this.textHeight = lines.length * lineH;
    const align = this.opts.align ?? "left";
    lines.forEach((line, row) => {
      let x = align === "left" ? 0 : align === "center" ? (this.textWidth - widths[row]) / 2 : this.textWidth - widths[row];
      for (const ch of line) {
        const g = glyph(f, ch) ?? (ch === " " ? undefined : f.glyphs["?"]);
        if (g) {
          const s = new Sprite(cell(f, g));
          s.tint = this.color;
          s.scale.set(k);
          s.position.set(x + g[5] * k, row * lineH + g[6] * k);
          this.body.addChild(s);
        }
        x += this.advance(f, ch) * k;
      }
    });
    // щёлкать можно по всему блоку надписи, а не только по самим буквам (между буквами и пробелами клик иначе уходил под кнопку)
    this.hitArea = new Rectangle(0, 0, this.textWidth, this.textHeight);
    this.place();
  }

  private place() {
    // целые пиксели: иначе буквы ложатся между пикселями и расплываются
    this.pivot.set(Math.round(this.ax * this.textWidth), Math.round(this.ay * this.textHeight));
  }
}

export const rgb = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
