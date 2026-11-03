# Convertix

Convertisseur de fichiers par glisser-déposer, 100 % dans le navigateur : aucun fichier n'est envoyé à un serveur.

En ligne : https://convertix-eh9.pages.dev

## Formats

| Famille | Départ | Arrivée |
|---|---|---|
| Images | PNG JPG WEBP AVIF GIF BMP SVG ICO HEIC TIFF TGA | PNG JPG WEBP AVIF GIF BMP ICO TIFF SVG PDF Base64 |
| PDF | PDF | PNG JPG WEBP (page par page), TXT, MD, HTML, PDF découpé, PDF allégé |
| Documents | DOCX, MD, HTML, TXT | PDF, HTML, MD, TXT |
| Données | CSV TSV JSON XLSX XLS ODS XML YAML | XLSX CSV TSV JSON YAML XML ODS HTML MD SQL |
| Audio | MP3 WAV OGG M4A AAC FLAC OPUS WMA AIFF | MP3 WAV OGG FLAC M4A OPUS |
| Vidéo | MP4 WEBM MOV MKV AVI M4V WMV FLV 3GP MPEG | MP4 WEBM MOV MKV AVI GIF, MP3 WAV M4A, image PNG/JPG |
| Archives | ZIP | extraction |

Aussi : fusion de PDF, images assemblées en un PDF, réglages (qualité, taille, rotation, débit, découpe, images par seconde, séparateur CSV, nom des fichiers), dossiers entiers, collage, téléchargement groupé en ZIP, lecteur intégré pour tous les formats.

## Développement

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
node scripts/e2e.mjs <url> <dossier-de-fichiers-de-test>   # teste chaque conversion dans Chrome
```

## Déploiement (Cloudflare Pages)

```bash
npm run build && npx wrangler pages deploy dist --project-name convertix --branch main
```

L'audio et la vidéo passent par ffmpeg.wasm : son cœur (≈ 31 Mo) est chargé à la demande depuis jsDelivr, puis mis en cache.
