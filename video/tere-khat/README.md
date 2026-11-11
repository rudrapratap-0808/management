# TERE KHAT – Rudra_iy (album: BAS TU)

Animated watercolor music video, 1920×1080, 24 fps, 4:09.88 (matches the song exactly).

**Download the full-quality video (792 MB):** see the GitHub Release `tere-khat-v1`, asset `TERE_KHAT_1080p_master.mp4`.
The file is above GitHub's 100 MB git limit, so it is published as a release asset rather than committed.

## Files here

- `TERE_KHAT_Prompts.txt` – storyboard, character sheets and every image / video prompt with timestamps.
- `generation-prompts.json` – the prompts actually used to generate each scene image.
- `edit.py` – the edit: shot list with timestamps, camera moves, color grades, particle effects, fades and grain.
  Expects scene images at `/tmp/a/img/<scene>.png` and the song at `/tmp/a/song.mp3`;
  run `python3 edit.py out.mp4` (needs numpy, pillow, ffmpeg).
