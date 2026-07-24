import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "build-app-shots.py"
SPEC = importlib.util.spec_from_file_location("build_app_shots", SCRIPT)
build_app_shots = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build_app_shots)


class BuildAppShotsTests(unittest.TestCase):
    def test_manifest_entry_uses_language_counts_and_paths(self):
        manifest = build_app_shots.make_manifest(
            {
                "yomoka": {
                    "ja": 5,
                    "en": 4,
                }
            }
        )

        self.assertEqual(
            manifest["apps"]["yomoka"]["ja"],
            {
                "count": 5,
                "images": [
                    "assets/apps/yomoka/ja/1.webp",
                    "assets/apps/yomoka/ja/2.webp",
                    "assets/apps/yomoka/ja/3.webp",
                    "assets/apps/yomoka/ja/4.webp",
                    "assets/apps/yomoka/ja/5.webp",
                ],
                "thumbs": [
                    "assets/apps/yomoka/ja/thumb_1.webp",
                    "assets/apps/yomoka/ja/thumb_2.webp",
                    "assets/apps/yomoka/ja/thumb_3.webp",
                    "assets/apps/yomoka/ja/thumb_4.webp",
                    "assets/apps/yomoka/ja/thumb_5.webp",
                ],
            },
        )
        self.assertEqual(manifest["apps"]["yomoka"]["en"]["count"], 4)

    def test_clean_output_dir_removes_only_webp_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            stale = out_dir / "stale.webp"
            keep = out_dir / "keep.txt"
            stale.write_bytes(b"old")
            keep.write_text("keep")

            build_app_shots.clean_output_dir(out_dir)

            self.assertFalse(stale.exists())
            self.assertTrue(keep.exists())

    def test_write_manifest_outputs_sorted_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.json"
            manifest = build_app_shots.make_manifest({"app": {"ja": 1}})

            build_app_shots.write_manifest(manifest, path)

            self.assertEqual(json.loads(path.read_text()), manifest)
            self.assertTrue(path.read_text().endswith("\n"))


if __name__ == "__main__":
    unittest.main()
