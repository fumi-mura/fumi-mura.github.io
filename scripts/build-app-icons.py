#!/usr/bin/env python3
"""各 iOS アプリの AppIcon を WebP に変換してサイトへ取り込む。

出力先: assets/apps/{app}/icon.webp … カード左上に置くアプリアイコン

素材(Assets.xcassets)を更新したら `python3 scripts/build-app-icons.py` を実行するだけで再生成される。
"""
from pathlib import Path

from PIL import Image

from apps import load_apps

REPO_ROOT = Path(__file__).resolve().parent.parent
PROGRAM_DIR = REPO_ROOT.parent
OUT_ROOT = REPO_ROOT / "assets" / "apps"

APPS = load_apps()

ICON_SIZE = 192  # 表示は 56px 前後なので Retina 3x でも足りる
QUALITY = 82


def find_icon(app_root):
    """AppIcon.appiconset の中で最も大きい png を返す。"""
    candidates = list(app_root.glob("**/AppIcon.appiconset/*.png"))
    if not candidates:
        return None
    return max(candidates, key=lambda p: (p.stat().st_size, p.name))


def to_square(im, size):
    side = min(im.width, im.height)
    left = (im.width - side) // 2
    top = (im.height - side) // 2
    return im.crop((left, top, left + side, top + side)).resize((size, size), Image.LANCZOS)


def icon_rel_path(app):
    return f"assets/apps/{app}/icon.webp"


def build():
    for app, repo in APPS.items():
        src = find_icon(PROGRAM_DIR / repo)
        if src is None:
            print(f"  ! {app}: no AppIcon")
            continue
        out = REPO_ROOT / icon_rel_path(app)
        out.parent.mkdir(parents=True, exist_ok=True)
        im = Image.open(src).convert("RGB")
        to_square(im, ICON_SIZE).save(out, "WEBP", quality=QUALITY, method=6)
        print(f"  {app}: {src.name} -> {out.relative_to(REPO_ROOT)}")
    print("done")


if __name__ == "__main__":
    build()
