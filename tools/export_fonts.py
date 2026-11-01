"""Растровые шрифты PopCap «Фермы Айрис» → web/public/fonts (webp + fonts.json).

Файл шрифта (data/fonts/X.txt, cp1251) задаёт CharList (символы), WidthList (ширины), RectList
(прямоугольники в картинке), OffsetList (смещения) и картинку слоя Main. Картинка — белые буквы с
встроенной обводкой, игра красит их цветом из XML (белое × цвет). Одна картинка может обслуживать
несколько файлов (BritannicBold14, TC4_16_en и Verdana14 — все на SegoeUI14Bold).

Запуск: python3 export_fonts.py "<папка игры>" <папка web>
"""
import json
import re
import sys
from pathlib import Path

from PIL import Image

# шрифты, которые использует игра (resource.xml и properties_ru.xml)
FONTS = [
    "BritannicBold14", "TC4_16_en", "Verdana14", "ComicSansMS18", "comic_18",
    "rubius_20", "rubius_24", "rubius_30", "arial_narrow_bold_24", "palatino_14",
    "comic_stroke_white_14", "comic_stroke_white_18", "comic_stroke_white_24",
    "float_points", "bonus_events_white", "time",
]
# шрифты интерфейса «Цветка Стихий» (resource.xml): пункты меню, кнопки, панель слева, диалоги
FONTS_FLOWER = [
    "Main-normal", "Main-normal-active", "button-normal", "button-normal-active",
    "stat_control_fonts_1", "stat_control_fonts_2", "stat_control_fonts_menu_normal",
    "stat_control_fonts_menu-normal-active", "stat_control_fonts_menu_deactive",
    "palatino_15", "Dialog", "Dialog2", "logoff", "logoff-active", "quest",
]

# символ в кавычках; обратная косая записана как '\\\\' (шрифты интерфейса «Цветка Стихий»)
STR = re.compile(r"'(\\\\|.)'|\"(\\\\|.)\"", re.S)


def section(text, name):
    m = re.search(rf"Define\s+{name}\s*(.*?);\s*(?=Define|CreateLayer|\Z)", text, re.S)
    return m.group(1) if m else ""


def parse(path):
    raw = path.read_bytes()
    # в «Цветке Стихий» файлы шрифтов в UTF-16 (BOM FF FE), в первой игре — cp1251
    text = raw.decode("utf-16") if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else raw.decode("cp1251")
    chars = [(a or b).replace("\\\\", "\\") for a, b in STR.findall(section(text, "CharList"))]
    widths = [int(x) for x in re.findall(r"-?\d+", section(text, "WidthList"))]
    rects = [tuple(int(v) for v in t) for t in re.findall(r"\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)", section(text, "RectList"))]
    offs = [tuple(int(v) for v in t) for t in re.findall(r"\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)", section(text, "OffsetList"))]
    image = re.search(r"LayerSetImage\s+Main\s+'([^']+)'", text).group(1)
    ascent = int(re.search(r"LayerSetAscent\s+Main\s+(\d+)", text).group(1))
    glyphs = {}
    for i, ch in enumerate(chars):  # повторы перекрывают друг друга, как в игре
        if i < len(rects) and i < len(widths):
            dx, dy = offs[i] if i < len(offs) else (0, 0)
            glyphs[ch] = [*rects[i], widths[i], dx, dy]
    spaces = {c: int(w) for c, w in re.findall(r"LayerSetCharWidths\s+Main\s+\(\s*'(.)'\s*\)\s*\(\s*(\d+)\s*\)", text)}
    return {"image": image, "ascent": ascent, "glyphs": glyphs, "space": spaces.get(" ", 5)}


MAX_WIDTH = 2048  # на многих телефонах предел текстуры 4096, а у части старых 2048: широкие полосы шрифтов переупаковываем строками


def repack(img, fonts):
    """Если картинка шире MAX_WIDTH, глифы укладываются строками и координаты во всех шрифтах этой картинки пересчитываются."""
    if img.width <= MAX_WIDTH:
        return img
    rects = sorted({tuple(g[:4]) for f in fonts for g in f["glyphs"].values() if g[2] > 0 and g[3] > 0}, key=lambda r: (r[1], r[0]))
    placed, x, y, row_h = {}, 0, 0, 0
    for r in rects:
        if x + r[2] > MAX_WIDTH:
            x, y, row_h = 0, y + row_h + 2, 0
        placed[r] = (x, y)
        x += r[2] + 2
        row_h = max(row_h, r[3])
    out = Image.new("RGBA", (MAX_WIDTH, y + row_h), (0, 0, 0, 0))
    for r, (nx, ny) in placed.items():
        out.paste(img.crop((r[0], r[1], r[0] + r[2], r[1] + r[3])), (nx, ny))
    for f in fonts:
        for g in f["glyphs"].values():
            if tuple(g[:4]) in placed:
                g[0], g[1] = placed[tuple(g[:4])]
    return out


def load_font_image(folder, image):
    """Картинка шрифта: X.jpg / X.png + маска X_.png / X_.gif (альфа в яркости), либо X.png / _X.png / _X.jpg."""
    color = next((c for c in (folder / f"{image}.jpg", folder / f"{image}.png") if c.exists()), None)
    mask = next((m for m in (folder / f"{image}_.png", folder / f"{image}_.gif") if m.exists()), None)
    if color and mask:
        # цветная картинка + маска (stat_control_fonts_1.png + _.gif): буквы своего цвета, белым не перекрашиваются
        img = Image.open(color).convert("RGBA")
        img.putalpha(Image.open(mask).convert("L").resize(img.size))
        return img
    src = next(p for p in (folder / f"{image}.png", folder / f"_{image}.png", folder / f"_{image}.jpg") if p.exists())
    img = Image.open(src).convert("RGBA")
    if img.getchannel("A").getextrema()[0] == 255:
        # картинка без альфы: яркость — это маска глифа (чёрное — прозрачно), буквы белые
        lum = img.convert("L")
        img = Image.merge("RGBA", (*(Image.new("L", img.size, 255),) * 3, lum))
    return img


def main():
    game, web = Path(sys.argv[1]), Path(sys.argv[2])
    # русские шрифты «Цветка Стихий» лежат отдельно (data/ru/fonts, с кириллицей и своими картинками);
    # шрифтов интерфейса там нет — они в data/fonts (и уже с кириллицей)
    dirs = [d for d in (game / "data" / "ru" / "fonts", game / "data" / "fonts") if d.exists()]
    names = FONTS + [f for f in FONTS_FLOWER if (dirs[-1] / f"{f}.txt").exists()]
    out = web / "public" / "fonts"
    out.mkdir(parents=True, exist_ok=True)
    parsed, folder = {}, {}
    for name in names:
        d = next(d for d in dirs if (d / f"{name}.txt").exists())
        parsed[name], folder[name] = parse(d / f"{name}.txt"), d
    by_image = {}
    for name, f in parsed.items():
        by_image.setdefault((folder[name], f["image"]), []).append(f)
    for (d, image), fonts in by_image.items():
        img = load_font_image(d, image)
        for f in fonts:
            f["height"] = img.height  # высота строки — по исходной полосе, а не по переупакованной картинке
        img = repack(img, fonts)
        img.save(out / f"{image}.webp", lossless=True)
    for name, f in parsed.items():
        print(f"{name:38} {len(f['glyphs']):3} глифов, картинка {f['image']}")
    (out / "fonts.json").write_text(json.dumps(parsed, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
