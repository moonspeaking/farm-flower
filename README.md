# Ферма Айрис: Цветок Стихий — разбор

Разбор «Ферма Айрис: Цветок Стихий» (SmallGames, 2013; данные игры 2009 г.). Это та же игра, что
первая «Ферма Айрис» (порт — `/Users/Apple/PycharmProjects/Farm`), плюс пятая локация «Город Майя»
и доработанные механики. Цель та же: веб-порт на оригинальных ресурсах и правилах.

## Откуда данные

Чистые файлы — из установщика `7565_sumrFermaAyrisCvetokStihiy.exe` (Downloads), а не из установленных
копий в CrossOver: там `xml/properties*.xml` правились вручную (например, в
`Program Files/Game/xml/properties_ru.xml` вырезано растение `bush_2`), а в установщике — версия
от 22.10.2009.

```bash
python3 tools/extract_installer.py ~/Downloads/7565_sumrFermaAyrisCvetokStihiy.exe original/install
python3 tools/unpak.py original/install/main.pak original/pak
```

`extract_installer.py` разбирает Smart Install Maker без запуска (нужен `7zz`: `brew install sevenzip`),
`unpak.py` — PopCap PAK (XOR 0xF7), взят из `MagicFarm2Port`.

| Папка | Что там |
|------|---------|
| `original/install/` | 110 файлов установщика: `game.exe` (сама игра, 5,6 МБ), `main.pak`, `xml/`, шрифты `DATA/` |
| `original/pak/data/` | 3003 файла из `main.pak`: картинки, звук, частицы, шрифты (ru/de/jp) |
| `tools/` | распаковщики |
| `docs/DIFF_FROM_MF1.md` | чем игра отличается от первой «Фермы» |

`original/` в git не кладётся (`.gitignore`).

## Порт (форк кода `Farm`)

`web/` и экспортёры `tools/` скопированы из `Farm` и доработаны под данные «Цветка Стихий».

```bash
python3 -m venv .venv && .venv/bin/pip install pillow numpy
# папка игры для экспортёров: original/game/{xml -> ../install/xml, data -> ../pak/data}
cd web
../.venv/bin/python ../tools/export_mf1.py ../original/game .
../.venv/bin/python ../tools/export_fonts.py ../original/game .
../.venv/bin/python ../tools/export_cursors.py ../original/game .
../.venv/bin/python ../tools/export_particles.py ../original/game .
npm ci && npx vite
```

Что пришлось поменять в экспортёрах:
- логика в `properties.xml`, интерфейс в `properties_ru.xml` — читаются одним деревом (сначала логика);
- `ru.xml` в UTF-8 с BOM, сущность `&cr;` (перенос строки), голые `&`, элементы после `</root>`;
- повтор атрибута в одном теге (`location_1.xml`, `well_object`: `pail_2` дважды) — берётся последний;
- волны: приставки `casual-` / `hardcore-` (и опечатка `hardocre-`), модификаторы `boar!@1*2$3` — сохраняются в `specs`, смысл не разобран;
- у волны нет `delay` (берётся 0 — **допущение**, проверить по exe);
- `<dynamic_obstacle name="well_00" removed="well_5"/>` — подмена объекта в локации;
- число локаций — по файлам `location_N.xml` (5);
- шрифты: `data/ru/fonts`, файлы в UTF-16, картинки вида `X.jpg` + `X_.png`.

Сейчас работает: меню, ферма и город всех пяти локаций открываются без ошибок, графика своя.

Не сделано (по механикам первой игры, раскладка и новое):
- раскладка интерфейса взята из первой игры: пункты меню, панель слева (`game_screen/item_stat`), экран загрузки
  (у `load_progress` другое число кадров) стоят не на своих местах — брать из `properties_ru.xml` «Цветка»;
- новые механики из `docs/DIFF_FROM_MF1.md` (сложность, серии ударов, призы, автобукеты, сова/часы/рог, уровни колодца,
  длина дня min→max, трофеи, дерево-идол, выбор квестов) не реализованы;
- `Farm/docs/EXE_REVERSE_NOTES.md` (скопирован как `docs/MF1_EXE_NOTES.md`) — адреса для `Magic Farm_fixed.exe`, у `game.exe` они другие.
