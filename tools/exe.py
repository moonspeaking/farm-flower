"""Мелкие помощники для разбора original/install/game.exe (capstone + pefile из .venv).

Запуск: ../.venv/bin/python exe.py <адрес> [<адрес>…] — дизассемблировать блок, подписывая строки,
на которые ссылаются push; функции модуля удобно импортировать для своих запросов.
"""
import re
import struct
import sys
from pathlib import Path

import capstone
import pefile

PATH = Path(__file__).resolve().parent.parent / "original/install/game.exe"
pe = pefile.PE(str(PATH), fast_load=True)
data = PATH.read_bytes()
base = pe.OPTIONAL_HEADER.ImageBase
secs = [(base + s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData, s.Name.rstrip(b"\0").decode())
        for s in pe.sections]
text = next(s for s in secs if s[4] == ".text")
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)


def va2off(v):
    for va, vs, ro, rs, n in secs:
        if va <= v < va + rs:
            return ro + v - va


def off2va(o):
    for va, vs, ro, rs, n in secs:
        if ro <= o < ro + rs:
            return va + o - ro


def cstr(v):
    o = va2off(v)
    if o is None:
        return None
    return data[o:data.find(b"\0", o)].decode("latin1")


def find_str(s):
    return [off2va(m.start()) for m in re.finditer(re.escape(s.encode()) + b"\0", data) if data[m.start() - 1] == 0]


def xrefs(v):
    tva, _, tro, trs, _ = text
    return [tva + m.start() for m in re.finditer(re.escape(struct.pack("<I", v)), data[tro:tro + trs])]


def callers(target):
    tva, _, tro, trs, _ = text
    blob, out = data[tro:tro + trs], []
    i = blob.find(b"\xe8")
    while i != -1:
        if i + 5 <= len(blob) and tva + i + 5 + struct.unpack("<i", blob[i + 1:i + 5])[0] == target:
            out.append(tva + i)
        i = blob.find(b"\xe8", i + 1)
    return out


def dis(v, n=40):
    o = va2off(v)
    out = []
    for i in md.disasm(data[o:o + n * 10], v):
        line = f"{i.address:08x}  {i.mnemonic} {i.op_str}"
        m = re.search(r"push (0x8[0-9a-f]{5})$", line)
        if m:
            s = cstr(int(m.group(1), 16))
            if s and s.isprintable():
                line += f'   ; "{s}"'
        out.append(line)
        if len(out) >= n:
            break
    return out


if __name__ == "__main__":
    for a in sys.argv[1:]:
        print("=====", a)
        print("\n".join(dis(int(a, 16), 120)))
