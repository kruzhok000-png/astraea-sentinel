# Astraea Sentinel · CELESTIAL

Начните с [пошаговой инструкции: оформление, загрузка и запуск](docs/START-HERE.md). Там же готовое описание профиля бота.

TypeScript / discord.js 14 / PostgreSQL / Prisma 6.19. Один постоянный Node.js-процесс. Node.js 22.12+ (рекомендуется последний 22 LTS). Токен читается **только из DISCORD_TOKEN окружения**; бот не загружает секреты из файлов.

## Структура

```text
src/
  commands/definitions.ts       восемь slash-команд
  interactions/                команды, кнопки, select, modals и права
  services/                    транзакции, выдача ролей, доставка, валидация
  jobs/reconcile.ts            восстановление после ошибок Discord
  ui/                          карточки и палитра
  lib/                         Prisma, журнал, custom IDs
  config.ts
  index.ts
  deploy-commands.ts
prisma/
  schema.prisma
  seed.ts
  migrations/                  основная схема + уникальная активная заявка
tests/                         unit, карточки, конкурентные сценарии, PostgreSQL
scripts/preview.mjs            HTML-превью из фактических embed-данных
docs/                          примеры и визуальные превью
.github/workflows/ci.yml        PostgreSQL 17, миграции, сборка, тесты
Dockerfile
docker-compose.yml
package.json
package-lock.json
.env.example
```

## Подготовка Discord

1. Создайте бота в [Discord Developer Portal](https://discord.com/developers/applications). Включите Server Members Intent.
2. Пригласите бота со scopes `bot` и `applications.commands`. Права: View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Create Private Threads, Send Messages in Threads, Manage Threads и Manage Roles.
3. Создайте публичный канал панели и отдельные приватные каналы модерации и аудита. Для @everyone запретите View Channel в обоих приватных каналах; разрешите доступ команде и боту.
4. Разместите роль бота выше Member и дополнительной игровой роли. Роли с Administrator / Manage Roles, managed-роли и @everyone выдавать нельзя.
5. Доверенные пользователи 1388985537649578116, 794867229672996865 и 1539394688539431043 получают внутреннее право Application Admin при seed и запуске. Discord Administrator не назначается.

## Деплой на BotHost

Инструкция рассчитана на [bothost.ru](https://bothost.ru/), который документирует Dockerfile и переменные окружения. Если ваш BotHost — другой сервис, используйте приведённые команды Node.js, сверив его интерфейс.

Рекомендуемый путь — **кастомный Dockerfile**:

1. Загрузите проект из архива или подключите репозиторий. Выберите Dockerfile из корня.
2. В настройках бота → «Переменные окружения» задайте `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID=1389355523316519002` и `DATABASE_URL`. Значение токена вводится только в защищённое поле панели. Автоматический `DISCORD_BOT_TOKEN` BotHost не заменяет требуемый `DISCORD_TOKEN`.
3. Используйте PostgreSQL с постоянным хранилищем. `DATABASE_URL` должен содержать полный PostgreSQL URL; для внешней БД включите TLS по инструкции её провайдера.
4. Соберите и запустите образ. Его CMD применяет миграции, выполняет seed и запускает постоянный процесс.
5. В консоли контейнера один раз выполните `node /opt/astraea/dist/src/deploy-commands.js`. Повторите после изменения набора команд.
6. В Discord выполните `/application-config`: задайте moderation, audit, panel, member_role и роли команды. Затем `/application-panel`.
7. Проверьте логи: `PostgreSQL connected`, `Discord client ready`, `Application system initialized`. Регистрируя команды, вы увидите `Slash commands registered`.

Рабочая папка образа — `/opt/astraea`: документация BotHost предупреждает, что монтирование `/app` может скрыть dist и node_modules. Источники: [переменные окружения](https://bothost.ru/docs/environment-variables), [ошибки Docker-деплоя](https://bothost.ru/docs/common-errors), [хранение БД](https://bothost.ru/docs/database-storage).

Если выбран Node.js runtime без Docker:

```bash
npm ci
npm run build
npm run db:migrate
npm run db:seed
npm run deploy:commands
npm start
```

Build command: `npm ci && npm run build`. Release/pre-start: `npm run db:migrate && npm run db:seed`. Start: `npm start`. Если отдельного release-шагa нет, задайте start `npm run db:migrate && npm run db:seed && npm start`. Используйте **одну реплику** и автоматический restart.

## Docker Compose

Compose предназначен для среды, где вы управляете Docker Engine. Его поддержка конкретным тарифом BotHost отдельно не предполагается. Передайте через окружение DISCORD_TOKEN, CLIENT_ID и POSTGRES_PASSWORD. Для удобства URL в Compose пароль PostgreSQL должен состоять из URL-безопасных символов; для произвольного пароля используйте корректно URL-encoded DATABASE_URL и адаптируйте Compose.

```bash
docker compose build
docker compose up -d
docker compose exec bot node dist/src/deploy-commands.js
docker compose logs -f bot
```

PostgreSQL хранится в volume astraea_pgdata, порт БД наружу не публикуется. Graceful shutdown имеет 30 секунд; завершение бота передаётся через exec. В production не применяйте migrate dev.

## Настройки и поведение

- Applicant — уровень по умолчанию. Curator берёт заявку и просит уточнение. Moderator одобряет/отклоняет и ставит паузу. Senior Moderator переназначает и видит статистику. Application Admin управляет настройками, запретами, шаблонами и экспортом.
- `/application-config` задаёт каналы, роли, срок рассмотрения, cooldown, апелляции и доверенных лиц. Первоначальные три ID защищены от удаления через команду.
- Вопросы имеют фиксированные безопасные поля. Пара `question` + `question_label` меняет подпись выбранного вопроса. Добавление новых категорий персональных данных намеренно не предусмотрено. Возраст — только 13–17, 18–24, 25–34 или 35+.
- `/application-template` задаёт тексты одобрения, отказа и уточнения. Причина и статус сохраняются в постоянном досье независимо от текста шаблона.
- Черновик сохраняется после каждого раздела. Возврат в раздел подставляет предыдущие ответы. Отправка повторно и редактирование отправленного досье запрещены.
- PostgreSQL обеспечивает одну активную заявку на кандидата частичным уникальным индексом. Конкурентные клики проверяют версию записи; неудачный конкурентный запрос можно повторить.
- После отказа — cooldown 14 дней по умолчанию. Апелляция доступна по настройке, одна на заявку, при отсутствии другой активной заявки.
- Повторное создание черновиков ограничено пятью в час. Флаг нового аккаунта или краткой мотивации — подсказка проверяющему, а не автоматический отказ.
- Постоянная DM-карточка редактируется на месте. Если пользователь удалил её, создаётся замена. Закрытые DM фиксируются в аудите; статус доступен через публичную панель.
- Решения и выдача ролей аудируются. Решение по собственной заявке запрещено. Выход кандидата с сервера предотвращает выдачу ролей.
- Задание восстановления повторяет доставку отсутствующих модераторских карточек и невыданных ролей раз в минуту. Discord и PostgreSQL не имеют общей транзакции: при аварии строго между отправкой нового сообщения и сохранением его ID возможна повторная доставка. Выдача уже имеющейся роли идемпотентна.
- CSV ограничен 5000 строками, доступен Application Admin и защищён от формул. Тексты мотивации и контакты в экспорт не включены.
- Текущая реализация рассчитана на одну реплику. Перед горизонтальным масштабированием понадобится распределённая очередь доставки.

## Проверка

```bash
npm run build
npm test
npm run test:core
node scripts/preview.mjs
```

Обычные тесты не требуют токена или БД. Для двух интеграционных тестов задайте отдельную DATABASE_URL с именем базы, заканчивающимся на `_test`, примените миграции и включите `RUN_DB_TESTS=1`. CI поднимает PostgreSQL 17 и выполняет этот сценарий автоматически после загрузки проекта в GitHub. На рабочую БД эти тесты направлять нельзя.

Визуальные примеры: [HTML](docs/cards-preview.html), [390 px](docs/preview-390.png), [1280 px](docs/preview-1280.png). Это локальная визуализация реальных embed-данных, не скриншоты живого клиента Discord.

Точные результаты локальных проверок и ограничения перечислены в [QA.md](docs/QA.md). Для финальной приёмки на сервере проверьте закрытые DM, два одновременных клика «Взять», отказ/cooldown, апелляцию, выход кандидата до одобрения и restart после изменения статуса.

## Эксплуатация

Токен не вводите в чат, исходники, README или файлы проекта. Ротация — через DISCORD_TOKEN в BotHost и restart. Храните резервные копии PostgreSQL и ограничьте доступ к аудиту и экспортам.

Prisma закреплена на 6.19.0. [Официальный срок security-поддержки Prisma 6](https://www.prisma.io/docs/orm/release-status) — до 19 ноября 2026; до этой даты запланируйте обновление на поддерживаемую стабильную ветку. Для сборки используется discord.js 14.25.0. Rollup (только инструмент тестов) зафиксирован на 4.64.9, поскольку зеркало не содержит одну из платформенных зависимостей 4.64.10.
