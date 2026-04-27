// On ajoute un numéro de version.
// À chaque grosse mise à jour de ton site, passe à v3, v4, etc.
const CACHE_NAME = "MiraBot-v2";
const assets = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
];

// 1. INSTALLATION : On met les fichiers en cache
self.addEventListener("install", (event) => {
  self.skipWaiting(); // Force le nouveau Service Worker à s'installer immédiatement
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Mise en cache des ressources");
      return cache.addAll(assets);
    }),
  );
});

// 2. ACTIVATION : On nettoie les anciens caches (ex: suppression de MiraBot-v1)
self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim()); // Force le contrôle immédiat de la page
  event.waitUntil(
    caches.keys().then((nomsDesCaches) => {
      return Promise.all(
        nomsDesCaches.map((nom) => {
          // Si le nom du cache ne correspond pas à la version actuelle, on le supprime
          if (nom !== CACHE_NAME) {
            console.log("Nettoyage de l'ancien cache :", nom);
            return caches.delete(nom);
          }
        }),
      );
    }),
  );
});

// 3. FETCH : Stratégie "Stale-While-Revalidate"
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((reponseEnCache) => {
      // On lance la requête réseau en arrière-plan pour chercher une éventuelle nouvelle version
      const requeteReseau = fetch(event.request)
        .then((reponseReseau) => {
          // On met à jour le cache avec la version fraîchement téléchargée
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, reponseReseau.clone());
          });
          return reponseReseau;
        })
        .catch(() => {
          // Si on est complètement hors ligne, on ignore l'erreur
          console.log("Mode hors-ligne, utilisation du cache exclusif.");
        });

      // MAGIE : On retourne IMMÉDIATEMENT le cache s'il existe (chargement instantané)
      // Sinon, on attend la réponse du réseau
      return reponseEnCache || requeteReseau;
    }),
  );
});
