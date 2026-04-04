# AB-тесты XWAY: описание раздела для переноса в другой проект

## 1. Назначение документа

Этот документ нужен, чтобы перенести **именно раздел `AB-тесты XWAY`** в другой проект и в другую БД.

Ключевой момент: текущий раздел построен как смесь:

- live-данных из XWAY;
- legacy-данных из Google Sheets;
- вычисляемой клиентской логики;
- временного in-memory кэша в React.

В новом проекте это не нужно переносить 1:1 по реализации. Нужно перенести:

- предметную модель;
- пользовательский функционал;
- правила расчета;
- семантику дат и окон `до / во время / после`;
- логику успеха теста;
- агрегаты для воронки, карточек, товаров и блока `Лучшие`.

При этом **технические источники данных должны быть переопределены** под новый backend / API маркетплейса / рекламных кабинетов.

---

## 2. Что такое раздел `AB-тесты XWAY`

Это отдельная аналитическая страница по тестам обложек.

Раздел показывает:

- список AB-тестов;
- успех/неуспех по воронке;
- детализацию по обложкам теста;
- рекламные метрики по окнам `до / во время / после`;
- группировку по товарам;
- сводку `Лучшие`;
- текущие снимки товара из XWAY.

### Основные сущности раздела

1. **AB-тест**
   - тест обложек по одному товару;
   - имеет период активности;
   - содержит варианты обложек и их метрики;
   - связан с рекламной кампанией / типом кампании.

2. **RK-окна**
   - `До` = день до начала AB-теста;
   - `Во время` = период активности AB-теста;
   - `После` = день после окончания AB-теста, если этот день уже наступил.

3. **Товар**
   - нужен для группировки тестов;
   - дополнительно тянется текущий снапшот: обложка, остаток, наличие в наличии.

4. **Лучшие тесты**
   - подмножество завершенных успешных тестов;
   - сортировка по **приросту `CTR*CR1`**, а не по абсолютному значению.

---

## 3. Где это находится в текущем проекте

### Основная страница

- `src/app/pages/XwayAbTestsPage.tsx`

### Основные frontend-компоненты

- `src/app/components/xway-dashboard-service.ts`
- `src/app/components/ab-service.ts`
- `src/app/components/FilterToolbar.tsx`
- `src/app/components/XwayFunnelDashboard.tsx`
- `src/app/components/TestCard.tsx`
- `src/app/components/ProductsTable.tsx`
- `src/app/components/ProductGroupsWithTests.tsx`
- `src/app/components/BestTestsSection.tsx`

### Backend / API

- `functions/api/xway-ab-tests.js`
- `functions/api/xway-ab-test.js`
- `functions/api/xway-product-snapshots.js`
- `functions/api/_lib/xway-client.js`

### Что важно понимать

Раздел `AB-тесты XWAY`:

- **не хранит свои доменные данные в D1**;
- получает live-данные по запросу;
- на клиенте обогащает модель по мере загрузки;
- хранит промежуточное состояние только в React state и in-memory cache.

То есть это сейчас **read-through аналитический экран**, а не самостоятельный stateful модуль с записью результатов в БД.

---

## 4. Что умеет раздел

## 4.1. Верхний дашборд

Пользователь видит:

- заголовок раздела;
- время последней загрузки списка;
- кнопку `Обновить данные`.

`Обновить данные` заново грузит список тестов XWAY и сбрасывает локальный кэш детализации.

---

## 4.2. Фильтры

Используется `FilterToolbar`.

Поддерживаются фильтры:

- поиск;
- кабинет;
- исход теста;
- диапазон дат;
- выбор одного или нескольких месяцев;
- лимит количества карточек;
- view mode:
  - `tests`
  - `products`
  - `both`
  - `best`

На странице `AB-тесты XWAY` фильтрация идет по модели `XWAY`, а не по legacy export.

---

## 4.3. Воронка

Компонент:

- `src/app/components/XwayFunnelDashboard.tsx`

Показывает сводку успешности по этапам:

- `CTR`
- `Цена`
- `CTR x CR1`
- `Итог`

Особенности:

- есть агрегат `Все кабинеты`;
- есть группировка:
  - `По ИП`
  - `По кабинетам`
- есть два режима визуализации:
  - круговые графики;
  - полосы;
- клик по этапу фильтрует тесты так же, как основной фильтр страницы.

Текущий дефолт:

- группировка `По ИП`;
- стиль `Графики`.

### Группировка по ИП

Сейчас реализованы две группы:

- `ИП Паша` = `ИП Карпачев П. А.` + `Качественные товары`
- `ИП Стас` = `Качественные товары abcAge` + `ИП Сытин С. О.`

Это фронтовая бизнес-логика, не источник данных.

---

## 4.4. Список тестов

Каждый тест рендерится через `TestCard`.

В карточке теста есть:

- основная информация о тесте;
- реальные даты активности AB-теста;
- блок метрик теста по обложкам;
- блок RK-метрик `до / во время / после`;
- статус XWAY-загрузки;
- ручное обновление одного теста;
- переходы в XWAY / WB.

---

## 4.5. Группировка по товарам

Есть два режима:

- таблица товаров;
- grouped view: товар + вложенные тесты.

Для товара подтягиваются текущие live-снапшоты:

- актуальная главная обложка;
- stock value;
- in stock.

Это не часть AB-теста, а отдельный live product snapshot.

---

## 4.6. Раздел `Лучшие`

Компонент:

- `src/app/components/BestTestsSection.tsx`

Логика:

- берутся только **завершенные** тесты;
- берутся только **успешные по воронке чистых тестов**;
- сортировка идет по **приросту `CTR*CR1`**;
- рейтинг `#1, #2, ...` пересчитывается динамически по текущему visible pool.

Поддерживается:

- `Полный / Сжатый` режим;
- локальное скрытие карточек;
- pool mode:
  - `Выбранные`
  - `Скрытые`
  - `Все`
- сброс скрытых.

Важно:

- скрытие в `Лучших` сейчас **не сохраняется в БД**;
- это локальный UI-state внутри компонента.

### Семантика дат в `Лучших`

Это важно сохранить при переносе:

- строка под названием теста показывает **реальный период активности AB-теста**;
- плашки `До` / `После` показывают **RK-окна**, а не период AB-теста.

То есть в одном и том же фрейме живут **две разные логики дат**:

1. период самого AB-теста;
2. периоды рекламного сравнения.

---

## 5. Текущий data flow

## 5.1. Загрузка базового списка

Стартовая точка:

- `loadXwayDashboardData()` в `src/app/components/xway-dashboard-service.ts`

Что происходит:

1. frontend вызывает `/api/xway-ab-tests`
2. параллельно вызывает `loadAbDashboardData()`
3. из XWAY берет live-список тестов
4. из legacy Google Sheets берет price-related fallback и старую расчетную модель
5. строит базовый `XwayDashboardModel`

### Что приходит из `/api/xway-ab-tests`

Сервер получает:

- список тестов из XWAY;
- набор main-image по товарам.

На клиенте из этого строится **базовая карточка теста**, но без полного detail-патча.

---

## 5.2. Догрузка detail по каждому тесту

После загрузки списка клиент **не считает страницу готовой**.

Дальше для текущей отфильтрованной выборки идет массовая догрузка:

- `hydrateXwayForTests(filteredTests, { force: true, reset: true })`

Эта логика находится в:

- `src/app/pages/XwayAbTestsPage.tsx`

Что она делает:

- строит request meta по каждому тесту;
- бьет запросы в `/api/xway-ab-test`;
- держит in-memory cache по request key;
- ограничивает параллелизм до 3 запросов;
- патчит каждый тест в модель по мере ответа;
- показывает per-test статус `loading / ready / error`.

### Что это значит для миграции

Текущий UI использует модель в два этапа:

1. сначала базовый список;
2. потом detail enrichment.

В новом проекте это можно оставить, но технически лучше сделать проще:

- либо сервер сразу отдает уже собранный normalized test list;
- либо дать отдельный batch endpoint, который возвращает detail сразу по пачке test ids.

С текущим N+1-паттерном переносить один-в-один не обязательно.

---

## 5.3. Догрузка product snapshots

Если активен режим товаров, клиент дополнительно вызывает:

- `/api/xway-product-snapshots`

Это батч endpoint, куда уходит список:

- `shopId:productId:article`

Сервер возвращает:

- актуальную главную картинку товара;
- остаток;
- inStock.

Это обновляет только product-level отображение.

---

## 6. Источники данных в текущей реализации

Этот раздел критичен для миграции.

Ниже описано не только **что** используется, но и **зачем** это важно.

---

## 6.1. Источник A: XWAY список тестов

Файл:

- `functions/api/xway-ab-tests.js`

Внутренние вызовы:

- `GET /api/ab-test/ab-tests-list`
- `GET /api/ab-test/product/main-image`

Что из этого берется:

- id теста;
- название теста;
- product name;
- article;
- cabinet / shop name;
- type;
- status / launchStatus;
- startedAt / finishedAt;
- progress;
- views;
- cpm;
- estimated expense;
- число картинок;
- shopId;
- productId;
- imageUrls.

### Зачем это важно

Это текущий источник **списка AB-тестов**.

Если в новом проекте у вас есть собственный backend / marketplace API:

- этот слой надо заменить;
- но сохранить тот же смысл полей;
- желательно сразу отдавать нормализованный список тестов без зависимости от браузерной XWAY-сессии.

---

## 6.2. Источник B: XWAY detail одного теста

Файл:

- `functions/api/xway-ab-test.js`

Внутренние вызовы:

- `GET /api/ab-test/main-image/{testId}/path-info`
- `GET /api/ab-test/main-image/{testId}/info`
- `GET /api/adv/shop/{shopId}/product/{productId}/info`
- `GET /api/adv/shop/{shopId}/product/{productId}/stata?...`
- `GET /api/adv/shop/{shopId}/product/{productId}/campaign/{campaignId}/bid-history`

### Что именно считается здесь

#### 1. Реальный период AB-теста

Из `testInfo`:

- `test.startedAt`
- `test.endedAt`

Это используется для:

- текста периода активности AB-теста;
- вычисления окон RK.

#### 2. Варианты обложек

Из `testInfo.images_stats` и `testInfo.images`.

На их основе строятся:

- variant cards;
- baseline variant;
- best variant;
- CTR вариантов;
- статус variant;
- installedAt;
- ctr boost.

#### 3. RK-окна

Считаются по логике:

- `before = start date - 1 day`
- `during = start date ... end date`
- `after = end date + 1 day`, только если день уже наступил

Это фундаментальная бизнес-логика текущего раздела.

#### 4. RK totals и conversion metrics

Из `stata` для matched campaigns считаются:

- views;
- clicks;
- atbs;
- orders;
- sumPrice;
- bid;

И производные метрики:

- CTR
- CR1
- CR2
- CTR*CR1
- CRF x 100

#### 5. Историческая ставка

Ставка **не берется как текущая campaign bid**.

Она берется из:

- `bid-history`

И вычисляется как ставка для окна по истории изменений.

Это очень важно не потерять при миграции.

Если в новом проекте есть прямой доступ к истории ставок:

- нужно подставить ее сюда;
- не использовать просто актуальную ставку кампании.

#### 6. Price timeline

Сейчас `priceTimeline` и price-related rows не считаются из XWAY как основной truth source.

На практике price decision берется из legacy sheet snapshot.

---

## 6.3. Источник C: Google Sheets legacy export

Файл:

- `src/app/components/ab-service.ts`

Функция:

- `loadAbDashboardData()`

Источник:

- Google Sheets `Тесты CTR`

Листы:

- `Каталог товаров`
- `AB-выгрузка`
- `Результаты обложек`

### Что именно из legacy sheet используется в XWAY-разделе

Для XWAY-раздела Google Sheets не являются главным источником списка. Но используются как fallback / enrichment для:

- `sheetPriceRows`
- `sheetPriceDecisionRaw`
- `sheetPriceDeviationCount`

То есть:

- этап `Цена` во воронке;
- price-deviation logic;
- часть comparison rows

сейчас завязаны не только на XWAY, а еще и на старый sheet-based export.

### Почему это важно

В новом проекте это место скорее всего надо переписать.

Если новый backend умеет сам отдавать:

- фактические цены по окнам;
- отклонения цены;
- verdict по цене;
- count of price transitions;

то зависимость от Google Sheets нужно удалить.

---

## 6.4. Источник D: product snapshots

Файл:

- `functions/api/xway-product-snapshots.js`

Внутренний вызов:

- `GET /api/adv/shop/{shopId}/product/{productId}/info`

Что берется:

- current main image;
- stock;
- inStock.

Это используется для product/grouped views, не для расчета успеха AB-теста.

---

## 6.5. Авторизация к XWAY

Файл:

- `functions/api/_lib/xway-client.js`

Текущая схема:

- cookie-based session state;
- secret:
  - `XWAY_STORAGE_STATE_JSON`
  - или `XWAY_STORAGE_STATE_BASE64`
- fallback:
  - `functions/api/_lib/xway-storage-state.js`

### Почему это важно

Это технический способ текущего проекта, а не бизнес-логика.

В новый проект **не нужно переносить fallback cookie blob как целевое решение**.

Лучше заменить на:

- официальный API token;
- backend auth integration;
- service account;
- или ваш серверный session broker.

---

## 7. Что считается прямо на клиенте

Это нужно понимать, потому что при миграции можно часть вычислений унести на backend.

На клиенте сейчас считаются:

- фильтрация тестов;
- funnel cards;
- grouped product aggregation;
- `Лучшие`;
- ranking и re-ranking;
- скрытие / возврат карточек в `Лучших`;
- часть derived formatting;
- patching XWAY detail в модель.

### Важные формулы

#### 1. `testCtr`

Логика:

- baseline = базовая обложка / main;
- bestCtr = лучший CTR среди вариантов;
- если `bestCtr > baselineCtr`, то `WIN`, иначе `LOOSE`.

#### 2. `testPrice`

Сейчас берется не из XWAY-formula layer, а из legacy sheet decision.

#### 3. `testCtrCr1`

Логика:

- берется delta строки `CTR*CR1`;
- если delta >= 10%, то `WIN`, иначе `LOOSE`.

#### 4. `overall`

Логика:

- если любой из этапов неизвестен, итог `?`
- если все этапы `WIN`, итог `WIN`
- иначе итог `LOOSE`

Это напрямую влияет на:

- воронку;
- фильтры stage;
- раздел `Лучшие`.

---

## 8. Что пишется в БД, а что нет

## 8.1. Что не пишется в БД

Для раздела `AB-тесты XWAY` доменные данные сейчас **не сохраняются** в Cloudflare D1.

Не сохраняются:

- список XWAY AB-тестов;
- detail payload XWAY;
- variant stats;
- RK windows;
- bid history результат;
- product snapshots;
- hidden pool `Лучших`;
- per-test status refresh.

Все это живет только:

- в React state;
- в `useRef`-кэшах;
- в текущем сеансе страницы.

## 8.2. Что все же есть в проекте, но не относится к этой вкладке как к domain storage

В проекте есть D1 и state-store инфраструктура, но она относится в основном к legacy dashboards и auth.

Для `AB-тесты XWAY` это не основной storage path.

Вывод:

- при миграции можно проектировать storage заново;
- не надо пытаться адаптировать старый `state-store` под этот раздел без необходимости.

---

## 9. Текущая модель данных раздела

Ниже не буквальная JS-структура, а смысловая доменная модель, которую желательно сохранить.

## 9.1. Сущность `ab_test`

Минимально:

- `test_id`
- `title`
- `product_name`
- `article`
- `cabinet_name`
- `campaign_type`
- `campaign_external_id`
- `shop_id`
- `product_id`
- `launch_status`
- `status`
- `progress`
- `started_at`
- `ended_at`
- `views`
- `cpm`
- `estimated_expense`
- `images_num`

## 9.2. Сущность `ab_test_variant`

- `test_id`
- `sort_index`
- `image_url`
- `is_main`
- `is_best`
- `status`
- `date_start`
- `views`
- `clicks`
- `ctr`
- `ctr_boost`

## 9.3. Сущность `ab_test_rk_window_metrics`

Нужны окна:

- `before`
- `during`
- `after`

Поля:

- `views`
- `bid`
- `clicks`
- `atbs`
- `orders`
- `sum_price`
- `ctr`
- `cr1`
- `cr2`
- `ctr_cr1`
- `crf100`
- `avg_price`

## 9.4. Сущность `ab_test_summary`

- `test_id`
- `test_ctr_status`
- `test_price_status`
- `test_ctrcr1_status`
- `overall_status`
- `price_deviation_count`

## 9.5. Сущность `product_snapshot_current`

- `shop_id`
- `product_id`
- `article`
- `name`
- `main_image_url`
- `stock_value`
- `in_stock`
- `snapshot_at`

---

## 10. Что нужно заменить в новом проекте

Ниже список текущих технических зависимостей, которые не стоит переносить как есть.

## 10.1. Убрать зависимость от cookie-based XWAY session

Заменить на:

- backend connector к вашему источнику;
- service token;
- или нормальный internal API.

## 10.2. Убрать N+1 detail refresh с клиента, если возможно

Сейчас:

- список грузится отдельно;
- детали догружаются пачкой с клиента;
- есть in-memory request cache.

Лучше:

- batch backend endpoint;
- либо сразу серверный список с detail summary;
- либо background aggregation + persisted snapshots.

## 10.3. Убрать зависимость от Google Sheets, если новый backend дает price truth

Нужно заменить:

- `sheetPriceRows`
- `sheetPriceDecisionRaw`
- `sheetPriceDeviationCount`

на server-side расчет из нормальных источников.

## 10.4. Не переносить `xway-storage-state.js`

Это только временный технический fallback.

---

## 11. Рекомендуемый целевой backend-контракт

Если новый проект пересобирает раздел с нуля, лучше давать фронту не XWAY-specific raw, а normalized API.

## 11.1. Список тестов

`GET /api/ab-tests`

Возвращает:

- normalized list tests;
- базовые product fields;
- базовые summary fields;
- возможно current snapshot.

Минимум:

```json
{
  "items": [
    {
      "testId": "141945",
      "title": "П / APK / ...",
      "productName": "Колготки ...",
      "article": "840178026",
      "cabinet": "ИП Карпачев П. А.",
      "shopId": 123,
      "productId": 456,
      "type": "APK",
      "campaignExternalId": "32290791",
      "launchStatus": "DONE",
      "status": "FINISHED",
      "startedAt": "2026-03-26T14:24:00Z",
      "endedAt": "2026-03-27T10:04:00Z",
      "views": 3117,
      "cpm": 775,
      "estimatedExpense": 12345
    }
  ]
}
```

## 11.2. Detail одного теста

`GET /api/ab-tests/{id}`

Должен возвращать уже готовый normalized payload:

- test;
- variants;
- rk windows;
- matched campaigns;
- totals;
- metrics;
- summary checks.

## 11.3. Batch detail

Предпочтительный вариант вместо текущего N+1:

`POST /api/ab-tests/details-batch`

Вход:

- `testIds[]`

Выход:

- массив detail payloads в normalized виде.

## 11.4. Product snapshots

`POST /api/products/current-snapshots`

Вход:

- `[{ shopId, productId, article }]`

Выход:

- current image;
- stock;
- inStock;
- updatedAt.

## 11.5. Optional persisted aggregates

Если проект большой и AB-данных много, лучше иметь persisted tables:

- `ab_tests`
- `ab_test_variants`
- `ab_test_rk_windows`
- `ab_test_campaign_matches`
- `product_current_snapshots`
- `ab_test_refresh_log`

---

## 12. Рекомендуемая схема БД

Если section будет храниться в новой БД, минимально рекомендую:

### `ab_tests`

- `id`
- `external_test_id`
- `article`
- `title`
- `product_name`
- `cabinet_name`
- `shop_id`
- `product_id`
- `campaign_type`
- `campaign_external_id`
- `launch_status`
- `status`
- `started_at`
- `ended_at`
- `views`
- `cpm`
- `estimated_expense`
- `raw_payload_json`
- `updated_at`

### `ab_test_variants`

- `id`
- `ab_test_id`
- `sort_index`
- `image_url`
- `is_main`
- `is_best`
- `status`
- `date_start`
- `views`
- `clicks`
- `ctr`
- `ctr_boost`
- `updated_at`

### `ab_test_rk_windows`

- `id`
- `ab_test_id`
- `window_type` (`before`, `during`, `after`)
- `window_from`
- `window_to`
- `views`
- `bid`
- `clicks`
- `atbs`
- `orders`
- `sum_price`
- `ctr`
- `cr1`
- `cr2`
- `ctr_cr1`
- `crf100`
- `avg_price`
- `updated_at`

### `ab_test_summary_checks`

- `ab_test_id`
- `test_ctr_status`
- `test_price_status`
- `test_ctrcr1_status`
- `overall_status`
- `price_deviation_count`
- `updated_at`

### `product_current_snapshots`

- `shop_id`
- `product_id`
- `article`
- `name`
- `main_image_url`
- `stock_value`
- `in_stock`
- `snapshot_at`

---

## 13. Что переносить как поведение, а не как реализацию

Следующие вещи важно сохранить по смыслу, но не нужно переносить один-в-один по коду:

- массовый refresh текущей filtered выборки;
- individual refresh одного теста;
- stage-based funnel filtering;
- `before / during / after` windows;
- историческая ставка по окну;
- реальный период активности AB-теста отдельно от RK-окон;
- лучшие тесты по приросту `CTR*CR1`;
- группировка по ИП;
- current product snapshots.

---

## 14. Что можно упростить при миграции

Можно не повторять буквально:

- клиентские `useRef`-кэши;
- текущий порядок отдельных fetch-ов;
- зависимость от Google gviz API;
- fallback cookie storage state;
- локальную patch-модель `base list -> detail patch`, если новый backend может отдать готовую агрегированную модель.

---

## 15. Что нужно передать другой нейронке

Чтобы перенести **именно раздел `AB-тесты XWAY`**, другой модели нужно передать:

### 15.1. Обязательно

1. Этот файл:
   - `docs/xway-ab-tests-migration.md`
2. Исходники фронта:
   - `src/app/pages/XwayAbTestsPage.tsx`
   - `src/app/components/xway-dashboard-service.ts`
   - `src/app/components/ab-service.ts`
   - `src/app/components/XwayFunnelDashboard.tsx`
   - `src/app/components/TestCard.tsx`
   - `src/app/components/ProductsTable.tsx`
   - `src/app/components/ProductGroupsWithTests.tsx`
   - `src/app/components/BestTestsSection.tsx`
   - `src/app/components/FilterToolbar.tsx`
3. Исходники backend:
   - `functions/api/xway-ab-tests.js`
   - `functions/api/xway-ab-test.js`
   - `functions/api/xway-product-snapshots.js`
   - `functions/api/_lib/xway-client.js`

### 15.2. Необязательно, но полезно

4. Примеры реальных JSON-ответов нового backend / marketplace API:
   - список AB-тестов
   - detail AB-теста
   - история ставок
   - stats по рекламной кампании
   - current product snapshot
5. Описание новой БД:
   - какие таблицы уже существуют
   - какие сущности уже есть для товаров / рекламы / тестов
6. Описание auth-модели:
   - как новый backend получает доступ к данным
   - какие токены / ключи есть

---

## 16. Что нужно решить до начала переноса

Новая нейронка должна получить ответы на эти вопросы:

1. Откуда в новом проекте брать список AB-тестов?
2. Есть ли у нового backend собственная сущность AB-теста или ее нужно собрать из нескольких API?
3. Откуда брать историю ставок по датам?
4. Откуда брать ценовые окна и verdict по цене?
5. Нужен ли persisted storage для AB-тестов или раздел останется read-through?
6. Нужны ли background refresh jobs?
7. Нужно ли переносить `Лучшие` полностью вместе со скрытием / pool mode?

Без этих ответов другой модели придется делать слишком много предположений.

---

## 17. Готовая инструкция для другой нейронки

Ниже текст, который можно дать другой модели вместе с файлами.

### Prompt

> Нужно перенести в новый проект только раздел `AB-тесты XWAY`.
>
> Исходная реализация находится в приложенном наборе файлов. Главный документ по архитектуре и миграции: `docs/xway-ab-tests-migration.md`.
>
> Твоя задача:
>
> 1. Не переносить старую реализацию 1:1.
> 2. Сохранить бизнес-логику раздела:
>    - список AB-тестов;
>    - фильтры;
>    - воронка;
>    - карточки тестов;
>    - RK-окна `до / во время / после`;
>    - product snapshots;
>    - раздел `Лучшие`;
>    - группировку по ИП.
> 3. Заменить текущие источники XWAY / Google Sheets на новые API и новую БД.
> 4. Сначала выделить нормализованную domain model для `ab_test`, `ab_test_variant`, `rk_window_metrics`, `product_snapshot`.
> 5. После этого предложить новый backend contract и только потом собирать UI.
> 6. Отдельно опиши, какие части legacy-логики больше не нужны.
>
> Обязательно учитывай:
>
> - реальный период AB-теста и RK-окна это разные сущности;
> - ставка должна считаться из истории ставки по окну, а не как текущая ставка;
> - `Лучшие` сортируются по приросту `CTR*CR1`;
> - `Итог` теста зависит от `CTR`, `Цена`, `CTR*CR1`.

---

## 18. Краткий вывод

Для миграции раздела `AB-тесты XWAY` нужно переносить не текущий способ fetch из XWAY, а следующую сущность:

- список тестов обложек;
- варианты обложек;
- RK-сравнение по окнам;
- success funnel;
- агрегаты по кабинетам / ИП / товарам;
- блок `Лучшие`.

Текущие технические источники:

- XWAY browser-session API;
- Google Sheets export;
- клиентские in-memory cache.

В новом проекте это желательно заменить на:

- нормализованный backend;
- собственную БД;
- batch / persisted aggregation;
- явную доменную модель `ab_tests`.
