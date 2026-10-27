# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

zen-live-folder-options =
    .label = Параметры живой папки
zen-live-folder-last-fetched =
    .label = Обновлено: { $time }
zen-live-folder-refresh =
    .label = Обновить
zen-live-folder-github-option-author-self =
    .label = Созданные мной
zen-live-folder-github-option-assigned-self =
    .label = Назначенные мне
zen-live-folder-github-option-review-requested =
    .label = Запросы на ревью
zen-live-folder-github-option-include-drafts =
    .label = Включая черновики пул-реквестов
zen-live-folder-type-rss =
    .label = RSS-лента
zen-live-folder-option-fetch-interval =
    .label = Интервал обновления
zen-live-folder-fetch-interval-mins =
    .label = { $mins ->
      [one] { $mins } минута
      [few] { $mins } минуты
      *[many] { $mins } минут
    }
zen-live-folder-fetch-interval-hours =
    .label = { $hours ->
      [one] { $hours } час
      [few] { $hours } часа
      *[many] { $hours } часов
    }
zen-live-folder-rss-option-time-range =
    .label = Период
zen-live-folder-time-range-hours =
    .label = { $hours ->
      [one] За последний { $hours } час
      [few] За последние { $hours } часа
      *[many] За последние { $hours } часов
    }
zen-live-folder-time-range-all-time =
    .label = За всё время
zen-live-folder-time-range-days =
    .label = { $days ->
      [one] За последний { $days } день
      [few] За последние { $days } дня
      *[many] За последние { $days } дней
    }
zen-live-folder-rss-option-item-limit =
    .label = Количество записей
zen-live-folder-rss-option-feed-url =
    .label = Адрес ленты
zen-live-folder-rss-prompt-feed-url = Введите адрес ленты
zen-live-folder-rss-option-item-limit-num =
    .label = Записей: { $limit }
zen-live-folder-failed-fetch =
    .label = Не удалось обновить
    .tooltiptext = Не удалось обновить. Попробуйте ещё раз.
zen-live-folder-github-no-auth =
    .label = Нет входа в GitHub
    .tooltiptext = Войдите в GitHub снова.
zen-live-folder-github-no-filter =
    .label = Фильтр не задан
    .tooltiptext = Фильтр не задан, загружать нечего.
zen-live-folder-rss-invalid-url-title = Не удалось создать живую папку
zen-live-folder-rss-invalid-url-description = Неверный адрес ленты. Проверьте его и попробуйте ещё раз
zen-live-folder-github-option-repo-filter =
    .label = Репозитории
zen-live-folder-github-option-repo =
    .label = { $repo }
zen-live-folder-github-pull-requests =
    .label = Пул-реквесты
zen-live-folder-github-issues =
    .label = Задачи
zen-live-folder-github-option-repo-list-note =
    .label = Список составлен по вашим открытым пул-реквестам.
zen-live-folders-promotion-title = Живая папка создана!
zen-live-folders-promotion-description = Здесь будут сами появляться новые записи из RSS-лент или пул-реквесты GitHub.
