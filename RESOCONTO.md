# Resoconto Tecnico - QR Binary Matrix Streamer

Questo documento riassume le fasi di ricerca, prototipazione, tentativi di risoluzione e l'evoluzione dell'architettura del progetto **qr-web-streamer**.

---

## 1. Obiettivo Iniziale e Prototipo Locale
- **Scopo:** Sviluppare una web app per trasmettere QR Code in tempo reale tra dispositivi inviando la **matrice binaria grezza del QR** (`BitMatrix`), anziché immagini o testo decodificato.
- **Libreria:** `@zxing/library` per la scansione e il rilevamento tramite fotocamera del browser.

---

## 2. Analisi e Ricerca di ZXing (`BitMatrix`)
- Abbiamo verificato che la libreria ZXing, pur essendo pensata per decodificare il testo, espone internamente tramite il `Detector` standard di QR Code un metodo per ottenere la `BitMatrix` campionata (`detectorResult.getBits()`).
- **Problema riscontrato:** Il `Detector` standard di ZXing campiona partendo dai **centri** dei finder pattern (`3.5`), omettendo i bordi esterni dei tre quadrati d'angolo e la quiet zone.
- **Tentativo ed Evoluzione:** Abbiamo esplorato trasformazioni prospettiche edge-to-edge per catturare la matrice completa da `0` a `dimension`, e successivamente isolato il comportamento con test sintetici 21x21 per distinguere errori di estrazione da errori di rendering.

---

## 3. Architettura di Rete: Da WebRTC P2P a Server-Relay WebSocket
- **Fase WebRTC P2P:** Inizialmente abbiamo implementato una segnalazione WebSocket e una connessione WebRTC DataChannel (`RTCPeerConnection`) tra dispositivi.
- **Problema riscontrato:** Su reti reali (tra PC e mobile o a causa di firewall, NAT e isolamento AP Wi-Fi), la negoziazione P2P diretta può fallire o andare in timeout.
- **Soluzione Architetturale (Server-Relay):** Per garantire affidabilità al 100%, abbiamo semplificato l'architettura eliminando WebRTC e passando a un modello **WebSocket Server-Relay (Broadcast)** centralizzato in Node.js (`server.ts`):
  - Il Trasmettitore invia i flussi binari al server indipendentemente dalla presenza di ricevitori.
  - Il Server memorizza l'ultimo QR (`lastMatrix`) e lo trasmette in tempo reale a tutti i ricevitori connessi alla sessione.

---

## 4. Risoluzione dei Problemi di Connessione e Mixed Content
- **Problema 1 (Errore JSON sui pacchetti binari):** Il server di segnalazione provava a fare `JSON.parse` sui fotogrammi binari grezzi del QR inviati dal trasmettitore. 
  - *Risoluzione:* Aggiornato `server.ts` per verificare la natura binaria (`isBinary || Buffer.isBuffer`) prima di qualsiasi parsing JSON.
- **Problema 2 (Mixed Content / Errore di Connessione):** I browser moderni bloccano le pagine in **HTTPS** (necessarie per accedere alla fotocamera) dall'aprire WebSocket non sicure (`ws://`). 
  - *Tentativo:* Tentativo di connessione diretta sulla porta `3001`.
  - *Soluzione:* Configurazione del proxy WebSocket integrato in Vite (`vite.config.ts`) per instradare le richieste sicure (`wss://.../ws`) in modo trasparente verso il backend locale sulla porta `3001`.

---

## 5. Stato Attuale del Progetto
- **Frontend:** Vite + TypeScript + `@zxing/library` + Client WebSocket (`src/streamer.ts`).
- **Backend:** Node.js + WebSocket Server (`server.ts`).
- **Protocollo:** Serializzazione binaria efficiente della `BitMatrix` (`src/protocol.ts`) con misurazione della latenza end-to-end in millisecondi.
