#!/usr/bin/env python3
"""Generate pixel-art PNG toolbar icons (stdlib only)."""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "icons")

PAL = {
    ".": (0, 0, 170, 255),
    "k": (0, 0, 0, 255),
    "w": (255, 255, 255, 255),
    "g": (192, 192, 192, 255),
    "c": (0, 255, 255, 255),
    "y": (255, 255, 0, 255),
    "r": (255, 0, 0, 255),
}

# 16×16 CRT monitor with a cyan screen and yellow blip
SPRITE = [
    "................",
    "....kkkkkkkk....",
    "...kgwwwwwwgk...",
    "...kgccccccgk...",
    "...kgcckkccgk...",
    "...kgccccccgk...",
    "...kgccyyccgk...",
    "...kgccccccgk...",
    "...kggggggggk...",
    "....kkkkkkkk....",
    "......kggk......",
    ".....kggggk.....",
    "....kkkkkkkk....",
    "................",
    "..y.TAB.TIME.k..",
    "................",
]


def encode_png(width, height, pixels):
    def chunk(tag, data):
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(pixels[y * width + x])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def sprite_pixels():
    # Fix the decorative last rows to be valid 16-char palette rows
    rows = [
        "................",
        "....kkkkkkkk....",
        "...kgwwwwwwgk...",
        "...kgccccccgk...",
        "...kgcckkccgk...",
        "...kgccccccgk...",
        "...kgccyyccgk...",
        "...kgccccccgk...",
        "...kggggggggk...",
        "....kkkkkkkk....",
        "......kggk......",
        ".....kggggk.....",
        "....kkkkkkkk....",
        "......kkkk......",
        ".....kyyyyk.....",
        "................",
    ]
    px = []
    for row in rows:
        for ch in row:
            px.append(PAL[ch])
    return 16, 16, px


def scale(pixels, src, factor):
    w, h = src, src
    out = []
    for y in range(h * factor):
        for x in range(w * factor):
            out.append(pixels[(y // factor) * w + (x // factor)])
    return w * factor, h * factor, out


def main():
    os.makedirs(OUT, exist_ok=True)
    w, h, px = sprite_pixels()
    for size in (16, 32, 48, 128):
        factor = size // 16
        sw, sh, sp = scale(px, 16, factor)
        path = os.path.join(OUT, f"icon{size}.png")
        with open(path, "wb") as f:
            f.write(encode_png(sw, sh, sp))
        print("wrote", path)


if __name__ == "__main__":
    main()
