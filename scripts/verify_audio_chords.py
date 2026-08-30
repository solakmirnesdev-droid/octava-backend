#!/usr/bin/env python3
"""
Audio Chord Recognition & Key Verification Engine for Octava
Performs DSP Harmonic Analysis, Constant-Q Chromagram extraction, and Key/Chord Triangulation.
"""

import sys
import os
import json
import argparse
import subprocess
import tempfile
import numpy as np

# Add venv to sys.path if not running from it
VENV_PATH = "/Users/solakmirnes/.gemini/audio-tools/venv"
if os.path.exists(VENV_PATH):
    site_packages = os.path.join(VENV_PATH, "lib", f"python{sys.version_info.major}.{sys.version_info.minor}", "site-packages")
    if os.path.exists(site_packages) and site_packages not in sys.path:
        sys.path.insert(0, site_packages)

import librosa
import soundfile as sf

# Note names following Ex-Yu notation (Sharps only, H as 12th degree)
NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'H']

# Krumhansl-Schmuckler Key Profiles
MAJOR_PROFILE = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MINOR_PROFILE = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

# Normalize key profiles
MAJOR_PROFILE = (MAJOR_PROFILE - np.mean(MAJOR_PROFILE)) / np.std(MAJOR_PROFILE)
MINOR_PROFILE = (MINOR_PROFILE - np.mean(MINOR_PROFILE)) / np.std(MINOR_PROFILE)

# Chord templates (12-dimensional chroma vectors)
def build_chord_templates():
    templates = {}
    
    # 1. Major triads (0, 4, 7)
    for i, root in enumerate(NOTE_NAMES):
        vec = np.zeros(12)
        vec[i] = 1.0
        vec[(i + 4) % 12] = 0.8
        vec[(i + 7) % 12] = 0.8
        templates[root] = vec / np.linalg.norm(vec)

    # 2. Minor triads (0, 3, 7)
    for i, root in enumerate(NOTE_NAMES):
        vec = np.zeros(12)
        vec[i] = 1.0
        vec[(i + 3) % 12] = 0.8
        vec[(i + 7) % 12] = 0.8
        templates[f"{root}m"] = vec / np.linalg.norm(vec)

    # 3. Dominant 7th chords (0, 4, 7, 10)
    for i, root in enumerate(NOTE_NAMES):
        vec = np.zeros(12)
        vec[i] = 1.0
        vec[(i + 4) % 12] = 0.8
        vec[(i + 7) % 12] = 0.8
        vec[(i + 10) % 12] = 0.7
        templates[f"{root}7"] = vec / np.linalg.norm(vec)

    # 4. Minor 7th chords (0, 3, 7, 10)
    for i, root in enumerate(NOTE_NAMES):
        vec = np.zeros(12)
        vec[i] = 1.0
        vec[(i + 3) % 12] = 0.8
        vec[(i + 7) % 12] = 0.8
        vec[(i + 10) % 12] = 0.7
        templates[f"{root}m7"] = vec / np.linalg.norm(vec)

    # 5. Major 7th chords (0, 4, 7, 11)
    for i, root in enumerate(NOTE_NAMES):
        vec = np.zeros(12)
        vec[i] = 1.0
        vec[(i + 4) % 12] = 0.8
        vec[(i + 7) % 12] = 0.8
        vec[(i + 11) % 12] = 0.7
        templates[f"{root}maj7"] = vec / np.linalg.norm(vec)

    return templates

CHORD_TEMPLATES = build_chord_templates()


def download_audio_from_youtube(url_or_id, output_dir):
    """Downloads highest quality audio using yt-dlp."""
    if not url_or_id.startswith("http"):
        url = f"https://www.youtube.com/watch?v={url_or_id}"
    else:
        url = url_or_id

    output_template = os.path.join(output_dir, "audio.%(ext)s")
    cmd = [
        os.path.join(VENV_PATH, "bin", "yt-dlp"),
        "-x",
        "--audio-format", "wav",
        "--audio-quality", "0",
        "-o", output_template,
        url
    ]
    
    # Try system yt-dlp if venv yt-dlp fails
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception:
        cmd[0] = "yt-dlp"
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    wav_file = os.path.join(output_dir, "audio.wav")
    if not os.path.exists(wav_file):
        # find any created file
        for f in os.listdir(output_dir):
            if f.startswith("audio."):
                return os.path.join(output_dir, f)
    return wav_file


def estimate_key(chroma_mean):
    """Estimates musical key using Krumhansl-Schmuckler correlations."""
    chroma_norm = (chroma_mean - np.mean(chroma_mean)) / (np.std(chroma_mean) + 1e-9)
    
    best_key = "Am"
    best_corr = -1.0
    
    for i, root in enumerate(NOTE_NAMES):
        # Major
        rot_major = np.roll(MAJOR_PROFILE, i)
        corr_major = np.corrcoef(chroma_norm, rot_major)[0, 1]
        if corr_major > best_corr:
            best_corr = corr_major
            best_key = root
            
        # Minor
        rot_minor = np.roll(MINOR_PROFILE, i)
        corr_minor = np.corrcoef(chroma_norm, rot_minor)[0, 1]
        if corr_minor > best_corr:
            best_corr = corr_minor
            best_key = f"{root}m"
            
    return best_key, float(best_corr)


def analyze_audio_chords(audio_path, max_duration=240):
    """Performs full DSP harmonic and chord extraction."""
    # Load audio (downsample to 22050 for efficiency)
    y, sr = librosa.load(audio_path, sr=22050, duration=max_duration)
    
    # Harmonic-Percussive Source Separation (isolates harmony from drums)
    y_harmonic, _ = librosa.effects.hpss(y)
    
    # Compute Harmonic Pitch Class Profile (CQT chromagram)
    chroma = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr, hop_length=1024, n_chroma=12)
    
    # Beat tracking
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=1024)
    if isinstance(tempo, np.ndarray):
        tempo = float(tempo[0])
    else:
        tempo = float(tempo)
        
    # Beat-synchronous chromagram
    chroma_beat = librosa.util.sync(chroma, beat_frames, aggregate=np.median)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=1024)
    
    # Estimate global key
    global_chroma = np.mean(chroma, axis=1)
    key, key_confidence = estimate_key(global_chroma)
    
    # Match chords per beat
    chord_sequence = []
    unique_chords = []
    
    for i in range(chroma_beat.shape[1]):
        beat_chroma = chroma_beat[:, i]
        norm = np.linalg.norm(beat_chroma)
        if norm > 0:
            beat_chroma = beat_chroma / norm
            
        best_chord = "None"
        best_score = -1.0
        
        for chord_name, template in CHORD_TEMPLATES.items():
            score = np.dot(beat_chroma, template)
            if score > best_score:
                best_score = score
                best_chord = chord_name
                
        time_sec = float(beat_times[i]) if i < len(beat_times) else i * (1024 / sr)
        
        # Filter low-confidence noise
        if best_score > 0.45:
            if not chord_sequence or chord_sequence[-1]["chord"] != best_chord:
                chord_sequence.append({
                    "time_sec": round(time_sec, 2),
                    "chord": best_chord,
                    "confidence": round(float(best_score), 2)
                })
            if best_chord not in unique_chords:
                unique_chords.append(best_chord)
                
    return {
        "status": "success",
        "key": key,
        "key_confidence": round(key_confidence, 2),
        "tempo_bpm": round(tempo, 1),
        "duration_sec": round(float(librosa.get_duration(y=y, sr=sr)), 1),
        "unique_chords": unique_chords,
        "chord_timeline": chord_sequence[:40]  # First 40 changes for summary
    }


def main():
    parser = argparse.ArgumentParser(description="Extract and verify chords from YouTube or audio file")
    parser.add_argument("source", help="YouTube URL, YouTube ID, or local audio file path")
    parser.add_argument("--json", action="store_true", help="Output pure JSON")
    args = parser.parse_args()

    temp_dir = tempfile.mkdtemp(prefix="octava_dsp_")
    try:
        if os.path.exists(args.source) and os.path.isfile(args.source):
            audio_file = args.source
        else:
            audio_file = download_audio_from_youtube(args.source, temp_dir)

        result = analyze_audio_chords(audio_file)
        
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"\n🎵 === AUDIO HARMONIC ANALYSIS REPORT ===")
            print(f"🔑 Detected Key: {result['key']} (Confidence: {result['key_confidence']*100:.1f}%)")
            print(f"⏱️  Tempo: {result['tempo_bpm']} BPM | Duration: {result['duration_sec']}s")
            print(f"🎸 Unique Chords Detected: {', '.join(result['unique_chords'])}")
            print(f"\n🎼 Sample Chord Progression Timeline:")
            for item in result['chord_timeline'][:12]:
                print(f"  [{item['time_sec']:>5.1f}s] -> {item['chord']:<6} (confidence: {item['confidence']*100:.0f}%)")
            print("=========================================\n")

    except Exception as e:
        err = {"status": "error", "message": str(e)}
        if args.json:
            print(json.dumps(err, indent=2))
        else:
            print(f"❌ Error during audio analysis: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        # Cleanup
        try:
            for f in os.listdir(temp_dir):
                os.remove(os.path.join(temp_dir, f))
            os.rmdir(temp_dir)
        except Exception:
            pass


if __name__ == "__main__":
    main()
