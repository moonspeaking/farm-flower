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
