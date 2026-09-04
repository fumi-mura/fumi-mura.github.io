import re
import unittest
from pathlib import Path


CSS_PATH = Path(__file__).resolve().parents[1] / "assets" / "lp.css"


class YomokaHeroStyleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.css = CSS_PATH.read_text(encoding="utf-8")

    def test_hero_mockup_uses_compact_desktop_width(self):
        self.assertIn("grid-template-columns: 1fr minmax(0, 360px);", self.css)

    def test_hero_title_uses_compact_responsive_size(self):
        title_rule = re.search(r"\.lp-title \{(?P<body>.*?)\n\}", self.css, re.S)

        self.assertIsNotNone(title_rule)
        self.assertIn("font-size: clamp(30px, 4.6vw, 52px);", title_rule["body"])

    def test_hero_mockup_uses_compact_mobile_width(self):
        mobile_rule = re.search(
            r"@media \(max-width: 780px\) \{(?P<body>.*?)\n\}", self.css, re.S
        )

        self.assertIsNotNone(mobile_rule)
        self.assertIn("max-width: 250px;", mobile_rule["body"])


class YomokaSpineShelfTests(unittest.TestCase):
    """「選ぶ理由」の棚は plan.ja.md の行数ぶん並ぶ。7 行になって 2 段になった。"""

    @classmethod
    def setUpClass(cls):
        cls.css = CSS_PATH.read_text(encoding="utf-8")

    def test_spines_fit_four_columns_at_full_width(self):
        # 最小 190px だと 1180px の器に 5 列入って 5 + 2 に割れる。
        # 240px にすると 4 列で止まり、7 枚が 4 + 3 に均れる
        self.assertIn("grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));", self.css)

    def test_spine_rows_share_one_height(self):
        # 段ごとに中身の量が違うので、放っておくと上下の段で高さが揃わない
        spines = re.search(r"\.lp-spines \{(?P<body>.*?)\n\}", self.css, re.S)

        self.assertIsNotNone(spines)
        self.assertIn("grid-auto-rows: 1fr;", spines.group("body"))


if __name__ == "__main__":
    unittest.main()
