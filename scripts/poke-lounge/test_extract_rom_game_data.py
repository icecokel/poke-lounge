import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace


SCRIPT_PATH = Path(__file__).with_name("extract-rom-game-data.py")
SPEC = importlib.util.spec_from_file_location("extract_rom_game_data", SCRIPT_PATH)
assert SPEC and SPEC.loader
extractor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(extractor)


def words(*values: int) -> bytes:
    return b"".join(value.to_bytes(2, "little") for value in values)


def learnset_value(level: int, move_id: int) -> int:
    return (level << 9) | move_id


def move_record(
    *,
    effect_code: int = 276,
    category: int = 1,
    power: int = 250,
    type_id: int = 17,
    accuracy: int = 100,
    pp: int = 40,
    effect_chance: int = 100,
    target_range: int = 1024,
    priority: int = -7,
    flags: int = 179,
    contest_effect: int = 23,
    contest_type: int = 4,
    unknown14: int = 0,
) -> bytes:
    return b"".join(
        (
            effect_code.to_bytes(2, "little"),
            bytes((category, power, type_id, accuracy, pp, effect_chance)),
            target_range.to_bytes(2, "little"),
            priority.to_bytes(1, "little", signed=True),
            bytes((flags, contest_effect, contest_type)),
            unknown14.to_bytes(2, "little"),
        )
    )


class LearnsetParserTest(unittest.TestCase):
    def test_preserves_authentic_out_of_level_order(self) -> None:
        data = words(
            learnset_value(8, 103),
            learnset_value(5, 101),
            0xFFFF,
            0,
        )

        parsed = extractor.parse_learnsets(
            SimpleNamespace(files=[data, words(learnset_value(100, 467), 0xFFFF)])
        )

        self.assertEqual(
            parsed[0],
            [{"level": 8, "moveId": 103}, {"level": 5, "moveId": 101}],
        )
        self.assertEqual(parsed[1], [{"level": 100, "moveId": 467}])

    def test_rejects_malformed_members(self) -> None:
        row = learnset_value(5, 101)
        cases = {
            "odd byte length": b"\xff",
            "missing terminator": words(row, 0),
            "multiple terminators": words(0xFFFF, 0xFFFF),
            "non-terminal terminator": words(row, 0xFFFF, row, 0),
            "missing alignment padding": words(0xFFFF),
            "extra alignment padding": words(0xFFFF, 0, 0),
            "zero row": words(0, 0xFFFF),
            "move ID above 467": words(learnset_value(1, 468), 0xFFFF),
            "level above 100": words(learnset_value(101, 1), 0xFFFF),
            "duplicate row": words(row, row, 0xFFFF, 0),
        }

        for label, data in cases.items():
            with self.subTest(label=label), self.assertRaises(ValueError):
                extractor.parse_learnsets(SimpleNamespace(files=[data]))


class MoveParserTest(unittest.TestCase):
    def test_exposes_complete_move_record(self) -> None:
        parsed = extractor.parse_move_records(
            SimpleNamespace(files=[bytes(16), move_record()]),
            {1: "테스트기술"},
        )[1]

        self.assertEqual(parsed["category"], "special")
        self.assertEqual(parsed["typeName"], "악")
        self.assertEqual(parsed["flags"], 179)
        self.assertEqual(parsed["contestEffect"], 23)
        self.assertEqual(parsed["contestType"], 4)
        self.assertEqual(parsed["unknown14"], 0)

        with self.assertRaises(ValueError):
            extractor.parse_move_records(
                SimpleNamespace(files=[bytes(16), move_record()]),
                {},
            )
        with self.assertRaises(ValueError):
            extractor.parse_move_records(
                SimpleNamespace(files=[bytes(16)]),
                {0: "내부 기술"},
            )

    def test_rejects_out_of_range_fields(self) -> None:
        cases = {
            "effect code": move_record(effect_code=277),
            "category": move_record(category=3),
            "type": move_record(type_id=18),
            "accuracy": move_record(accuracy=101),
            "zero playable PP": move_record(pp=0),
            "PP": move_record(pp=41),
            "effect chance": move_record(effect_chance=101),
            "combined target bits": move_record(target_range=3),
            "priority": move_record(priority=6),
            "contest effect": move_record(contest_effect=24),
            "contest type": move_record(contest_type=5),
            "unknown14": move_record(unknown14=1),
        }

        for label, data in cases.items():
            with self.subTest(label=label), self.assertRaises(ValueError):
                extractor.parse_move_records(
                    SimpleNamespace(files=[bytes(16), data]),
                    {1: "테스트기술"},
                )


class BallIconTest(unittest.TestCase):
    def test_decodes_transparent_tiled_pixels_and_rejects_invalid_data(self) -> None:
        character = bytearray(0x230)
        character[:4] = b"RGCN"
        character[16:20] = b"RAHC"
        character[0x1C:0x20] = (3).to_bytes(4, "little")
        character[0x28:0x2C] = (512).to_bytes(4, "little")
        character[0x30] = 1
        character[0x50] = 0x10
        palette = bytearray(0x228)
        palette[:4] = b"RLCN"
        palette[16:20] = b"TTLP"
        palette[0x2A:0x2C] = (31).to_bytes(2, "little")
        image = extractor.decode_ball_icon(bytes(character), bytes(palette))
        self.assertEqual(image.size, (10, 1))
        self.assertEqual(image.getpixel((0, 0)), (248, 0, 0, 255))
        self.assertEqual(image.getpixel((1, 0))[3], 0)
        self.assertEqual(image.getpixel((9, 0)), (248, 0, 0, 255))
        with self.assertRaises(ValueError):
            extractor.decode_ball_icon(bytes(character[:-1]), bytes(palette))


if __name__ == "__main__":
    unittest.main()
