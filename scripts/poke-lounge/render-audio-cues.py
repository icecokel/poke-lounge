#!/usr/bin/env python3
import argparse
import json
import math
import random
import shutil
import struct
import subprocess
import sys
import wave
from pathlib import Path

try:
    from ndspy.rom import NintendoDSRom
    from ndspy.soundArchive import SDAT
except ModuleNotFoundError as error:
    print(
        "Missing Python package 'ndspy'. Install it with: python3 -m pip install --user ndspy",
        file=sys.stderr,
    )
    raise SystemExit(1) from error


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = REPO_ROOT / "scripts/poke-lounge/audio-cues.json"
OUTPUT_SAMPLE_RATE = 44_100
RUNTIME_AUDIO_MANIFEST_VERSION = 2
SSEQ_TICKS_PER_BEAT = 48
ADPCM_STEP_TABLE = [
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    16,
    17,
    19,
    21,
    23,
    25,
    28,
    31,
    34,
    37,
    41,
    45,
    50,
    55,
    60,
    66,
    73,
    80,
    88,
    97,
    107,
    118,
    130,
    143,
    157,
    173,
    190,
    209,
    230,
    253,
    279,
    307,
    337,
    371,
    408,
    449,
    494,
    544,
    598,
    658,
    724,
    796,
    876,
    963,
    1060,
    1166,
    1282,
    1411,
    1552,
    1707,
    1878,
    2066,
    2272,
    2499,
    2749,
    3024,
    3327,
    3660,
    4026,
    4428,
    4871,
    5358,
    5894,
    6484,
    7132,
    7845,
    8630,
    9493,
    10442,
    11487,
    12635,
    13899,
    15289,
    16818,
    18500,
    20350,
    22385,
    24623,
    27086,
    29794,
    32767,
]
ADPCM_INDEX_TABLE = [-1, -1, -1, -1, 2, 4, 6, 8]


def read_config(config_path):
    with config_path.open("r", encoding="utf-8") as file:
        return json.load(file)


def resolve_repo_path(value):
    return (REPO_ROOT / value).resolve()


def load_sdat(config):
    rom_path = resolve_repo_path(config["romPath"])
    if not rom_path.exists():
        raise FileNotFoundError(f"ROM file is missing: {rom_path}")

    rom = NintendoDSRom.fromFile(str(rom_path))
    sdat_bytes = bytes(rom.getFileByName(config["sdatPath"]))

    return rom_path, SDAT(sdat_bytes)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def iter_audio_cues(config):
    for cue in config["cues"]:
        yield "sfx", cue

    for cue in config.get("bgm", []):
        yield "bgm", cue


def extract_catalog(config, rom_path, sdat):
    processed_dir = resolve_repo_path(config["processedDir"])
    catalog_path = processed_dir / "sdat-catalog.json"
    cues = []

    for cue_kind, cue in iter_audio_cues(config):
        sequence_name, sequence = get_sequence(sdat, cue)
        bank_name, bank = sdat.banks[sequence.bankID]
        wave_archive_ids = list(bank.waveArchiveIDs)
        cues.append(
            {
                "id": cue["id"],
                "kind": cue_kind,
                "sequenceIndex": cue["sequenceIndex"],
                "sequenceName": sequence_name,
                "bankIndex": sequence.bankID,
                "bankName": bank_name,
                "sequenceVolume": sequence.volume,
                "waveArchives": [
                    {
                        "index": wave_archive_id,
                        "name": sdat.waveArchives[wave_archive_id][0],
                        "waveCount": len(sdat.waveArchives[wave_archive_id][1].waves),
                    }
                    for wave_archive_id in wave_archive_ids
                    if 0 <= wave_archive_id < len(sdat.waveArchives)
                ],
                "usedNotes": collect_used_notes(sdat, sequence, bank),
            }
        )

    catalog = {
        "version": 1,
        "source": {
            "romPath": str(rom_path.relative_to(REPO_ROOT)),
            "sdatPath": config["sdatPath"],
            "romTitle": "POKEMON HG",
        },
        "stats": {
            "sequenceCount": len(sdat.sequences),
            "bankCount": len(sdat.banks),
            "waveArchiveCount": len(sdat.waveArchives),
            "sfxCount": len(config["cues"]),
            "bgmCount": len(config.get("bgm", [])),
            "cueCount": len(cues),
        },
        "cues": cues,
    }
    write_json(catalog_path, catalog)
    return catalog_path


def get_sequence(sdat, cue):
    sequence_index = cue["sequenceIndex"]
    if not 0 <= sequence_index < len(sdat.sequences):
        raise ValueError(f"{cue['id']} sequenceIndex is out of range: {sequence_index}")

    name, sequence = sdat.sequences[sequence_index]
    if sequence is None:
        raise ValueError(f"{cue['id']} sequence is empty: {sequence_index}")

    if name != cue["sequenceName"]:
        raise ValueError(
            f"{cue['id']} expected {cue['sequenceName']} at {sequence_index}, found {name}"
        )

    if not sequence.parsed:
        sequence.parse()

    return name, sequence


def collect_used_notes(sdat, sequence, bank):
    notes = []
    instrument_id = 0

    for event in sequence.events:
        class_name = event.__class__.__name__
        if class_name == "InstrumentSwitchSequenceEvent":
            instrument_id = event.instrumentID
            continue

        if class_name != "NoteSequenceEvent":
            continue

        note_definition = resolve_note_definition(bank, instrument_id, event.type)
        if note_definition is None:
            continue

        wave_archive_index = None
        wave_archive_name = None
        wave_type = note_definition.type.name

        if note_definition.type.name == "PCM" and note_definition.waveArchiveIDID < len(bank.waveArchiveIDs):
            wave_archive_index = bank.waveArchiveIDs[note_definition.waveArchiveIDID]
            if 0 <= wave_archive_index < len(sdat.waveArchives):
                wave_archive_name = sdat.waveArchives[wave_archive_index][0]
                wave = sdat.waveArchives[wave_archive_index][1].waves[note_definition.waveID]
                wave_type = wave.waveType.name

        notes.append(
            {
                "instrumentId": instrument_id,
                "note": event.type,
                "velocity": event.velocity,
                "noteDefinitionPitch": note_definition.pitch,
                "noteType": note_definition.type.name,
                "waveArchiveIndex": wave_archive_index,
                "waveArchiveName": wave_archive_name,
                "waveId": note_definition.waveID,
                "waveType": wave_type,
            }
        )

    unique = []
    seen = set()
    for item in notes:
        key = tuple(sorted(item.items()))
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)

    return unique


def render_wav_files(config, sdat):
    processed_dir = resolve_repo_path(config["processedDir"])
    wav_dir = processed_dir / "wav"
    wav_dir.mkdir(parents=True, exist_ok=True)

    for cue_kind, cue in iter_audio_cues(config):
        wav_path = wav_dir / f"{cue['id']}.wav"
        stereo = cue_kind == "bgm"
        samples = render_cue(sdat, cue, stereo=stereo)
        write_wav(wav_path, samples, stereo=stereo)
        print(f"rendered {wav_path.relative_to(REPO_ROOT)}")

    return wav_dir


def render_cue(sdat, cue, stereo=False):
    _, sequence = get_sequence(sdat, cue)
    _, bank = sdat.banks[sequence.bankID]
    duration_seconds = cue["durationMs"] / 1000
    output_len = max(1, math.ceil(duration_seconds * OUTPUT_SAMPLE_RATE))
    output = ([0.0] * output_len, [0.0] * output_len)
    default_tempo = find_default_tempo(sequence.events)
    track_start_indices, event_indices = get_sequence_track_start_indices(sequence.events)

    for track_start_index in track_start_indices:
        render_track(
            output=output,
            events=sequence.events,
            start_event_index=track_start_index,
            event_indices=event_indices,
            sdat=sdat,
            bank=bank,
            sequence_volume=sequence.volume / 127,
            cue_gain=float(cue.get("gain", 1.0)),
            default_tempo=default_tempo,
        )

    normalize_peak(output, target_peak=0.9, stereo=stereo)
    apply_output_fade(output, fade_out_ms=int(cue.get("fadeOutMs", 40)))
    return output


def find_default_tempo(events):
    for event in events:
        if event.__class__.__name__ == "TempoSequenceEvent":
            return max(1, event.value)

    return 120


def get_sequence_track_start_indices(events):
    event_indices = {id(event): index for index, event in enumerate(events)}
    track_start_indices = []
    main_track_start_index = 0

    while main_track_start_index < len(events):
        event = events[main_track_start_index]
        class_name = event.__class__.__name__

        if class_name == "DefineTracksSequenceEvent":
            main_track_start_index += 1
            continue

        if class_name != "BeginTrackSequenceEvent":
            break

        track_start_index = event_indices.get(id(event.firstEvent))
        if track_start_index is not None:
            track_start_indices.append(track_start_index)
        main_track_start_index += 1

    if main_track_start_index < len(events):
        track_start_indices.insert(0, main_track_start_index)

    unique_track_start_indices = []
    seen = set()
    for track_start_index in track_start_indices:
        if track_start_index in seen:
            continue
        seen.add(track_start_index)
        unique_track_start_indices.append(track_start_index)

    return unique_track_start_indices, event_indices


def render_track(
    output,
    events,
    start_event_index,
    event_indices,
    sdat,
    bank,
    sequence_volume,
    cue_gain,
    default_tempo,
):
    seconds = 0.0
    tempo = default_tempo
    instrument_id = 0
    track_volume = 1.0
    expression = 1.0
    pan = 64
    event_index = start_event_index
    call_return_indices = []
    max_event_steps = max(1_000, len(events) * 256)
    event_steps = 0

    while seconds < len(output[0]) / OUTPUT_SAMPLE_RATE and event_steps < max_event_steps:
        if not 0 <= event_index < len(events):
            break

        event = events[event_index]
        class_name = event.__class__.__name__
        event_steps += 1

        if class_name == "TempoSequenceEvent":
            tempo = max(1, event.value)
        elif class_name == "InstrumentSwitchSequenceEvent":
            instrument_id = event.instrumentID
        elif class_name == "TrackVolumeSequenceEvent":
            track_volume = event.value / 127
        elif class_name == "ExpressionSequenceEvent":
            expression = event.value / 127
        elif class_name == "PanSequenceEvent":
            pan = event.value
        elif class_name == "RestSequenceEvent":
            seconds += ticks_to_seconds(event.duration, tempo)
        elif class_name == "NoteSequenceEvent":
            note_seconds = ticks_to_seconds(event.duration, tempo)
            gain = sequence_volume * track_volume * expression * (event.velocity / 127) * cue_gain
            mix_note(output, seconds, note_seconds, sdat, bank, instrument_id, event.type, gain, pan)
        elif class_name == "JumpSequenceEvent":
            destination_index = event_indices.get(id(event.destination))
            if destination_index is None:
                break
            event_index = destination_index
            continue
        elif class_name == "CallSequenceEvent":
            destination_index = event_indices.get(id(event.destination))
            if destination_index is None:
                break
            call_return_indices.append(event_index + 1)
            event_index = destination_index
            continue
        elif class_name == "ReturnSequenceEvent":
            if not call_return_indices:
                break
            event_index = call_return_indices.pop()
            continue
        elif class_name == "EndTrackSequenceEvent":
            break

        event_index += 1


def ticks_to_seconds(ticks, tempo):
    return (ticks * 60) / (tempo * SSEQ_TICKS_PER_BEAT)


def resolve_note_definition(bank, instrument_id, note):
    if not 0 <= instrument_id < len(bank.instruments):
        return None

    instrument = bank.instruments[instrument_id]
    if instrument is None:
        return None

    if hasattr(instrument, "noteDefinition"):
        return instrument.noteDefinition

    if hasattr(instrument, "regions"):
        for region in instrument.regions:
            if note <= region.lastPitch:
                return region.noteDefinition
        return instrument.regions[-1].noteDefinition if instrument.regions else None

    if hasattr(instrument, "noteDefinitions"):
        first_pitch = getattr(instrument, "firstPitch", note)
        index = min(max(note - first_pitch, 0), len(instrument.noteDefinitions) - 1)
        return instrument.noteDefinitions[index]

    return None


def mix_note(output, start_seconds, note_seconds, sdat, bank, instrument_id, note, gain, pan):
    note_definition = resolve_note_definition(bank, instrument_id, note)
    if note_definition is None or gain <= 0:
        return

    note_type = note_definition.type.name

    if note_type == "PCM":
        if note_definition.waveArchiveIDID >= len(bank.waveArchiveIDs):
            return
        wave_archive_index = bank.waveArchiveIDs[note_definition.waveArchiveIDID]
        if not 0 <= wave_archive_index < len(sdat.waveArchives):
            return
        wave_archive = sdat.waveArchives[wave_archive_index][1]
        if not 0 <= note_definition.waveID < len(wave_archive.waves):
            return
        wave_data = decode_wave(wave_archive.waves[note_definition.waveID])
        if not wave_data["samples"]:
            return
        ratio = 2 ** ((note - note_definition.pitch) / 12)
        mix_pcm_note(
            output,
            start_seconds,
            note_seconds,
            wave_data["samples"],
            wave_data["sample_rate"],
            ratio,
            gain,
            pan,
        )
        return

    if note_type == "PSG_SQUARE_WAVE":
        mix_square_note(output, start_seconds, note_seconds, note, note_definition.pitch, gain, pan)
        return

    if note_type == "PSG_WHITE_NOISE":
        mix_noise_note(output, start_seconds, note_seconds, gain, pan)


def decode_wave(wave_object):
    wave_type = wave_object.waveType.name
    raw = bytes(wave_object.data)

    if wave_type == "PCM8":
        samples = [struct.unpack("b", raw[index : index + 1])[0] / 128 for index in range(len(raw))]
    elif wave_type == "PCM16":
        samples = [
            struct.unpack_from("<h", raw, index)[0] / 32768
            for index in range(0, len(raw) - 1, 2)
        ]
    elif wave_type == "ADPCM":
        samples = decode_adpcm(raw)
    else:
        samples = []

    return {"sample_rate": wave_object.sampleRate or OUTPUT_SAMPLE_RATE, "samples": samples}


def decode_adpcm(raw):
    if len(raw) < 4:
        return []

    predictor = struct.unpack_from("<h", raw, 0)[0]
    step_index = max(0, min(88, raw[2] & 0x7F))
    samples = [predictor / 32768]

    for byte in raw[4:]:
        for nibble in (byte & 0x0F, byte >> 4):
            step = ADPCM_STEP_TABLE[step_index]
            diff = step >> 3
            if nibble & 1:
                diff += step >> 2
            if nibble & 2:
                diff += step >> 1
            if nibble & 4:
                diff += step

            if nibble & 8:
                predictor -= diff
            else:
                predictor += diff

            predictor = max(-32768, min(32767, predictor))
            step_index += ADPCM_INDEX_TABLE[nibble & 7]
            step_index = max(0, min(88, step_index))
            samples.append(predictor / 32768)

    return samples


def mix_pcm_note(output, start_seconds, note_seconds, source, source_rate, pitch_ratio, gain, pan):
    start_index = max(0, int(start_seconds * OUTPUT_SAMPLE_RATE))
    source_duration = len(source) / source_rate / max(pitch_ratio, 0.01)
    render_duration = min(source_duration, max(note_seconds + 0.16, note_seconds * 1.35))
    frame_count = min(len(output[0]) - start_index, max(0, int(render_duration * OUTPUT_SAMPLE_RATE)))

    if frame_count <= 0:
        return

    fade_in_frames = max(1, int(0.002 * OUTPUT_SAMPLE_RATE))
    fade_out_frames = max(1, min(frame_count, int(0.018 * OUTPUT_SAMPLE_RATE)))
    left_gain, right_gain = resolve_pan_gains(pan)

    for frame in range(frame_count):
        source_index = int(frame * source_rate * pitch_ratio / OUTPUT_SAMPLE_RATE)
        if not 0 <= source_index < len(source):
            break

        envelope = 1.0
        if frame < fade_in_frames:
            envelope *= frame / fade_in_frames
        if frame >= frame_count - fade_out_frames:
            envelope *= (frame_count - frame) / fade_out_frames

        sample = source[source_index] * gain * envelope
        output[0][start_index + frame] += sample * left_gain
        output[1][start_index + frame] += sample * right_gain


def mix_square_note(output, start_seconds, note_seconds, note, root_note, gain, pan):
    start_index = max(0, int(start_seconds * OUTPUT_SAMPLE_RATE))
    frame_count = min(
        len(output[0]) - start_index,
        max(0, int(max(note_seconds + 0.08, note_seconds * 1.2) * OUTPUT_SAMPLE_RATE)),
    )
    frequency = 440 * (2 ** ((note - 69) / 12))
    fade_out_frames = max(1, min(frame_count, int(0.025 * OUTPUT_SAMPLE_RATE)))
    left_gain, right_gain = resolve_pan_gains(pan)

    for frame in range(frame_count):
        phase = (frame * frequency / OUTPUT_SAMPLE_RATE) % 1
        sample = 0.65 if phase < 0.5 else -0.65
        envelope = 1.0
        if frame >= frame_count - fade_out_frames:
            envelope *= (frame_count - frame) / fade_out_frames
        sample *= gain * envelope
        output[0][start_index + frame] += sample * left_gain
        output[1][start_index + frame] += sample * right_gain


def mix_noise_note(output, start_seconds, note_seconds, gain, pan):
    start_index = max(0, int(start_seconds * OUTPUT_SAMPLE_RATE))
    frame_count = min(
        len(output[0]) - start_index,
        max(0, int(max(note_seconds + 0.06, note_seconds * 1.2) * OUTPUT_SAMPLE_RATE)),
    )
    rng = random.Random(0x504F4B45)
    fade_out_frames = max(1, min(frame_count, int(0.025 * OUTPUT_SAMPLE_RATE)))
    left_gain, right_gain = resolve_pan_gains(pan)

    for frame in range(frame_count):
        envelope = 1.0
        if frame >= frame_count - fade_out_frames:
            envelope *= (frame_count - frame) / fade_out_frames
        sample = rng.uniform(-0.6, 0.6) * gain * envelope
        output[0][start_index + frame] += sample * left_gain
        output[1][start_index + frame] += sample * right_gain


def resolve_pan_gains(pan):
    right_gain = max(0, min(127, pan)) / 127
    return 1 - right_gain, right_gain


def normalize_peak(samples, target_peak, stereo):
    if stereo:
        peak = max((abs(sample) for channel in samples for sample in channel), default=0)
    else:
        peak = max((abs(left + right) for left, right in zip(*samples)), default=0)
    if peak <= 0 or peak <= target_peak:
        return

    scale = target_peak / peak
    for channel in samples:
        for index, sample in enumerate(channel):
            channel[index] = sample * scale


def apply_output_fade(samples, fade_out_ms):
    fade_frames = max(1, min(len(samples[0]), int((fade_out_ms / 1000) * OUTPUT_SAMPLE_RATE)))
    for channel in samples:
        for offset in range(fade_frames):
            index = len(channel) - fade_frames + offset
            channel[index] *= offset / fade_frames


def write_wav(path, samples, stereo):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(2 if stereo else 1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(OUTPUT_SAMPLE_RATE)
        payload = bytearray()
        for left, right in zip(*samples):
            frame = (left, right) if stereo else (left + right,)
            for sample in frame:
                value = max(-32768, min(32767, int(sample * 32767)))
                payload.extend(struct.pack("<h", value))
        wav_file.writeframes(bytes(payload))


def convert_mp3_files(config):
    processed_dir = resolve_repo_path(config["processedDir"])
    wav_dir = processed_dir / "wav"
    public_dir = resolve_repo_path(config["publicDir"])
    sfx_dir = public_dir / "sfx"
    bgm_dir = public_dir / "bgm"
    manifest_path = public_dir / "audio-manifest.json"
    ffmpeg = shutil.which("ffmpeg")

    if ffmpeg is None:
        raise RuntimeError("ffmpeg is required to convert Poke Lounge audio to MP3")

    sfx_dir.mkdir(parents=True, exist_ok=True)
    bgm_dir.mkdir(parents=True, exist_ok=True)
    sfx_manifest_items = []
    bgm_manifest_items = []

    for cue_kind, cue in iter_audio_cues(config):
        wav_path = wav_dir / f"{cue['id']}.wav"
        if not wav_path.exists():
            raise FileNotFoundError(f"missing WAV for cue {cue['id']}: {wav_path}")

        audio_dir = bgm_dir if cue_kind == "bgm" else sfx_dir
        mp3_path = audio_dir / f"{cue['id']}.mp3"
        command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(wav_path),
            "-af",
            "loudnorm=I=-18:LRA=11:TP=-1.5",
            "-ac",
            "2" if cue_kind == "bgm" else "1",
            "-ar",
            str(OUTPUT_SAMPLE_RATE),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            cue.get("bitrate", "64k"),
            str(mp3_path),
        ]
        subprocess.run(command, check=True)
        size_bytes = mp3_path.stat().st_size
        manifest_item = {
            "id": cue["id"],
            "src": f"/assets/poke-lounge/audio/{cue_kind}/{cue['id']}.mp3",
            "durationMs": cue["durationMs"],
            "sizeBytes": size_bytes,
            "defaultVolume": cue["defaultVolume"],
            "source": {
                "sdatPath": config["sdatPath"],
                "sequenceName": cue["sequenceName"],
                "sequenceIndex": cue["sequenceIndex"],
            },
        }
        if cue_kind == "bgm":
            bgm_manifest_items.append(manifest_item)
        else:
            sfx_manifest_items.append(manifest_item)
        print(f"converted {mp3_path.relative_to(REPO_ROOT)} ({size_bytes} bytes)")

    manifest = {
        "version": RUNTIME_AUDIO_MANIFEST_VERSION,
        "sfx": sfx_manifest_items,
        "bgm": bgm_manifest_items,
    }
    write_json(manifest_path, manifest)
    print(f"wrote {manifest_path.relative_to(REPO_ROOT)}")
    return manifest_path


def main():
    parser = argparse.ArgumentParser(description="Render Poke Lounge audio from a local NDS ROM.")
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to scripts/poke-lounge/audio-cues.json",
    )
    parser.add_argument(
        "--mode",
        choices=("extract", "render", "convert", "all"),
        default="all",
        help="Pipeline step to run",
    )
    args = parser.parse_args()

    config = read_config(args.config)
    rom_path, sdat = load_sdat(config)

    if args.mode in ("extract", "all"):
        catalog_path = extract_catalog(config, rom_path, sdat)
        print(f"wrote {catalog_path.relative_to(REPO_ROOT)}")

    if args.mode in ("render", "all"):
        render_wav_files(config, sdat)

    if args.mode in ("convert", "all"):
        convert_mp3_files(config)


if __name__ == "__main__":
    main()
