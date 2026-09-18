"""Remove only the white matte from the verified original CAU seal."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1]
source = root / 'assets/identity/cau-emblem.png'
out = root / 'assets/identity/cau-emblem-transparent.png'
im = Image.open(source).convert('RGBA')
pixels = []
for r, g, b, a in im.getdata():
    alpha = 1 - min(r, g, b) / 255
    if alpha == 0:
        pixels.append((0, 0, 0, 0))
    else:
        rgb = tuple(max(0, min(255, round((v - 255 * (1-alpha)) / alpha))) for v in (r, g, b))
        pixels.append((*rgb, round(a * alpha)))
result = Image.new('RGBA', im.size)
result.putdata(pixels)
result.save(out, optimize=True)
assert result.getpixel((0, 0))[3] == 0
print(f'Prepared {out.name}: transparent alpha, original proportions {im.size}')
