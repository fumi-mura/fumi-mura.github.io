import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

SCRIPT = SCRIPTS / "build-app-icons.py"
SPEC = importlib.util.spec_from_file_location("build_app_icons", SCRIPT)
build_app_icons = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build_app_icons)


def make_png(path, size=(1024, 1024)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, (10, 20, 30)).save(path)
    return path


class FindIconTests(unittest.TestCase):
    def test_finds_the_png_inside_appiconset(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            icon = make_png(root / "App/Resources/Assets.xcassets/AppIcon.appiconset/icon_1024.png")

            self.assertEqual(build_app_icons.find_icon(root), icon)

    def test_returns_none_when_there_is_no_appiconset(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_png(root / "App/Resources/other.png")

            self.assertIsNone(build_app_icons.find_icon(root))

    def test_ignores_png_outside_the_appiconset(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_png(root / "App/Preview/screenshot.png")
            icon = make_png(root / "App/Assets.xcassets/AppIcon.appiconset/AppIcon.png")

            self.assertEqual(build_app_icons.find_icon(root), icon)

    def test_prefers_the_largest_png_when_several_exist(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            iconset = root / "App/Assets.xcassets/AppIcon.appiconset"
            make_png(iconset / "icon_40.png", (40, 40))
            big = make_png(iconset / "icon_1024.png", (1024, 1024))

            self.assertEqual(build_app_icons.find_icon(root), big)


class ToSquareTests(unittest.TestCase):
    def test_resizes_to_the_requested_size(self):
        im = Image.new("RGB", (1024, 1024))

        self.assertEqual(build_app_icons.to_square(im, 192).size, (192, 192))

    def test_crops_a_non_square_source_to_a_square(self):
        im = Image.new("RGB", (1200, 800))

        self.assertEqual(build_app_icons.to_square(im, 192).size, (192, 192))


class OutputPathTests(unittest.TestCase):
    def test_icon_rel_path_matches_the_manifest_style(self):
        self.assertEqual(build_app_icons.icon_rel_path("yomoka"), "assets/apps/yomoka/icon.webp")


if __name__ == "__main__":
    unittest.main()
