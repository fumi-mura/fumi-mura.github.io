#!/usr/bin/env python3
"""トップページ(index.html)の iOS アプリカードを fastlane metadata から同期する。

各カードの名前(card-title)を metadata の name、説明(card-sub)を subtitle にする。
metadata を変更したら `python3 scripts/sync-app-meta.py` を実行するだけで反映される。
冪等に動作する。英語 metadata が無いアプリは日本語にフォールバックする。
"""
import html
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PROGRAM_DIR = REPO_ROOT.parent
INDEX = REPO_ROOT / "index.html"

# data-app 属性 -> アプリリポジトリ(~/Program 以下)
APPS = {
    "visitory": "Visitory",
    "patrimo": "Patrimo",
    "dripshot": "dripshot/dripshot",
    "pulltimer": "pull-timer",
    "reelo": "Reelo",
    "yomoka": "yomoka",
}

ARTICLE_RE = re.compile(
    r'(<article class="card app-card" data-app="([a-z]+)"[^>]*>)(.*?)(</article>)',
    re.DOTALL,
)


def read_meta(app_repo, lang, field):
    path = PROGRAM_DIR / app_repo / "fastlane" / "metadata" / lang / f"{field}.txt"
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8").strip()


def clean_name(name):
    """App Store のキーワード詰め込み("A | B | C")を先頭要素だけに整える。"""
    if name is None:
        return None
    return name.split(" | ")[0].strip()


def esc(text):
    return html.escape(text, quote=False)


def fields(app_repo):
    name_ja = clean_name(read_meta(app_repo, "ja", "name"))
    name_en = clean_name(read_meta(app_repo, "en-US", "name")) or name_ja
    sub_ja = read_meta(app_repo, "ja", "subtitle")
    sub_en = read_meta(app_repo, "en-US", "subtitle") or sub_ja
    return name_ja, name_en, sub_ja, sub_en


def bilingual(name_ja, name_en):
    return f'<span class="ja">{esc(name_ja)}</span><span class="en">{esc(name_en)}</span>'


def sync():
    text = INDEX.read_text(encoding="utf-8")

    def repl(m):
        site = m.group(2)
        app_repo = APPS.get(site)
        if app_repo is None:
            return m.group(0)
        name_ja, name_en, sub_ja, sub_en = fields(app_repo)
        inner = m.group(3)
        inner = re.sub(
            r'(<h3 class="card-title">).*?(</h3>)',
            lambda _: f'<h3 class="card-title">{bilingual(name_ja, name_en)}</h3>',
            inner, count=1, flags=re.DOTALL,
        )
        inner = re.sub(
            r'(<p class="card-sub">).*?(</p>)',
            lambda _: f'<p class="card-sub">{bilingual(sub_ja, sub_en)}</p>',
            inner, count=1, flags=re.DOTALL,
        )
        return f"{m.group(1)}{inner}{m.group(4)}"

    new_text, n = ARTICLE_RE.subn(repl, text)
    if new_text != text:
        INDEX.write_text(new_text, encoding="utf-8")
        print(f"updated index.html ({n} cards)")
    else:
        print(f"unchanged ({n} cards)")


if __name__ == "__main__":
    sync()
