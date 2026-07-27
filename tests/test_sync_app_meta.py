import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "sync-app-meta.py"
SPEC = importlib.util.spec_from_file_location("sync_app_meta", SCRIPT)
sync_app_meta = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sync_app_meta)


class ReplaceTitleTests(unittest.TestCase):
    def test_keeps_the_store_link_wrapping_the_title(self):
        inner = (
            '<h3 class="card-title">'
            '<a href="https://apps.apple.com/jp/app/id1" target="_blank" rel="noopener">'
            '<span class="ja">旧名</span><span class="en">Old</span>'
            "</a></h3>"
        )

        result = sync_app_meta.replace_title(inner, "新名", "New")

        self.assertEqual(
            result,
            '<h3 class="card-title">'
            '<a href="https://apps.apple.com/jp/app/id1" target="_blank" rel="noopener">'
            '<span class="ja">新名</span><span class="en">New</span>'
            "</a></h3>",
        )

    def test_title_without_a_link_stays_without_one(self):
        inner = '<h3 class="card-title"><span class="ja">旧名</span><span class="en">Old</span></h3>'

        result = sync_app_meta.replace_title(inner, "新名", "New")

        self.assertEqual(
            result,
            '<h3 class="card-title"><span class="ja">新名</span><span class="en">New</span></h3>',
        )

    def test_is_idempotent(self):
        inner = (
            '<h3 class="card-title">'
            '<a href="https://apps.apple.com/jp/app/id1" target="_blank" rel="noopener">'
            '<span class="ja">名前</span><span class="en">Name</span>'
            "</a></h3>"
        )

        once = sync_app_meta.replace_title(inner, "名前", "Name")

        self.assertEqual(once, inner)
        self.assertEqual(sync_app_meta.replace_title(once, "名前", "Name"), inner)

    def test_escapes_html_in_the_name(self):
        inner = '<h3 class="card-title"><span class="ja">旧</span><span class="en">Old</span></h3>'

        result = sync_app_meta.replace_title(inner, "A & B", "A & B")

        self.assertIn("A &amp; B", result)


if __name__ == "__main__":
    unittest.main()
