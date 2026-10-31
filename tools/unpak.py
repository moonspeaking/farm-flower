"""Распаковщик main.pak (PopCap PAK, XOR 0xF7).

Формат (после XOR каждого байта с 0xF7):
  u32 magic = 0xBAC04AC0, u32 version = 0
  записи: u8 flags (0x80 = конец списка), u8 len, name[len] (cp1251, '\\'),
          u32 size, u64 FILETIME
  затем данные всех файлов подряд в порядке записей.

Запуск: python3 unpak.py <main.pak> <выходная папка>
"""
import struct
import sys
from pathlib import Path

KEY = 0xF7
MAGIC = 0xBAC04AC0
_XOR = bytes(b ^ KEY for b in range(256))


def read_pak(path):
    data = Path(path).read_bytes().translate(_XOR)
    magic, version = struct.unpack_from("<II", data, 0)
    if magic != MAGIC:
        raise ValueError(f"не PAK: magic={magic:#x}")
    pos, entries = 8, []
    while True:
        flags = data[pos]
        pos += 1
        if flags & 0x80:
            break
        n = data[pos]
        name = data[pos + 1:pos + 1 + n].decode("cp1251")
        pos += 1 + n
        size, _filetime = struct.unpack_from("<IQ", data, pos)
        pos += 12
        entries.append((name, size))
    for name, size in entries:
        yield name.replace("\\", "/"), data[pos:pos + size]
        pos += size
    if pos != len(data):
        raise ValueError(f"хвост {len(data) - pos} байт после последнего файла")


def main():
    src, out = sys.argv[1], Path(sys.argv[2])
    count = total = 0
    for name, blob in read_pak(src):
        dst = out / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(blob)
        count += 1
        total += len(blob)
    print(f"{count} файлов, {total / 2**20:.1f} МБ -> {out}")


if __name__ == "__main__":
    main()
