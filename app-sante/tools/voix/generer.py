import csv, os, sys, time, torch
import soundfile as sf
import subprocess
torch.set_num_threads(2)
lignes = list(csv.DictReader(open('textes.tsv', encoding='utf-8'), delimiter='\t'))
langues = sys.argv[1:] or ['ff', 'wo']
def ecrire(lang, cle, audio, sr):
    os.makedirs(f'sortie/{lang}', exist_ok=True)
    wav = f'sortie/{lang}/{cle}.wav'; sf.write(wav, audio, sr)
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',wav,'-af','loudnorm','-ac','1','-b:a','64k',wav[:-4]+'.mp3'],check=True); os.remove(wav)
for lang in langues:
    t0 = time.time()
    if lang == 'ff':
        from transformers import VitsModel, AutoTokenizer
        m = VitsModel.from_pretrained('facebook/mms-tts-ful'); tok = AutoTokenizer.from_pretrained('facebook/mms-tts-ful')
        for l in lignes:
            with torch.no_grad(): w = m(**tok(l['ff'], return_tensors='pt')).waveform
            ecrire('ff', l['cle'], w.numpy().squeeze(), m.config.sampling_rate); print('ff', l['cle'], flush=True)
    if lang == 'wo':
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer
        m = ParlerTTSForConditionalGeneration.from_pretrained('CONCREE/Adia_TTS'); tok = AutoTokenizer.from_pretrained('CONCREE/Adia_TTS')
        desc = tok('A clear and educational voice, with a flow adapted to learning', return_tensors='pt').input_ids
        for l in lignes:
            if os.path.exists(f'sortie/wo/{l["cle"]}.mp3'): continue
            torch.manual_seed(7)
            a = m.generate(input_ids=desc, prompt_input_ids=tok(l['wo'], return_tensors='pt').input_ids)
            ecrire('wo', l['cle'], a.numpy().squeeze(), m.config.sampling_rate); print('wo', l['cle'], round(time.time()-t0), flush=True)
    print('FIN', lang, round(time.time() - t0), flush=True)
