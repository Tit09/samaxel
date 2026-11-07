"""Assemble la vidéo de démo : image (webm Playwright) + voix réellement jouées (journal)."""
import json, subprocess, sys, os, urllib.parse
racine = '/home/claude/samaxel/jeu-jammu-xel/build/web/'
j = json.load(open('/home/claude/jeu/captures/video/journal.json'))
video, journal = j['video'], j['journal']
sons = []
for i, e in enumerate(journal):
    if e['src'] == 'STOP' or not e['src']:
        continue
    chemin = racine + urllib.parse.unquote(urllib.parse.urlparse(e['src']).path.lstrip('/'))
    if not os.path.exists(chemin):
        continue
    fin = None
    for f in journal[i + 1:]:
        if f['src'] == 'STOP' or (f['src'] and 'voix/' in f['src'] and 'voix/' in e['src']):
            fin = f['t']; break
    sons.append((e['t'], fin, chemin))
entrees, filtres = [], []
for k, (t, fin, chemin) in enumerate(sons):
    entrees += ['-i', chemin]
    trim = f'atrim=0:{max(0.05,(fin - t) / 1000):.3f},' if fin else ''
    filtres.append(f'[{k + 1}:a]{trim}adelay={t}|{t},aformat=channel_layouts=mono[a{k}]')
mix = ''.join(f'[a{k}]' for k in range(len(sons))) + f'amix=inputs={len(sons)}:normalize=0,apad[son]'
sortie = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/jeu/captures/JAMMU_XEL_demo.mp4'
cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-i', video, *entrees, '-filter_complex', ';'.join(filtres) + ';' + mix,
       '-map', '0:v', '-map', '[son]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-shortest', sortie]
subprocess.run(cmd, check=True)
print(sortie, len(sons), 'sons')
