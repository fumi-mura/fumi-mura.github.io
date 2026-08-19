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


if __name__ == "__main__":
    unittest.main()
