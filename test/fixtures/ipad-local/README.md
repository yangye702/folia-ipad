# Local playback fixture

Two original synthetic sine tones (440 Hz and 660 Hz, 60 seconds each), generated with FFmpeg/libmp3lame at 32 kbit/s. No downloaded music or user files. ID3 titles are `iPad Track One` / `iPad Track Two`; artist is `Folia Test`. The LRC sidecars and 8×8 solid PNG are original test data.

Recreate either audio file with:

```bash
ffmpeg -f lavfi -i sine=frequency=440:duration=60 -metadata title='iPad Track One' -metadata artist='Folia Test' -codec:a libmp3lame -b:a 32k one.mp3
ffmpeg -f lavfi -i sine=frequency=660:duration=60 -metadata title='iPad Track Two' -metadata artist='Folia Test' -codec:a libmp3lame -b:a 32k two.mp3
```
