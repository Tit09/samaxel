"""Voix de JÀMMU XEL. Usage : python gen_voix.py fren | wo
fren : français et anglais (Piper, hors ligne, rapide)
wo   : wolof (CONCREE Adia_TTS, lent ; relancer en boucle, 10 phrases par processus)"""
import os, sys, subprocess, wave
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from phrases import P
SORTIE = '/home/claude/jeu/voix'
NOVOIX = {'langue_nom'}  # généré à part (chaque langue dit son nom)
def mp3(wav, dst):
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',wav,'-af','silenceremove=start_periods=1:start_threshold=-50dB,loudnorm','-ac','1','-ar','24000','-b:a','48k',dst], check=True); os.remove(wav)
mode = sys.argv[1]
if mode == 'fren':
    sys.path.insert(0, '/home/claude/voix')
    from piper import PiperVoice, SynthesisConfig
    cfg = SynthesisConfig(length_scale=1.1, noise_scale=0.6, noise_w_scale=0.7)
    for lang, modele, col in [('fr','/home/claude/voix/modeles/fr_FR-siwis-medium.onnx',1),('en','/home/claude/voix/modeles/en_US-lessac-high.onnx',2)]:
        v = PiperVoice.load(modele); os.makedirs(f'{SORTIE}/{lang}', exist_ok=True)
        for row in P:
            k, t = row[0], row[col]
            dst = f'{SORTIE}/{lang}/{k}.mp3'
            if os.path.exists(dst): continue
            t = t.replace('JÀMMU XEL', 'Jammou Khel' if lang=='fr' else 'Jammu Khel').replace('Pénc','Pènch').replace('Xel','Khel')
            wav = dst[:-4]+'.wav'
            with wave.open(wav,'wb') as w: v.synthesize_wav(t, w, syn_config=cfg)
            mp3(wav, dst)
        print('FIN', lang, flush=True)
else:
    import torch, soundfile as sf
    torch.set_num_threads(2)
    from parler_tts import ParlerTTSForConditionalGeneration
    from transformers import AutoTokenizer
    m = ParlerTTSForConditionalGeneration.from_pretrained('CONCREE/Adia_TTS'); tok = AutoTokenizer.from_pretrained('CONCREE/Adia_TTS')
    desc = tok('A clear and educational voice, with a flow adapted to learning', return_tensors='pt')
    os.makedirs(f'{SORTIE}/wo', exist_ok=True); faits = 0
    # ordre : espace enfant d'abord (le plus utile sans lecture), puis le reste
    ordre = sorted(P, key=lambda r: (0 if r[0].split('_')[0] in ('emo','j','p','c','r','act','enfant','bravo','encore','fini') else 1))
    for row in ordre:
        k, t = row[0], row[3]
        dst = f'{SORTIE}/wo/{k}.mp3'
        if os.path.exists(dst): continue
        torch.manual_seed(7)
        p = tok(t, return_tensors='pt')
        a = m.generate(input_ids=desc.input_ids, attention_mask=desc.attention_mask, prompt_input_ids=p.input_ids, prompt_attention_mask=p.attention_mask)
        wav = dst[:-4]+'.wav'; sf.write(wav, a.cpu().numpy().squeeze(), m.config.sampling_rate); mp3(wav, dst)
        print('wo', k, flush=True); faits += 1
        if faits >= 10: sys.exit(3)
    print('FIN wo', flush=True)
