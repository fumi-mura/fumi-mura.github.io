"""index.html の data-app 属性 -> アプリリポジトリ(~/Program 以下) の対応表。

サイトのビルドスクリプトと promokit が共有する単一ソース。
アプリを追加したら apps.json だけを更新する。
"""
import json
from pathlib import Path

DEFAULT_PATH = Path(__file__).resolve().parent / "apps.json"


def load_apps(path=DEFAULT_PATH):
    return json.loads(Path(path).read_text(encoding="utf-8"))
