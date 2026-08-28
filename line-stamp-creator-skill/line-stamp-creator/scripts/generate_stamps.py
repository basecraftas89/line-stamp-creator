#!/usr/bin/env python3
"""参考画像と expressions.json から透過PNGのLINEスタンプを生成する。"""
import argparse, base64, json, os, sys
from pathlib import Path

ROOT = Path.cwd()
RAW = ROOT / "output" / "raw"

def find_reference():
    for name in ("reference.png", "reference.jpg", "reference.jpeg"):
        path = ROOT / name
        if path.exists():
            return path
    return None

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", type=int, nargs="*", help="再生成する番号")
    parser.add_argument("--model", default=os.getenv("LINE_STAMP_IMAGE_MODEL", "gpt-image-2"))
    args = parser.parse_args()
    if not os.getenv("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY が未設定です。値を表示せずに設定してから再実行してください。")
    ref = find_reference()
    if ref is None:
        raise SystemExit("reference.png / reference.jpg がありません。作業フォルダに置いてください。")
    config_path = ROOT / "expressions.json"
    if not config_path.exists():
        config_path = Path(__file__).resolve().parent.parent / "references" / "expressions.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    targets = [s for s in config["stamps"] if not args.only or s["no"] in args.only]
    from openai import OpenAI
    client = OpenAI()
    RAW.mkdir(parents=True, exist_ok=True)
    for stamp in targets:
        rules = "\n".join(f"- {rule}" for rule in config.get("design_rules", []))
        prompt = (f"{config['style']}\n制作条件:\n{rules}\n表情・ポーズ: {stamp['expression']}。\n"
                  f"手描きの太いマーカー風の日本語文字『{stamp['text']}』を正確に添える。\n"
                  "中央配置、上下左右に余白、背景なし、透明背景、被写体を切らない。")
        print(f"[{stamp['no']}] {stamp['text']} を生成中...")
        with ref.open("rb") as image_file:
            result = client.images.edit(model=args.model, image=image_file, prompt=prompt,
                                        background="transparent", output_format="png", size="1024x1024")
        data = base64.b64decode(result.data[0].b64_json)
        out = RAW / f"stamp_{stamp['no']:02d}.png"
        out.write_bytes(data)
        print(f"  -> {out} ({len(data) // 1024}KB)")
    print("生成完了。次: python3 scripts/finalize_stamps.py --check-only")

if __name__ == "__main__":
    main()
