#!/usr/bin/env python3
"""
SAMA XHEL Santé — génération des voix du guide vocal dans les langues nationales.

POURQUOI DES FICHIERS AUDIO ET PAS UNE SYNTHÈSE EN DIRECT ?
  Les phrases du guide sont fixes (93 : 20 phrases d'écran + 73 questions des tests).
  On les génère UNE fois, un locuteur natif les écoute et les valide, puis on les met
  dans l'application (assets/voix/<langue>/<clé>.mp3). Résultat : le guide marche
  sans internet, sans coût par écoute, et on est sûr de ce qu'entend le parent.

ÉTAPES
  1. Faire traduire tools/traductions_voix.csv (une colonne par langue) par des
     locuteurs natifs : wo (wolof), ff (pulaar), srr (sérère), dyo (diola),
     mnk (mandinka / socé), bm (bambara). Les cases vides sont ignorées.
  2. Ouvrir Google Colab (Exécution > Modifier le type d'exécution > GPU T4),
     téléverser ce script et le CSV, puis :
         !pip install -q git+https://github.com/huggingface/parler-tts.git transformers soundfile pydub
         !apt -qq install -y ffmpeg
         !python generer_voix.py traductions_voix.csv --langues wo bm
  3. Télécharger voix.zip, le décompresser dans assets/voix/ de l'application.
  4. FAIRE ÉCOUTER chaque fichier à un locuteur natif avant publication (fichier
     rapport_validation.csv produit à côté, colonne « valide » à remplir).

MODÈLES UTILISÉS (vérifier la licence avant usage commercial)
  - Wolof   : CONCREE/Adia_TTS (Parler-TTS, Apache 2.0 — citer CONCREE), voix sénégalaise.
  - Autres  : Meta MMS-TTS « facebook/mms-tts-<code ISO 639-3> » (licence CC-BY-NC 4.0 :
              usage non commercial — à revoir si l'application devient payante).
    Le script vérifie que le modèle existe ; sinon il le signale et passe à la suite
    (dans ce cas l'application lit la phrase en français, voir lib/core/voix.dart).
"""
import argparse
import csv
import os
import sys
import zipfile

# Code de l'application → modèle Hugging Face (ordre = préférence)
MODELES = {
    'wo':  ['CONCREE/Adia_TTS', 'facebook/mms-tts-wol'],
    'ff':  ['facebook/mms-tts-fuc', 'facebook/mms-tts-fuv', 'facebook/mms-tts-ful'],  # pulaar du Sénégal = fuc
    'srr': ['facebook/mms-tts-srr'],
    'dyo': ['facebook/mms-tts-dyo'],
    'mnk': ['facebook/mms-tts-mnk'],
    'bm':  ['facebook/mms-tts-bam'],
}
DESCRIPTION_ADIA = 'A clear and educational voice, with a flow adapted to learning'


def charger_modele(lang):
    """Renvoie une fonction texte -> (audio numpy, fréquence), ou None si aucun modèle n'est disponible."""
    import torch
    device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
    for nom in MODELES[lang]:
        try:
            if 'Adia' in nom:
                from parler_tts import ParlerTTSForConditionalGeneration
                from transformers import AutoTokenizer
                modele = ParlerTTSForConditionalGeneration.from_pretrained(nom).to(device)
                tok = AutoTokenizer.from_pretrained(nom)
                desc = tok(DESCRIPTION_ADIA, return_tensors='pt').input_ids.to(device)

                def parler(texte):
                    ids = tok(texte, return_tensors='pt').input_ids.to(device)
                    audio = modele.generate(input_ids=desc, prompt_input_ids=ids)
                    return audio.cpu().numpy().squeeze(), modele.config.sampling_rate
            else:
                from transformers import VitsModel, AutoTokenizer
                modele = VitsModel.from_pretrained(nom).to(device)
                tok = AutoTokenizer.from_pretrained(nom)

                def parler(texte):
                    with torch.no_grad():
                        sortie = modele(**tok(texte, return_tensors='pt').to(device)).waveform
                    return sortie.cpu().numpy().squeeze(), modele.config.sampling_rate
            print(f'  ✔ {lang} : modèle {nom}')
            return parler
        except Exception as e:  # modèle absent ou incompatible
            print(f'  ✘ {lang} : {nom} indisponible ({str(e).splitlines()[0][:90]})')
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('csv', help='tools/traductions_voix.csv rempli par les traducteurs')
    ap.add_argument('--langues', nargs='+', default=list(MODELES), choices=list(MODELES))
    ap.add_argument('--sortie', default='voix')
    args = ap.parse_args()

    import soundfile as sf
    from pydub import AudioSegment

    with open(args.csv, encoding='utf-8') as f:
        lignes = list(csv.DictReader(f))
    rapport = []
    for lang in args.langues:
        a_faire = [l for l in lignes if (l.get(lang) or '').strip()]
        print(f'\n[{lang}] {len(a_faire)} phrase(s) traduite(s)')
        if not a_faire:
            continue
        parler = charger_modele(lang)
        if parler is None:
            continue
        os.makedirs(os.path.join(args.sortie, lang), exist_ok=True)
        for l in a_faire:
            texte = l[lang].strip()
            wav = os.path.join(args.sortie, lang, l['cle'] + '.wav')
            mp3 = wav[:-4] + '.mp3'
            audio, sr = parler(texte)
            sf.write(wav, audio, sr)
            # mp3 mono 64 kb/s : ~8 Ko par seconde, léger pour les téléphones d'entrée de gamme
            AudioSegment.from_wav(wav).set_channels(1).export(mp3, format='mp3', bitrate='64k')
            os.remove(wav)
            rapport.append({'langue': lang, 'cle': l['cle'], 'texte': texte, 'fichier': mp3, 'valide': ''})
            print(f'   {l["cle"]}.mp3')

    with open('rapport_validation.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=['langue', 'cle', 'texte', 'fichier', 'valide'])
        w.writeheader()
        w.writerows(rapport)
    with zipfile.ZipFile('voix.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        for r in rapport:
            z.write(r['fichier'], os.path.relpath(r['fichier'], args.sortie))
    print(f'\n{len(rapport)} fichier(s) → voix.zip ; faites valider rapport_validation.csv par un locuteur natif.')


if __name__ == '__main__':
    sys.exit(main())
