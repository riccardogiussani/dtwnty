export const OCCLUSION_PROMPT = `COMPITO
Rigenera l'immagine allegata (mappa top-down per GDR, 3000 px di larghezza) come "mappa di ostruzione visiva" per un sistema di line-of-sight / fog of war. L'output deve essere sovrapponibile pixel per pixel all'originale.

VINCOLI GEOMETRICI (prioritari su tutto)
- Stesse dimensioni in pixel, stesso rapporto, nessun crop, nessuna rotazione, nessuna prospettiva.
- Ogni muro, porta e finestra deve occupare esattamente le stesse coordinate dell'originale. Non spostare, ridisegnare o "ripulire" le geometrie.
- Se non puoi garantire la sovrapposizione esatta, restituisci invece i poligoni vettoriali (JSON/SVG) nello stesso sistema di coordinate dell'immagine.

COSA RIMUOVERE
Tutto ciò che non ostruisce la vista: pavimento texture, griglia, macchie e aloni rossi/arancioni/blu, ombre, sfondo carta, mobilio (tavoli, scaffali, letti, tappeti, vasche, bare, statue, barili, sedie, piedistalli, scale decorative). Lo sfondo diventa un colore piatto neutro (#000000 o trasparente se PNG).

COSA MANTENERE E COME COLORARE (colori piatti, senza anti-aliasing, senza sfumature, senza ombre)
- Muri (ostruzione fissa, blocca sempre la vista): #FF0000
- Porte (ostruzione mobile, apribili/chiudibili; sono i rettangoli chiari inseriti nei muri): #00FF00
- Finestre (ostruzione mobile/parziale; le sottili aperture rosate nei muri esterni): #00FFFF
- Passaggi aperti senza porta (archi, varchi nei muri): non colorare, lascia vuoto
- Altri asset che possono occludere la vista (es. colonne, blocchi massicci, statue grandi che fanno da ostacolo, il pozzo/buco circolare centrale se blocca la vista): #FFFF00 per ostruzione fissa non-muro
- Eventuali elementi mobili non porta (es. tende, barricate): #FF00FF

REGOLE
1. Ogni categoria ha un unico colore uniforme; nessun altro colore deve comparire.
2. Spessore dei muri identico all'originale, bordi netti.
3. In caso di dubbio su un elemento (ostruisce o no?), non includerlo e segnalalo nel report.
4. Le scale e le aree sopraelevate non sono ostruzioni, a meno che abbiano parapetti/muri.

OUTPUT RICHIESTO
1. PNG con la mappa color-coded (stessa risoluzione dell'originale).
2. Legenda testuale colore → categoria → tipo di ostruzione (fissa/mobile).
3. Lista degli elementi ambigui che hai escluso o classificato con incertezza.
4. Opzionale: export SVG/JSON dei poligoni per categoria, con coordinate in pixel.

VERIFICA FINALE
Sovrapponi mentalmente l'output all'originale al 50% di opacità: muri, porte e finestre devono coincidere perfettamente. Se non coincidono, correggi prima di consegnare.`;
