"""Частицы «Фермы Айрис»: data/particles/*.psi → web/public/data/particles.json.

Формат .psi разобран по дизассемблеру exe (game.exe: загрузчик 0x79f760, создание эмиттера 0x7e34c0 → 0x79e840,
такт 0x79eb00, отрисовка 0x79f4c0). Файл — ровно 128 байт, читается fread'ом без разбора:

  +0x00 u32   (в игре перезаписывается указателем на картинку; в файле — служебные 5,4 / 4,4)
  +0x04 i32   частиц в секунду (эмиссия: rate·dt, остаток копится)
  +0x08 f32   длительность эмиттера, с (−1 — бесконечно; старт 0x79f430 даёт elapsed −1 и время не тикает)
  +0x0c f32×2 время жизни частицы, с: случайно от…до
  +0x14 f32   направление, рад (0 — вверх: угол = value − π/2)
  +0x18 f32   разброс направления, рад (2π — во все стороны)
  +0x1c u32   флаг: направление отсчитывается от отрезка эмиттера (назад по движению)
  +0x20 f32×2 начальная скорость       ┐
  +0x28 f32×2 гравитация (вниз, +y)    │ загрузчик 0x79f760 делит эти 8 чисел
  +0x30 f32×2 радиальное ускорение     │ на 100 (0x888a80) — эквивалент ×0,01
  +0x38 f32×2 тангенциальное ускорение ┘ (от/к эмиттеру; вдоль перпендикуляра)
  +0x40 f32   масштаб в начале, +0x44 в конце, +0x48 разброс начального (0…1)
  +0x4c f32   «вращение» в начале, +0x50 в конце, +0x54 разброс; угол рисования = вращение·возраст
  +0x58 f32×4 цвет RGBA в начале, +0x68 f32×4 в конце, +0x78 разброс RGB, +0x7c разброс A

Скорость — пикселей за такт обновления (позиция += скорость без dt); список эмиттеров 0x7e3340 тикает их
шагами ровно 0,01 с (100 Гц), полёт к панели 0x427930 — каждым кадром с реальным dt.

Запуск: python3 export_particles.py "<папка игры>" <папка web>
"""
import json
import struct
import sys
from pathlib import Path

SCALE = 0.01


def parse(raw):
    assert len(raw) == 128
    head, rate = struct.unpack_from("<Ii", raw, 0)
    f = list(struct.unpack_from("<30f", raw, 8))
    flag = struct.unpack_from("<I", raw, 0x1C)[0]
    s = lambda v: v * SCALE  # noqa: E731
    return {
        "rate": rate,
        "duration": f[0],
        "life": [f[1], f[2]],
        "angle": f[3],
        "spread": f[4],
        "relative": bool(flag),
        "speed": [s(f[6]), s(f[7])],
        "gravity": [s(f[8]), s(f[9])],
        "radial": [s(f[10]), s(f[11])],
        "tangential": [s(f[12]), s(f[13])],
        "scale": {"start": f[14], "end": f[15], "var": f[16]},
        "spin": {"start": f[17], "end": f[18], "var": f[19]},
        "color_start": f[20:24],
        "color_end": f[24:28],
        "color_var": [f[28], f[29]],
    }


def main():
    src = Path(sys.argv[1]) / "data" / "particles"
    out = Path(sys.argv[2]) / "public" / "data"
    out.mkdir(parents=True, exist_ok=True)
    result = {p.stem: parse(p.read_bytes()) for p in sorted(src.glob("*.psi"))}
    (out / "particles.json").write_text(json.dumps(result, indent=1))
    for k, v in result.items():
        print(k, v["rate"], v["duration"], v["life"], v["speed"], v["color_start"], v["color_end"])


if __name__ == "__main__":
    main()
