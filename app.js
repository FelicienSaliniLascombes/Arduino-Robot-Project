// --- ENREGISTREMENT DE LA PWA (SERVICE WORKER) ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => console.log("Service Worker enregistré avec succès !"))
      .catch((erreur) => console.log("Erreur Service Worker :", erreur));
  });
}
const boutonConnect = document.getElementById("btnConnect");
const texteStatus = document.getElementById("status");

let caracteristiqueBluetooth;
let appareilBluetooth; // On garde le robot en mémoire globale

// =================================================================
// --- 1. CONNEXION ET RECONNEXION AUTOMATIQUE ---
// =================================================================

// Le clic initial (Obligatoire par sécurité)
boutonConnect.addEventListener("click", async () => {
  try {
    texteStatus.innerText = "Recherche en cours...";

    // On demande l'autorisation au navigateur
    appareilBluetooth = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [0xffe0],
    });

    // On surveille si le robot disparaît (coupure de batterie, perte de signal)
    appareilBluetooth.addEventListener(
      "gattserverdisconnected",
      tentativeReconnexion,
    );

    // On lance la connexion
    await etablirConnexion();
  } catch (erreur) {
    console.log("Erreur : ", erreur);
    texteStatus.innerText = "Erreur de connexion 🔴";
  }
});

// La fonction de connexion séparée
async function etablirConnexion() {
  texteStatus.innerText = "Connexion...";
  const serveur = await appareilBluetooth.gatt.connect();
  const service = await serveur.getPrimaryService(0xffe0);
  caracteristiqueBluetooth = await service.getCharacteristic(0xffe1);

  await caracteristiqueBluetooth.startNotifications();
  caracteristiqueBluetooth.addEventListener(
    "characteristicvaluechanged",
    recevoirDonnees,
  );

  texteStatus.innerText = "Statut : CONNECTÉ ! 🟢 Pilotez le robot.";
  texteStatus.style.color = "#28a745";
}

// La reconnexion automatique en boucle
async function tentativeReconnexion() {
  texteStatus.innerText = "Connexion perdue ! Reconnexion en cours... ⏳";
  texteStatus.style.color = "orange";
  console.log("Signal perdu. Tentative de reconnexion dans 2 secondes...");

  // On attend 2 secondes pour laisser le temps au robot de redémarrer
  setTimeout(async () => {
    try {
      await etablirConnexion();
      console.log("Reconnexion automatique réussie !");
    } catch (erreur) {
      console.log("Échec de la reconnexion automatique.");
      texteStatus.innerText = "Robot déconnecté. Cliquez pour reconnecter 🔴";
      texteStatus.style.color = "#dc3545";
    }
  }, 2000);
}

// =================================================================
// --- 2. ENVOI DES ORDRES (MOUVEMENT ET ÉCRAN) ---
// =================================================================

// Fonction magique pour envoyer une lettre au robot
async function envoyerOrdre(lettre) {
  if (!caracteristiqueBluetooth) {
    alert("Connectez d'abord le robot !");
    return;
  }
  const encodeur = new TextEncoder();
  await caracteristiqueBluetooth.writeValue(encodeur.encode(lettre));
  console.log("Ordre envoyé :", lettre);
}

// Variable pour ne pas "spammer" le Bluetooth
let commandeEnCours = "f";

function changerEtatMouvement(nouvelleCommande) {
  // On n'envoie l'ordre que s'il est différent de ce que le robot fait déjà
  if (commandeEnCours !== nouvelleCommande) {
    commandeEnCours = nouvelleCommande;
    envoyerOrdre(nouvelleCommande);
  }
}

// CONTRÔLE AVEC LES BOUTONS DE L'ÉCRAN TACTILE / SOURIS
const boutonsActions = [
  { id: "btnHaut", cmd: "z" },
  { id: "btnBas", cmd: "s" },
  { id: "btnAvantGauche", cmd: "a" },
  { id: "btnAvantDroite", cmd: "e" },
  { id: "btnArriereGauche", cmd: "q" },
  { id: "btnArriereDroite", cmd: "d" },
];

boutonsActions.forEach((bouton) => {
  const el = document.getElementById(bouton.id);
  if (!el) return; // Sécurité si un bouton manque dans le HTML

  // Quand on ENFONCE le bouton
  el.addEventListener("mousedown", () => changerEtatMouvement(bouton.cmd));
  el.addEventListener("touchstart", (event) => {
    event.preventDefault(); // Empêche le zoom bizarre sur mobile
    changerEtatMouvement(bouton.cmd);
  });

  // Quand on RELÂCHE le bouton
  el.addEventListener("mouseup", () => changerEtatMouvement("f"));
  el.addEventListener("mouseleave", () => changerEtatMouvement("f"));
  el.addEventListener("touchend", () => changerEtatMouvement("f"));
});

document
  .getElementById("btnStop")
  .addEventListener("mousedown", () => changerEtatMouvement("f"));

// =================================================================
// --- NOUVEAU CONTRÔLE CLAVIER (MULTI-TOUCHES SIMULTANÉES) ---
// =================================================================

// On crée une mémoire pour retenir toutes les touches enfoncées en même temps
const touchesActives = new Set();

function evaluerTouchesClavier() {
  // On regarde ce qui est appuyé en ce moment
  const haut = touchesActives.has("z") || touchesActives.has("arrowup");
  const bas = touchesActives.has("s") || touchesActives.has("arrowdown");
  const gauche = touchesActives.has("q") || touchesActives.has("arrowleft");
  const droite = touchesActives.has("d") || touchesActives.has("arrowright");

  const diagAvG = touchesActives.has("a");
  const diagAvD = touchesActives.has("e");

  if ((haut || bas || gauche || droite || diagAvG || diagAvD) && modeAuto) {
    modeAuto = false;
    envoyerOrdre("w"); // On dit à l'Arduino de stopper l'auto
    if (btnAuto) {
      btnAuto.innerText = "Mode Auto : OFF";
      btnAuto.classList.remove("actif");
    }
  }

  let commande = "f"; // Par défaut, Stop.

  // --- LOGIQUE MULTI-TOUCHES (DIAGONALES) ---

  // 1. Priorité Avant-Gauche (Z+Q ou Touche A)
  if ((haut && gauche) || diagAvG) {
    commande = "a";
  }
  // 2. Priorité Avant-Droite (Z+D ou Touche E)
  else if ((haut && droite) || diagAvD) {
    commande = "e";
  }
  // 3. NOUVEAU : Arrière-Gauche (S+Q)
  else if (bas && gauche) {
    commande = "q"; // 'q' dans ton Arduino est arriereGauche
  }
  // 4. NOUVEAU : Arrière-Droite (S+D)
  else if (bas && droite) {
    commande = "d"; // 'd' dans ton Arduino est arriereDroite
  }
  // 5. Mouvements simples
  else if (haut) commande = "z";
  else if (bas) commande = "s";
  else if (gauche)
    commande = "q"; // Pivot gauche simple (ou arriere selon ton code)
  else if (droite) commande = "d"; // Pivot droit simple (ou arriere selon ton code)

  // On envoie le résultat au robot
  changerEtatMouvement(commande);
}

// Quand on ENFONCE une touche
document.addEventListener("keydown", (event) => {
  if (event.repeat) return; // Ignore la répétition Windows
  const touche = event.key.toLowerCase();
  const touchesValides = [
    "z",
    "s",
    "q",
    "d",
    "a",
    "e",
    "w",
    "c",
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
  ];

  if (touchesValides.includes(touche)) {
    touchesActives.add(touche); // On ajoute la touche à notre mémoire
    evaluerTouchesClavier(); // On calcule la nouvelle trajectoire
  }
});

// Quand on RELÂCHE une touche
document.addEventListener("keyup", (event) => {
  const touche = event.key.toLowerCase();
  const touchesValides = [
    "z",
    "s",
    "q",
    "d",
    "a",
    "e",
    "w",
    "c",
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
  ];

  if (touchesValides.includes(touche)) {
    touchesActives.delete(touche); // On enlève la touche de la mémoire
    evaluerTouchesClavier(); // On recalcule ! (Si Z est encore appuyé, il repart en avant)
  }
});

// =================================================================
// --- 3. RÉCEPTION DES DONNÉES CAPTEURS ---
// =================================================================

function recevoirDonnees(event) {
  const decodeur = new TextDecoder("utf-8");
  const messageBrut = decodeur.decode(event.target.value).trim();

  // On découpe le bloc en plusieurs lignes
  const lignes = messageBrut.split("\n");

  lignes.forEach((ligne) => {
    ligne = ligne.trim();
    if (ligne === "") return;

    // --- Distance (D:) ---
    if (ligne.startsWith("D:")) {
      const distance = ligne.split(":")[1];
      const elem = document.getElementById("valeurDistance");
      if (elem) elem.innerText = distance;
    }
    // --- Mouvement (M:) ---
    else if (ligne.startsWith("M:")) {
      const mouvement = ligne.split(":")[1];
      const affichageMouvement = document.getElementById("valeurMouvement");
      if (affichageMouvement) {
        if (mouvement === "1") {
          affichageMouvement.innerText = "DÉTECTÉ ! 🚨";
          affichageMouvement.style.color = "#dc3545"; // Rouge
        } else {
          affichageMouvement.innerText = "R.A.S 🟢";
          affichageMouvement.style.color = "#28a745"; // Vert
        }
      }
    }
    // --- Température (T:) ---
    else if (ligne.startsWith("T:")) {
      const temperature = parseFloat(ligne.split(":")[1]).toFixed(1);
      const elem = document.getElementById("valeurTemperature");
      if (elem) elem.innerText = temperature;
    }
    // --- Lumière (L:) ---
    else if (ligne.startsWith("L:")) {
      const lumiere = ligne.split(":")[1];
      const elem = document.getElementById("valeurLumiere");
      if (elem) {
        elem.innerText = lumiere;

        // Changer la couleur selon l'intensité
        if (parseInt(lumiere) < 30) {
          elem.style.color = "#959595"; // Sombre
        } else {
          elem.style.color = "#ffeb3b"; // Jaune vif
        }
      }
    }
    // --- Feu (F:) ---
    else if (ligne.startsWith("F:")) {
      const feu = parseInt(ligne.split(":")[1]);
      const elemFeu = document.getElementById("valeurFeu");
      const alerte = document.getElementById("alerteFeu");

      if (elemFeu) elemFeu.innerText = feu;

      if (alerte) {
        if (feu > 700) {
          alerte.innerText = "🔥 FEU DÉTECTÉ !";
          alerte.style.color = "#ff4444";
        } else {
          alerte.innerText = "Pas de danger";
          alerte.style.color = "#28a745";
        }
      }
    }
    // --- Magnétique (G:) ---
    else if (ligne.startsWith("G:")) {
      const mag = ligne.split(":")[1];
      const alerteMag = document.getElementById("alerteMag");

      if (alerteMag) {
        if (mag === "1") {
          alerteMag.innerText = "🧲 Aimant détecté !";
          alerteMag.style.color = "#00ffff";
        } else {
          alerteMag.innerText = "Rien à signaler";
          alerteMag.style.color = "#28a745";
        }
      }
    }
  });
}

// =================================================================
// --- 4. CONTRÔLE DU SERVOMOTEUR (TÊTE) ---
// =================================================================

const sliderServo = document.getElementById("sliderServo");
const valeurAngle = document.getElementById("valeurAngle");

if (sliderServo && valeurAngle) {
  sliderServo.addEventListener("input", (event) => {
    const angle = event.target.value;
    valeurAngle.innerText = angle;
    envoyerOrdre("V" + angle);
  });
}

// Mode AUTO

let modeAuto = false;
const btnAuto = document.getElementById("btnAuto");

if (btnAuto) {
  btnAuto.addEventListener("click", () => {
    modeAuto = !modeAuto;
    if (modeAuto) {
      envoyerOrdre("W"); // Commande ON
      btnAuto.innerText = "Mode Auto : ON";
      btnAuto.classList.add("actif");
    } else {
      envoyerOrdre("w"); // Commande OFF
      btnAuto.innerText = "Mode Auto : OFF";
      btnAuto.classList.remove("actif");
    }
  });
}

function changerEtatMouvement(nouvelleCommande) {
  // --- REPRISE EN MAIN ---
  // Si on reçoit un ordre de mouvement (autre que stop 'f') alors qu'on est en auto
  if (modeAuto && nouvelleCommande !== "f") {
    modeAuto = false;
    envoyerOrdre("w"); // On envoie l'arrêt du mode auto à l'Arduino

    // Mise à jour visuelle du bouton sur le site
    if (btnAuto) {
      btnAuto.innerText = "Mode Auto : OFF";
      btnAuto.classList.remove("actif");
    }
  }

  // Envoi de l'ordre s'il est différent de l'actuel
  if (commandeEnCours !== nouvelleCommande) {
    commandeEnCours = nouvelleCommande;
    envoyerOrdre(nouvelleCommande);
  }
}
