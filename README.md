# dtwnty

Tavolo virtuale fantasy realizzato con React, TypeScript e Vite. Gestione delle dipendenze tramite npm.

## Avvio

Richiede Node.js 22.12+ (oppure 20.19+).

```sh
npm ci
npm run dev
```

Apri http://127.0.0.1:5173. La porta è fissa: se occupata, Vite si ferma invece di sceglierne un'altra. La preview della build usa la porta 4173. La porta 8080 non viene usata.

```sh
npm run typecheck
npm run build
npm run preview
```

La build statica è generata in `dist/`.

## GitHub Pages

Il progetto include `.github/workflows/pages.yml`: esegue `npm ci`, controlla TypeScript, compila e pubblica `dist/` a ogni push su `main`. Nel repository scegli **Settings → Pages → Source → GitHub Actions**. Il percorso base relativo di Vite permette l'hosting anche sotto `/dtwnty/`. Non sono stati creati repository remoti né eseguite pubblicazioni.

## Funzionalità

- Mappe PNG, JPG e WebP fino a 20 MB per immagine.
- Token giocatore e nemico con ritaglio circolare, trascinamento, nome, dimensione, duplicazione e rimozione.
- Spostamento della mappa, zoom con rotella e pulsanti, adattamento, griglia visiva regolabile da 10 a 300 px e schermo intero.
- `0` adatta la mappa, `Canc` rimuove il token selezionato, `Esc` deseleziona.
- Salvataggio automatico locale in IndexedDB ed esportazione/importazione JSON con immagini incluse. Compatibile con i file sessione della prima versione.
- Il cambio di mappa mantiene le posizioni proporzionali dei token.

Le immagini restano nel browser. Non sono previsti account o sincronizzazione multiplayer. La persistenza dipende dal browser e dall'origine: esporta la sessione per trasferirla o conservarne una copia. I font Google sono opzionali e hanno fallback di sistema. Su touch usa un dito per spostare e i pulsanti per lo zoom.

## Struttura

`src/App.tsx` contiene l'interfaccia React e le interazioni. `src/session.ts` definisce i tipi e valida immagini e sessioni. `style.css` conserva lo stile minimal floreale fantasy.

### Dimensione della griglia

Sotto il caricamento della mappa trovi **Dimensione cella**: usa il cursore o inserisci un numero da 10 a 300 px. Puoi impostarla prima di caricare la mappa o modificarla durante il gioco. I pixel sono riferiti alla mappa originale: la griglia segue zoom e spostamento. Modificare la misura rende visibile la griglia per visualizzare subito il risultato; il pulsante griglia permette di nasconderla. Dimensione e visibilità vengono salvate nel browser e nel JSON della sessione. Le vecchie sessioni senza queste impostazioni utilizzano 50 px e griglia nascosta.


### Fog of war e luce dinamica

1. Carica la mappa di gioco, poi **Carica occlusion map** nel pannello **Luce e visibilità**.
2. Le immagini devono avere lo stesso inquadramento; risoluzioni diverse sono adattate alle dimensioni della mappa. Un rapporto d'aspetto diverso di oltre l'1% è rifiutato. Un adattamento di scala non corregge disegni disallineati: controlla la sovrapposizione.
3. Dopo il caricamento viene attivata la **Vista master** con sovrapposizione semitrasparente, per verificare l'allineamento. Disattivala per vedere la visuale dei giocatori.
4. Ogni token **giocatore** emette luce circolare (8 celle per impostazione iniziale). **Portata luce** va da 1 a 40 celle e usa la dimensione della griglia. I nemici non emettono luce. Durante il trascinamento la luce rimane ferma: si aggiorna solo quando rilasci il token. Un trascinamento annullato non modifica posizione o zone esplorate.
5. Rosso = ostacolo fisso bloccante; verde = porta; azzurro/ciano = finestra; giallo = custom non bloccante. Sfondo nero/trasparente e colori non riconosciuti, incluso magenta, sono ignorati. Il riconoscimento tollera la compressione JPEG; PNG a colori piatti resta preferibile.
6. Ogni componente connessa verde o ciano diventa un'apertura distinta, inizialmente chiusa e bloccante. Clicca il rettangolo verde/azzurro per aprirla o chiuderla. Il bordo tratteggiato indica un'apertura aperta. Anche le finestre chiuse bloccano completamente la vista, come richiesto. Componenti dello stesso colore che si toccano diventano un unico elemento.
7. In vista giocatori puoi interagire con le aperture illuminate; in vista master con tutte. La vista master rivela tutta la mappa e serve alla gestione locale: non è un sistema di permessi multiplayer.
8. La fog distingue tre stati: zone mai viste completamente buie, zone già visitate in penombra e zone attualmente illuminate. La memoria accumula solo le visuali effettive dei giocatori alle posizioni confermate, non quelle attraversate durante il trascinamento. I nemici fuori dalla visuale attuale sono nascosti interamente, anche nelle zone già esplorate, nell’elenco e nel pannello di selezione; la vista master continua a mostrarli tutti. Senza giocatori la mappa resta buia. Un giocatore collocato dentro un ostacolo bloccante non emette luce: spostalo in una zona libera dalla vista master. La luce non limita fisicamente il trascinamento dei token attraverso i muri.

L'occlusione è calcolata su una maschera raster fino a 1200 pixel sul lato lungo, con ombre e attenuazione sul bordo della portata. Le aperture più piccole di 3 pixel della maschera sono ignorate come rumore: dettagli troppo sottili o varchi errati nell'immagine possono produrre risultati approssimativi. La griglia e lo zoom non cambiano l'allineamento degli ostacoli. Il caricamento di una nuova mappa di gioco rimuove l'occlusion map precedente per evitare abbinamenti errati.

Immagine di occlusione, zone esplorate, porte/finestre aperte, fog e portata luce sono inclusi nel salvataggio locale e nel JSON esportato. La vista master è temporanea e non viene esportata. Le sessioni precedenti restano compatibili. Nessuna immagine viene inviata a servizi esterni.

Test di regressione: `npm test` (Node.js 22.6+ con supporto alla rimozione dei tipi TypeScript; si consiglia Node.js 22.18+).

La memoria di esplorazione è compatta e persiste sia nel browser sia nelle sessioni JSON. Caricare una nuova mappa o sostituire la occlusion map azzera le zone esplorate. Le vecchie sessioni partono senza memoria pregressa: vengono ricordate le visuali da questo aggiornamento in poi. L’apertura di porte/finestre e le modifiche alla portata continuano ad aggiornare subito la luce. La vista master da sola non aggiunge aree esplorate: vengono memorizzate solo le visuali dei giocatori.

## Gioco online

Apri **Gioca online** per creare una stanza o entrare con un codice. Il master assegna i personaggi; ogni partecipante riceve dal server soltanto la propria visuale, la propria esplorazione e i token visibili. La luce si aggiorna al rilascio. Configurazione e pubblicazione sono descritte in [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md).

Per il gioco locale le immagini restano nel browser. Quando crei una stanza online, il tavolo viene caricato sul tuo Worker e nel database SQLite privato della stanza; il servizio genera le visuali personali. Stanze: 12 giocatori, 100 token, scadenza dopo 7 giorni. Il servizio Cloudflare non è stato pubblicato automaticamente.

Il backend online usa solo Workers e Durable Objects SQLite: non richiede attivazione R2, bucket o chiavi R2. Le immagini sono archiviate in blocchi da 256 KiB e non vengono riscritte durante i normali spostamenti.
