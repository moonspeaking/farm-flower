"""Экспорт «Фермы Айрис» (Magic Farm 1) в веб: картинки и правила первой локации.

Картинки PopCap: X.jpg (цвет) + X_.png (альфа в яркости) → web/public/img/<имя>.webp с альфой.
Правила: xml/properties_ru.xml, xml/locations/location_1.xml, xml/locations/items.xml,
xml/ru/ru.xml (cp1251 без объявления кодировки) → web/public/data/rules.json. Числа не правятся.

Запуск: python3 export_mf1.py "<папка игры>" <папка web>
"""
import json
import subprocess
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image

# имя в вебе -> путь в data/ без расширения
IMAGES = {
    "bg": "game/farms/location_1",
    "stat_panel": "game/stat_control",
    "round_button": "buttons/back",
    "tut_circle": "tutorial/circle_103",
    "tut_circle_large": "tutorial/circle_large_smooth",
    "tut_dead": "tutorial/first_dead_flower",
    "tut_basket": "tutorial/bouquets_shop_busket",
    "tut_bouquets": "tutorial/bouquets_shop_bouquets",
    "particle_star": "particles/water-changes",
    "particle_sparkle": "particles/level-available",
    "dialog": "main_menu/dialog_roll",
    "shop_small": "game/shop/shop_button_small",
    "shop_small_cant": "game/shop/shop_button_small_cant_buy",
    "shop_medium": "game/shop/shop_button_medium",
    "shop_medium_cant": "game/shop/shop_button_medium_cant_buy",
    "veg_baloon": "game/shop/buy_veg_baloon",
    "clock_back": "game/whether_time_ctrl/back",
    "clock_fore": "game/whether_time_ctrl/fore",
    "clock_pointer": "game/whether_time_ctrl/pointer",
    "weather_normal": "game/whether_time_ctrl/normal",
    "ridge": "obstacles/ridge_00",
    "well": "obstacles/well_00",
    "barrel": "game/farms/water_storage/barrel_01",
    "barrel_water": "game/farms/water_storage/barrel_water_01",
    "pail": "game/farms/water_storage/farm_1_pail_1",
    "pail_water": "game/farms/water_storage/farm_1_water_1",
    "pail_mask": "game/farms/water_storage/farm_1_mask_1",
    "box": "game/farms/product_storage/farm_1_storage_1",
    "box_content": "game/farms/product_storage/farm_1_content_1",
    "load_progress": "main_menu/load_progress",
    "barrel_mask": "game/farms/water_storage/barrel_mask_01",
    "box_mask": "game/farms/product_storage/farm_1_mask_1",
    "drop": "game/progresses/drop",
    "flower": "game/progresses/flower",
    "drop_helper": "game/progresses/drop_helper",
    "heart_small": "game/progresses/heart_small",
    "heart_strong": "game/progresses/heart_strong",
    "waterpot": "game/waterpot",
    "cursor_pour": "cursors/pour",
    "menu_bg": "main_menu/main_menu_background",
    "menu_title": "main_menu/title",
    "comics": "main_menu/first_comics",
    "town_bg": "game/towns/location_1",
    "dialog_next": "buttons/dialog_next_normal",
    "dialog_next_selected": "buttons/dialog_next_selected",
    "dialog_prev": "buttons/dialog_prev_normal",
    "dialog_prev_selected": "buttons/dialog_prev_selected",
    "quest_info": "buttons/quest_info_normal",
    "bq_back": "game/bouquets/bouquets_back",
    "lu_back": "game/level_up/level_up_back",
    "rubber_back": "game/shop/buy_shop_item_back",
    # «Цветок Стихий»: стручки-полоски умений (10 кадров анимации), рамки выбранного / наведённого умения
    "lu_bob": "game/level_up/bob_prog",
    "lu_bob_inv": "game/level_up/bob_prog_inv",
    "lu_bob_sel": "game/level_up/bob_prog_sel",
    "lu_bob_sel_inv": "game/level_up/bob_prog_sel_inv",
    "lu_selected": "game/level_up/selected",
    "lu_overed": "game/level_up/overed",
    "lu_progress": "game/level_up/progress",
    "lu_glass": "game/level_up/glass",
    "lu_girl": "game/level_up/girl",
    "lu_helper": "game/level_up/helper",
    "lu_farm": "game/level_up/farm",
    "lu_trade": "game/level_up/trade",
    "lu_attack": "game/level_up/attack",
    "lu_helper_attack": "game/level_up/helper_attack",
    "lu_helper_pour": "game/level_up/helper_pour",
    "lu_helper_product": "game/level_up/helper_product",
    "lu_helper_attack_off": "game/level_up/helper_attack_disabled",
    "lu_helper_pour_off": "game/level_up/helper_pour_disabled",
    "lu_helper_product_off": "game/level_up/helper_product_disabled",
    "paper_sheet": "game/level_up/special_skills/paper_sheet",
    "special_back": "game/level_up/special_skills/progress_back",
    "weather_rain": "game/whether_time_ctrl/rain",
    "weather_sun": "game/whether_time_ctrl/sun",
    "weather_back": "game/whether_time_ctrl/whether_back",
    "weather_fore": "game/whether_time_ctrl/whether_fore",
    "cursor_normal": "cursors/normal",
    "cursor_gather": "cursors/gather_product",
    "cursor_attack": "cursors/attack",
    "cursor_buy": "cursors/buy",
    "cursor_sell": "cursors/sell",
    "cursor_talk": "cursors/talk",
    "game_menu_bg": "game/game_menu",
    "pause_bg": "game/pause_back",
    "options_bg": "options/background",
    "options_thumb": "options/thumb",
    "options_check": "options/checked-normal",
    "options_check_off": "options/normal-normal",
    "in_game": "highscores/in_game",
    "highscores_bg": "highscores/highscores_background",
    "select_user_bg": "select_user/select_user",
    "new_user_bg": "select_user/new_user",
}
SEEDS_STAGES = ("", "_2", "_3")
DIRECTIONS = ("down", "right", "right_down", "right_up", "up")

VEG_FIELDS = {"price_buy": int, "price_sell": int, "life": int, "hunger_min": float, "hunger_max": float,
              "min_product_delay": float, "max_product_delay": float, "upgrade": int,
              "upgrade_to_vegetation": str, "image_offset": "vec", "exp_for_pour": int}


def vec(s):
    return [float(x) for x in s.replace(" ", "").split(";")]


def load_image(path):
    """X.jpg + X_.png (альфа в яркости) или просто X.png."""
    jpg, png = path.with_suffix(".jpg"), path.with_suffix(".png")
    if jpg.exists():
        img = Image.open(jpg).convert("RGBA")
        # маска X_.png, в «Цветке Стихий» бывает и X_.gif
        mask = next((m for m in (path.with_name(path.name + "_.png"), path.with_name(path.name + "_.gif")) if m.exists()), None)
        if mask:
            img.putalpha(Image.open(mask).convert("L").resize(img.size))
        return img
    img = Image.open(png).convert("RGBA")
    # PNG без своей альфы + маска X_.png (в «Цветке Стихий»: портреты и рамки окна умений)
    mask = path.with_name(path.name + "_.png")
    if mask.exists() and img.getchannel("A").getextrema()[0] == 255:
        img.putalpha(Image.open(mask).convert("L").resize(img.size))
    return img


def read_xml(path):
    raw = path.read_bytes()
    # ru.xml «Цветка Стихий» — UTF-8 с BOM, остальные файлы — cp1251
    text = raw[3:].decode("utf-8") if raw.startswith(b"\xef\xbb\xbf") else raw.decode("cp1251")
    text = re.sub(r"^<\?xml[^>]*\?>", "", text.lstrip("﻿")).strip()
    # &cr; — перенос строки в текстах «Цветка Стихий»; в первой игре вместо него писали \\n
    text = text.replace("&cr;", "\\n")
    text = re.sub(r"&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)", "&amp;", text)  # голые & в английских строках
    # ru.xml «Цветка Стихий» после </root> дописаны ещё элементы (delimiter, titles) — переносим их внутрь корня
    end = text.find("</root>")
    if end >= 0 and text[end + 7:].strip():
        text = text[:end] + text[end + 7:] + "</root>"
    return ET.fromstring(dedupe_attrs(text))


def dedupe_attrs(text):
    """В XML оригинала встречаются повторы атрибута в одном теге (location_1.xml: pail_2 дважды у well_object),
    игра их принимает. ElementTree — нет: оставляем последнее значение (как при записи в словарь)."""
    def fix(m):
        attrs = re.findall(r'([\w.\-]+)\s*=\s*("[^"]*"|\'[^\']*\')', m.group(2))
        if len({k for k, _ in attrs}) == len(attrs):
            return m.group(0)
        last = dict(attrs)
        return "<" + m.group(1) + "".join(f" {k}={v}" for k, v in last.items()) + m.group(3) + ">"
    return re.sub(r"<([\w.\-]+)((?:\s+[\w.\-]+\s*=\s*(?:\"[^\"]*\"|'[^']*'))+)\s*(/?)>", fix, text)


def read_props(xml_dir):
    """В первой игре всё в properties_ru.xml; в «Цветке Стихий» логика в properties.xml, интерфейс в properties_ru.xml.
    Разделы обоих файлов идут подряд в одном дереве: сначала логика (find находит её первой), потом интерфейс."""
    ru = read_xml(xml_dir / "properties_ru.xml")
    logic_path = xml_dir / "properties.xml"
    if not logic_path.exists():
        return ru
    root = ET.Element("root")
    root.extend(list(read_xml(logic_path)) + list(ru))
    return root


def read_multi(path):
    """XML с несколькими корневыми элементами (skills.xml, items.xml): оборачиваем в <r>."""
    text = re.sub(r"^<\?xml[^>]*\?>", "", path.read_bytes().decode("cp1251").lstrip("\ufeff").strip())
    return ET.fromstring(f"<r>{text}</r>")


def pick(el, fields):
    out = {}
    for k, kind in fields.items():
        if k in el.attrib and el.attrib[k] != "":
            v = el.attrib[k]
            out[k] = vec(v) if kind == "vec" else kind(v)
    return out


def farm_objects(farm):
    """Объекты фермы (dynamic_obstacle). В «Цветке Стихий» локация подменяет общий объект своим:
    <dynamic_obstacle name="well_00" removed="well_5"/> — вместо well_00 стоит well_5 (имя остаётся прежним для правил)."""
    objects = {o.attrib["name"]: {"position": vec(o.attrib["position"]), "dimensions": vec(o.attrib["dimensions"]),
                                  "image_offset": vec(o.attrib.get("image_offset", "0;0"))}
               for o in farm.iter("dynamic_obstacle") if "position" in o.attrib}
    for o in farm.iter("dynamic_obstacle"):
        if "removed" in o.attrib and o.attrib["removed"] in objects:
            objects[o.attrib["name"]] = {**objects[o.attrib["removed"]], "replaced_by": o.attrib["removed"]}
    return objects


def ridge_list(el):
    count = int(el.attrib.get("ridges_count", len(el)))
    # veg_name — растение, которое стоит на грядке с начала игры (дерево-идол и его ветки в 5-й локации);
    # без image (plain) грядка не рисуется и игрок на неё ничего не сажает
    return [{"position": vec(r.attrib["position"]), "dimensions": vec(r.attrib["dimensions"]),
             **({"veg": r.attrib["veg_name"]} if r.attrib.get("veg_name") else {}),
             **({"plain": True} if not r.attrib.get("image") else {})}
            for r in list(el)[:count]]


def walk_dialog(nodes):
    for n in nodes:
        yield n
        for a in n.get("answers", []):
            yield from walk_dialog(a["dialog"])


def walk_actions(quests):
    """Все действия квестов: части, ответы и ответы во вложенных диалогах."""
    for q in quests.values():
        for sq in q["sub_quests"].values():
            yield from sq["actions"]
            for n in walk_dialog(sq["dialog"]):
                for ans in n.get("answers", []):
                    yield from ans["actions"]


def split_images(rules, bugs, names):
    """Картинки делятся на общие (грузятся при запуске) и по локациям (подгружаются при первом заходе, экономит память):
    спрайты вредителей волн локации, фон фермы и города, ящик, портреты держателей и говорящих. Робин и всё остальное — общие."""
    def bug_images(name, seen):
        if name in seen or name not in bugs:
            return set()
        seen.add(name)
        b = bugs[name]
        out = {f"bug_{b['folder']}_{a}_{d}" for a in b["anims"] for d in DIRECTIONS}
        if b["items"]:
            out.add(f"item_{b['items']}")
        return out | (bug_images(b["reincorn"], seen) if b["reincorn"] else set())

    def talkers(quests):
        found = set()
        for q in quests.values():
            for sq in q["sub_quests"].values():
                found |= {n["talker"] for n in walk_dialog(sq["dialog"]) if n.get("talker")}
        return found

    per = {}
    for n in range(1, len(rules["locations"]) + 2):
        d = rules if n == 1 else rules["locations"][str(n)]
        imgs = set()
        for day in d["waves"]:
            for grp in day:
                for b in (x["name"] for x in grp["specs"]):
                    imgs |= bug_images(b, set())
        for b in statue_bugs(d.get("statues", {}), set(bugs)):
            imgs |= bug_images(b, set())
        imgs |= {f"holder_{h}" for h in d["holders"]} | {f"talker_{t}" for t in talkers(d["quests"])}
        imgs |= ({"bg", "town_bg", "box", "box_content", "box_mask"} if n == 1 else
                 {f"farm_bg_{n}", f"town_bg_{n}", f"box_{n}", f"box_content_{n}", f"box_mask_{n}"})
        if n == 5:
            imgs |= {"stat_panel_5", "bq_back_5"}
        per[str(n)] = imgs
    helper = {i for i in names if i.startswith("bug_helper_")}
    only = set().union(*per.values()) - helper
    # то, что нужно любой локации (общие ресурсы вроде talker_hero), остаётся общим
    shared = set.intersection(*per.values())
    only -= shared
    core = sorted((set(names) | {"comics_clean"}) - only)
    return core, {k: sorted((v & set(names)) - set(core)) for k, v in per.items()}


def conditions(el):
    return [{"type": c.tag, **c.attrib} for c in (el if el is not None else [])]


def actions(el):
    return [{"type": a.tag, **a.attrib} for a in (el if el is not None else [])]


def unquote_csv(o):
    """Несколько строк в XML оригинала записаны как в CSV: в кавычках, внутренние кавычки удвоены."""
    if isinstance(o, dict):
        return {k: unquote_csv(v) for k, v in o.items()}
    if isinstance(o, list):
        return [unquote_csv(v) for v in o]
    if isinstance(o, str) and '""' in o:
        o = o.strip()
        if len(o) > 1 and o[0] == '"' and o[-1] == '"':
            o = o[1:-1]
        return o.replace('""', '"').strip()
    return o


def dialog(logic, texts):
    """Узлы диалога: реплики и вопросы. Тексты ru.xml идут по порядку: phrase_1.., question, answer_N."""
    out = []
    phrases = [t for t in (texts if texts is not None else []) if t.tag.startswith("phrase")]
    questions = [t for t in (texts if texts is not None else []) if t.tag == "question"]
    pi = qi = 0
    for node in logic if logic is not None else []:
        if node.tag == "phrase":
            t = phrases[pi].attrib.get("text", "") if pi < len(phrases) else ""
            pi += 1
            out.append({"kind": "phrase", "talker": node.attrib.get("talker", ""), "text": t})
        elif node.tag == "question":
            qt = questions[qi] if qi < len(questions) else None
            qi += 1
            answers_t = [a for a in (qt if qt is not None else []) if a.tag.startswith("answer")]
            answers = []
            for ai, a in enumerate(node.findall("answer")):
                at = answers_t[ai] if ai < len(answers_t) else None
                answers.append({
                    "text": at.attrib.get("text", "") if at is not None else "",
                    "active_if": conditions(a.find("active_if")),
                    "dialog": dialog(a.find("dialog"), at),
                    "actions": actions(a.find("actions")),
                })
            out.append({"kind": "question", "talker": node.attrib.get("talker", ""),
                        "text": qt.attrib.get("text", "") if qt is not None else "", "answers": answers})
    return out


def export_quests(xml_dir, props, ru, n=1):
    logic = read_xml(xml_dir / "locations" / f"location_{n}_quests.xml")
    texts = ru.find(f"quests/location_{n}/quests")
    quests = {}
    for q in logic:
        qt = texts.find(q.tag) if texts is not None else None
        subs = {}
        for sq in q.find("sub_quests"):
            st = qt.find(f"sub_quests/{sq.tag}") if qt is not None else None
            subs[sq.tag] = {
                "holder": sq.attrib.get("holder", ""),
                "header": st.attrib.get("header", "") if st is not None else "",
                "dialog": dialog(sq.find("dialog"), st.find("dialog") if st is not None else None),
                "actions": actions(sq.find("actions")),
            }
        quests[q.tag] = {
            "header": qt.attrib.get("header", "") if qt is not None else "",
            "enabled_sub_quests": [s.strip() for s in q.attrib.get("enabled_sub_quests", "").split(";") if s.strip()],
            "enable_condition": conditions(q.find("enable_condition")),
            "sub_quests": subs,
        }
    # где стоят персонажи в городе (quest_holders первой локации), только те, у кого есть картинка
    used = {sq["holder"] for q in quests.values() for sq in q["sub_quests"].values()}
    locn = next(l for l in props.iter(f"location_{n}") if l.find("quest_holders") is not None)
    holders = {}
    for h in locn.find("quest_holders"):
        if h.tag in used:
            holders[h.tag] = {"position": vec(h.attrib["position"]), "dimensions": vec(h.attrib["dimensions"])}
    return quests, holders


def export_gameplay(props, loc1_props, skills_xml):
    """Уровни опыта, умения (skills.xml), заказы на букеты, прогрессы над растениями, погода."""
    levels = [int(l.attrib["l"]) for l in skills_xml.find("exp_levels")]
    char = skills_xml.find("character")
    limits = {k: float(v) for k, v in char.find("skill_limits").attrib.items()}
    skills = {}
    for sk in char.find("skills"):
        skills[sk.tag] = [{k.tag: float(k.attrib["k"]) for k in lv} for lv in sk]
    events = {}
    for ev in char.find("events"):
        events[ev.tag] = [{"value": int(lv.attrib["value"]), **{k.tag: float(k.attrib["k"]) for k in lv}} for lv in ev]
    bset = loc1_props.find("bouquet_set")
    bouquets = bouquet_list(bset)
    prog = props.find("progresses")
    progresses = {c.tag: {"image": c.attrib["image"].rsplit("/", 1)[-1], "max": int(c.attrib["max_hearts"]),
                          "offset": vec(c.attrib["center_offset"])} for c in prog}
    weather = {w.tag: {k: float(v) for k, v in w.attrib.items()} for w in props.find("common/whether")}
    marks = {m.tag: int(m.attrib["day"]) for m in props.find("set_mark_by_day/set")}
    common = props.find("common").attrib
    return {
        "exp_levels": levels, "skill_limits": limits, "skills": skills, "skill_events": events,
        "bouquets": bouquets, "bouquet_price_k": float(common["bouquet_price_k"]),
        "bouquet_random": bouquet_random(loc1_props.find("bouquet_random_set")),
        # размеры букетов (properties.xml bouquets/size_N): множитель цены, картинка большого кулька и её сдвиг (exe 0x4d1800)
        "bouquet_sizes": {sz.tag[5:]: {"price_k": float(sz.attrib["price_k"]), "offset": vec(sz.attrib["offset"]),
                                       "image": "bq_big" if sz.attrib.get("image") else ""}
                          for sz in props.find("bouquets") if sz.tag.startswith("size_")},
        "progresses": progresses, "strong_heart": float(prog.attrib["strong_heart"]), "weather": weather,
        "marks_by_day": marks,
    }


# картинка из unfade_img_path → имя в веб-версии (то, что экспортируется в IMAGES)
UNFADE = {
    "data/game/shop/shop_button_small": "shop_small", "data/game/shop/shop_button_medium": "shop_medium",
    "data/tutorial/circle_103": "tut_circle", "data/tutorial/circle_large_smooth": "tut_circle_large",
    "data/tutorial/first_dead_flower": "tut_dead", "data/tutorial/bouquets_shop_busket": "tut_basket",
    "data/tutorial/bouquets_shop_bouquets": "tut_bouquets", "data/obstacles/ridge_00": "ridge",
    "data/obstacles/well_00": "well", "data/buttons/back": "round_button",
    "data/game/global_map/town_1": "map_town_1",
    "data/game/towns/quests/old_servant": "holder_old_servant",
    "data/game/towns/quests/talkers/old_servant": "talker_old_servant",
    "data/game/farms/water_storage/barrel_01": "barrel", "data/game/farms/product_storage/farm_1_storage_1": "box",
}


def export_tutorial(props):
    """Шаги туториала: где пузырь, какая картинка остаётся светлой под затемнением (fader_alpha)."""
    steps = {}
    for el in props.find("tutorial"):
        a = el.attrib
        if "baloon_pos" not in a:
            continue
        path = a.get("unfade_img_path", "").replace("\\", "/")
        steps[el.tag] = {"pos": vec(a["baloon_pos"]), "alpha": float(a.get("fader_alpha", 0.5)),
                         "pointer": not a.get("baloon_base", "").endswith("no_pointer"),
                         "image": UNFADE.get(path), "image_pos": vec(a.get("unfade_img_pos", "0;0"))}
    return steps



def collect_vegetations(seeds, veg_root, prod_root, vegetations, products):
    """Растения посева и те, во что они вырастают, + их продукты (накапливаются в общих словарях)."""
    queue = list(seeds)
    while queue:
        name = queue.pop(0)
        if name in vegetations:
            continue
        el = veg_root.find(name)
        v = pick(el, VEG_FIELDS)
        v["nodes"] = [vec(n.attrib["offset"]) for n in el.find("nodes")]
        v["products"] = [p.attrib["product"] for p in el.find("products")]
        v["probabilities"] = [float(p.attrib.get("probability", 1)) for p in el.find("products")]
        vegetations[name] = v
        nxt = v.get("upgrade_to_vegetation")
        if nxt and veg_root.find(nxt) is not None:
            queue.append(nxt)
    for v in vegetations.values():
        for p in v["products"]:
            if p in products:
                continue
            el = prod_root.find(p)
            inner = el.find(p)
            products[p] = {"price": int(el.attrib["price"]), "exp": int(el.attrib.get("exp", 0)),
                           "offset": vec(inner.attrib["offset"]) if inner is not None else [0, 0],
                           "bonuses": el.attrib.get("bonuses", "")}


def wave_group(g, known):
    """Группа волны. В «Цветке Стихий» запись вредителя бывает с приставкой casual- или hardcore- (в данных есть и опечатка
    hardocre-) — только для одной сложности — и с модификаторами после имени (boar!@1*2$3, etti@1*2$2: смысл ! @ * $ # +
    ещё не разобран в exe, хранится как есть). Записи без известного вредителя (одиночное «5») пропускаются.
    bugs — имена для обычной сложности (как в первой игре), specs — все записи полностью."""
    specs = []
    for raw in g.attrib.get("bugs", "").split(";"):
        m = re.match(r"\s*(?:(casual|hardcore|hardocre)-)?([a-z_0-9]+)(.*?)\s*$", raw)
        if not m or m.group(2) not in known:
            continue
        mode = {"hardocre": "hardcore"}.get(m.group(1), m.group(1)) or "any"
        specs.append({"name": m.group(2), "mode": mode, "mods": m.group(3)})
    # bugs — для обычной сложности, с модификаторами (snail!@1*2$2 — разбирает игра, web/src/bugs.ts parseBugSpec)
    return {"bugs": [x["name"] + x["mods"] for x in specs if x["mode"] != "hardcore"], "specs": specs, "delay": float(g.attrib["delay"])}


STATUES = ("owl", "neptun", "altar", "horn", "clock")


def farm_statues(props, n):
    """Статуи фермы (root/shop/location_N/<owl|neptun|altar|horn|clock>): место и уровни. Общее у всех (exe 0x4fa680,
    сова — 0x4ff3b0): цена, время покоя и активности (min..max), картинки stand / active / action; остальное — параметры
    эффекта (exp у совы, min/max_damage у Нептуна, slow_k и max_activete_time у часов, items у алтаря, bugs у горна)."""
    loc = props.find(f"shop/location_{n}")
    out = {}
    for kind in STATUES:
        el = loc.find(kind) if loc is not None else None
        lv = el.find("levels") if el is not None else None
        if lv is None or int(lv.attrib.get("count", 0)) == 0:
            continue
        levels = []
        for i in range(1, int(lv.attrib["count"]) + 1):
            a = dict(lv.find(f"level_{i}").attrib)
            anims = lv.find(f"level_{i}/animations")
            common = {"price": int(a.pop("price")),
                      "stand": [float(a.pop("min_stand_time")), float(a.pop("max_stand_time"))],
                      "active": [float(a.pop("min_active_time")), float(a.pop("max_active_time"))],
                      "offset": vec(a.pop("image_offset", "0;0")),
                      "images": {an.tag: an.attrib["anim_image"].rsplit("/", 1)[-1] for an in anims},
                      "action_time": float(anims.find("action").attrib.get("play_time", 1))}
            params = {}
            for k, v in a.items():
                try:
                    params[k] = float(v) if ";" not in v else v
                except ValueError:
                    params[k] = v
            levels.append({**common, "params": params})
        out[kind] = {"position": vec(el.attrib["position"]), "dimensions": vec(el.attrib["dimensions"]), "levels": levels}
    return out


def auto_bouquet(props, n):
    """Автосборка букетов (root/auto_bouquet_level/location_N, exe 0x4091c0): пороги уровней (каждый — сколько ещё цветов
    продать в букетах), полоса на экране букетов (control) и картинки уровней."""
    el = props.find(f"auto_bouquet_level/location_{n}")
    if el is None:
        return None
    c = el.find("control").attrib
    pic = lambda path: "ab_" + path.rsplit("/", 1)[-1] if path else ""
    levels = []
    for i in range(len(el)):
        lv = el.find(f"level_{i}")
        if lv is None:
            break
        a = lv.attrib
        levels.append({"level_image": pic(a.get("level_image", "")), "level_pos": vec(a.get("level_image_pos", "0;0")),
                       "progress_image": pic(a.get("progress_image", "")), "progress_pos": vec(a.get("progress_image_pos", "0;0"))})
    return {"thresholds": [int(x) for x in el.attrib["levels_array"].split(";")],
            "position": vec(c["position"]), "dimensions": vec(c["dimensions"]),
            "complete": pic(el.find("complete").attrib.get("image", "")), "levels": levels}


def statue_bugs(statues, known):
    """Вредители, которых призывает горн (bugs у его уровней), — их спрайты нужны локации."""
    out = set()
    for st in statues.values():
        for lv in st["levels"]:
            for raw in str(lv["params"].get("bugs", "")).split(";"):
                m = re.match(r"\s*(?:(?:casual|hardcore|hardocre)-)?([a-z_0-9]+)", raw)
                if m and m.group(1) in known:
                    out.add(m.group(1))
    return out


def prizes_set(locn):
    """Призы фермы (farm/prizes_set, exe 0x42c640): ступени с вероятностью prize_k и призами (пусто — ничего).
    Читаются первые prizes_count записей."""
    ps = locn.find("farm/prizes_set") if locn is not None else None
    if ps is None:
        return []
    entries = list(ps)[:int(ps.attrib.get("prizes_count", len(ps)))]
    return [{"k": float(e.attrib["prize_k"].rstrip("f")),
             "prizes": [x.strip() for x in e.attrib.get("prizes", "").split(";") if x.strip()]} for e in entries]


def dropped_items(el):
    """Призы (root/dropped_items, exe 0x4b4880): вид по имени (exp / gold / water — так их различает сбор, 0x566a80),
    значение, картинка data/prize_items/<image>, цвет надписи, сложности (difficults; пусто — любая)."""
    out = {}
    for it in el:
        a = it.attrib
        if "value" not in a or "image" not in a:
            continue
        kind = next((k for k in ("exp", "gold", "water") if k in it.tag), None)
        if not kind:
            continue
        out[it.tag] = {"kind": kind, "value": int(float(a["value"])), "image": a["image"],
                       "color": [int(x) for x in a.get("float_string_color", "255;255;255").split(";")[:3]],
                       "difficults": [x.strip() for x in a.get("difficults", "").split(";") if x.strip()]}
    return out


def bouquet_list(bset):
    """Заказы bouquet_set по порядку. exe читает только первые bouquet_count записей (в loc1 — 0: заказы только случайные)."""
    entries = [[x.strip() for x in b.attrib["bouquet"].split(";") if x.strip()] for b in bset]
    return entries[:int(bset.attrib["bouquet_count"])] if "bouquet_count" in bset.attrib else entries


def bouquet_random(rs):
    """Случайные букеты (bouquet_random_set, exe 0x42cec0): цветы-кандидаты и записи по дням — вероятности размеров
    p_size3/4/5 и веса цветов p_*. Читаются первые bouquet_count записей."""
    if rs is None:
        return None
    num = lambda v: float(v.rstrip("f"))
    entries = []
    for b in list(rs)[:int(rs.attrib.get("bouquet_count", len(rs)))]:
        a = b.attrib
        entries.append({"day": int(a.get("day", 0)), "sizes": [num(a.get(f"p_size{k}", "0")) for k in (3, 4, 5)],
                        "weights": {k: num(v) for k, v in a.items() if k.startswith("p_") and not k.startswith("p_size")}})
    entries.sort(key=lambda e: e["day"])
    return {"products": [x.strip() for x in rs.attrib.get("products", "").split(";") if x.strip()], "entries": entries}


def resource_paths(path):
    """resource.xml: id картинки → путь без расширения (с учётом SetDefaults path)."""
    base, out = "", {}
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        m = re.search(r'<SetDefaults\s+path="([^"]*)"', line)
        if m:
            base = m.group(1).removeprefix("data/")
        m = re.search(r'<Image\s+id="([^"]+)"\s+path="([^"]+)"', line)
        if m:
            out[m.group(1)] = f"{base}/{m.group(2)}" if base else m.group(2)
    return out


def well_levels(farm, objects, items_root):
    """Уровни колодца (exe 0x4f32e0): атрибуты well_object фермы (well / well_N, pail / pail_N) и свойства колодцев
    items/wells/<имя> с их препятствиями на ферме. Какой уровень брать — решает игра (web/src/farm.ts, wellAt)."""
    wo = dict(farm.find("well_object").attrib)
    items = {}
    for name in {v for k, v in wo.items() if k == "well" or k.startswith("well_")}:
        it = items_root.find(f"items/wells/{name}")
        if it is None or name not in objects:
            continue
        a = it.attrib
        pail = a.get("pail", "")
        items[name] = {**objects[name], "pail": objects.get(pail, objects[name]), "pail_name": pail,
                       **{k: float(a[k]) for k in ("delay", "fill_time", "water_capacity", "price", "pail_height")}}
    return {"well_object": wo, "well_items": items}


def day_times(farm):
    """Без атрибутов — как в exe: min и max равны time, прибавка 0."""
    t = float(farm.attrib["time"])
    return {"day_min": float(farm.attrib.get("min_time", t)), "day_max": float(farm.attrib.get("max_time", t)),
            "day_inc": float(farm.attrib.get("inc_time", 0))}


def wave_keys(arriver):
    return {"wave_keys": [w.attrib.get("key", "") for w in arriver.find("waves")],
            "wave_loop": int(arriver.attrib.get("wave_loop", 0))}


def export_waves(props, bug_root, n):
    """Волны вредителей локации n: [{bugs, delay}…] по дням, места появления."""
    locn = next(l for l in props.iter(f"location_{n}") if l.find("bug_arriver") is not None)
    arriver = locn.find("bug_arriver")
    waves = [[wave_group(g, {b.tag for b in props.find("bugs")}) for g in w] for w in arriver.find("waves")]
    return waves, [vec(v) for v in arriver.find("arrive_positions").attrib.values()]


def bug_def(bug_root, name):
    a = bug_root.find(name).attrib
    return {
        "folder": a["folder"],
        **{k: float(a[k]) for k in ("attack", "click_radius", "obst_radius", "life", "speed", "exp") if k in a},
        "items": a.get("items", ""), "reincorn": a.get("reincorn", ""), "prize_k": float(a.get("prize_k", 1)),
        "anims": {an.tag: {"rows": int(an.attrib["anim_rows"]), "time": float(an.attrib["play_time"]),
                           "loop": an.attrib.get("loop", "true") == "true"} for an in bug_root.find(name).find("anims")},
    }


def shop_positions(props, n):
    """Где у фермы локации n стоят кнопки «Продать плоды», «Купить воду» и колодца (shop_control)."""
    locn = next(l for l in props.iter(f"location_{n}") if l.find("shop_control") is not None)
    c = locn.find("shop_control/click_obj_buttons")
    return {"sell_prod": vec(c.find("product_storage/sell_prod").attrib["position"]),
            "buy_water": vec(c.find("water_storage/buy_water").attrib["position"]),
            "well": vec(c.find("well").attrib["position"]),
            # кнопки предметов фермы (сова, алтарь, рог…): у каждой локации свои
            **{t: vec(c.find(t).attrib["position"]) for t in ("owl", "altar", "neptun", "clock", "horn") if c.find(t) is not None}}


def export_location(n, props, xml_dir, items_root, ru, vegetations, products, bugs):
    """Всё, что отличает ферму и город локации n (общие правила остаются в корне rules.json)."""
    farm = read_xml(xml_dir / "locations" / f"location_{n}.xml")
    locn = next(l for l in props.iter(f"location_{n}") if l.find("farm") is not None)
    seeds = [x.strip() for x in farm.find("buy_vegetation_set").attrib["vegetations"].split(";") if x.strip()]
    ridges = locn.find("farm/ridges")
    # растения, которые стоят на грядках с начала игры (дерево-идол и ветки) и все ступени веток, которые сажают квесты
    placed = [r.attrib["veg_name"] for r in ridges.find("at_start") if r.attrib.get("veg_name")]
    collect_vegetations(seeds + placed, props.find("vegetations"), props.find("products"), vegetations, products)
    objects = farm_objects(farm)

    def levels(tag):
        # position — где рисуется картинка (level), obstacle — левый верх препятствия объекта (для сетки вредителей), dimensions — его размер
        return [{**objects[lv.attrib["object"]], "object": lv.attrib["object"], "position": vec(lv.attrib["position"]),
                 "obstacle": objects[lv.attrib["object"]]["position"],
                 "capacity": int(lv.attrib["capacity"]), "price": int(lv.attrib["price"]),
                 "progress_height": int(lv.attrib["progress_height"])} for lv in farm.find(tag)]

    well = items_root.find("items/wells/well_00").attrib
    waves, arrive = export_waves(props, props.find("bugs"), n)
    for g in waves:
        for grp in g:
            for b in (x["name"] for x in grp["specs"]):
                bugs.setdefault(b, bug_def(props.find("bugs"), b))
    statues = farm_statues(props, n)
    for b in statue_bugs(statues, {x.tag for x in props.find("bugs")}):
        bugs.setdefault(b, bug_def(props.find("bugs"), b))
    for b in list(bugs):
        r = bugs[b]["reincorn"]
        if r:
            bugs.setdefault(r, bug_def(props.find("bugs"), r))
    quests, holders = export_quests(xml_dir, props, ru, n)
    bset = locn.find("bouquet_set")
    return {
        "day_time": float(farm.attrib["time"]),
        # длина дня «Цветка Стихий»: от min_time, каждый день + inc_time, не больше max_time (exe 0x42aaa8, 0x42f1f0)
        **day_times(farm),
        "seeds": seeds,
        "ridges": ridge_list(ridges.find("at_start")),
        "ridges_for_sale": ridge_list(ridges.find("not_installed")),
        "water_storage": levels("water_storage"),
        "product_storage": levels("product_storage"),
        "well": {**objects["well_00"], "pail": objects["well_pail_00"],
                 **{k: float(well[k]) for k in ("delay", "fill_time", "water_capacity", "price", "pail_height")}},
        **well_levels(farm, objects, items_root),
        "prices": {"ridge": int(items_root.find(f"items/ridges/location_{n}").attrib["price"]),
                   "water": int(items_root.find("items/water").attrib["price"])},
        "waves": waves,
        # пауза после волны (атрибут delay у wave.): отсчитывается, когда группы вышли и поле чистое (exe 0x40ced0)
        "wave_delays": [float(w.attrib.get("delay", 0)) for w in next(l for l in props.iter(f"location_{n}") if l.find("bug_arriver") is not None).find("bug_arriver/waves")],
        # ключ волны (key у wave.) и wave_loop — с какой волны начинать круг заново (exe 0x41c400)
        **wave_keys(next(l for l in props.iter(f"location_{n}") if l.find("bug_arriver") is not None).find("bug_arriver")),
        "arrive_positions": arrive,
        "bouquets": bouquet_list(bset),
        "bouquet_random": bouquet_random(locn.find("bouquet_random_set")),
        "statues": statues,
        "prizes_set": prizes_set(locn),
        "auto_bouquet": auto_bouquet(props, n),
        "obstacles": [{"position": vec(o.attrib["position"]), "dimensions": vec(o.attrib["dimensions"])} for o in farm.findall("obstacle")],
        # метки-препятствия (marks_obstacle): картинка, которая встаёт на ферму, когда поставлена метка (дерево-идол в 5-й локации)
        "marks_obstacle": [{"mark": m.attrib["mark"], "position": vec(m.attrib["position"]), "dimensions": vec(m.attrib["dimensions"]),
                            "image": "mark_" + m.attrib["image"].rsplit("/", 1)[-1] if m.attrib["image"] else ""}
                           for m in farm.findall("marks_obstacle/mark") if m.attrib["mark"]],
        "quests": quests,
        "holders": holders,
        "shop_positions": shop_positions(props, n),
    }


def export_audio(data_dir, web):
    """Звуки и музыка как есть (ogg/wav). Файлы по 50 байт в этой установке пустые, их пропускаем."""
    out = web / "public" / "audio"
    out.mkdir(parents=True, exist_ok=True)
    names = []
    for folder, prefix in (("sounds", ""), ("sounds/buttons", "btn_"), ("music", "")):
        for f in sorted((data_dir / folder).iterdir()):
            if f.suffix in (".ogg", ".wav") and f.stat().st_size > 100:
                (out / f"{prefix}{f.name}").write_bytes(f.read_bytes())
                names.append(f"{prefix}{f.name}")
    return names


def main():
    game, web = Path(sys.argv[1]), Path(sys.argv[2])
    data_dir, xml_dir = game / "data", game / "xml"
    props = read_props(xml_dir)
    farm = read_xml(xml_dir / "locations" / "location_1.xml")
    items = read_xml(xml_dir / "locations" / "items.xml") if False else None  # два корня — читаем вручную ниже
    ru = read_xml(xml_dir / "ru" / "ru.xml")

    # ---------------- растения первой локации и их продукты
    seeds = [s.strip() for s in farm.find("buy_vegetation_set").attrib["vegetations"].split(";") if s.strip()]
    veg_root = props.find("vegetations")
    vegetations, products = {}, {}
    queue = list(seeds)
    while queue:
        name = queue.pop(0)
        if name in vegetations:
            continue
        el = veg_root.find(name)
        v = pick(el, VEG_FIELDS)
        v["nodes"] = [vec(n.attrib["offset"]) for n in el.find("nodes")]
        v["products"] = [p.attrib["product"] for p in el.find("products")]
        v["probabilities"] = [float(p.attrib.get("probability", 1)) for p in el.find("products")]
        vegetations[name] = v
        nxt = v.get("upgrade_to_vegetation")
        if nxt and veg_root.find(nxt) is not None:
            queue.append(nxt)
    prod_root = props.find("products")
    for v in vegetations.values():
        for p in v["products"]:
            el = prod_root.find(p)
            inner = el.find(p)
            products[p] = {"price": int(el.attrib["price"]), "exp": int(el.attrib.get("exp", 0)),
                           "offset": vec(inner.attrib["offset"]) if inner is not None else [0, 0]}

    # ---------------- ферма: лунки, бочки, ящики, колодец, длина дня
    loc1 = next(l for l in props.iter("location_1") if l.find("farm") is not None)
    ridges = loc1.find("farm/ridges")
    objects = farm_objects(farm)

    def levels(tag):
        # position — где рисуется картинка (level), obstacle — левый верх препятствия объекта (для сетки вредителей), dimensions — его размер
        return [{**objects[lv.attrib["object"]], "object": lv.attrib["object"], "position": vec(lv.attrib["position"]),
                 "obstacle": objects[lv.attrib["object"]]["position"],
                 "capacity": int(lv.attrib["capacity"]), "price": int(lv.attrib["price"]),
                 "progress_height": int(lv.attrib["progress_height"])} for lv in farm.find(tag)]

    items_text = (xml_dir / "locations" / "items.xml").read_bytes().decode("cp1251")
    items_root = ET.fromstring("<r>" + re.sub(r"^<\?xml[^>]*\?>", "", items_text.strip()) + "</r>")
    well = items_root.find("items/wells/well_00").attrib
    common = props.find("common").attrib
    rules = {
        "start": {"gold": int(common["gold_at_start"]), "water": int(common["water_at_start"]),
                  "vegetations": [common["vegetations_at_start"]]},
        "day_time": float(farm.attrib["time"]),
        # длина дня «Цветка Стихий»: от min_time, каждый день + inc_time, не больше max_time (exe 0x42aaa8, 0x42f1f0)
        **day_times(farm),
        "seeds": seeds,
        "vegetations": vegetations,
        "products": products,
        "ridges": ridge_list(ridges.find("at_start")),
        "ridges_for_sale": ridge_list(ridges.find("not_installed")),
        "obstacles": [{"position": vec(o.attrib["position"]), "dimensions": vec(o.attrib["dimensions"])} for o in farm.findall("obstacle")],
        "water_storage": levels("water_storage"),
        "product_storage": levels("product_storage"),
        "well": {**objects["well_00"], "pail": objects["well_pail_00"],
                 **{k: float(well[k]) for k in ("delay", "fill_time", "water_capacity", "price", "pail_height")}},
        **well_levels(farm, objects, items_root),
        "prices": {"ridge": int(items_root.find("items/ridges/location_1").attrib["price"]),
                   "water": int(items_root.find("items/water").attrib["price"])},
    }

    # ---------------- русские строки
    shop = ru.find("shop_screen_farm")
    rules["texts"] = {
        "title": ru.find("app").attrib["title"],
        "names": dict(ru.find("item_names").attrib),
        "stats": dict(ru.find("stats").attrib),
        "warnings": dict(ru.find("farm_warning").attrib),
        "events": dict(ru.find("events").attrib),
        "shop": {c.tag: c.attrib.get("text", "") for c in shop if "text" in c.attrib},
        "desc": dict(shop.find("desc").attrib),
        "buttons": {c.tag: c.attrib.get("label", "") for c in ru.find("button") if "label" in c.attrib},
        "shop_buttons": {c.tag: c.attrib.get("label", "") for c in ru.find("button/shop")},
        "buy_water": dict(ru.find("buy_water").attrib),
        "buy_water_loc5": dict(ru.find("buy_water_loc5").attrib),
        "new_game": dict(ru.find("new_or_continue_game").attrib),
        "skill_names": dict(ru.find("skill_names").attrib),
        "skill_characteristics": dict(ru.find("skill_characteristic_names").attrib),
        "skill_desc": dict(ru.find("level_desc").attrib),
        "skill_up": dict(ru.find("skill_up").attrib),
        "bonus_events": dict(ru.find("bonus_events").attrib),
        "bouquets_screen": dict(ru.find("bouquets_screen").attrib),
        "tutorial": dict(ru.find("tutorial").attrib),
        "headers": dict(ru.find("headers").attrib),
        "options": dict(ru.find("options").attrib),
        "game_menu": {c.tag: c.attrib.get("label", "") for c in ru.find("button") if c.tag.startswith("game_menu")},
        "pause": dict(ru.find("pause").attrib),
        "highscores": dict(ru.find("highscores").attrib),
        "users": {"delete_confirmation": ru.find("delete_confirmation").attrib["text"],
                  "main_change_user": ru.find("main_change_user").attrib["text"]},
    }

    # ---------------- квесты первой локации: логика + тексты, связанные по порядку реплик
    quests, holders = export_quests(xml_dir, props, ru)
    rules["quests"] = quests
    rules["tutorial_steps"] = export_tutorial(props)
    rules["holders"] = holders
    rules["texts"]["characters"] = dict(ru.find("characters").attrib)
    rules["texts"]["global_map"] = dict(ru.find("global_map").attrib)
    rules["statues"] = farm_statues(props, 1)
    rules["auto_bouquet"] = auto_bouquet(props, 1)
    rules["prizes_set"] = prizes_set(next(l for l in props.iter("location_1") if l.find("farm/prizes_set") is not None))
    rules["dropped_items"] = dropped_items(props.find("dropped_items"))
    # комната трофеев (trophy_room_screen/medals): место, пороги ступеней, сколько картинок (ступень 0 — пустое место)
    trophies, trophy_names = {}, {}
    sized = data_dir / "trophy_room" / "sized"
    for m in props.find("trophy_room_screen/medals"):
        if m.tag == "trophy_room_rect":
            continue
        levels = [lv for lv in m if lv.tag.startswith("level_")]
        thresholds = [int(next(iter(lv.attrib.values()))) for lv in levels]
        count = 0
        while (sized / f"{m.tag}_{count}.jpg").exists():
            trophy_names[f"tr_{m.tag}_{count}"] = f"trophy_room/sized/{m.tag}_{count}"
            if (sized / f"{m.tag}_{count}_overed.jpg").exists():
                trophy_names[f"tr_{m.tag}_{count}_o"] = f"trophy_room/sized/{m.tag}_{count}_overed"
            count += 1
        trophies[m.tag] = {"position": vec(m.attrib["position"]), "dimensions": vec(m.attrib["dimensions"]),
                           "thresholds": thresholds, "images": count}
    rules["trophies"] = trophies
    trophy_names["trophy_back"] = "trophy_room/trophy_room_back"
    rules["texts"]["medals"] = dict(ru.find("medals").attrib)
    rules["texts"]["comics"] = {k: ru.find(tag).attrib["description"] for k, tag in
                                [("1", "first_comics"), ("2", "location_2_comix"), ("3", "location_3_comix"), ("4", "location_4_comix"),
                                 ("5", "location_5_comix"), ("win_var_1", "win_var_1_comics"), ("win_var_2", "win_var_2_comics")]}
    rules["texts"]["medal_header"] = ru.find("medal_header_text").attrib.get("text", "")
    # сложность (difficult, exe 0x425c90): множители цен покупки и продажи, жизни вредителей, порогов опыта (exp_levels) и полива
    rules["difficulty"] = {d.tag.split("_", 2)[2]: {k: float(v) for k, v in d.attrib.items()} for d in props.find("difficult")}
    # серии ударов (combo_set, exe 0x44a6d0): с какого удара подряд какой множитель урона
    cs = props.find("combo_set")
    rules["combo_set"] = [{"count": int(c.attrib["comobos_count"]), "damage": float(c.attrib["damage"])}
                          for c in list(cs)[:int(cs.attrib.get("combos_count", len(cs)))]]
    # названия и описания предметов фермы (root/item_names, root/desc): сова — owl, owl_level2, owl_level3
    rules["texts"]["item_names"] = dict(ru.find("item_names").attrib) if ru.find("item_names") is not None else {}
    rules["texts"]["item_desc"] = dict(ru.find("desc").attrib) if ru.find("desc") is not None else {}
    # окно заданий: заголовок quest/header и разделитель тысяч в числах (root/delimiter, «,»)
    rules["texts"]["tooltips"] = dict(ru.find("tooltips").attrib) if ru.find("tooltips") is not None else {}
    rules["texts"]["quest_title"] = ru.find("quest/header").attrib.get("text", "")
    rules["texts"]["delimiter"] = ru.find("delimiter").attrib.get("text", ",")
    rules["texts"]["buttons_menu"] = {k: rules["texts"]["buttons"].get(k, "") for k in
                                      ("game_adventure", "options", "menu_highscores", "menu_exit", "new_game", "continue_game", "menu_trophy_room")}
    # названия сложностей (root/button/difficult/@casual, @hardcore) — кнопки экрана выбора сложности
    rules["texts"]["buttons_menu"].update(ru.find("button/difficult").attrib)

    # ---------------- вредители первой фермы, помощник Робин, оружие
    loc1 = next(l for l in props.iter("location_1") if l.find("bug_arriver") is not None)
    arriver = loc1.find("bug_arriver")
    waves = [[wave_group(g, {b.tag for b in props.find("bugs")}) for g in w] for w in arriver.find("waves")]
    used = {x["name"] for w in waves for g in w for x in g["specs"]} | statue_bugs(rules["statues"], {b.tag for b in props.find("bugs")})
    bug_root = props.find("bugs")
    for b in list(used):  # то, во что превращаются (reincorn), тоже нужно
        r = bug_root.find(b).attrib.get("reincorn", "")
        if r:
            used.add(r)
    bugs = {}
    for name in sorted(used) + ["helper"]:
        el = bug_root.find(name)
        a = el.attrib
        bugs[name] = {
            "folder": a["folder"],
            **{k: float(a[k]) for k in ("attack", "click_radius", "obst_radius", "life", "speed", "exp") if k in a},
            "items": a.get("items", ""), "reincorn": a.get("reincorn", ""), "prize_k": float(a.get("prize_k", 1)),
            "anims": {an.tag: {"rows": int(an.attrib["anim_rows"]), "time": float(an.attrib["play_time"]),
                               "loop": an.attrib.get("loop", "true") == "true"} for an in el.find("anims")},
        }
    rules["bugs"] = bugs
    rules["waves"] = waves
    rules["wave_delays"] = [float(w.attrib.get("delay", 0)) for w in arriver.find("waves")]
    rules.update(wave_keys(arriver))
    rules["arrive_positions"] = [vec(v) for v in arriver.find("arrive_positions").attrib.values()]
    rules["helper"] = {k: (vec(v) if ";" in v else float(v)) for k, v in props.find("common/helper").attrib.items()}
    rules["weapon_attack"] = float(items_root.find("weapons/simple_sword").attrib["attack"])
    rules["texts"]["bug_names"] = dict(ru.find("bug_names").attrib)
    # в оригинале подсказка про цветочный магазин оставлена с английскими «sell» / «sell all» — подставляем подписи самих кнопок (без кавычек: в растровом шрифте нет « »)
    # кнопка и пункт магазина продают цветы — подпись «Продать Цветы» вместо «Продать Плоды»
    rules["texts"]["buttons"]["shop_button_sell_prod"] = rules["texts"]["buttons"]["shop_button_sell_prod"].replace("Плоды", "Цветы")
    rules["texts"]["shop"]["sell_products"] = rules["texts"]["shop"]["sell_products"].replace("плоды", "цветы")
    sb = rules["texts"]["shop_buttons"]
    tut = rules["texts"]["tutorial"]
    tut["bouquet_show_sell_button"] = (tut["bouquet_show_sell_button"]
                                       .replace("кнопку sell all", f"кнопку {sb['sell_all']}")
                                       .replace("кнопку sell", f"кнопку {sb['sell']}"))

    # ---------------- остальные локации (2–4): ферма, город, квесты; растения/продукты/вредители пополняют общие словари
    rules["shop_positions"] = shop_positions(props, 1)
    rules["locations"] = {}
    # локаций столько, сколько файлов location_N.xml: 4 в первой игре, 5 в «Цветке Стихий» (Город Майя)
    nloc = len(list((xml_dir / "locations").glob("location_[0-9].xml")))
    for n in range(2, nloc + 1):
        rules["locations"][str(n)] = export_location(n, props, xml_dir, items_root, ru, vegetations, products, bugs)
    rules["vegetations"], rules["products"], rules["bugs"] = vegetations, products, bugs
    # global_map есть в обоих файлах «Цветка Стихий»: города — в properties.xml, фермы (farm_1…5) — в properties_ru.xml
    rules["global_map"] = {c.tag: {"position": vec(c.attrib["position"]), "dimensions": vec(c.attrib["dimensions"]),
                                    "image": c.attrib.get("active_image", "")}
                           for gm in props.findall("global_map") for c in gm if "position" in c.attrib}

    # ---------------- опыт, умения, букеты, прогрессы, погода
    rules.update(export_gameplay(props, loc1_props=next(l for l in props.iter("location_1") if l.find("bouquet_set") is not None),
                                 skills_xml=read_multi(xml_dir / "locations" / "skills.xml")))

    # ---------------- картинки
    out_img = web / "public" / "img"
    out_img.mkdir(parents=True, exist_ok=True)
    names = dict(IMAGES)
    names.update(trophy_names)
    for v in vegetations:
        names[v] = f"vegetations/{v}"
    for p in products:
        names[p] = f"products/{p}"
    all_quests = [quests] + [loc["quests"] for loc in rules["locations"].values()]
    for h in set(holders).union(*(set(loc["holders"]) for loc in rules["locations"].values())):
        if (data_dir / f"game/towns/quests/{h}.jpg").exists():
            names[f"holder_{h}"] = f"game/towns/quests/{h}"
    for n in range(2, nloc + 1):  # у локации 1 свои имена (bg, town_bg, box…) из IMAGES
        names[f"farm_bg_{n}"] = f"game/farms/location_{n}"
        names[f"town_bg_{n}"] = f"game/towns/location_{n}"
        names[f"box_{n}"] = f"game/farms/product_storage/farm_{n}_storage_1"
        names[f"box_content_{n}"] = f"game/farms/product_storage/farm_{n}_content_1"
        names[f"box_mask_{n}"] = f"game/farms/product_storage/farm_{n}_mask_1"
    for k in ("global_map_back", "ship", "pirate_ship", "broken_ship"):
        names[k] = f"game/global_map/{k}"
    for n in range(1, nloc + 1):
        names[f"map_town_{n}"] = f"game/global_map/town_{n}"
        names[f"map_farm_{n}"] = f"game/global_map/farm_{n}"
    talkers = {n["talker"] for qs in all_quests for q in qs.values() for sq in q["sub_quests"].values() for n in walk_dialog(sq["dialog"])}
    for tk in sorted(talkers):
        if (data_dir / f"game/towns/quests/talkers/{tk}.jpg").exists():
            names[f"talker_{tk}"] = f"game/towns/quests/talkers/{tk}"
    for bug in bugs.values():
        folder = data_dir / "bugs" / bug["folder"]
        for anim in bug["anims"]:
            for d in DIRECTIONS:
                if (folder / anim / f"{d}.jpg").exists():
                    names[f"bug_{bug['folder']}_{anim}_{d}"] = f"bugs/{bug['folder']}/{anim}/{d}"
    # 5-я локация: панель с кристаллами вместо монет и свой фон экрана букетов (resource.xml: stat_back_loc5, bouquets_screen_loc5)
    for loc in [rules] + list(rules["locations"].values()):
        for m in loc.get("marks_obstacle", []):
            if m["image"]:
                names[m["image"]] = "tree/" + m["image"][len("mark_"):]
    # комиксы между локациями (location_N_comix) и концовки (win_var_N_comics)
    for k, f in [("2", "comics-1-2"), ("3", "comics-2-3"), ("4", "comics-3-4"), ("5", "comics-4-5"), ("win_var_1", "comics-fin-1"), ("win_var_2", "comics-fin-2")]:
        names[f"comics_{k}"] = f"main_menu/{f}"
    # эффекты полёта к панели (effects/prizes, effects/product): частицы с картинкой приза / плода из data/particles/{prizes,products}
    for kind, tag in (("prizes", "pp"), ("products", "pq")):
        for f in sorted((data_dir / "particles" / kind).glob("*.jpg")):
            names[f"{tag}_{f.stem.lower()}"] = f"particles/{kind}/{f.stem}"
    names["stat_panel_5"] = "game/stat_control_loc5"
    names["bq_back_5"] = "game/bouquets/bouquets_back_loc5"
    names["bq_big"] = "game/bouquets/big-flowers"
    for f in ("auto_bouquet_level_1", "auto_bouquet_level_2", "auto_bouquet_level_3", "auto_bouquet_progress_1", "complete"):
        names[f"ab_{f}"] = f"game/bouquets/{f}"
    names["bug_target"] = "bugs/target"  # мишень серии ударов (root/bug/target)
    for it in rules["dropped_items"].values():
        names[f"prize_{it['image']}"] = f"prize_items/{it['image']}"
    for loc in [rules] + list(rules["locations"].values()):
        for st in loc.get("statues", {}).values():
            for lv in st["levels"]:
                for img in lv["images"].values():
                    names[img] = f"obstacles/{img}"
    # окно заданий (quest_screen): фон, стрелки листания, портреты персонажей журнала и значки заданий
    names["quest_back"] = "game/Quest_back"
    for d in ("next", "prev"):
        for st in ("normal", "active", "disabled"):
            names[f"quest_{d}_{st}"] = f"buttons/quest_{d}_{st}"
    mini = data_dir / "game/towns/quests/miniimages"
    journal_acts = [a for qs in all_quests for a in walk_actions(qs)]
    for person in {a["person"] for a in journal_acts if a["type"] == "add_quest"}:
        if (mini / f"{person}.jpg").exists():
            names[f"mini_{person}"] = f"game/towns/quests/miniimages/{person}"
    for item in {a.get("item", "") for a in journal_acts if a["type"] in ("add_task", "add_task_count")} - {""}:
        if (mini / "need" / f"{item}.jpg").exists() or (mini / "need" / f"{item}.png").exists():
            names[f"need_{item}"] = f"game/towns/quests/miniimages/need/{item}"
    # картинки колодцев по resource.xml: root/obstacles/<колодец> (у 2–5-й локаций — empty) и «ведро» root/<ведро>/pail|water|mask
    # (у 2–5-й локаций это и есть видимый фонтан, родник, акведук). Где ведро стоит — game_screen/well_ctrl/<ведро>.
    res = resource_paths(xml_dir / "resource.xml")
    well_ctrl = next(e for e in props.iter("well_ctrl") if len(e))
    for loc in [rules] + list(rules["locations"].values()):
        for name, it in loc.get("well_items", {}).items():
            src = res.get(f"root/obstacles/{name}", "")
            it["image"] = ""
            if src and not src.endswith("/empty") and (data_dir / f"{src}.jpg").exists():
                it["image"] = f"wellimg_{name}"
                names[it["image"]] = src
            pn = it.pop("pail_name", "")
            parts = [res.get(f"root/{pn}/{k}", "") for k in ("pail", "water", "mask")]
            it["pail_images"] = []
            if all(parts):
                it["pail_images"] = [f"pail{k}_{pn}" for k in ("", "w", "m")]
                for nm, src in zip(it["pail_images"], parts):
                    names[nm] = src
            ctrl = well_ctrl.find(pn)
            it["pail_pos"] = vec(ctrl.attrib["position"]) if ctrl is not None else None
    for item in {b["items"] for b in bugs.values() if b["items"]}:
        names[f"item_{item}"] = f"quest_items/{item}"
    for icon in ("attack_icon", "pour_icon", "product_icon"):
        names[f"helper_{icon}"] = f"bugs/helper/{icon}"
    for name, src in names.items():
        # русские варианты картинок «Цветка Стихий» (логотип, фон меню) лежат в data/ru/ — они главнее
        ru_src = data_dir / "ru" / src
        img = load_image(ru_src if ru_src.with_suffix(".jpg").exists() or ru_src.with_suffix(".png").exists() else data_dir / src)
        img.save(out_img / f"{name}.webp", lossless=True)
    # комикс без нарисованной «лужи» кнопки (кадр с фермой, пока кнопка не появилась)
    subprocess.run([sys.executable, str(Path(__file__).with_name("make_comics_clean.py")),
                    str(out_img / "comics.webp"), str(out_img / "comics_clean.webp")], check=True)
    rules["images"] = sorted([*names, "comics_clean"])
    rules["core_images"], rules["location_images"] = split_images(rules, bugs, names)
    rules["audio"] = export_audio(data_dir, web)
    # таблица рекордов по умолчанию: файл объявлен как windows-1251, но записан в cp866
    # в «Цветке Стихий» — UTF-8 с BOM и отдельные таблицы adventure_casual / adventure_hardcore: берём обычную сложность
    raw_scores = (xml_dir / "ru" / "default_scores_ru.xml").read_bytes()
    scores = raw_scores[3:].decode("utf-8") if raw_scores.startswith(b"\xef\xbb\xbf") else raw_scores.decode("cp866")
    casual = re.search(r"<adventure_casual>(.*?)</adventure_casual>", scores, re.S)
    scores = casual.group(1) if casual else scores
    rules["default_scores"] = [{"name": n, "days": int(d), "money": int(m)}
                               for n, d, m in re.findall(r'<place name="([^"]*)" days="(\d+)" money="(\d+)"', scores)]
    out = web / "public" / "data" / "rules.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    rules = unquote_csv(rules)
    out.write_text(json.dumps(rules, ensure_ascii=False, indent=1))
    print(f"картинок: {len(names)}, растений: {len(vegetations)}, продуктов: {len(products)}")
    print(json.dumps({k: rules[k] for k in ("start", "day_time", "seeds", "prices", "water_storage", "product_storage", "well")}, ensure_ascii=False)[:1800])


if __name__ == "__main__":
    main()
