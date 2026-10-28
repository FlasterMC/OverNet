# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

zen-live-folder-options =
    .label = Options du dossier dynamique
zen-live-folder-last-fetched =
    .label = Dernière mise à jour : { $time }
zen-live-folder-refresh =
    .label = Actualiser
zen-live-folder-github-option-author-self =
    .label = Créées par moi
zen-live-folder-github-option-assigned-self =
    .label = Qui me sont assignées
zen-live-folder-github-option-review-requested =
    .label = Demandes de revue
zen-live-folder-github-option-include-drafts =
    .label = Inclure les pull requests en brouillon
zen-live-folder-type-rss =
    .label = Flux RSS
zen-live-folder-option-fetch-interval =
    .label = Intervalle de mise à jour
zen-live-folder-fetch-interval-mins =
    .label = { $mins ->
            [one] 1 minute
            *[other] { $mins } minutes
        }
zen-live-folder-fetch-interval-hours =
    .label = { $hours ->
            [one] 1 heure
            *[other] { $hours } heures
        }
zen-live-folder-rss-option-time-range =
    .label = Période
zen-live-folder-time-range-hours =
    .label = { $hours ->
            [one] Dernière heure
            *[other] { $hours } dernières heures
        }
zen-live-folder-time-range-all-time =
    .label = Depuis toujours
zen-live-folder-time-range-days =
    .label = { $days ->
            [one] Dernier jour
            *[other] { $days } derniers jours
        }
zen-live-folder-rss-option-item-limit =
    .label = Nombre d’éléments
zen-live-folder-rss-option-feed-url =
    .label = URL du flux
zen-live-folder-rss-prompt-feed-url = Veuillez saisir l’URL du flux
zen-live-folder-rss-option-item-limit-num =
    .label = { $limit } éléments
zen-live-folder-failed-fetch =
    .label = Échec de la mise à jour
    .tooltiptext = Échec de la mise à jour. Réessayez.
zen-live-folder-github-no-auth =
    .label = Non connecté à GitHub
    .tooltiptext = Reconnectez-vous à GitHub.
zen-live-folder-github-no-filter =
    .label = Aucun filtre défini
    .tooltiptext = Aucun filtre défini, rien ne sera récupéré.
zen-live-folder-rss-invalid-url-title = Impossible de créer le dossier dynamique
zen-live-folder-rss-invalid-url-description = L’URL du flux n’est pas valide. Vérifiez l’adresse et réessayez
zen-live-folder-github-option-repo-filter =
    .label = Dépôts
zen-live-folder-github-pull-requests =
    .label = Pull requests
zen-live-folder-github-issues =
    .label = Tickets
zen-live-folder-github-option-repo-list-note =
    .label = Cette liste est générée à partir de vos pull requests actuellement ouvertes.
zen-live-folders-promotion-title = Dossier dynamique créé !
zen-live-folders-promotion-description = Les derniers contenus de vos flux RSS ou de vos pull requests GitHub apparaîtront ici automatiquement.
zen-live-folder-github-option-repo =
    .label = { $repo }
