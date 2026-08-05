import importlib.util
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = REPO_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

from apps import load_apps  # noqa: E402


def load_script(name):
    spec = importlib.util.spec_from_file_location(
        name.replace("-", "_"), SCRIPTS / f"{name}.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LoadAppsTests(unittest.TestCase):
    def test_loads_the_mapping_from_a_given_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "apps.json"
            path.write_text(json.dumps({"foo": "Foo", "bar": "bar/bar"}))

            self.assertEqual(load_apps(path), {"foo": "Foo", "bar": "bar/bar"})

    def test_reads_the_repo_apps_json_by_default(self):
        apps = load_apps()

        self.assertEqual(apps["yomoka"], "yomoka")
        self.assertEqual(apps["dripshot"], "dripshot/dripshot")

    def test_every_repo_in_the_mapping_exists(self):
        program_dir = REPO_ROOT.parent

        for key, repo in load_apps().items():
            with self.subTest(app=key):
                self.assertTrue((program_dir / repo).is_dir(), f"{repo} not found")


class MappingIsTheSingleSourceTests(unittest.TestCase):
    """対応表を 1 箇所に保つための回帰テスト。"""

    def test_the_three_scripts_share_one_mapping(self):
        expected = load_apps()

        for name in ("sync-app-meta", "build-app-shots", "build-app-icons"):
            with self.subTest(script=name):
                self.assertEqual(load_script(name).APPS, expected)

    def test_the_mapping_covers_every_app_card_on_the_index(self):
        index = (REPO_ROOT / "index.html").read_text(encoding="utf-8")
        cards = set(re.findall(r'class="card app-card" data-app="([a-z]+)"', index))

        self.assertEqual(cards, set(load_apps()))


if __name__ == "__main__":
    unittest.main()
