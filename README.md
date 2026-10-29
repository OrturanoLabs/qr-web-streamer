# QR Binary Matrix Real-Time Streamer

Una web application ad alte prestazioni per la trasmissione in tempo reale della matrice binaria grezza (`BitMatrix`) di un QR Code tra dispositivi, basata su un'architettura **WebSocket Server-Relay** in Node.js e sul rilevamento avanzato tramite `@zxing/library`.

---

## 🚀 Architettura e Funzionalità

- **Estrazione BitMatrix Grezza:** Utilizza una custom subclass di ZXing (`MatrixCapturingQRCodeReader`) per estrarre la matrice binaria geometrica completa (`dimension x dimension`) direttamente dai moduli del QR Code.
- **Protocollo Binario Compatto (`src/protocol.ts`):** Serializzazione ottimizzata in `ArrayBuffer` con header di protocollo (versione, dimensione, numero di sequenza, timestamp globale).
- **Server-Relay WebSocket (`server.ts`):** Architettura centralizzata basata su sessioni a 6 caratteri. Il trasmettitore invia i flussi binari al server, che li inoltra in tempo reale a tutti i ricevitori connessi alla sessione.
- **Latenza E2E in Tempo Reale:** Calcolo della latenza end-to-end in millisecondi basato su timestamp sincronizzati (`Date.now()`).
- **Aggiornamento Continuo:** Invio periodico dei frame statici (ogni 150ms) per garantire il ticking in tempo reale del timer sul receiver con precisione al decimo di secondo (`HH:MM:SS.s`).

---

## 📦 Installazione e Avvio

Assicurati di avere Node.js installato.

```bash
# Installazione delle dipendenze
npm install

# Avvio in modalità sviluppo (avvia contemporaneamente server WebSocket e Vite)
npm run dev
```

---

## ⚠️ Disclaimer Legale ed Etico (Scopo Didattico)

> **AVVISO IMPORTANTE:**
> Questo progetto è stato sviluppato **esclusivamente a scopo didattico, di ricerca e accademico** per esplorare le capacità di elaborazione delle matrici binarie di QR Code, la serializzazione binaria custom e la comunicazione in tempo reale tramite WebSocket.
> 
> L'autore e i contributori **non si assumono alcuna responsabilità** per l'uso improprio, illegale o fraudolento di questo software (inclusi, a titolo esemplificativo ma non esaustivo, tentativi di aggirare sistemi di rilevamento presenze, validazione di biglietti o certificazioni digitali). L'utente è l'unico responsabile del rispetto delle normative vigenti e delle politiche di utilizzo dei servizi con cui interagisce.

---

## 📄 Licenza

Distribuito sotto licenza MIT. Vedi il file `LICENSE` per i dettagli.
