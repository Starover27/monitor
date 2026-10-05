"""Generate icon.ico for MonitorClient.exe — чистый Python, без Pillow.

Рисует скруглённый тёмный квадрат с бирюзовой линией пульса —
в стиле веб-интерфейса Monitor. Запуск: py -3.13 make_icon.py
"""
import struct
import sys
from pathlib import Path

BG_TOP = (16, 24, 40)       # #101828
BG_BOTTOM = (7, 13, 23)     # #070D17
LINE = (34, 211, 238)       # #22D3EE

# Электрокардиограмма в нормализованных координатах (x, y вниз)
PULSE = [
    (0.05, 0.60), (0.30, 0.60), (0.38, 0.30),
    (0.50, 0.84), (0.62, 0.50), (0.72, 0.60), (0.95, 0.60),
]


def _clamp01(value: float) -> float:
    return 0.0 if value < 0 else 1.0 if value > 1 else value


def _seg_distance(px, py, ax, ay, bx, by) -> float:
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    c1 = vx * wx + vy * wy
    if c1 <= 0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    c2 = vx * vx + vy * vy
    if c2 <= c1:
        return ((px - bx) ** 2 + (py - by) ** 2) ** 0.5
    t = c1 / c2
    qx, qy = ax + t * vx, ay + t * vy
    return ((px - qx) ** 2 + (py - qy) ** 2) ** 0.5


def _rounded_rect_sdf(x, y, size, radius) -> float:
    half = size / 2
    qx = abs(x - half) - (half - radius)
    qy = abs(y - half) - (half - radius)
    ax, ay = max(qx, 0.0), max(qy, 0.0)
    return (ax * ax + ay * ay) ** 0.5 + min(max(qx, qy), 0.0) - radius


def render(size: int) -> bytearray:
    """RGBA-изображение size×size (top-down, RGBA)."""
    half_line = size * 0.055
    glow_radius = size * 0.17
    radius = size * 0.22
    points = [(x * size, y * size) for x, y in PULSE]
    img = bytearray(size * size * 4)
    for row in range(size):
        y = row + 0.5
        grad = y / size
        bg = tuple(BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * grad for i in range(3))
        for col in range(size):
            x = col + 0.5
            rect_alpha = _clamp01(0.5 - _rounded_rect_sdf(x, y, size, radius))
            if rect_alpha <= 0:
                continue
            dist = min(_seg_distance(x, y, *points[i], *points[i + 1])
                       for i in range(len(points) - 1))
            glow = _clamp01(1.0 - dist / glow_radius) * 0.30
            line = _clamp01(half_line + 0.5 - dist)
            color = [bg[i] * (1 - glow) + LINE[i] * glow for i in range(3)]
            color = [color[i] * (1 - line) + LINE[i] * line for i in range(3)]
            offset = (row * size + col) * 4
            img[offset:offset + 4] = bytes((
                round(color[0]), round(color[1]), round(color[2]),
                round(255 * max(rect_alpha, line * 0.9)),
            ))
    return img


def _downsample(source: bytearray, source_size: int, target: int) -> bytearray:
    if target == source_size:
        return source
    factor = source_size // target
    out = bytearray(target * target * 4)
    for row in range(target):
        src_row = row * factor
        for col in range(target):
            src_col = col * factor
            r = g = b = a = 0
            for dy in range(factor):
                base = ((src_row + dy) * source_size + src_col) * 4
                for _ in range(factor):
                    r += source[base]
                    g += source[base + 1]
                    b += source[base + 2]
                    a += source[base + 3]
                    base += 4
            area = factor * factor
            offset = (row * target + col) * 4
            out[offset:offset + 4] = bytes((r // area, g // area, b // area, a // area))
    return out


def _bmp_entry(width: int, image: bytearray) -> bytes:
    """BMP-данные для ICO (BGRA снизу-вверх + пустая AND-маска)."""
    height = width
    pixels = bytearray()
    for row in range(height - 1, -1, -1):
        base = row * width * 4
        for col in range(width):
            r, g, b, a = image[base + col * 4: base + col * 4 + 4]
            pixels += bytes((b, g, r, a))
    mask_row = ((width + 31) // 32) * 4
    and_mask = bytes(mask_row * height)
    header = struct.pack(
        "<IiiHHIIiiII",
        40, width, height * 2, 1, 32, 0,
        len(pixels) + len(and_mask), 0, 0, 0, 0,
    )
    return header + bytes(pixels) + and_mask


def build_icon(sizes=(16, 24, 32, 48, 64, 128, 256), path="icon.ico") -> Path:
    images = []
    for size in sizes:
        base = 512 if 512 % size == 0 else 192
        images.append((size, _downsample(render(base), base, size)))
    entries = [(size, _bmp_entry(size, img)) for size, img in images]

    header = struct.pack("<HHH", 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    directory = bytearray()
    payload = bytearray()
    for size, data in entries:
        directory += struct.pack(
            "<BBBBHHII",
            0 if size >= 256 else size, 0 if size >= 256 else size,
            0, 0, 1, 32, len(data), offset,
        )
        payload += data
        offset += len(data)
    out = Path(path)
    out.write_bytes(header + bytes(directory) + bytes(payload))
    return out


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("icon.ico")
    built = build_icon(path=target)
    print(f"OK: {built} ({built.stat().st_size} bytes)")
