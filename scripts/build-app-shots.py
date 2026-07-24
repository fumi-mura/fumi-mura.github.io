#!/usr/bin/env python3
"""各 iOS アプリの App Store 用スクショ(完成ポスター)を WebP に変換してサイトへ取り込む。

出力先: assets/apps/{app}/{lang}/{n}.webp       … ライトボックス用(全枚数)
        assets/apps/{app}/{lang}/thumb_{n}.webp … フィルムストリップ用の小サムネ
        assets/apps/manifest.json                … サイト表示用の画像一覧

lang は ja / en(サイトの言語コード)。en の元素材は en-US。
en-US が無いアプリ(dripshot)は ja を両方に使う。
素材を更新したら `python3 scripts/build-app-shots.py` を実行するだけで WebP と manifest が再生成される。
"""
import json
import re
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
PROGRAM_DIR = REPO_ROOT.parent
OUT_ROOT = REPO_ROOT / "assets" / "apps"
MANIFEST_PATH = OUT_ROOT / "manifest.json"

# data-app 属性 -> アプリリポジトリ(~/Program 以下)
APPS = {
    "visitory": "Visitory",
    "patrimo": "Patrimo",
    "dripshot": "dripshot/dripshot",
    "pulltimer": "pull-timer",
    "reelo": "Reelo",
    "yomoka": "yomoka",
}

# サイトの言語コード -> fastlane のロケール
LOCALES = {"ja": "ja", "en": "en-US"}

FULL_MAX_H = 1600  # ライトボックス用の高さ上限
THUMB_MAX_W = 320  # フィルムストリップ用サムネの幅上限
QUALITY = 80


def natural_key(p):
    nums = re.findall(r"\d+", p.name)
    return [int(n) for n in nums] if nums else [0]


def source_shots(app_repo, locale):
    d = PROGRAM_DIR / app_repo / "fastlane" / "screenshots" / locale
    if not d.is_dir():
        return []
    return sorted((f for f in d.glob("*.png")), key=natural_key)


def resize_to_height(im, max_h):
    if im.height <= max_h:
        return im
    w = round(im.width * max_h / im.height)
    return im.resize((w, max_h), Image.LANCZOS)


def resize_to_width(im, max_w):
    if im.width <= max_w:
        return im
    h = round(im.height * max_w / im.width)
    return im.resize((max_w, h), Image.LANCZOS)


def clean_output_dir(out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    for path in out_dir.glob("*.webp"):
        path.unlink()


def make_manifest(counts):
    apps = {}
    for app in sorted(counts):
        apps[app] = {}
        for lang in sorted(counts[app]):
            count = counts[app][lang]
            apps[app][lang] = {
                "count": count,
                "images": [f"assets/apps/{app}/{lang}/{i}.webp" for i in range(1, count + 1)],
                "thumbs": [f"assets/apps/{app}/{lang}/thumb_{i}.webp" for i in range(1, count + 1)],
            }
    return {"apps": apps}


def write_manifest(manifest, path=MANIFEST_PATH):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def build():
    total = 0
    counts = {}
    for app, repo in APPS.items():
        counts[app] = {}
        for lang, locale in LOCALES.items():
            shots = source_shots(repo, locale)
            if not shots:  # en-US が無ければ ja へフォールバック
                shots = source_shots(repo, LOCALES["ja"])
            if not shots:
                print(f"  ! {app}/{lang}: no source")
                continue
            out_dir = OUT_ROOT / app / lang
            clean_output_dir(out_dir)
            for i, src in enumerate(shots, start=1):
                im = Image.open(src).convert("RGB")
                resize_to_height(im, FULL_MAX_H).save(
                    out_dir / f"{i}.webp", "WEBP", quality=QUALITY, method=6
                )
                resize_to_width(im, THUMB_MAX_W).save(
                    out_dir / f"thumb_{i}.webp", "WEBP", quality=QUALITY, method=6
                )
                total += 1
            counts[app][lang] = len(shots)
            print(f"  {app}/{lang}: {len(shots)} shots")
    write_manifest(make_manifest(counts))
    print(f"done ({total} images)")


if __name__ == "__main__":
    build()
