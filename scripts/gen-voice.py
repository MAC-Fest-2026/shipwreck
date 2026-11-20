"""Render the original dialogue bank with a locally installed eSpeak NG library."""
from array import array
from ctypes import CFUNCTYPE, CDLL, POINTER, c_char_p, c_int, c_short, c_size_t, c_uint, c_void_p
from ctypes.util import find_library
from pathlib import Path
import json
import wave

ROOT = Path(__file__).resolve().parents[1] / "public"
DIALOGUE = ROOT / "dialogue" / "lines.en.json"
VOICES = {
    "reyes": ("en-us+m2", 163, 43),
    "oduya": ("en+m3", 153, 35),
    "mara": ("en-us+f3", 162, 46),
    "elias": ("en+m1", 173, 41),
    "dev": ("en+m2", 169, 54),
    "ana": ("en-us+f4", 186, 54),
    "priya": ("en+f2", 147, 46),
    "jay": ("en-us+m4", 194, 62),
    "tommy": ("en-us+m1", 181, 49),
    "hollis": ("en+m4", 149, 35),
}


def main():
    libname = find_library("espeak-ng")
    if not libname:
        raise SystemExit("Install the eSpeak NG shared library and its voice data.")
    synth = CDLL(libname)
    synth.espeak_Initialize.argtypes = [c_int, c_int, c_char_p, c_int]
    synth.espeak_SetVoiceByName.argtypes = [c_char_p]
    synth.espeak_SetParameter.argtypes = [c_int, c_int, c_int]
    synth.espeak_Synth.argtypes = [c_char_p, c_size_t, c_uint, c_int, c_uint, c_uint, POINTER(c_uint), c_void_p]
    sample_rate = synth.espeak_Initialize(2, 0, None, 0)
    if sample_rate <= 0:
        raise SystemExit("Could not initialize the eSpeak NG data directory.")

    chunks = []
    callback = CFUNCTYPE(c_int, POINTER(c_short), c_int, c_void_p)

    @callback
    def collect(samples, count, _events):
        if samples and count:
            chunks.extend(samples[:count])
        return 0

    synth.espeak_SetSynthCallback.argtypes = [callback]
    synth.espeak_SetSynthCallback(collect)
    rows = json.loads(DIALOGUE.read_text())
    for line in rows:
        voice, rate, pitch = VOICES[line["speaker"]]
        if synth.espeak_SetVoiceByName(voice.encode()) != 0:
            raise SystemExit(f"Voice unavailable: {voice}")
        synth.espeak_SetParameter(1, rate, 0)
        synth.espeak_SetParameter(3, pitch, 0)
        chunks.clear()
        phrase = line["text"].encode("utf-8")
        if synth.espeak_Synth(phrase, len(phrase) + 1, 0, 1, 0, 1, None, None) != 0 or not chunks:
            raise SystemExit(f"Could not render {line['id']}")
        relative = Path("audio/voice") / line["speaker"] / (line["id"] + ".wav")
        output = ROOT / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(output), "wb") as stream:
            stream.setparams((1, 2, sample_rate, 0, "NONE", "not compressed"))
            stream.writeframes(array("h", chunks).tobytes())
        line["audio"] = relative.as_posix()
    DIALOGUE.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n")
    synth.espeak_Terminate()
    print(f"Rendered {len(rows)} voice lines.")


if __name__ == "__main__":
    main()
