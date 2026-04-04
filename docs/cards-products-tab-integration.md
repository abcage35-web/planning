# Карточки товаров: описание раздела для переноса в другой проект

## 1. Задача документа

Этот документ нужен, чтобы перенести **именно раздел "Карточки товаров"** в другой проект и в другую БД.

Ключевой момент: в текущем проекте раздел исторически построен как **legacy-страница**, которая:

- хранит собственное состояние;
- часть данных берет из Cloudflare API этого проекта;
- часть данных берет напрямую из публичных WB-источников в браузерном формате;
- часть логики является вычисляемой на клиенте;
- часть данных и логики должна быть **переназначена** в новом проекте на ваш собственный backend / API маркетплейса.

Ниже разделено:

- что является **бизнес-логикой** раздела;
- что является **текущим техническим способом получения данных**;
- что нужно **заменить при миграции**;
- что можно **оставить как поведение**, но не переносить 1:1 по реализации.

---

## 2. Что такое раздел "Карточки товаров"

Раздел показывает список WB-товаров по артикулам (`nmId`) и проверяет заполненность карточек товара.

Основная ценность раздела:

- держать список отслеживаемых товаров;
- массово обновлять карточки;
- подсвечивать проблемы контента;
- фильтровать товары по кабинетам, категориям и признакам;
- хранить историю обновлений;
- хранить снапшоты проблем во времени;
- экспортировать текущее состояние.

### Проверяемые признаки карточки

Раздел считает и показывает по каждому товару:

- наличие видео;
- наличие рекомендаций;
- наличие rich-контента;
- наличие autoplay;
- наличие тегов;
- дубль обложки;
- количество слайдов листинга;
- количество rich-слайдов;
- количество рекомендаций;
- цветовые варианты / склейки;
- остаток;
- текущую цену;
- базовую цену;
- рейтинг;
- количество отзывов;
- ошибки загрузки карточки.

### Основные пользовательские сценарии

1. Добавить артикулы в список.
2. Массово обновить все карточки или карточки из текущего фильтра.
3. Смотреть проблемные карточки через дашборд и пресеты фильтров.
4. Открывать оверлеи:
   - листинг / слайды;
   - рекомендации;
   - rich;
   - история обновлений строки.
5. Управлять кабинетами через маппинг `supplierId -> cabinet`.
6. Хранить текущее состояние между сессиями и между пользователями.
7. Экспортировать таблицу.

---

## 3. Где это находится в текущем проекте

### Текущий вход в раздел

- React-страница-обертка: `src/app/pages/CardsPage.tsx`
- legacy shell: `cards/legacy-shell.html`
- orchestration legacy-приложения: `cards/app.js`

Важно: **текущая React-страница не реализует раздел нативно**. Она просто встраивает legacy-страницу через `LegacyPageHost`.

Это значит:

- для переноса в другой проект **не нужно копировать способ embed/host**;
- переносить надо **функционал раздела**, а не legacy-shell как обязательную форму исполнения.

---

## 4. Текущая архитектура раздела

### 4.1. Frontend-слой

Legacy-страница разбита на сервисы:

- `cards/services/wb-card-loader.service.js`
  - загрузка карточки;
  - сбор payload по товару;
  - обновление строк;
  - лог изменений строки;
  - basket-host resolution;
  - дубль обложки.

- `cards/services/wb-market.service.js`
  - получение market snapshot через backend `/api/wb-market`;
  - stock / price / rating / reviews.

- `cards/services/ui-table.service.js`
  - таблица;
  - пагинация;
  - сортировки;
  - фильтрация.

- `cards/services/ui-dashboard.service.js`
  - дашборд проблем;
  - breakdown по кабинетам;
  - пресеты фильтров.

- `cards/services/ui-problems.service.js`
  - summary;
  - problem stats;
  - snapshots проблем.

- `cards/services/ui-overlays.service.js`
  - модалки и оверлеи;
  - row history;
  - preview / rich / recommendations.

- `cards/services/ui-controls-filters.service.js`
  - глобальные фильтры;
  - фильтры колонок;
  - chip-фильтры кабинетов и категорий.

- `cards/services/cloud-state.service.js`
  - синхронизация состояния с `/api/state`;
  - GET / PATCH / fallback PUT;
  - экспорт через `/api/state-export`.

- `cards/services/app-controls.service.js`
  - bulk actions;
  - seller settings;
  - shadow scheduled update;
  - handlers кнопок и форм.

- `cards/services/parser-utils.service.js`
  - парсинг bulk input;
  - извлечение `nmId`;
  - парсинг recommendation refs и rich payload.

### 4.2. Backend-слой

Используются Cloudflare Functions:

- `functions/api/state.js`
- `functions/api/state-export.js`
- `functions/api/row-history.js`
- `functions/api/wb-market.js`
- `functions/api/auth/login.js`
- `functions/api/auth/me.js`
- `functions/api/auth/logout.js`

Хранилище состояния: **Cloudflare D1** через `functions/api/_lib/state-store.js`.

---

## 5. Что является моделью данных раздела

## 5.1. Основная сущность: строка товара

В текущем разделе основная сущность — это строка списка отслеживаемых товаров.

Минимальный набор полей строки:

- `id` — внутренний row id;
- `nmId` — артикул WB;
- `cabinet` — кабинет;
- `supplierId` — seller / supplier id;
- `stockValue`
- `inStock`
- `stockSource`
- `currentPrice`
- `basePrice`
- `priceSource`
- `error`
- `updatedAt`
- `updateLogs[]`
- `data` — расширенный payload карточки.

### 5.2. Расширенный payload `row.data`

По текущей реализации в `fetchCardPayload()` и `normalizeRowData()` раздел рассчитывает и хранит:

- `supplierId`
- `cardCode`
- `link`
- `name`
- `category`
- `brand`
- `hasVideo`
- `hasSellerRecommendations`
- `recommendationRefs`
- `recommendationRefsFromRich`
- `recommendationRefsFromApi`
- `recommendationKnownCount`
- `recommendationResolvedRefs`
- `recommendationDetails`
- `recommendationDetailsError`
- `recommendationsResolvedAt`
- `hasRich`
- `richBlockCount`
- `richDetails`
- `hasAutoplay`
- `hasTags`
- `coverSlideDuplicate`
- `cardExists`
- `colorNmIds`
- `colorCount`
- `slides`
- `photoCount`
- `cardUpdatedAt`
- `stockValue`
- `inStock`
- `stockSource`
- `currentPrice`
- `basePrice`
- `priceSource`
- `rating`
- `reviewCount`
- `marketError`

### 5.3. Что реально важно сохранить при миграции

Не обязательно сохранять ту же JS-структуру буквально, но в новом проекте нужно сохранить **тот же смысл данных**:

1. Идентификатор товара.
2. Состояние карточки на момент последнего обновления.
3. Источник/качество market-данных.
4. Вычисляемые признаки проблем.
5. Историю изменений по строке.
6. Историю агрегированных snapshots проблем.

---

## 6. Откуда сейчас берутся данные

Это самый важный раздел для переназначения на новый backend.

## 6.1. Источник A: `/api/wb-market`

Файл: `functions/api/wb-market.js`

Текущий источник внутри backend:

- `https://card.wb.ru/cards/v4/detail`

Что вытягивается:

- `cardExists`
- `stockValue`
- `inStock`
- `currentPrice`
- `basePrice`
- `rating`
- `reviewCount`

Что делает backend:

- сам ходит в `card.wb.ru`;
- нормализует ответ;
- возвращает единый `snapshot`.

### Что важно для миграции

Если в новом проекте есть собственный marketplace API, то этот слой **почти наверняка надо заменить полностью**.

Новый backend должен отдавать тот же смысл:

- факт существования карточки;
- остаток;
- наличие в наличии;
- цену со скидкой;
- базовую цену;
- рейтинг;
- отзывы.

Текущая реализация через `card.wb.ru` нужна только потому, что проект не имел более надежного server-side источника.

---

## 6.2. Источник B: public WB basket-host + `card.json`

Файл: `cards/services/wb-card-loader.service.js`

Текущая схема:

1. По `nmId` вычисляются `vol` и `part`.
2. Определяется `basket-host` через HEAD probe по URL превью:
   - `https://basket-XX.wbbasket.ru/vol{vol}/part{part}/{nmId}/images/c246x328/1.webp`
3. После нахождения host читается:
   - `.../info/ru/card.json`

Из `card.json` берутся:

- `supplierId`
- `cardCode`
- `name`
- `category`
- `brand`
- `hasVideo`
- `hasSellerRecommendations`
- `hasRich`
- `hasAutoplay`
- `hasTags`
- `full_colors / colors`
- `photo_count`
- `slides[]`
- `cardUpdatedAt`

### Что важно для миграции

Это **типичный browser/public-source слой**, который и нужно заменить в новом проекте.

Если новый проект имеет marketplace API с полноценным товарным payload, то:

- `basket-host resolution` больше не нужен;
- `card.json` больше не нужен;
- `slides`, `supplierId`, `vendorCode`, `media flags`, `colors`, `product name`, `brand`, `category` должны браться из нового backend API.

Иными словами, в новом проекте должен появиться единый серверный контракт вроде:

`GET /product-card/{nmId}`

или batch-вариант:

`POST /product-cards/batch`

который возвращает уже нормализованный payload вместо прямого чтения WB browser endpoints.

---

## 6.3. Источник C: public WB basket-host + `rich.json`

Файл: `cards/services/wb-card-loader.service.js`

Если карточка содержит rich или seller recommendations, текущая реализация читает:

- `.../info/ru/rich.json`

Из него извлекаются:

- `richBlockCount`
- `richDetails`
- `recommendationRefs`
- ссылки и media внутри rich

### Что важно для миграции

Это тоже **browser-format источник**, который должен быть переназначен.

Если новый проект имеет доступ к:

- полному rich payload;
- связям рекомендаций;
- media-блокам;

то parsing `rich.json` на клиенте нужно убрать и заменить на серверное поле в контракте продукта.

---

## 6.4. Источник D: seller settings (ручной mapping)

Файлы:

- `cards/app.js`
- `cards/services/app-controls.service.js`

Сейчас кабинет товара определяется через mapping:

- `supplierId -> cabinet`

Этот mapping хранится в state и имеет дефолты:

- `233776 -> Паша 1`
- `372556 -> Стас 1`
- `250027557 -> Паша 2`
- `250067050 -> Стас 2`

Пользователь может:

- добавлять seller;
- удалять seller;
- сбрасывать к дефолту.

### Что важно для миграции

В новом проекте это можно реализовать одним из 3 способов:

1. Оставить как есть: отдельный пользовательский mapping.
2. Перенести в справочник кабинетов в БД.
3. Вообще убрать ручной mapping, если кабинет уже приходит из вашего backend / seller API.

Если кабинет уже можно получить автоматически, это лучше сделать на backend и не держать manual mapping в UI.

---

## 6.5. Источник E: локальные и вычисляемые данные

Сейчас часть данных не приходит снаружи, а вычисляется в приложении:

- `coverSlideDuplicate`
- `recommendationKnownCount`
- `colorCount`
- `problemStats`
- `problem snapshots`
- `row change logs`
- usage/over-limit по autoplay и tags

Эта логика может:

- остаться на frontend;
- или быть перенесена в backend.

Для нового проекта обычно лучше разделить:

- **сырые факты** получает backend,
- **агрегаты и вердикты** может считать frontend,
- либо backend, если нужен единый доменный слой.

---

## 7. Что сейчас записывается в БД

Текущая БД — это не классическая продуктовая модель, а **state store / event store** для дашборда.

Файл: `functions/api/_lib/state-store.js`

### Таблицы

#### `dashboard_state`

Legacy-хранилище полного JSON payload.

Нужно в основном для обратной совместимости.

#### `dashboard_state_meta`

Метаданные состояния.

Хранит:

- `state_key`
- `meta_json`
- `saved_at`
- `updated_at`
- actor metadata

#### `dashboard_rows_current`

Главная таблица текущего состояния строк.

Хранит нормализованные поля строки:

- `row_id`
- `sort_index`
- `nm_id`
- `cabinet`
- `supplier_id`
- `stock_value`
- `in_stock`
- `stock_source`
- `current_price`
- `base_price`
- `price_source`
- `error`
- `updated_at`
- `card_code`
- `product_name`
- `category_name`
- `brand_name`
- `has_video`
- `has_recommendations`
- `has_rich`
- `rich_block_count`
- `has_autoplay`
- `has_tags`
- `cover_duplicate`
- `listing_slides_count`
- `rich_slides_count`
- `recommendation_known_count`
- `recommendation_refs_json`
- `color_count`
- `color_nm_ids_json`
- `rating`
- `review_count`
- `market_error`
- `row_data_json`
- `row_payload_json`
- `row_hash`
- `last_saved_at`
- кто сохранил

#### `dashboard_row_versions`

История версий строки.

Нужна для аудита и восстановления истории состояний.

#### `dashboard_row_logs`

История событий обновления строки.

Содержит:

- время;
- источник (`manual/system`);
- режим (`full/content-only`);
- `action_key`;
- статус (`success/error`);
- текст ошибки;
- `changes_json`;
- actor metadata.

Именно отсюда строится **row history modal**.

#### `dashboard_problem_snapshots`

История агрегированных snapshots проблем.

Содержит:

- `total_rows`
- `loaded_rows`
- `error_rows`
- `problems_json`
- `cabinets_json`
- источник / режим / action key

Используется для графиков и динамики проблем.

#### `dashboard_article_registry`

Реестр увиденных артикулов.

Нужен как побочный registry-слой.

#### `dashboard_save_events`

Журнал сохранений состояния.

Содержит:

- сколько строк изменилось;
- сколько удалилось;
- сколько логов upsert;
- размер payload;
- кто сохранил.

---

## 8. Как работает запись состояния

## 8.1. Local state

Legacy UI хранит полное состояние в `localStorage`:

- ключ: `wb-dashboard-v2`

Там лежат:

- rows;
- filters;
- limits;
- seller settings;
- color variant cache;
- update snapshots;
- прочее UI state.

## 8.2. Cloud state

При авторизации состояние синхронизируется в backend через:

- `GET /api/state`
- `PATCH /api/state`
- fallback `PUT /api/state`

Важно:

- в cloud sync гоняется не весь шумный UI state;
- PATCH синхронизирует дельту по строкам + meta + последний problem snapshot;
- это сделано специально, чтобы уменьшить количество лишних записей.

### Ограничения по ролям

Сейчас backend запрещает обычным пользователям:

- добавлять строки;
- удалять строки.

Это разрешено только `admin`.

Также есть защита от массового удаления.

---

## 9. Как работает обновление карточек

## 9.1. Ручное обновление

Пользователь:

- добавляет список артикулов;
- жмет `Обновить`;
- приложение проходит по строкам;
- для каждой строки выполняется загрузка карточки;
- пересчитываются problem stats;
- сохраняются row logs;
- сохраняется state;
- записывается новый problem snapshot.

## 9.2. Фоновое плановое обновление

Есть shadow scheduler в `app-controls.service.js`.

Особенности:

- запускается по слотам MSK (`00:00` и `12:00`);
- использует localStorage lock между вкладками;
- обновляет копию rows;
- после завершения пытается сохранить в cloud state;
- если cloud недоступен, сохраняет shadow payload локально.

Для новой системы это поведение можно:

- либо сохранить;
- либо заменить нормальным cron/job на backend.

Если у нового проекта есть полноценный backend, **лучше вынести плановое обновление с клиента на сервер**.

---

## 10. Бизнес-правила, которые важно не потерять

При переносе важно сохранить не конкретный код, а эти правила:

1. Раздел работает со списком отслеживаемых товаров, а не с произвольным поиском на лету.
2. У каждого товара есть текущее состояние + история обновлений.
3. Есть distinction между:
   - ошибкой загрузки;
   - отсутствием данных;
   - негативным признаком карточки.
4. Дашборд проблем строится по вычисляемым признакам.
5. Кабинет является важной осью группировки.
6. Нужно хранить snapshots проблем во времени.
7. Нужно хранить audit trail изменений строки.
8. Добавление/удаление товаров должно быть permission-based.

---

## 11. Что нужно заменить в новом проекте

Это самая важная секция для другой нейронки.

## 11.1. Нужно заменить полностью

### A. Источники данных карточки из browser/public WB

Сейчас используются:

- `card.wb.ru/cards/v4/detail`
- `basket-XX.wbbasket.ru/.../card.json`
- `basket-XX.wbbasket.ru/.../rich.json`
- basket-host probing

В новом проекте это надо заменить на **ваш backend**, который берет данные из:

- официального marketplace API;
- внутреннего API проекта;
- собственной product DB;
- media/content API;
- stock/price API.

### B. Клиентский scheduler

Текущий shadow scheduler нужен, потому что проект legacy и не имеет серверного job layer.

Если в новом проекте есть backend, лучше заменить на:

- cron / scheduled job;
- queue worker;
- background refresh service.

### C. Seller settings как UI-only mapping

Если кабинет можно определить из backend, переводите mapping в серверный справочник.

---

## 11.2. Можно сохранить как бизнес-логику

- problem dashboard;
- фильтрацию;
- concept row history;
- snapshots проблем;
- экспорт;
- разделение `current rows` / `history logs` / `problem snapshots`;
- limits по autoplay и tags;
- distinction между manual update и scheduled update.

---

## 12. Рекомендуемый новый серверный контракт

Для нового проекта лучше не пытаться воспроизвести старые источники 1:1.

Лучше собрать **один нормализованный backend contract**.

### Вариант API для чтения карточки

#### `POST /api/product-cards/batch`

Вход:

```json
{
  "nmIds": ["12345678", "23456789"],
  "includeHistory": false
}
```

Выход:

```json
{
  "items": [
    {
      "nmId": "12345678",
      "exists": true,
      "supplierId": "233776",
      "cabinet": "Паша 1",
      "vendorCode": "ABC-123",
      "name": "Название",
      "category": "Категория",
      "brand": "Бренд",
      "listingSlides": ["..."],
      "photoCount": 8,
      "hasVideo": true,
      "hasRecommendations": false,
      "recommendationRefs": ["..."],
      "hasRich": true,
      "richBlockCount": 4,
      "richMedia": ["..."],
      "hasAutoplay": false,
      "hasTags": true,
      "coverDuplicate": false,
      "colorNmIds": ["..."],
      "stockValue": 34,
      "inStock": true,
      "currentPrice": 1599,
      "basePrice": 2499,
      "rating": 4.8,
      "reviewCount": 214,
      "updatedAt": "2026-04-04T10:00:00.000Z",
      "sourceMeta": {
        "content": "marketplace-api",
        "stock": "marketplace-api",
        "price": "marketplace-api"
      }
    }
  ]
}
```

Такой контракт позволит выкинуть:

- `basket-host resolution`
- прямые запросы с клиента к WB
- `rich.json` parsing на клиенте
- `card.v4` parsing на клиенте / в edge backend

---

## 13. Рекомендуемая новая схема БД

Если перенос идет в другой проект, не обязательно копировать D1-таблицы 1:1.

Но логически надо иметь минимум 4 слоя:

### 1. `tracked_products`

Текущий список отслеживаемых товаров.

Минимум:

- `id`
- `nm_id`
- `cabinet_id` или `cabinet_name`
- `supplier_id`
- `is_active`
- `sort_index`
- `created_at`
- `updated_at`

### 2. `tracked_product_state_current`

Последнее состояние карточки.

Минимум:

- `tracked_product_id`
- `exists`
- `vendor_code`
- `name`
- `category`
- `brand`
- `has_video`
- `has_recommendations`
- `recommendation_known_count`
- `has_rich`
- `rich_block_count`
- `has_autoplay`
- `has_tags`
- `cover_duplicate`
- `listing_slides_count`
- `rich_slides_count`
- `color_count`
- `stock_value`
- `in_stock`
- `current_price`
- `base_price`
- `rating`
- `review_count`
- `error`
- `payload_json`
- `updated_at`

### 3. `tracked_product_update_logs`

История событий обновления и diff.

Минимум:

- `tracked_product_id`
- `at`
- `source`
- `mode`
- `action_key`
- `status`
- `error`
- `changes_json`
- `actor_id`

### 4. `product_problem_snapshots`

Агрегированные snapshots по времени.

Минимум:

- `at`
- `source`
- `mode`
- `action_key`
- `total_rows`
- `loaded_rows`
- `error_rows`
- `problems_json`
- `group_breakdown_json`

### Дополнительно

- `seller_cabinet_mapping`
- `dashboard_state_meta`
- `exports`

---

## 14. На что другой проект должен обратить особое внимание

### 14.1. Не переносить legacy-embed как обязательную архитектуру

Текущий `/cards` в React просто хостит legacy shell.

Для нового проекта правильнее сделать:

- нативную страницу;
- нативные компоненты;
- backend-driven data layer.

### 14.2. Не переносить browser scraping, если есть нормальный API

Если новый проект умеет получать:

- контент карточки;
- media;
- rich;
- рекомендации;
- остатки;
- цены;
- рейтинги;
- отзывы;

то старые public-source точки надо считать **временной реализацией**, а не частью доменной модели.

### 14.3. Не смешивать UI-state и доменные данные

В текущем проекте это исторически смешано в одном state payload.

В новом проекте лучше разделить:

- доменные данные карточек;
- пользовательские фильтры;
- служебные кэши;
- логи и snapshots.

---

## 15. Минимальный объем, который нужно перенести "прямо сейчас"

Если переносим **пока только раздел "Карточки товаров"**, то нужно реализовать:

1. Список отслеживаемых товаров.
2. Добавление / удаление артикулов.
3. Массовое обновление карточек.
4. Расчет признаков:
   - видео
   - рекомендации
   - rich
   - autoplay
   - теги
   - дубль обложки
   - stock / price / rating / reviews
5. Фильтры:
   - quick search
   - кабинет
   - категория
   - column filters
   - presets проблем
6. Дашборд проблем.
7. История обновлений строки.
8. Хранение current state + history + problem snapshots.
9. Экспорт.

Что можно отложить на второй этап:

- legacy-style scheduled client update;
- локальные browser-specific fallback-источники;
- часть декоративных overlay-деталей;
- сложные local caches, если backend будет полноценным.

---

## 16. Что нужно передать другой нейронке

Ниже список того, что нужно дать другой модели, чтобы она могла перенести именно раздел `Карточки товаров`.

### Обязательно передать

1. Этот файл:
   - `docs/cards-products-tab-integration.md`

2. Список текущих файлов раздела:
   - `src/app/pages/CardsPage.tsx`
   - `cards/legacy-shell.html`
   - `cards/app.js`
   - `cards/services/wb-card-loader.service.js`
   - `cards/services/wb-market.service.js`
   - `cards/services/ui-table.service.js`
   - `cards/services/ui-dashboard.service.js`
   - `cards/services/ui-problems.service.js`
   - `cards/services/ui-overlays.service.js`
   - `cards/services/ui-controls-filters.service.js`
   - `cards/services/cloud-state.service.js`
   - `cards/services/app-controls.service.js`
   - `cards/services/parser-utils.service.js`

3. Backend-файлы:
   - `functions/api/state.js`
   - `functions/api/state-export.js`
   - `functions/api/row-history.js`
   - `functions/api/wb-market.js`
   - `functions/api/_lib/state-store.js`

4. Описание нового backend / новой БД:
   - какие таблицы уже есть;
   - какие сущности уже есть;
   - есть ли tracked products;
   - есть ли product snapshots;
   - есть ли update logs / audit trail;
   - есть ли job scheduler.

5. Контракты нового marketplace API:
   - откуда брать остатки;
   - откуда брать цены;
   - откуда брать рейтинг и отзывы;
   - откуда брать rich / media / рекомендации / seller / colors;
   - есть ли batch endpoints;
   - есть ли кабинет / supplier mapping.

### Очень желательно передать

6. Примеры реальных ответов нового API:
   - 1 товар с полным контентом;
   - 1 товар без rich;
   - 1 товар без рекомендаций;
   - 1 товар без видео;
   - 1 товар с нулевым остатком;
   - 1 несуществующий товар.

7. Решение по источнику кабинета:
   - кабинет берется из backend;
   - или сохраняется ручной mapping;
   - или нужен гибрид.

8. Решение по истории:
   - сохраняем полную row-history;
   - или только last state;
   - или last state + snapshots.

9. Решение по расписанию:
   - нужен ли фоновой refresh;
   - где он будет жить: frontend / cron / worker.

### Формулировка для другой нейронки

Можно передать ей такой prompt:

> Нужно перенести в новый проект только раздел "Карточки товаров". Текущая реализация описана в приложенном markdown и файлах legacy-раздела. Не нужно копировать browser-based источники данных 1:1: в новом проекте большая часть данных должна идти из нашего backend / marketplace API. Сохрани бизнес-логику раздела: tracked products, bulk refresh, problem dashboard, filters, row history, problem snapshots, export. Построй новый backend contract и новую схему хранения под текущий функционал. Отдельно покажи, какие поля старой модели чем заменяются в новом проекте.

---

## 17. Краткий вывод

Текущий раздел `Карточки товаров` состоит из двух слоев:

1. **Правильный доменный слой**, который нужно сохранить:
   - tracked products
   - card completeness checks
   - dashboard
   - history
   - snapshots
   - export

2. **Временный технический слой получения данных**, который нужно заменить:
   - `card.wb.ru`
   - `basket-XX.wbbasket.ru`
   - `rich.json`
   - basket-host probing
   - часть legacy client-side scheduling

Для нового проекта цель должна быть такой:

- сохранить поведение раздела;
- убрать browser-format зависимости;
- перевести получение данных в единый backend contract;
- хранить состояние не как legacy payload, а как нормальную доменную модель.
