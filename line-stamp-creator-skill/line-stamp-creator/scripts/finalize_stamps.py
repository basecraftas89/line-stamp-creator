#!/usr/bin/env python3
"""透過検収、LINE規格へのリサイズ、申請用ZIP作成。"""
import argparse, sys, zipfile
from pathlib import Path
from PIL import Image

ROOT = Path.cwd(); RAW = ROOT / "output" / "raw"; SUBMIT = ROOT / "output" / "submit"
STAMP_MAX = (370, 320); MAIN_SIZE = (240, 240); TAB_SIZE = (96, 74)

def check(path):
    problems = []
    image = Image.open(path)
    if image.mode != "RGBA":
        return False, ["アルファチャンネルなし"]
    alpha = image.getchannel("A"); hist = alpha.histogram()
    transparent_ratio = sum(hist[:16]) / (image.width * image.height)
    if transparent_ratio < 0.10:
        problems.append(f"透過率{transparent_ratio:.0%}: 背景が抜けていない可能性")
    bbox = alpha.getbbox()
    if bbox is None:
        problems.append("画像が空")
    elif 0 in bbox or bbox[2] == image.width or bbox[3] == image.height:
        problems.append("被写体が縁に接している可能性")
    return not problems, problems

def fit(image, box, margin=0):
    bbox = image.getchannel("A").getbbox()
    if bbox: image = image.crop(bbox)
    scale = min((box[0] - margin * 2) / image.width, (box[1] - margin * 2) / image.height, 1.0)
    width = max(2, int(image.width * scale) // 2 * 2); height = max(2, int(image.height * scale) // 2 * 2)
    image = image.resize((width, height), Image.LANCZOS)
    canvas = Image.new("RGBA", (width + margin * 2, height + margin * 2), (0, 0, 0, 0))
    canvas.paste(image, (margin, margin), image); return canvas

def save_capped(image, path):
    image.save(path, "PNG", optimize=True)
    if path.stat().st_size > 1024 * 1024:
        raise SystemExit(f"{path.name} が1MBを超過しています。再生成してください。")

def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args(); files = sorted(RAW.glob("stamp_*.png"))
    if len(files) < 8: raise SystemExit(f"rawが{len(files)}枚しかありません（8枚必要）。")
    ng = []
    for path in files:
        ok, problems = check(path); print(f"[{ 'OK' if ok else 'NG' }] {path.name}" + (f" -> {'; '.join(problems)}" if problems else ""))
        if not ok: ng.append(path.name)
    if args.check_only: raise SystemExit(1 if ng else 0)
    if ng: raise SystemExit("NGあり。--only 番号で再生成してから再実行してください。")
    SUBMIT.mkdir(parents=True, exist_ok=True)
    for i, path in enumerate(files, 1): save_capped(fit(Image.open(path).convert("RGBA"), STAMP_MAX, 10), SUBMIT / f"{i:02d}.png")
    for name, size, margin in (("main.png", MAIN_SIZE, 10), ("tab.png", TAB_SIZE, 4)):
        fitted = fit(Image.open(files[0]).convert("RGBA"), size, margin); canvas = Image.new("RGBA", size, (0, 0, 0, 0))
        canvas.paste(fitted, ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2), fitted); save_capped(canvas, SUBMIT / name)
    zpath = ROOT / "output" / "stamps_submit.zip"
    with zipfile.ZipFile(zpath, "w") as archive:
        for path in sorted(SUBMIT.iterdir()): archive.write(path, path.name)
    print(f"完成: {SUBMIT}/ と {zpath}")

if __name__ == "__main__": main()
