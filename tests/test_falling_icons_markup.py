import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
INTEREST_KINDS = [
    "travel",
    "basketball",
    "sauna",
    "dog",
    "training",
    "reading",
]


def read(path):
    return (REPO_ROOT / path).read_text(encoding="utf-8")


def script_srcs(html):
    return re.findall(r'<script src="([^"]+)"', html)


class FallingIconsMarkupTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = read("index.html")
        cls.about = read("about/index.html")
        cls.css = read("assets/site.css")

    def assert_drop_loaded_before_site(self, html):
        srcs = [Path(s).name for s in script_srcs(html)]
        self.assertIn("drop.js", srcs)
        self.assertLess(srcs.index("drop.js"), srcs.index("site.js"))

    def test_pages_load_drop_before_site_script(self):
        self.assert_drop_loaded_before_site(self.index)
        self.assert_drop_loaded_before_site(self.about)

    def test_about_has_face_avatar_trigger(self):
        avatar = re.search(
            r'<button[^>]*class="avatar"[^>]*>(?P<body>.*?)</button>', self.about, re.S
        )
        self.assertIsNotNone(avatar)
        self.assertIn('data-drop="interests"', avatar.group(0))
        self.assertIn('src="/assets/about/face.webp"', avatar["body"])
        self.assertTrue((REPO_ROOT / "assets/about/face.webp").is_file())

    def test_interests_are_chips_for_every_kind(self):
        panel = re.search(
            r"関心のあること.*?</section>", self.about, re.S
        )
        self.assertIsNotNone(panel)
        kinds = re.findall(
            r'<button type="button" class="interest-chip" data-kind="([a-z]+)"',
            panel.group(0),
        )
        self.assertEqual(kinds, INTEREST_KINDS)

    def test_every_chip_is_labelled_in_both_languages(self):
        chips = re.findall(
            r'<button type="button" class="interest-chip".*?</button>', self.about, re.S
        )
        self.assertEqual(len(chips), len(INTEREST_KINDS))
        for chip in chips:
            self.assertRegex(chip, r'<span class="ja">[^<]+</span>')
            self.assertRegex(chip, r'<span class="en">[^<]+</span>')

    def test_every_interest_kind_has_an_emoji_and_tone(self):
        for kind in INTEREST_KINDS:
            self.assertRegex(
                self.css,
                r'\[data-kind="%s"\] \{ --tone: [^;]+; --emoji: url\("/assets/emoji3d/%s\.webp"\); \}' % (kind, kind),
            )
            self.assertTrue((REPO_ROOT / f"assets/emoji3d/{kind}.webp").is_file(), kind)

    def test_falling_book_is_closed_until_it_opens(self):
        self.assertIn(
            '.drop-token[data-kind="reading"]:not(.is-open) { --emoji: url("/assets/emoji3d/reading-closed.webp"); }',
            self.css,
        )
        self.assertTrue((REPO_ROOT / "assets/emoji3d/reading-closed.webp").is_file())

    def test_spilled_letters_are_styled(self):
        rule = re.search(r"\.drop-letter \{(?P<body>.*?)\}", self.css, re.S)
        self.assertIsNotNone(rule)
        self.assertIn("pointer-events: none;", rule["body"])

    def test_contrail_color_is_defined_for_both_themes(self):
        light = re.search(r":root \{(?P<body>.*?)\n\}", self.css, re.S)
        dark = re.search(r':root\[data-theme="dark"\] \{(?P<body>.*?)\n\}', self.css, re.S)
        self.assertIn("--trail:", light["body"])
        self.assertIn("--trail:", dark["body"])

    def test_contrail_canvas_never_blocks_pointers(self):
        rule = re.search(r"\.drop-trails \{(?P<body>.*?)\}", self.css, re.S)
        self.assertIsNotNone(rule)
        self.assertIn("pointer-events: none;", rule["body"])

    def test_icons_draw_their_emoji(self):
        rule = re.search(r"\.drop-token::before,\n\.interest-icon::before \{(?P<body>.*?)\}", self.css, re.S)
        self.assertIsNotNone(rule)
        self.assertIn("background: var(--emoji) center / contain no-repeat;", rule["body"])
        self.assertNotIn("mask", rule["body"])

    def test_emoji_license_ships_with_the_art(self):
        self.assertTrue((REPO_ROOT / "assets/emoji3d/LICENSE").is_file())

    def test_flat_glyphs_are_gone(self):
        self.assertFalse((REPO_ROOT / "assets/icons").exists())
        self.assertNotIn("--icon", self.css)
        self.assertNotIn("data-skin", self.css)
        self.assertNotIn("skin", read("assets/site.js"))

    def test_dogs_come_as_dogs_and_poodles(self):
        self.assertIn(
            '[data-kind="dog"][data-variant="poodle"] { --emoji: url("/assets/emoji3d/poodle.webp"); }',
            self.css,
        )
        self.assertTrue((REPO_ROOT / "assets/emoji3d/poodle.webp").is_file())

    def test_bone_has_an_emoji(self):
        self.assertIn('[data-kind="bone"] { --emoji: url("/assets/emoji3d/bone.webp"); }', self.css)

    def test_effect_sprites_exist(self):
        for name in ["steam"]:
            self.assertTrue((REPO_ROOT / f"assets/emoji3d/{name}.webp").is_file(), name)
        for name in ["drop-steam"]:
            self.assertRegex(self.css, r"\.%s \{[^}]*pointer-events: none;" % name)

    def test_interest_chips_are_plain_icon_and_text(self):
        rule = re.search(r"\.interest-chip \{(?P<body>.*?)\n\}", self.css, re.S)
        self.assertIsNotNone(rule)
        self.assertIn("border: 0;", rule["body"])
        self.assertIn("background: none;", rule["body"])
        self.assertIn("padding: 0;", rule["body"])
        self.assertNotRegex(self.css, r"\.interest-chip:hover \{[^}]*background")

    def test_drop_triggers_skip_double_tap_zoom(self):
        rule = re.search(r"(?P<sel>[^{}]*)\{ touch-action: manipulation; \}", self.css)
        self.assertIsNotNone(rule)
        for sel in [".interest-chip", ".avatar", ".app-icon.is-droppable", ".logo"]:
            self.assertIn(sel, rule["sel"])

    def test_touch_devices_skip_the_costly_icon_shadow(self):
        self.assertRegex(
            self.css,
            r"@media \(pointer: coarse\) \{\s*\.drop-token, \.drop-token\.is-held \{ filter: none; \}",
        )

    def test_hero_intro_hides_the_title_before_paint_with_a_safety_net(self):
        head = self.index.split("</head>")[0]
        self.assertIn('classList.add("intro-pending")', head)
        self.assertIn("prefers-reduced-motion: reduce", head)
        self.assertRegex(head, r'setTimeout\(function \(\) \{ [^}]*classList\.remove\("intro-pending"\)')
        self.assertRegex(self.css, r"\.intro-pending \.hero-title,\n\.intro-pending \.hero-sub,\n\.intro-pending \.scroll-cue \{ visibility: hidden; \}")

    def test_hero_intro_keeps_the_title_readable(self):
        js = read("assets/site.js")
        self.assertIn('title.setAttribute("aria-label", text)', js)
        self.assertIn('ch.setAttribute("aria-hidden", "true")', js)
        self.assertIn("fumiworks_intro", js)

    def test_about_hero_content_sits_above_the_blob(self):
        # The blob is absolutely positioned, so static content would be painted underneath its tint.
        self.assertIn(".about-hero .section-head,\n.about-hero .about-lead { position: relative; }", self.css)

    def test_background_blobs_never_swallow_clicks(self):
        rule = re.search(r"\.blob-wrap \{(?P<body>[^}]*)\}", self.css)
        self.assertIsNotNone(rule)
        self.assertIn("pointer-events: none;", rule["body"])

    def test_drop_layer_is_fixed_and_non_blocking(self):
        rule = re.search(r"\.drop-layer \{(?P<body>.*?)\}", self.css, re.S)
        self.assertIsNotNone(rule)
        self.assertIn("position: fixed;", rule["body"])
        self.assertIn("pointer-events: none;", rule["body"])


if __name__ == "__main__":
    unittest.main()
