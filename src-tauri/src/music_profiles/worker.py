"""Local-only PCM protocol. No network, filenames, credentials or cloud SDKs."""
import json
import os
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
sys.path.insert(0, str(root / "packages"))
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["TF_NUM_INTRAOP_THREADS"] = "1"
os.environ["TF_NUM_INTEROP_THREADS"] = "1"
import numpy as np
import essentia.standard as es

manifest = json.loads((root / "assets.json").read_text())
embedding = es.TensorflowPredictMusiCNN(
    graphFilename=str(root / manifest["embedding"]), output="model/dense/BiasAdd"
)
heads = {
    name: es.TensorflowPredict2D(graphFilename=str(root / spec["file"]), output=spec["output"])
    for name, spec in manifest["heads"].items()
}

def emit(value):
    print(json.dumps(value, allow_nan=False), flush=True)

def profile(audio):
    if not np.isfinite(audio).all() or float(np.sqrt(np.mean(audio * audio))) < 0.00001:
        raise ValueError("Insufficient audio signal")
    embeddings = embedding(audio)
    scores, spread = {}, []
    for name, model in heads.items():
        values = model(embeddings)[:, manifest["heads"][name]["index"]]
        scores[name] = float(np.clip(np.mean(values), 0, 1))
        spread.append(float(np.std(values)))
    # This is an estimated composite energy score, not a measured emotional truth.
    energy = 0.55 * (1 - scores["relaxed"]) + 0.25 * scores["aggressive"] + 0.20 * scores["danceable"]
    confidence = float(np.mean([abs(scores[key] * 2 - 1) for key in ("relaxed", "happy", "sad", "aggressive")])) * (1 - min(0.7, float(np.mean(spread))))
    tempo = None
    try:
        clip = audio[15 * 16000:30 * 16000] if len(audio) >= 30 * 16000 else audio
        full_rate = es.Resample(inputSampleRate=16000, outputSampleRate=44100, quality=4)(clip)
        bpm, _, certainty, _, _ = es.RhythmExtractor2013(method="multifeature")(full_rate)
        if certainty > 1 and 30 <= bpm <= 300:
            tempo = float(bpm)
    except Exception:
        pass  # Tempo is optional; mood estimates remain useful.
    return dict(scores, energy=float(energy), confidence=float(confidence), tempo=tempo,
                sampleSeconds=len(audio) / 16000, modelVersion=manifest["version"])

emit({"ready": True, "version": manifest["version"]})
while True:
    line = sys.stdin.buffer.readline(1025)
    if not line:
        break
    try:
        count = json.loads(line)["samples"]
        if type(count) is not int or not 16000 * 6 <= count <= 16000 * 60:
            raise ValueError("Invalid sample length")
        payload = bytearray()
        while len(payload) < count * 4:
            block = sys.stdin.buffer.read(count * 4 - len(payload))
            if not block:
                raise EOFError("Incomplete PCM frame")
            payload.extend(block)
        emit({"profile": profile(np.frombuffer(payload, dtype="<f4"))})
    except Exception:
        emit({"error": "Local audio analysis failed for this sample."})
