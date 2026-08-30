import importlib.util
import tempfile
import unittest
import wave
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name("render-audio-cues.py")
SPEC = importlib.util.spec_from_file_location("render_audio_cues", SCRIPT_PATH)
RENDER_AUDIO_CUES = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RENDER_AUDIO_CUES)


class RenderAudioCuesTest(unittest.TestCase):
    def test_resolve_pan_gains_uses_nds_range(self):
        self.assertEqual(RENDER_AUDIO_CUES.resolve_pan_gains(0), (1, 0))
        self.assertEqual(RENDER_AUDIO_CUES.resolve_pan_gains(127), (0, 1))
        self.assertAlmostEqual(sum(RENDER_AUDIO_CUES.resolve_pan_gains(64)), 1)

    def test_write_wav_preserves_stereo_channels(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "stereo.wav"
            RENDER_AUDIO_CUES.write_wav(path, ([1.0, 0.0], [0.0, 1.0]), stereo=True)

            with wave.open(str(path), "rb") as wav_file:
                self.assertEqual(wav_file.getnchannels(), 2)
                self.assertEqual(wav_file.getnframes(), 2)


if __name__ == "__main__":
    unittest.main()
