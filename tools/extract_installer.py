"""Распаковка установщика SmallGames (Smart Install Maker 5.04) без запуска.

Устройство: после PE идёт оверлей — текстовый заголовок (строки через \\0: название, список файлов
«@$&%04\\путь», за каждым «2», «1»), затем подряд CAB-архивы (MS-ZIP) без 4-байтовой сигнатуры MSCF.
Первый CAB — служебные файлы установщика ($inst\\*.tmp), дальше многотомный набор 0000.tmp, 0001.tmp…
(тома по 8 МБ, ссылаются друг на друга по этим именам). Файлы внутри названы номерами 0, 1, 2… —
это порядковые номера в списке файлов заголовка.

Запуск: python3 extract_installer.py <setup.exe> <выходная папка>   (нужен 7zz: brew install sevenzip)
"""
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path


def overlay(data: bytes) -> bytes:
    pe = struct.unpack_from("<I", data, 0x3C)[0]
    n = struct.unpack_from("<H", data, pe + 6)[0]
    sec = pe + 24 + struct.unpack_from("<H", data, pe + 20)[0]
    end = max(sum(struct.unpack_from("<II", data, sec + 40 * i + 16)) for i in range(n))
    return data[end:]


def cabinets(ov: bytes):
    """Начала CAB без сигнатуры: (смещение поля reserved1, размер вместе с MSCF)."""
    found = []
    for m in re.finditer(rb"\x03\x01[\x01\x02]\x00", ov):  # versionMinor 3, versionMajor 1, cFolders
        s = m.start() - 20
        if s < 0:
            continue
        res1, cb, res2, coff = struct.unpack_from("<IIII", ov, s)
        if res1 == 0 and res2 == 0 and 0 < coff < 1000 and 0 < cb <= len(ov) - s + 4:
            if not found or s >= found[-1][0] + found[-1][1] - 4:
                found.append((s, cb))
    return found


def file_names(ov: bytes):
    parts = ov[:200_000].split(b"\x00")
    return [
        p.decode("cp1251")[7:].replace("\\", "/")
        for i, p in enumerate(parts[:-2])
        if p.startswith(b"@$&%04\\") and parts[i + 1] == b"2" and parts[i + 2] == b"1"
    ]


def main():
    exe, out = Path(sys.argv[1]), Path(sys.argv[2])
    ov = overlay(exe.read_bytes())
    cabs = cabinets(ov)
    names = file_names(ov)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        # первый CAB — служебный, остальные — тома игры 0000.tmp, 0001.tmp…
        for i, (s, cb) in enumerate(cabs[1:]):
            (tmp / f"{i:04d}.tmp").write_bytes(b"MSCF" + ov[s:s + cb - 4])
        raw = tmp / "raw"
        subprocess.run(["7zz", "x", "-y", f"-o{raw}", str(tmp / "0000.tmp")], check=True, stdout=subprocess.DEVNULL)
        for i, name in enumerate(names):
            src = raw / str(i)
            if src.exists():
                dst = out / name
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
    print(f"{len(cabs) - 1} томов, {len(names)} файлов -> {out}")


if __name__ == "__main__":
    main()
