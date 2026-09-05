# ゲーム発展国++ (Game Dev Story) — Japanese Sources Notes

**Research for a Game Dev Story clone (of the ORIGINAL 2010 game).** Compiled from Japanese wikis/blogs, 2026-08-31.
Game tags used below:
- **[ORIG]** — applies to the original 2010 game ゲーム発展国++ (iOS 2010-04-22, v1.3.1; Android 2016 v2.0.3) — our clone target
- **[++]** — new/remake ゲーム発展国++ (2019-2020 Switch/PS4/Steam "Game Dev Story" re-release) or Apple Arcade ゲーム発展国+++ — ONLY, optional for clone
- **[BOTH]** — applies to both (structure is identical; the remake mostly rebalanced numbers)

---

## 0. Sources and reliability

| # | Source | URL | Reliability |
|---|---|---|---|
| S1 | h1g.jp ゲーム発展国++ 攻略Wiki (68+ pages) | https://h1g.jp/gamedev/ | Young wiki, many stub pages; sparse but accurate tables (ジャンル/開発ハード/受注/方針/大賞) |
| S2 | 新・カイロパーク攻略 Wiki (wikiwiki.jp/kairoparknew), gamedev/01-17 subpages | https://wikiwiki.jp/kairoparknew/gamedev | **Richest source**: complete combo matrix, full staff/contract/console/event/education tables. Used 2021→2026 |
| S3 | 旧カイロパークWiki (archived, describes 2010-era versions 1.3.1/2.0.3) | https://wikiwiki.jp/kairoparknew/others/kairopark/gamedev | **Best source for ORIGINAL-version data** (combo lists, genre unlock) |
| S4 | monmon-games.com 「ゲーム発展国++ 攻略の決定版」 | https://monmon-games.com/pocket-academy-guide/ | Blog, mostly consistent with wikis (job tree, office 1億, grand prix 38pt/7000 fans, 5×GP→カイロくん). Some claims unverified |
| S5 | szer.net/geten 「ゲーム発展国++完全攻略2025年版」 | https://szer.net/geten | **UNRELIABLE — AI-generated junk** (invented staff names 山田太郎/鈴木一郎, fake mechanics "水曜日スカウト効果", "業界スパイ"). Only its meta-claims usable; nothing cited from it below |
| S6 | thisplaygame.com 攻略blog | https://thisplaygame.com/gamedevstoryall-1853 | Generic guide, no exact numbers; consistent with S2 |
| S7 | Kairosoft official pages | https://kairosoft.net/game/pc/gamedev.html (1996 freeware), https://kairosoft.net/game/appli/gamedev.html (2010 app), https://kairosoft.net/game/mobile/gamedev2.html (2001 sequel) | Official descriptions; confirms 販売停止, 炎 (fire), 自社ハード, テクノロジー lineage |
| S8 | wikiwiki.jp/newkairopark | https://wikiwiki.jp/newkairopark/ゲーム発展国++ | Abandoned fork; points to S2 |

Series lineage (S7, S2): ゲーム発展途上国 (freeware PC, 1996) → ゲーム発展途上国2 (docomo mobile, 2001; 30-year play, already had バグ→販売停止, 自社ハード, テクノロジー, 炎) → **ゲーム発展国++ (iOS/Android, 2010)** → ゲーム発展国Mini (2018) → ゲーム発展国++ remake (2019-2020, Switch/PS4/Steam/Apple Arcade).

---

## 1. Core terminology (Japanese → EN/RU)

| JP | EN | RU | Notes |
|---|---|---|---|
| ジャンル | Genre | Жанр | 20 types, max Lv5 |
| 内容 | Content/Theme | Содержание/Тема | 79 types (++), max Lv5; task calls it "theme" |
| 相性 (組み合わせの相性) | Compatibility | Совместимость | Genre×content match rating |
| 傑作 / 独創的 / まあ良い / 普通 / 微妙 / 悪い | Masterpiece / Original / Decent / Normal / Meh / Bad | Шедевр / Оригинально / Норм / Обычно / Так себе / Плохо | rating levels |
| おもしろさ | Fun/Entertainment | Интересность | game param — drives sales |
| 独創性 | Originality | Оригинальность | game param — hit potential |
| バグ | Bugs | Баги | harm sales if shipped; squashing → 研究データ |
| 研究データ | Research data/points | Очки исследований | earned in dev/debug/contracts; spent on level-ups, technology, challenges |
| 開発ポイント | Dev points | Очки разработки | おもしろさ/独創性/グラフィック/サウンド build during dev |
| 方向性 | Direction/Policy | Направленность | 8 prefs × 10 pts per game; accumulates; genre/content level-up on match |
| 方向性ポイント | Direction points | Очки направления | +2 granted at genre Lv2 and Lv5; carry to NG+ |
| 年俸 | Salary (yearly) | Годовая зарплата | paid end of March; rises with level; first year free |
| 契約金 | Contract fee | Взнос при найме | one-time hire cost |
| 受注開発 | Contract work | Заказная разработка | fixed jobs for fixed money + research data |
| ハード / ライセンス | Console / License | Консоль/Лицензия | PC free, all others need license |
| 自社ハード | Own console | Своя консоль | endgame project, needs ハードエンジニア |
| ファン | Fans | Фанаты | age-segmented; boost all sales |
| 期待度 / 知名度 | Hype / Recognition | Ожидание/Известность | raised by ads during dev, challenges, awards |
| 殿堂入り | Hall of Fame | Зал славы | review ≥32/40 → sequel allowed |
| 日本ゲーム発展大賞 | Game Dev Awards | Премия | yearly Dec; グランプリ=Grand Prize 1億円 |
| クソゲーム賞 | Worst Game Award | Антипремия | -3000万; win by shipping 50-60 bugs |
| ゲームデックス | Gamedex (game show) | Игровая выставка | yearly July booth event |
| 転職 | Job change | Смена профессии | via 転職の教科書 item; job Lv5 requirements |
| 教育 | Training | Обучение | costs money + POWER; may unlock contents; パチンコ special |
| POWER (体力) | Stamina | Выносливость | drains in dev/training; empty → employee goes home |
| テクノロジー | Technology | Технологии | one-time buy; per-use research data cost = 1/5 of current (30-190) |
| 週 | Week | Неделя | time unit; 1 year = 52 weeks |
| 周回プレイ / 2周目 | New Game+ | Новая игра+ | clear at 21年1月 (start of year 21) |
| 外注 | Outsourcing | Аутсорс | hire temp contractors for 企画/原画/音楽 |

---

## 2. Compatibility system (相性) — genre × content

### 2.1 Rating levels, in-game feedback (S2 gamedev/08)

| Symbol | Rating (JP) | EN | In-game line (JP) |
|---|---|---|---|
| ☆ | 傑作です | Masterpiece | 「とても良い組み合わせですね!! 社員の士気も上がりました」 |
| ◎ | 独創的だ | Original | 「かなり奇抜な組み合わせですね…」 |
| ◯ | まあ良い | Decent | 「これは人気が出そうな組み合わせですね」 |
| ◇ | 何もない | (none) | 「いよいよ開発に着手します」 |
| △ | 微妙だな | Meh | 「ちょっと微妙な組み合わせですね…」 |
| ✕ | 悪いです | Bad | 「ジャンルと組み合わせの内容が悪いですね…」 |

**[ORIG+BOTH]** Same 6-level system existed in the 2010 original (S3 old wiki lists 傑作/まあ良い/独創的 tables; English sources confirm ☆/◎/◯/△/✕).
**Special cases (S2, gamedev/05+06):** genres 03 シミュレーションRPG, 19 教育, 20 カードゲーム and contents 76 港湾, 77 タイムスリップ, 78 スパイ, 79 芸能人 NEVER produce a compatibility comment with anything (all ◇). Wiki editors concluded it's intended spec (unchanged for years).

### 2.2 Full compatibility matrix (S2 gamedev/08, complete, 2026; ++ but matches original closely)
Legend: ☆傑作 ◎独創的 ◯まあ良い △微妙 ✕悪い (blank/◇ = no comment). Genres numbered: 01RPG 02シミュレーション 03シミュレーションRPG 04テーブルゲーム 05アクションゲーム 06アドベンチャー 07シューティング 08アクションRPG 09レースゲーム 10ネットRPG 11ネットSLG 12素材集 13育成 14ボードゲーム 15パズル 16音楽ゲーム 17サウンドノベル 18体感ゲーム 19教育 20カードゲーム.

| 内容 | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| スポーツ | ◇ | ◎ | ◇ | ◇ | ◯ | ◇ | △ | ✕ | ◯ | ◇ | ◇ | ◇ | ◯ | ◇ | ◎ | ✕ | △ | ◎ | ◇ | ◇ |
| 冒険物 | ◯ | ◇ | ◇ | ◇ | ◯ | ◇ | △ | ◯ | ◇ | ◎ | ◇ | ◇ | ◇ | ◇ | △ | ✕ | ◇ | ◇ | ◇ | ◇ |
| 拳法 | ◇ | △ | ◇ | ◎ | ◯ | ◎ | ◎ | ◇ | ✕ | ◇ | ✕ | ◎ | ◇ | ◇ | △ | ◇ | ◎ | ◇ | ◇ | ◇ |
| ファンタジー | ☆ | ◇ | ◇ | ◯ | ◇ | ◯ | ◎ | ◯ | ✕ | ◯ | ◇ | ◇ | ◎ | ◇ | ◎ | △ | ◇ | ✕ | ◇ | ◇ |
| 競馬 | ✕ | ☆ | ◇ | ◇ | ◯ | ◇ | ◎ | ◇ | ◯ | ◇ | ☆ | ◇ | ◇ | △ | ◇ | △ | ◇ | ◎ | ◇ | ◇ |
| 戦国 | ◇ | ◯ | ◇ | ◇ | ◯ | ◇ | △ | ◇ | ◎ | △ | ◯ | ◇ | ◇ | ◯ | ◇ | ✕ | ◇ | ◇ | ◇ | ◇ |
| ダンジョン | ◯ | ◇ | ◇ | ◯ | ◯ | ◇ | ◯ | ◇ | ◎ | ◯ | ◇ | ✕ | △ | ◯ | △ | △ | ◇ | ✕ | ◇ | ◇ |
| 恋愛 | △ | ☆ | ◇ | ◇ | ✕ | ◯ | ◇ | △ | ✕ | ◇ | ◇ | ◎ | ◇ | ◇ | △ | ◇ | ☆ | ◎ | ◇ | ◇ |
| 埋蔵金 | ◇ | ◯ | ◇ | ✕ | ◇ | ◇ | ✕ | ◇ | ✕ | ◇ | ✕ | ◎ | ◇ | ◇ | △ | ◇ | △ | ◇ | ◇ | ◇ |
| お笑い | ✕ | ◯ | ◇ | ◇ | ◎ | ◎ | ◇ | ◇ | ◇ | ◇ | ◇ | ☆ | ◯ | ◇ | ◇ | ◇ | ◇ | ◎ | ◇ | ◇ |
| ホラー | ◎ | ◇ | ◇ | △ | ☆ | ◯ | ◇ | ◇ | ✕ | ◇ | ◇ | ◇ | △ | ◇ | △ | ✕ | ☆ | ◯ | ◇ | ◇ |
| 脳トレ | ◇ | ◯ | ◇ | ◯ | ◇ | ◇ | ◇ | ✕ | ✕ | ✕ | △ | ◇ | ☆ | ◇ | ◯ | ◇ | ◇ | ◎ | ◇ | ◇ |
| 電車 | ◎ | ☆ | ◇ | ◇ | ◎ | ◎ | ◇ | ◇ | ◎ | ◇ | ◇ | ◯ | ◇ | ◯ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ |
| 動物 | ◇ | ◯ | ◇ | ◇ | ◇ | ◇ | △ | ◇ | ◇ | △ | △ | ◯ | ☆ | ◇ | ◇ | ◇ | ◎ | ◇ | ◇ | ◇ |
| ロボット | ◇ | ◇ | ◇ | ◇ | ◯ | ◇ | ☆ | ◇ | ◇ | ◇ | ◇ | ◯ | ◇ | ◇ | △ | ◇ | ◇ | ◇ | ◇ | ◇ |
| 飛行機 | ✕ | ◯ | ◇ | ◇ | ◯ | ✕ | ◯ | ◇ | ◯ | ◇ | ◇ | ◇ | △ | ✕ | ◇ | ◇ | ✕ | ◇ | ◇ | ◇ |
| コンビニ | △ | ◯ | ◇ | ◇ | △ | ◇ | ✕ | ◇ | ◇ | ◇ | ☆ | ◇ | ◯ | ◇ | ◇ | ◎ | ◇ | ◇ | ◇ | ◇ |
| 時代劇 | ◇ | ◯ | ◇ | ◇ | ☆ | ◇ | ◎ | ◇ | ✕ | ◯ | ◯ | ◇ | ◇ | △ | △ | ✕ | ◯ | ◇ | ◇ | ◇ |
| 古本屋 | ◇ | ☆ | ◇ | ◇ | ◇ | ◇ | △ | ◇ | △ | ◇ | ◯ | ◇ | ◇ | ◇ | ◇ | △ | ◇ | ◎ | ◇ | ◇ |
| 漫画家 | ✕ | ☆ | ◇ | ◇ | △ | ◇ | ✕ | ◇ | △ | ◇ | ◇ | ◯ | ☆ | ◇ | ◇ | ✕ | ◇ | ◇ | ◇ | ◇ |
| 美術 | ◎ | ◇ | ◇ | △ | ◇ | ◯ | ◇ | ✕ | △ | ◇ | ◇ | ◇ | ◎ | ◇ | ◎ | △ | ◇ | △ | ◇ | ◇ |
| 映画 | ◇ | ☆ | ◇ | ◇ | ◇ | ◇ | ✕ | ◇ | △ | ◇ | ◇ | ◯ | ◯ | ◇ | ◇ | ◯ | ☆ | ◇ | ◇ | ◇ |
| ゲーム会社 | ◇ | ☆ | ◇ | ◇ | ◇ | △ | ◇ | ◇ | ◎ | ◇ | ☆ | ◇ | ☆ | ◇ | ◇ | △ | ◇ | ✕ | ◇ | ◇ |
| エジプト | ◯ | ◯ | ◇ | △ | ◇ | ◯ | ◇ | ◇ | ◇ | ◇ | ◇ | ◯ | ◇ | ◇ | ◎ | ◇ | ◇ | ◇ | ◇ | ◇ |
| 街開発 | ◇ | ☆ | ◇ | ◇ | △ | ◇ | ✕ | ◇ | ◇ | △ | ◇ | ◇ | ☆ | ◇ | ✕ | ◇ | ◎ | ◇ | ◇ | ◇ |
| ビル建築 | ◎ | ☆ | ◇ | ◇ | △ | ✕ | ◇ | ◇ | ✕ | ◇ | ☆ | ◇ | ◇ | △ | ◇ | ◇ | ◇ | ◎ | ◇ | ◇ |
| 裁判 | ◇ | ◯ | ◇ | ◇ | ◎ | ◇ | ◎ | ◇ | ✕ | ◇ | ◇ | ◯ | ◇ | ◇ | ◇ | △ | △ | ◇ | ◇ | ◇ |
| 中世欧州 | ◯ | ◇ | ◇ | ◯ | ◇ | ◯ | ◇ | ◯ | ◇ | ☆ | ◇ | ◇ | ◇ | ◯ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ |
| 妖怪 | ◇ | ◇ | ◇ | △ | ◇ | ◇ | ◯ | ◇ | ◎ | ◇ | ◇ | ◯ | ◇ | ◇ | △ | ◇ | ◇ | ◎ | ◇ | ◇ |
| 狩り | △ | ◯ | ◇ | ◇ | ◇ | ◇ | ◎ | ☆ | ◇ | ◯ | ◇ | ◇ | ◇ | △ | ◇ | △ | ◇ | ◇ | ◇ | ◇ |
| 高校 | ◇ | ◯ | ◇ | ◇ | ◯ | ◇ | △ | ◇ | ✕ | ◇ | ◇ | ◇ | ◇ | △ | ◇ | ◇ | ◯ | ◇ | ◇ | ◇ |
| 中学校 | ◇ | ◯ | ◇ | ◇ | ◯ | ◇ | △ | ◇ | ✕ | ◇ | ◇ | ◇ | ◇ | △ | ◇ | ◇ | ◯ | ◇ | ◇ | ◇ |
| 戦争 | ◇ | ◇ | ◇ | ◯ | ◇ | ✕ | ◯ | ◇ | △ | ◇ | ◯ | ◇ | ◇ | ◇ | △ | ◇ | ◯ | ◇ | ◇ | ◇ |
| 忍者 | ◇ | ◇ | ◇ | ◇ | ☆ | ◎ | ◯ | ◇ | △ | ◇ | ◇ | ◯ | ◇ | ◇ | ✕ | ◇ | ◇ | ◇ | ◇ | ◇ |
| 美少女 | ◇ | ☆ | ◇ | ◇ | ◇ | ◯ | △ | ◇ | ◎ | ◇ | ◇ | ◯ | ◯ | ◇ | ◇ | ◎ | ☆ | ◎ | ◇ | ◇ |
| ぶ少女 | ☆ | ◇ | ◇ | ◇ | ☆ | ◇ | △ | ◇ | ◎ | ◇ | ◇ | ✕ | △ | ◇ | ◇ | ◇ | △ | ◎ | ◇ | ◇ |
| 美男子 | ◇ | ◇ | ◇ | ◎ | ◇ | ◇ | ◯ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◎ | ◇ | ◯ | ◇ | ◇ | ◇ |
| 探偵 | ◇ | ◇ | ◇ | ✕ | ◎ | ☆ | ✕ | ◇ | ✕ | ◇ | ◇ | ◇ | ◯ | ◇ | ◇ | ◎ | ☆ | ◇ | ◇ | ◇ |
| ミステリー | ◯ | △ | ◇ | ◇ | ◇ | ☆ | ◇ | ◇ | ✕ | ◇ | ◇ | ◇ | ◇ | △ | △ | ◇ | ◯ | ◎ | ◇ | ◇ |
| 幕末 | ◯ | ◯ | ◇ | ◇ | ◯ | ☆ | ◇ | ◯ | ◎ | ◇ | ◇ | ◯ | ◇ | ◇ | ◇ | ◎ | ☆ | ◇ | ◇ | ◇ |
| 輪投げ | ◇ | ◇ | ◇ | ◇ | ◇ | ◎ | ☆ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◎ | ◇ | ◎ | ◇ | ◎ | ◇ | ◇ |
| 総理大臣 | ◇ | ◯ | ◇ | △ | ◇ | ◇ | ✕ | ◇ | ◎ | △ | △ | ◇ | ◯ | ◇ | ◇ | ◇ | ◇ | ◯ | ◇ | ◇ |
| 株式 | ✕ | ◯ | ◇ | ◇ | △ | ✕ | △ | ◇ | ✕ | ◇ | ☆ | ◇ | △ | ◇ | ✕ | ✕ | ✕ | ◎ | ◇ | ◇ |
| アニメ | ◯ | ☆ | ◇ | ◇ | ◯ | ☆ | ◇ | ◯ | ✕ | ◇ | ◇ | ◯ | ◇ | ◯ | ◇ | ◇ | ◇ | ◎ | ◇ | ◇ |
| コスプレ | ◎ | ◇ | ◇ | ✕ | △ | ◎ | ◇ | ◇ | ◎ | ◇ | ◇ | ☆ | ◯ | ◇ | ◇ | ✕ | ◇ | ◎ | ◇ | ◇ |
| アイドル | ◇ | ☆ | ◇ | ◇ | △ | ◇ | ✕ | ◇ | ✕ | ◇ | ☆ | ◯ | ☆ | ◇ | ◇ | ◯ | ◯ | ☆ | ◇ | ◇ |
| パンチラ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◎ | ◇ | ◎ | ◇ | ◇ | ◇ | ◎ | ◇ | ◎ | ◇ | ◇ |
| ブラジャー | ◇ | ◎ | ◇ | ◇ | ◇ | ◎ | ◇ | ◇ | ◎ | ◇ | ◇ | ☆ | ◇ | ◇ | ◇ | ◇ | ◎ | ◇ | ◇ | ◇ |
| マツタケ | ☆ | ☆ | ◇ | ◇ | ◇ | ◇ | ◎ | ◇ | ◎ | ◇ | ☆ | ◯ | ☆ | ✕ | ◇ | ✕ | ◇ | △ | ◇ | ◇ |
| ポンチョ | ◇ | ◇ | ◇ | ☆ | ◇ | ◇ | ◇ | ☆ | ◇ | ◇ | ◎ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ |
| 将棋 | ✕ | ◇ | ◇ | ◯ | ◇ | ◇ | △ | ◇ | ◇ | ◇ | ◇ | ◯ | ◇ | ☆ | ◯ | ✕ | △ | ◇ | ◇ | ◇ |
| 囲碁 | ✕ | ◇ | ◇ | ◯ | △ | ◇ | ✕ | ◇ | ◎ | ◇ | ◇ | ◇ | ◇ | ◯ | ☆ | ◎ | ◇ | ◇ | ◇ | ◇ |
| 麻雀 | ◇ | ◯ | ◇ | ☆ | ◇ | ◇ | ◎ | ◇ | ✕ | ◇ | ◇ | ◇ | ◇ | ◯ | ◯ | ◎ | ◇ | ◇ | ◇ | ◇ |
| リバーシ | ◇ | ◇ | ◇ | ◯ | ◇ | ◇ | ◇ | ◇ | ✕ | ◇ | ◎ | ◇ | ◇ | ◯ | ☆ | ◇ | ✕ | ◇ | ◇ | ◇ |
| ダンス | ◎ | ◇ | ◇ | ◇ | ◎ | ◇ | △ | ◎ | ◇ | ◇ | ◇ | ◇ | ◯ | ◇ | ◇ | ☆ | ◇ | ☆ | ◇ | ◇ |
| ドラム | ◇ | ◇ | ◇ | ◇ | ◯ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ☆ | ◇ | ☆ | ◇ | ◇ |
| フィットネス | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◎ | ◇ | ◇ | ◯ | ◇ | ◇ | ◇ | ◇ | ◇ | ☆ | ◇ | ◇ |
| プロレス | △ | ◇ | ◇ | △ | ◇ | ◇ | ◎ | ◇ | ✕ | ◇ | ◇ | ◇ | ☆ | ◇ | ◇ | ◇ | ◇ | ◎ | ◇ | ◇ |
| バスケット | △ | ◇ | ◇ | ✕ | ☆ | ◇ | ◇ | ◎ | ◇ | ◇ | ◇ | ◇ | ◯ | ◇ | △ | ◎ | ◇ | ◯ | ◇ | ◇ |
| スキー | ◇ | ◇ | ◇ | ◇ | ◯ | ◇ | ◇ | ◇ | ◯ | ◇ | ◇ | ◇ | ◇ | ◇ | ✕ | ◇ | ◇ | ☆ | ◇ | ◇ |
| スノーボード | ◇ | ◇ | ◇ | △ | ◇ | ◇ | ◇ | ◇ | ☆ | ◇ | ◇ | ◯ | ◇ | ◎ | ◇ | ◯ | ◇ | ☆ | ◇ | ◇ |
| ゴルフ | ◎ | ◇ | ◇ | ◇ | ◎ | ◇ | ◯ | ◇ | ◇ | ◇ | ◇ | ◯ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ |
| 水泳 | ◇ | ◎ | ◇ | ◇ | ◯ | ◇ | ◇ | ✕ | ◯ | ◇ | ☆ | ◇ | ◯ | ◇ | ◇ | △ | ◎ | ◇ | ◇ | ◇ |
| バレーボール | ◇ | ◯ | ◇ | △ | ◯ | ◇ | ◎ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | △ | ◇ | ◇ | ☆ | ◇ | ◇ |
| モータースポーツ | ◇ | ☆ | ◇ | ◇ | ◯ | △ | ◇ | ◇ | ☆ | ✕ | ◯ | ◇ | ◯ | ◇ | ✕ | ◇ | ◇ | ◯ | ◇ | ◇ |
| サッカー | ◇ | ☆ | ◇ | ◇ | ◯ | ◇ | △ | ◇ | ✕ | ◇ | ◇ | ◯ | ☆ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ |
| 卓球 | ◇ | ◇ | ◇ | ◇ | ◯ | ◎ | △ | ◇ | ✕ | ◇ | ◇ | ◇ | ☆ | ◯ | ◇ | ◎ | ◇ | ◇ | ◇ | ◇ |
| 相撲 | ◎ | ◇ | ◇ | ◇ | ☆ | ◯ | △ | ◇ | ✕ | ◇ | ◇ | ☆ | ◯ | ◇ | ◇ | ◇ | ◯ | ◇ | ◇ | ◇ |
| 野球 | ◇ | ◯ | ◇ | ◇ | ◯ | ◇ | ✕ | △ | ◎ | ◇ | ◇ | ◇ | ◯ | ◯ | ◇ | ◇ | ◎ | ◇ | ◇ | ◇ |
| レスリング | △ | ◇ | ◇ | ◎ | ◯ | ◇ | ◇ | ◇ | ◇ | ◇ | ◯ | ◇ | ◯ | ◇ | ◇ | ◎ | ◇ | ◎ | ◇ | ◇ |
| マラソン | ◯ | ◇ | ◇ | ◇ | ◯ | ✕ | ✕ | ◇ | ◯ | ◇ | ◇ | ◇ | ◇ | ◇ | △ | ◇ | ◇ | ◇ | ◇ | ◇ |
| F1 | ◎ | ☆ | ◇ | ◇ | ◯ | ◇ | ◎ | ◇ | ◯ | ◇ | ◇ | ◯ | ☆ | ◇ | ✕ | ◎ | ◇ | ◯ | ◇ | ◇ |
| パチンコ | ◇ | ◯ | ◇ | ◯ | ◎ | ◇ | ◇ | ◇ | ✕ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ◇ | ☆ | ◇ | ◇ |
| スロット | ◇ | ◯ | ◇ | ◯ | ◇ | ◇ | ✕ | ◇ | ◇ | △ | ◇ | ◇ | ◇ | ◯ | ◯ | ◇ | ◇ | ☆ | ◇ | ◇ |
| 萌え | ◇ | ◯ | ◇ | ◇ | ◎ | ◯ | ◇ | ◇ | ◎ | ◇ | ◇ | ◯ | ☆ | ◇ | ◇ | ◎ | ☆ | ◎ | ◇ | ◇ |

(76 港湾, 77 タイムスリップ, 78 スパイ, 79 芸能人 = all ◇, omitted)
Source: https://wikiwiki.jp/kairoparknew/gamedev/08

### 2.3 傑作 (☆ Masterpiece) combos, full list with total dev cost (S2 gamedev/09)
- RPG × ファンタジー(2215万), ぶ少女(1675), マツタケ(1450)
- シミュレーション × 競馬(1950), 恋愛(2040), 電車(1300), 古本屋(1400), 漫画家(1425), 映画(2095), ゲーム会社(2180), 街開発(2250), ビル建築(2200), 美少女(2410), アニメ(1650), アイドル(1450), マツタケ(1150), モータースポーツ(1690), サッカー(1750), F1(1750)
- テーブルゲーム × ポンチョ(550), 麻雀(525)
- アクション × ホラー(1420), 時代劇(1625), 忍者(1565), ぶ少女(1575), バスケット(1550), 相撲(1875)
- アドベンチャー × 探偵(800), ミステリー(885), 幕末(825), アニメ(1150)
- シューティング × ロボット(870), 輪投げ(775)
- アクションRPG × 狩り(2040), ポンチョ(1550)
- レース × スノーボード(1100), モータースポーツ(1490)
- ネットRPG × 中世欧州(2250)
- ネットSLG × 競馬(3450), コンビニ(3100), ゲーム会社(3680), ビル建築(3700), 株式(2775), アイドル(2950), マツタケ(2650)
- 素材集 × お笑い(600), コスプレ(675), ブラジャー(1745), 相撲(975)
- 育成 × 脳トレ(1525), 動物(1100), 漫画家(1225), ゲーム会社(1980), 街開発(2050), アイドル(1250), マツタケ(950), プロレス(1075), サッカー(1550), 卓球(1100), F1(1550), 萌え(1700)
- ボードゲーム × 将棋(650)
- パズル × 囲碁(520), リバーシ(500)
- 音楽ゲーム × ダンス(2820), ドラム(2725)
- サウンドノベル × 恋愛(1740), ホラー(920), 映画(1795), 美少女(2110), 探偵(1000), 幕末(1025), 萌え(1600)
- 体感ゲーム × アイドル(2950), ダンス(3320), ドラム(3225), フィットネス(3180), スキー(2800), スノーボード(2800), バレーボール(2850), パチンコ(2850), スロット(2850)
- **Omitted from 傑作: シミュレーションRPG, 教育, カードゲーム (no ☆ combos exist)**
- 独創的 (◎) list: see S2 gamedev/09 (RPG×ホラー/電車/美術/ビル建築/コスプレ/ダンス/ゴルフ/相撲/F1; シミュレーション×スポーツ/ブラジャー/水泳; アドベンチャー×拳法/お笑い/電車/忍者/輪投げ/コスプレ/ブラジャー/卓球; シューティング×拳法/ファンタジー/競馬/時代劇/裁判/狩り/マツタケ/麻雀/プロレス/バレーボール/F1; レース×戦国/ダンジョン/電車/ゲーム会社/妖怪/美少女/ぶ少女/幕末/総理大臣/コスプレ/ブラジャー/マツタケ/囲碁/フィットネス/野球/萌え; 音楽ゲーム×コンビニ/美少女/探偵/幕末/輪投げ/パンチラ/囲碁/麻雀/バスケット/卓球/レスリング/F1/萌え; サウンドノベル×拳法/動物/街開発/ブラジャー/水泳/野球; 体感ゲーム×スポーツ/競馬/恋愛/お笑い/脳トレ/古本屋/ビル建築/妖怪/美少女/ぶ少女/ミステリー/輪投げ/株式/アニメ/コスプレ/パンチラ/プロレス/レスリング/萌え; 素材集×拳法/恋愛/埋蔵金/パンチラ; 育成×ファンタジー/美術; ボード×輪投げ/スノーボード; パズル×スポーツ/ファンタジー/美術/エジプト/美男子; アクションRPG×ダンス/バスケット; ネットRPG×冒険物/パンチラ; ネットSLG×ポンチョ/リバーシ) — total 132 ◎ combos.

**ORIGINAL-version cross-check (S3 old wiki, 2010/2016 data):** 傑作 lists match the above for: RPG(ファンタジー/ぶ少女/マツタケ), シミュレーション(競馬/恋愛/電車/古本屋/漫画家/映画/ゲーム会社/街開発/ビル建築/美少女/アニメ/アイドル/マツタケ/モータースポーツ/サッカー/F1 — 16 items), テーブル(ポンチョ/麻雀), アクション(ホラー/時代劇/忍者/ぶ少女/バスケット/相撲), アドベンチャー(探偵/ミステリー/幕末/アニメ), シューティング(ロボット/輪投げ), ARPG(狩り/ポンチョ), レース(モータースポーツ — NOTE: スノーボード is a ++ addition), ネットRPG(中世欧州), ネットSLG(競馬/ビル建築/ゲーム会社/株式/マツタケ/アイドル/コンビニ — 水泳 is ++ addition), 素材集(お笑い/コスプレ/ブラジャー/相撲), 育成(動物/アイドル/萌え/マツタケ/サッカー/漫画家/プロレス — 脳トレ/ゲーム会社/街開発/卓球/F1 are ++ additions), パズル(囲碁/リバーシ), 音楽(ドラム/ダンス), サウンドノベル(ホラー/映画/萌え/恋愛/探偵/美少女 — 幕末 is ++ addition), 体感(フィットネス/ダンス/ドラム/スキー/スノーボード/パチンコ/スロット — アイドル/バレーボール are ++ additions). **→ For the clone: use the ORIGINAL ☆ lists; treat the extras flagged above as ++.**

---

## 3. Genres (ジャンル) — 20 types (S2 gamedev/05; S3 for original)

| # | Genre (JP) | EN | Popularity (initial) | Cost 万 (base) | Unlock (job level) | ORIG? |
|---|---|---|---|---|---|---|
| 04 | テーブルゲーム | Table game | low | 200 | from start | ✓ |
| 06 | アドベンチャー | Adventure | low | 500 | from start | ✓ |
| 12 | 素材集 | Collection/Asset | low | 300 | from start | ✓ |
| 15 | パズル | Puzzle | mid | 300 | from start | ✓ |
| 19 | 教育 | Education | low | 200 | from start | ✓ |
| 02 | シミュレーション | Simulation | high | 1000 | プログラマ Lv4 | ✓ |
| 05 | アクションゲーム | Action | mid | 1200 | シナリオライター Lv3 | ✓ |
| 07 | シューティング | Shooting | low | 600 | シナリオライター Lv3 | ✓ |
| 01 | RPG | RPG | high | 1300 | シナリオライター Lv5 | ✓ |
| 13 | 育成 | Training/Raising | mid | 800 | デザイナー Lv3 | ✓ |
| 09 | レースゲーム | Racing | low | 800 | サウンドクリエイター Lv3 | ✓ |
| 03 | シミュレーションRPG | SRPG | high | 1500 | ディレクター Lv1 | ✓ |
| 17 | サウンドノベル | Sound Novel | mid | 700 | ディレクター Lv2 | ✓ |
| 16 | 音楽ゲーム | Music | mid | 2000 | ディレクター Lv5 | ✓ |
| 14 | ボードゲーム | Board game | mid | 500 | プロデューサー Lv1 | ✓ |
| 08 | アクションRPG | Action RPG | high | 1200 | プロデューサー Lv3 | ✓ |
| 10 | ネットRPG | Net RPG | high | 2000 | プロデューサー Lv5 | ✓ |
| 20 | カードゲーム | Card game | high | 800 | ハードエンジニア Lv3 | ✓ |
| 18 | 体感ゲーム | Motion/Experience | high | 2500 | ハードエンジニア Lv4 | ✓ |
| 11 | ネットSLG | Net SLG | high | 2500 | スーパーハッカー Lv5 | ✓ |

Notes: genre max level 5; popularity "高/中/低" boosts sales; costs shown are base (Lv max cost is higher — S1 lists max-level costs: RPG 13,000万, アクション/ARPG 12,000万, カード 8,000万, アドベンチャー 5,000万, テーブル/教育 2,000万 — i.e. costs rise with genre level). **[ORIG]** unlock conditions identical in 2010 original (S3).

---

## 4. Contents (内容) — 79 types, unlock = job level + specific training (S2 gamedev/06)

Rule: content found via 教育 (training) while employee has the listed job at the listed level; one training discovers everything eligible at once. Contents with no training listed are available from start. Cost = base dev-cost contribution (万).

| 内容 (EN) | Cost | Unlock: Job Lv + Training |
|---|---|---|
| 埋蔵金 (Treasure) | 200 | start |
| 動物 (Animal) | 300 | start |
| ロボット (Robot) | 270 | start |
| 時代劇 (Period drama) | 425 | start |
| マラソン (Marathon) | 225 | start |
| 忍者 (Ninja) | 365 | start |
| ゴルフ (Golf) | 400 | start |
| リバーシ (Reversi) | 200 | start |
| スポーツ (Sports) | 260 | プログラマ Lv1 + ジョギング |
| 麻雀 (Mahjong) | 325 | プログラマ Lv1 + パチンコ |
| 飛行機 (Airplane) | 525 | プログラマ Lv1 + 科学博物館 |
| 港湾 (Harbor) | 500 | プログラマ Lv1 + 国内旅行 |
| 将棋 (Shogi) | 150 | プログラマ Lv2 + 散歩 |
| 冒険物 (Adventure tale) | 325 | プログラマ Lv2 + 映画鑑賞 |
| ダンジョン (Dungeon) | 400 | プログラマ Lv2 + ゲームで遊ぶ |
| 卓球 (Table tennis) | 300 | プログラマ Lv2 + ジョギング |
| 競馬 (Horse racing) | 950 | プログラマ Lv2 + パチンコ |
| 芸能人 (Celebrity) | 450 | プログラマ Lv2 + 音楽ライブ |
| F1 | 750 | プログラマ Lv2 + 海外旅行 |
| コンビニ (Convenience store) | 600 | プログラマ Lv3 + 散歩 |
| 高校 (High school) | 360 | プログラマ Lv3 + 散歩 |
| 野球 (Baseball) | 1070 | プログラマ Lv3 + 散歩 |
| 株式 (Stocks) | 275 | プログラマ Lv4 + 研究所 |
| ゲーム会社 (Game company) | 1180 | プログラマ Lv5 + ゲームで遊ぶ |
| ミステリー (Mystery) | 385 | シナリオライター Lv1 + 読書 |
| 映画 (Movie) | 1095 | シナリオライター Lv1 + 映画鑑賞 |
| プロレス (Pro wrestling) | 275 | シナリオライター Lv1 + ゲームで遊ぶ |
| パチンコ (Pachinko) | 350 | シナリオライター Lv1 + パチンコ |
| 中学校 (Middle school) | 300 | シナリオライター Lv1 + 大学で勉強 |
| ファンタジー (Fantasy) | 915 | シナリオライター Lv2 + 読書 |
| 探偵 (Detective) | 300 | シナリオライター Lv2 + 読書 |
| 恋愛 (Romance) | 1040 | シナリオライター Lv2 + 読書 |
| 戦国 (Warring states) | 600 | シナリオライター Lv2 + 映画鑑賞 |
| バスケット (Basketball) | 350 | シナリオライター Lv2 + ジョギング |
| ぶ少女 (Bishojo/cute girl) | 375 | シナリオライター Lv2 + 瞑想 |
| ダンス (Dance) | 820 | シナリオライター Lv2 + 音楽ライブ |
| アニメ (Anime) | 650 | シナリオライター Lv3 + アニメ鑑賞 |
| スロット (Slots) | 350 | シナリオライター Lv3 + パチンコ |
| ホラー (Horror) | 220 | シナリオライター Lv3 + ネットサーフィン |
| モータースポーツ (Motorsport) | 690 | シナリオライター Lv3 + ネットサーフィン |
| コスプレ (Cosplay) | 375 | シナリオライター Lv5 + アニメ鑑賞 |
| 美術 (Art) | 700 | デザイナー Lv1 + 映画鑑賞 |
| 妖怪 (Yokai) | 300 | デザイナー Lv1 + 瞑想 |
| 電車 (Train) | 300 | デザイナー Lv2 + 散歩 |
| バレーボール (Volleyball) | 350 | デザイナー Lv2 + ジョギング |
| サッカー (Soccer) | 750 | デザイナー Lv2 + ジョギング |
| 萌え (Moe) | 900 | デザイナー Lv3 + アニメ鑑賞 |
| 狩り (Hunting) | 840 | デザイナー Lv3 + ゲームで遊ぶ |
| 美少女 (Beautiful girl) | 1410 | デザイナー Lv3 + 音楽ライブ |
| レスリング (Wrestling) | 250 | サウンドクリエイター Lv1 + 散歩 |
| 水泳 (Swimming) | 300 | サウンドクリエイター Lv1 + 瞑想 |
| フィットネス (Fitness) | 680 | サウンドクリエイター Lv1 + 瞑想 |
| 囲碁 (Go) | 220 | サウンドクリエイター Lv1 + アニメ鑑賞 |
| 戦争 (War) | 425 | サウンドクリエイター Lv1 + 音楽ライブ |
| 古本屋 (Bookstore) | 400 | サウンドクリエイター Lv3 + 散歩 |
| 相撲 (Sumo) | 675 | ディレクター Lv1 + 散歩 |
| 拳法 (Martial arts) | 315 | ディレクター Lv1 + 映画鑑賞 |
| スノーボード (Snowboard) | 300 | ディレクター Lv1 + ジョギング |
| 裁判 (Trial) | 1010 | ディレクター Lv1 + ネットサーフィン |
| アイドル (Idol) | 450 | ディレクター Lv1 + 科学博物館 |
| ビル建築 (Skyscraper) | 1200 | ディレクター Lv1 + 海外旅行 |
| スパイ (Spy) | 650 | ディレクター Lv1 + 海外旅行 |
| 美男子 (Handsome man) | 425 | ディレクター Lv2 + 大学で勉強 |
| 輪投げ (Ring toss) | 175 | ディレクター Lv2 + パチンコ |
| 脳トレ (Brain training) | 725 | ディレクター Lv3 + 研究所 |
| ドラム (Drums) | 725 | プロデューサー Lv1 + 読書 |
| お笑い (Comedy) | 300 | プロデューサー Lv1 + 映画鑑賞 |
| スキー (Ski) | 300 | プロデューサー Lv1 + ジョギング |
| タイムスリップ (Time travel) | 500 | プロデューサー Lv1 + 瞑想 |
| 幕末 (Bakumatsu) | 325 | プロデューサー Lv1 + 国内旅行 |
| エジプト (Egypt) | 300 | プロデューサー Lv1 + 海外旅行 |
| 街開発 (City building) | 1250 | プロデューサー Lv2 + 科学博物館 |
| 漫画家 (Manga artist) | 425 | ハードエンジニア Lv1 + 読書 |
| 中世欧州 (Medieval Europe) | 250 | ハードエンジニア Lv2 + 映画鑑賞 |
| 総理大臣 (Prime minister) | 1175 | ハードエンジニア Lv2 + 研究所 |
| ポンチョ (Poncho) | 350 | スーパーハッカー Lv1 + 海外旅行 |
| パンチラ (Panty peek) | 1088 | スーパーハッカー Lv2 + アニメ鑑賞 |
| マツタケ (Matsutake mushroom) | 150 | スーパーハッカー Lv2 + 国内旅行 |
| ブラジャー (Bra) | 1445 | スーパーハッカー Lv5 + 国内旅行 |

**[ORIG]** The 2010 original had most of these; S3 confirms パンチラ/ブラジャー/マツタケ/ポンチョ etc. existed. Exact original list = 72 contents (English wiki); ++ added 港湾/タイムスリップ/スパイ/芸能人 + others. Verify against English wiki for the original-72.

---

## 5. Jobs (職業) and career change (転職) (S2 gamedev/12; S1)

### 5.1 Job table
- Job max level = Lv5. Leveling raises stats AND salary +20% per level.
- Changing job costs item 転職の教科書 (Job-Change Textbook).
- Salary (年俸) deducted end of March every year; FIRST year free.
- Job level/history affects: (a) genre/content unlocks, (b) who can do 企画/原画/音楽 phases, (c) own-console unlock. **Not** directly sales.

| Job | Career-change requirement | Main role | プログラム | シナリオ | グラフィック | サウンド | デバッグ |
|---|---|---|---|---|---|---|---|
| プログラマ Programmer | — | debug | + | + | + | + | ++ |
| シナリオライター Scenario Writer | — | 企画 (planning) | ++ | ++ | + | + | + |
| デザイナー Designer | — | α版 | + | ++ | ++ | + | + |
| サウンドクリエイター Sound Creator | — | β版 | + | ++ | + | ++ | + |
| ディレクター Director | プログラマLv5 + シナリオライターLv5 | debug + β版 | +++ | ++ | + | ++ | +++ |
| プロデューサー Producer | デザイナーLv5 + サウンドクリエイターLv5 | 企画 + α版 | + | +++ | +++ | + | + |
| ハードエンジニア Hardware Engineer | ディレクターLv5 + プロデューサーLv5 | own console | + | +++ | + | + | +++ |
| スーパーハッカー Super Hacker | ハードエンジニアLv5 | everything | +++ | +++ | +++ | +++ | +++ |

**Job tree:** 4 base jobs → Director / Producer → Hardware Engineer → Super Hacker. **[ORIG]** identical tree in 2010 original (S3/S4 confirm). Warning (S2): if you change job from one an employee was HIRED with, you can't go back until conditions met again (e.g., hired Super Hacker → changed → must re-master ALL jobs Lv5).

### 5.2 Level-up stat gains per job (S2 gamedev/12) — first row = general "総合" gain (all stats), then per-stat deltas

| Job | Stat | Lv2 | Lv3 | Lv4 | Lv5 |
|---|---|---|---|---|---|
| プログラマ | (総合) | 15 | 25 | 40 | 55 |
| | プログラム | 8 | 11 | 12 | 12 |
| | シナリオ | — | 3 | — | 4 |
| | グラフィック | 3 | — | 1 | 3 |
| | サウンド | — | — | 3 | 4 |
| シナリオライター | (総合) | 15 | 20 | 30 | 50 |
| | プログラム | — | — | 7 | 3 |
| | シナリオ | 12 | 10 | 8 | 14 |
| | グラフィック | — | 3 | 3 | 4 |
| | サウンド | 5 | 6 | — | 3 |
| デザイナー | (総合) | 15 | 25 | 28 | 45 |
| | プログラム | — | 3 | — | 4 |
| | シナリオ | 2 | 1 | 3 | 2 |
| | グラフィック | 6 | 10 | 6 | 12 |
| | サウンド | — | — | — | 4 |
| サウンドクリエイター | (総合) | 15 | 25 | 35 | 50 |
| | プログラム | 2 | 1 | 2 | 6 |
| | シナリオ | 1 | — | — | 3 |
| | グラフィック | — | 3 | 2 | 5 |
| | サウンド | 6 | 10 | 6 | 14 |
| ディレクター | (総合) | 30 | 40 | 60 | 88 |
| | プログラム | 10 | 8 | 9 | 15 |
| | シナリオ | 12 | 10 | 11 | 14 |
| | グラフィック | — | 2 | 1 | 3 |
| | サウンド | 1 | 2 | 4 | 2 |
| プロデューサー | (総合) | 35 | 50 | 77 | 108 |
| | プログラム | 10 | 10 | 8 | 14 |
| | シナリオ | 10 | 5 | 10 | 15 |
| | グラフィック | 12 | 10 | 12 | 12 |
| | サウンド | 6 | 8 | — | 18 |
| ハードエンジニア | (総合) | 40 | 60 | 90 | 135 |
| | プログラム | 11 | 11 | 11 | 20 |
| | シナリオ | 11 | 11 | 11 | 18 |
| | グラフィック | — | 5 | — | 12 |
| | サウンド | 11 | 3 | 5 | — |
| スーパーハッカー | (総合) | 32 | 64 | 128 | 256 |
| | プログラム | 1 | 12 | 15 | 40 |
| | シナリオ | 1 | 12 | 15 | 30 |
| | グラフィック | 1 | 12 | 15 | 30 |
| | サウンド | 1 | 10 | 15 | 30 |

---

## 6. Game development process (ゲーム開発) (S2 gamedev/04; S1; S7)

1. **New project**: choose hardware (license cost if not PC), genre, content (costs scale with genre/content level — Lv max cost much higher), 方針 (policy, below).
2. **方向性 (Direction)**: 8 items × 10 points, re-allocatable per game: e.g. カジュアル/ポップ/キュート/壮大/フレンドリー etc. (S5's list is invented; actual 8 directions in game are e.g. かわいい/かっこいい/大人/子供/マニア/一般... — exact names unverified in JP wikis; verify from game). Direction points accumulate as company image; matching direction ↔ genre/content levels them up. **Genre level-up gives +2 direction points at Lv2 and Lv5** (S2 gamedev/01, gamedev/04). Max 8 directions, no more discovered beyond 8.
3. **企画 (Planning)**: assign シナリオライター-experienced employee or 外注 (outsource); scenario stat matters; don't reuse the same employee as last time (「前回」penalty).
4. Compatibility verdict screen for genre×content.
5. **α版 (40%)**: Designer-experienced employee or outsource adds グラフィック points.
6. **β版 (80%)**: Sound Creator or outsource adds サウンド points.
7. **バグ取り (debug)**: ship anytime but bugs cause damage; squashed bugs convert to 研究データ; バグ消しテクノロジー speeds debugging.
8. Release; **雑誌レビュー**: 4 reviewers × 10 pts = max 40; **32+ = 殿堂入り (Hall of Fame)** → sequels allowed (same series on other platforms); if sequel doesn't reach HoF, series ends.
9. **挑戦イベント (Challenge events)** during dev: random employee proposes (e.g. raise おもしろさ/独創性, graphics/sound boost); costs money + research data; spend research data to raise success up to **80%**; success → 期待度 up; fail → 期待度 down + bugs increase. Same employee can't be used consecutively.
10. Random dev events (queue 行列, blackout 停電 etc.) change points/sales.

**開発方針 (Dev policies)** (S1/S2): 通常開発 +0%; 速度優先 +20% (faster, lower quality); クオリティ重視 +30% (more ひらめき/inspiration, slower); 研究重視 +30% (more research data); 予算増額 +100% (morale up, speed AND quality up).

**Game parameters (S2 gamedev/04, S1):** おもしろさ (Fun) → sells better; 独創性 (Originality) → hits; バグ (Bugs) → damage if shipped; グラフィック/サウンド points. Bugs → 研究データ when squashed.

**研究データ (Research data) uses** (S1 kenkyu, S2): employee level-up (cost per level — exact formula not in JP wiki; English wiki: level cost = level×... verify), テクノロジー activation (cost = floor(current/5), min 30, max 190), challenge events. Earned from: dev progress, bug squashing, contracts, 教え合い.

**POWER (stamina)**: drains during dev/training; at 0 employee goes home (recovers while away). Training executable if ≥2 bars remain even below listed requirement (exploit: endless training with 2-bar cost effectively).

---

## 7. Bugs & 販売停止 (sales halt) (S1/S2/S7)

- Bugs accumulate during dev (more from failed challenges, 組み合わせ「悪い」, low stats). **[ORIG]** official 2001 sequel page: 「バグがあるのに出荷すると販売停止で大損害を受ける場合があります」(ship with bugs → sales halt, big loss) — same mechanic in 2010 original.
- Squash bugs during バグ取り; each squashed bug → +研究データ.
- **クソゲーム賞 (Worst Game Award)**: ship with **50–60 bugs left** → win (also possible with bad-combo + 0 bugs, per S2 note). Prize: **−3,000万 (fine)**.
- バグ消しテクノロジー shortens debug time.

---

## 8. Contracts (受注開発) — full list (S2 gamedev/11; S1 has 3 entries)

Rewards vary per order (re-rolled on save/reset). Deadline & required stat totals fixed. Missing deadline → no reward. Best value = highest 報酬/必要パラメータ ratio. 納期 in weeks.

| Job | 報酬 万 | 報酬 研究データ | 納期/週 | プログラム | シナリオ | グラフィック | サウンド | Unlock |
|---|---|---|---|---|---|---|---|---|
| ゲーム漫画執筆 (write game manga) | 800–1,600 | 15–19 | 10 | 8 | — | 18 | — | start |
| 着信メロディ (ringtone) | 1,000–2,000 | 10–13 | 11 | — | — | — | 30 | start |
| 町内会のマスコット (mascot) | 1,000–2,000 | 15–19 | 11 | 5 | — | 35 | — | start |
| アニメの効果音 (anime SFX) | 1,200–2,400 | 10–14 | 11 | — | 5 | — | 30 | start |
| キャラデザイン (char design) | 1,500–3,000 | 21–23 | 10 | — | 15 | 30 | — | start |
| パチンコのムービー (pachinko movie) | 2,000–4,000 | 10–14 | 10 | — | — | 30 | 20 | start |
| ゲームシナリオ (game scenario) | 2,000–4,000 | 20–24 | 10 | 25 | 30 | — | — | start |
| ツール開発 (tool dev) | 2,000–4,000 | 36–38 | 9 | 20 | 20 | — | — | 中規模オフィス |
| ミニゲームの下請け (minigame subcontract) | 3,500–7,000 | 10–14 | 6 | 30 | 20 | — | — | 中規模オフィス |
| ゲームエンジン制作 (game engine) | 5,000–10,000 | 36–37 | 8 | — | 50 | — | 40 | 中規模オフィス |
| テーマソング作曲 (theme song) | 1,800–3,600 | 26–29 | 10 | — | 10 | — | 40 | 中規模オフィス |
| 映画の3Dムービー (movie 3D) | 4,000–6,400 | 17–19 | 10 | — | — | 50 | 20 | 中規模オフィス |
| 映画音楽 (film music) | 2,600–5,000 | 30–33 | 12 | — | — | — | 80 | 大規模オフィス |
| 海外ゲームの翻訳 (translation) | 6,000–12,000 | 40–44 | 8 | 60 | 80 | — | — | 大規模オフィス |
| ゲームソフトの移植 (port) | 2,600–5,000 | 41–43 | 13 | 70 | — | 70 | — | 大規模オフィス |
| ゲーム機の分析 (console analysis) | 8,500–17,000 | 61–63 | 8 | 100 | 100 | — | — | 大規模オフィス |

**[ORIG]** same 16 contract types in 2010 original (S1/S3 lists match; S1: アニメの効果音 1400万, パチンコのムービー 2600万, ゲーム漫画執筆 900万 — single values, rewards vary per offer).

---

## 9. Consoles (ハード) (S2 gamedev/17; S1 list of names)

All except PC require license. Shipment numbers roughly proportional to console install base (age/cost matter little). Developing many games on a console slightly grows its install base (~10万台). Old consoles get discontinued (製造終了) → no more new games. Genre/content cost multiplier per console differs.

| Console (JP → real-world analog) | Dev cost 万 | License 万 | Genre/content cost × | Maker | Unlock | End of production | Install base 万台 |
|---|---|---|---|---|---|---|---|
| パソコンゲーム (PC) | 100 | — | ×1 | — | start | — | 50~ |
| マイクロン-SX (MSX) | 500 | 2,000 | ×2 | ニポン | start | 6年2月 | 80–113 |
| ウルトラドライブ (Mega Drive) | 1,800 | 4,000 | ×2 | セタガヤ | 1年11月 | 6年6月 | 99–120 |
| ファミオン (Famicom) | 3,000 | 8,000 | ×2 | 雨天堂 | 3年2月 | 7年7月 | 180–197 |
| ゲームボーヤ (Game Boy) | 2,500 | 5,500 | ×1 | 雨天堂 | 3年11月 | 16年12月 | 250–285 |
| ポケットギア (Game Gear) | 4,500 | 10,500 | ×2 | セタガヤ | 5年6月 | 10年6月 | 200–212 |
| PCC-FQX (PC-FX) | 3,000 | 6,800 | ×3 | ニポン | 6年2月 | 11年2月 | 200–235 |
| ネオンジオン (Neo Geo) | 4,000 | 22,000 | ×4 | ニポン | 7年2月 | 9年4月 | 300–306 |
| ワールドスオン (WonderSwan) | 5,500 | 45,000 | ×3 | マイロフート | 7年6月 | 17年5月 | 350–370 |
| スーパーファミオン (SFC) | 6,000 | 50,000 | ×4 | 雨天堂 | 7年8月 | 11年7月 | 400–412 |
| バーチャメガネ (Virtual Boy) | 4,000 | 18,000 | ×5 | 雨天堂 | 8年8月 | 11年12月 | 300–309 |
| プレステータス (PS1) | 6,500 | 100,000 | ×8 | ソヌィ | 10年6月 | 18年2月 | 600–622 |
| プレディアン (Playdia) | 8,500 | 150,000 | ×12 | ニポン | 10年8月 | 19年4月 | 310–332 |
| セタガヤターン (Saturn) | 6,500 | 120,000 | ×8 | セタガヤ | 10年11月 | 19年2月 | 650–671 |
| ラボリューション (GC/N64/Wii-codename) | 8,500 | 250,000 | ×12 | 雨天堂 | 11年2月 | 18年11月 | 800–819 |
| プレスポケット (PSP) | 9,500 | 200,000 | ×9 | ソヌィ | 12年6月 | — | 600~ |
| ウテンドウDM (NDS) | 10,000 | 350,000 | ×18 | 雨天堂 | 16年2月 | — | 850~ |
| プレステータス2 (PS2) | 10,000 | 400,000 | ×18 | ソヌィ | 17年6月 | — | 1020~ |
| マイクロックス480 (Xbox/360) | 12,000 | 500,000 | ×18 | マイロフート | 17年9月 | — | 800~ |
| ウンテンタウンズ (Wii) | 16,000 | 800,000 | ×25 | 雨天堂 | 18年5月 | — | 1200~ |
| ハーポドライブ (Odyssey/Atari) | 13,000 | 900,000 | ×25 | セタガヤ | 19年7月 | — | 1500~ |
| プレイポッポX (PCE-Duo/PS3) | 15,000 | 999,999 | ×30 | ニポン | 19年11月 | — | 1550~ |
| オポチュニティ512 (Mars rover) | 3,500 | 640,000 | ×50 | カロイソフト | GP ×2 + 売上1600万本 | — | 1800~ |
| オシリーヌPOKET (toilet) | 3,500 | 640,000 | ×50 | カロイソフト | GP ×5 + 売上2000万本 | — | 2000~ |

Left install = initial, right = at end of production (no Kairos/own console, no dev). **[ORIG]** The 2010 original had the same console list up to プレイポッポX (English wiki confirms ~22 consoles); オポチュニティ512/オシリーヌPOKET = hidden consoles also in original (achievements "火星探査機みたいなハード"/"トイレみたいなハード", S2). Release timing: consoles unlock by year+month as listed.

### 9.1 自社ハード (own console) — [BOTH] (S2 gamedev/17; S1)
- Requires: 大規模オフィス + at least 1 active ハードエンジニア.
- Only ONE own console at a time; new one ends the previous.
- Takes long (faster with higher stats); releasing in **December** grows install base more (July release weak).
- No end of production; selling software grows its install base.
- Development has two phases: 前半 (おもしろさ + グラフィック, e.g. 0/650) and 後半 (独創性 + サウンド, 0/650) (S1).
- Spec choice (cost 万, build time bonus, requirement):

| Spec | Type | Cost 万 | Time | Requirement |
|---|---|---|---|---|
| 携帯型 handheld | 形態 form | 40,000 | 0 | — |
| 据え置き型 console | 形態 | 60,000 | +100 | — |
| 16ビットチップ | CPU | 10,000 | +100 | ハードエンジニア Lv1 |
| 32ビットチップ | CPU | 100,000 | +150 | — |
| 64ビットチップ | CPU | 500,000 | +250 | — |
| ポテトチップ (Potato Chip) | CPU | 900,000 | +299 | ハードエンジニア ×4 |
| カセット式 cartridge | メディア | 30,000 | +100 | ハードエンジニア Lv1 |
| CD-ROM | メディア | 50,000 | +150 | — |
| DVD-ROM | メディア | 150,000 | +200 | — |
| ブルーレイディスク | メディア | 350,000 | +300 | — |
| パンチカード (Punch Card) | メディア | 939,999 | +400 | ハードエンジニア ×6 |

- ポテトチップ + パンチカード combo → カイロくん型自社ハード [++ confirmed; likely also original]. CPU/media choices remain after use even if engineer count drops.

---

## 10. Advertising (宣伝広告), fans, hype (S2 gamedev/14; S1)

- Ads during dev raise 期待度/知名度 of the game; ads at release raise shipments directly; ads raise fans (permanent sales boost for ALL future games).
- Fan gains diminish as fan count grows; each ad has a cap (cheaper ads cap lower). Fans are age-segmented (世代交代 over time — young fans are longer-term investment). Fan letters occasionally +fans (complaints −fans).
- **Releasing nothing for a while, or same genre+content twice in a row, decreases fans** (change genre or content each game).

| Ad | Cost 万 | Unlock |
|---|---|---|
| 雑誌に広告 magazine | 300 | start |
| ネット広告 net | 500 | start |
| ラジオ広告 radio | 800 | start |
| 体験版を配布 demo | 1,500 | start |
| ちんどん屋 (street band) | 2,500 | start |
| テレビCM TV CM | 3,500 | 中規模オフィス |
| 着ぐるみショウ mascot show | 5,000 | 中規模 |
| テレビ番組スポンサー TV sponsor | 6,500 | 中規模 |
| キャラバンカーが走る caravan | 12,000 | 中規模 |
| カードゲーム大会 card tournament | 33,000 | 大規模オフィス |
| 飛行船を飛ばす airship | 55,000 | 大規模 |
| 月面広告 moon ad | 99,000 | 大規模 |

**[ORIG]** Original had same 12 ads (English wiki confirms, incl. 月面広告).

---

## 11. Magazine reviews, awards, events (S1; S2 gamedev/16; S4)

### 11.1 雑誌レビュー (magazine review)
- 4 reviewers, 10 pts each, max 40. **32+ → 殿堂入り (Hall of Fame)** → sequel possible; sequel must also reach HoF or the series ends.
- S4 claims Grand Prix needs **38+ pts** (plus 10–20M sales, 7000+ fans, own console + legendary staff) — consistent with English wiki; treat 38 as reported threshold.
- Game name 「カイロソフト」 allegedly gets biased review (S2 trivia, unverified).

### 11.2 日本ゲーム発展大賞 (annual, 12月3週目; games released Jan wk1–Dec wk3 eligible) (S2 gamedev/16)

| Award | Prize 万 | Notes |
|---|---|---|
| デザイン賞 Design | 1,000 | high グラフィック |
| 音楽賞 Music | 1,000 | high サウンド |
| 準グランプリ Runner-Up | 5,000 | |
| クソゲーム賞 Worst Game | **−3,000** | ship with 50–60 bugs |
| グランプリ Grand Prize | 10,000 | + special unlocks (below) |

Grand Prize unlocks (S2): 1st win → 森野クマックス hireable; 2nd → console オポチュニティ512 announced (also needs 16M sales); 3rd → チンパンGフォース; 4th → nothing; 5th → カイロくん hireable + console オシリーヌPOKET announced (also needs 20M sales). Any award raises 知名度.

### 11.3 ゲームデックス (annual July, from 中規模オフィス) (S2)

| Option | Cost 万 |
|---|---|
| 出展しない skip | 0 |
| ゲストなし no guest | 1,500 |
| ぬいぐるみを配置 mascot | 6,000 |
| コンパニオンを配置 companions | 25,000 |
| 豪華ゲストを呼ぶ (カイロくん) | 70,000 |

Raises company popularity. [ORIG] original had same event.

### 11.4 Yearly calendar (S1)
- 5月1–2週: アイテム屋 (item shop) visits (max 3 items per visit; prices rise after office move).
- 7月1週: ゲームデックス. 12月3週: 大賞. 3月末: salaries paid.

---

## 12. Staff (社員) (S2 gamedev/13)

### 12.1 Stat meanings
プログラム Program — all-around; planning/drawing/dev points. シナリオ Scenario — more research data discovery, originality. グラフィック/サウンド — dev points. POWER 体力 — drains in dev/training; empty → goes home (recovers).

### 12.2 Hireable roster (++ complete list; contract fee 契約金, yearly salary 年俸 initial, salary if all jobs Lv5, stats, unlock). **[++]** full roster; **[ORIG]** staff with ★ existed in 2010 original (S3/S2 achievements: ミスターX=謎のスタッフX, アブファラ国王=A, 森野クマックス=M, チンパンGフォース=G, カイロくん=K; others per oldwiki pages).

| Name | 契約金万 | 年俸万 | 年俸(all5)万 | POWER | プログラム | シナリオ | グラフィック | サウンド | Unlock |
|---|---|---|---|---|---|---|---|---|---|
| 井上こうぞう | 400 | 200 | 67,884 | 8 | 3 | 24 | 3 | 6 | start |
| 森田かずお | 400 | 200 | 67,884 | 9 | 18 | 8 | 8 | 3 | start |
| 宮沢はやと | 400 | 240 | 81,460 | 10 | 2 | 14 | 15 | 6 | start |
| 永下ひろみ | 400 | 280 | 95,034 | 13 | 1 | 1 | 36 | 3 | 知り合い経由 |
| 三段腹へるお | 500 | 260 | 61,216 | 12 | 15 | 6 | 3 | 7 | 知り合い経由 |
| 加藤三木助 | 500 | 240 | 81,460 | 11 | 24 | 4 | 2 | 2 | 知り合い経由 |
| 宮村みちこ | 600 | 300 | 85,070 | 14 | 7 | 19 | 2 | 10 | 知り合い経由 |
| 桃山モモコ | 600 | 350 | 68,803 | 14 | 15 | 8 | 10 | 13 | 知り合い経由 |
| 角川かどみ | 1,300 | 400 | 54,765 | 13 | 13 | 20 | 6 | 14 | 知り合い経由 |
| 鳥谷あきお | 1,300 | 500 | 98,662 | 14 | 10 | 18 | 23 | 6 | 知り合い経由 |
| 松山ちさと | 500 | 260 | 88,150 | 13 | 3 | 12 | 18 | 26 | 知り合い経由 |
| ビルゲイ子 | 600 | 300 | 70,892 | 13 | 24 | 26 | 4 | 6 | 知り合い経由 |
| 杏仁なみこ | 1,300 | 450 | 61,612 | 14 | 24 | 18 | 4 | 15 | 知り合い経由 |
| 猿元フリドリッヒ | 2,400 | 600 | 118,394 | 15 | 8 | 8 | 30 | 25 | 知り合い経由 |
| 桂こじろう | 1,800 | 600 | 68,516 | 15 | 9 | 20 | 30 | 20 | 知り合い経由 |
| 堀田雄三 | 2,000 | 700 | 95,976 | 16 | 24 | 48 | 25 | 10 | 知り合い経由 |
| マリリン シャポワラ | 2,000 | 650 | 61,885 | 15 | 24 | 7 | 39 | 8 | 知り合い経由 |
| 梶山奈保 | 3,000 | 850 | 56,217 | 16 | 28 | 49 | 6 | 32 | 知り合い経由 |
| 秋みかん | 4,000 | 650 | 89,114 | 15 | 36 | 36 | 15 | 5 | 知り合い経由 |
| 石森しょうた | 5,000 | 333 | 18,283 | 18 | 60 | 24 | 50 | 10 | 専門学校 |
| カツヤマリン3世 | 2,500 | 700 | 26,786 | 17 | 32 | 85 | 9 | 19 | 専門学校 |
| 猫村みみこ | 2,600 | 900 | 71,467 | 17 | 7 | 16 | 40 | 104 | 専門学校 |
| 鼻ほじろう | 1,500 | 650 | 106,936 | 17 | 47 | 14 | 21 | 88 | 専門学校 |
| 木下めぐこ | 8,000 | 999 | 66,009 | 19 | 84 | 60 | 15 | 12 | 専門学校 |
| 牧枝ふとし | 2,700 | 1,200 | 66,169 | 18 | 28 | 84 | 32 | 32 | 専門学校 |
| 大島よしぢ | 3,000 | 1,200 | 45,951 | 18 | 36 | 120 | 50 | 20 | 専門学校 |
| 木下としお | 3,000 | 1,024 | 81,201 | 19 | 35 | 16 | 30 | 156 | 専門学校 |
| 雪山ほの子 | 5,800 | 888 | 33,966 | 18 | 24 | 56 | 91 | 16 | 専門学校 |
| 沢上エリ子 | 8,400 | 1,200 | 114,338 | 20 | 36 | 120 | 30 | 50 | 専門学校 |
| 神宮寺はるお | 3,800 | 1,300 | 178,411 | 20 | 96 | 72 | 50 | 108 | 専門学校 |
| 奥村サンタコ | 10,000 | 2,000 | 158,932 | 20 | 80 | 40 | 92 | 54 | 会社説明会+大規模 |
| 中元工事 | 7,000 | 1,600 | 152,452 | 20 | 120 | 132 | 30 | 30 | 会社説明会+大規模 |
| エビー・チャン | 15,000 | 2,300 | 263,131 | 25 | 72 | 120 | 50 | 120 | 会社説明会+大規模 |
| ガッデム乳山 | 4,200 | 1,500 | 82,749 | 24 | 59 | 64 | 120 | 120 | 会社説明会+大規模 |
| ステイブジョビン | 20,000 | 3,000 | 137,967 | 29 | 112 | 168 | 130 | 104 | 会社説明会+大規模 |
| 大堂ドルリン子 | 85,000 | 6,000 | 572,241 | 30 | 120 | 180 | 140 | 78 | 会社説明会+大規模 |
| 第壱ともこ | 55,000 | 3,500 | 193,141 | 24 | 144 | 96 | 170 | 180 | 会社説明会+大規模 |
| 藤山ふじおA | 45,000 | 3,000 | 286,087 | 30 | 288 | 225 | 234 | 130 | 会社説明会+大規模 |
| すぎもと耕二 | 75,000 | 4,000 | 220,761 | 20 | 48 | 270 | 260 | 195 | 会社説明会+大規模 |
| フランソワーズ花 | 88,888 | 8,000 | 441,576 | 30 | 357 | 336 | 224 | 168 | 会社説明会+大規模 |
| ミスターX ★ | 5,000 | 1,000 | 66,169 | 24 | 48 | 25 | 4 | 7 | 中規模+専門学校+売上10位内 |
| アブファラ国王 ★ | 15,000 | 1,500 | 82,749 | 26 | 36 | 61 | 47 | 52 | 中規模+売上100万本+説明会 |
| 森野クマックス ★ | 44,444 | 4,000 | 317,895 | 27 | 64 | 112 | 104 | 64 | ハリウッド+GP 1勝 |
| チンパンGフォース ★ | 65,533 | 6,000 | 397,390 | 30 | 182 | 182 | 39 | 39 | ハリウッド+GP 3勝 |
| カイロくん ★ | 65,536 | 9,000 | 96,283 | 30 | 320 | 300 | 260 | 260 | ハリウッド(14年1月以降)+全賞5回(クソゲーム賞除く)+売上2000万本+ゲームデックス豪華ゲスト |

Notes: 「知り合い経由」pool = 19 cheap staff; hiring method determines the pool (1-2 tiers down can also appear). S4: cheap-hire strategy recommended early; スーパーハッカー hireable: 藤山ふじおA (cheapest, 45000万 contract + ~40000万 search cost → ~10億 cash needed), フランソワーズ花, すぎもと耕二 (only at 大規模オフィス).

### 12.3 Outsourcing (外注) (S2 gamedev/13)
Fixed temp staff (3 categories: 企画プランナー/原画/音楽), e.g. 石橋はしお (100万), 豊臣秀丸 (1000万), 斉東たわあ (3500万), 飯乃堅太郎 (7700万), 園山ひろこ (1万), ウィリアム・トマト (24000万); 原画: 上村はるき (100), 織田英太郎 (950), 鳥村あきこ (3200), モネ山ピカ草 (6400), 赤束ふじみ (9500), ゲイリー・ケイムラ (20500); 音楽: 米東べん (100), 網通あると (900), ニコ・オシリフスキー (3000), 坂元龍司 (5500), 三十島ゆきえ (11000), ミルク・プリンズキー (28000). Using outsourcing at α/β raises 知名度/期待度; outsourcing CANNOT actually job-change (display bug).

### 12.4 Training (教育) (S2 gamedev/13)
- Non-パチンコ trainings: raise stats toward a per-training cap (higher cost → higher cap; 海外旅行 highest). ~5% chance of スーパー能力アップ (×3 gain/loss); cap at 999.
- **パチンコ (Pachinko)**: ~27% success → ALL stats +6, fail → ±0, no other penalty; **no cap (only 999)** — the only unlimited training. [BOTH]
- Costs and POWER reqs:

| Training | Cost 万 | POWER | プログラム | シナリオ | グラフィック | サウンド | Unlock |
|---|---|---|---|---|---|---|---|
| 散歩 walk | 300 | 2 | — | +3 | +3 | — | start |
| 読書 reading | 300 | 2 | +4 | +3 | — | — | start |
| 映画鑑賞 movies | 500 | 2 | — | — | +4 | +4 | start |
| アニメ鑑賞 anime | 700 | 3 | +5 | +4 | +3 | +2 | start |
| ゲームで遊ぶ games | 1,000 | 3 | +6 | — | +5 | — | start |
| ジョギング jogging | 1,200 | 4 | +4 | — | — | +5 | 中規模 |
| パチンコ pachinko | 800 | 5 | +6/0 | +6/0 | +6/0 | +6/0 | 中規模 |
| 瞑想 meditation | 900 | 5 | +1 | +2 | +1 | +3 | 中規模 |
| 音楽ライブ live music | 1,600 | 3 | +3 | — | — | +5 | 中規模 |
| ネットサーフィン surfing | 2,800 | 4 | +7 | +5 | −5 | — | 中規模 |
| 科学博物館 museum | 3,000 | 4 | +5 | +6 | +6 | −3 | 中規模 |
| 大学で勉強 university | 5,500 | 6 | −2 | +5 | — | — | 大規模 |
| 研究所 lab | 8,000 | 7 | +6 | −3 | +3 | +4 | 大規模 |
| 国内旅行 domestic trip | 10,500 | 9 | +8 | +7 | +4 | +5 | 大規模 |
| 海外旅行 overseas trip | 25,000 | 11 | +5 | +8 | +6 | +6 | 大規模 |

### 12.5 Recruiting methods (求人) (S2; S1)

| Method | Cost 万 | Unlock |
|---|---|---|
| 知り合い経由 | 500 | start |
| 雑誌で募集 | 1,200 | start |
| ネットで募集 | 5,500 | start |
| 専門学校で探す | 8,000 | 中規模 |
| 会社説明会を開く | 18,000 | 中規模 |
| ハリウッドで探す | 35,000 | 大規模 |

---

## 13. Offices (オフィス) (S2 gamedev/03; S4)

| Office | Max staff | Move cost 万 | Trigger |
|---|---|---|---|
| 小規模 small | 4 | — | start |
| 中規模 medium | 6 | 6,000 | year 4+ (after ≥1 game dev) AND 総資金 ≥1億 |
| 大規模 large | 8 | 25,000 | year 4 Dec wk3–6: both 総資金≥3.5億 AND won 音楽賞+デザイン賞 ≥1 each; year 7–9: either one; year 10+: unconditional |

Move boosts all fan generations. 席替え (seat shuffle) cosmetic, but door-adjacent seats shorten walk time for low-POWER staff (S2 trivia). **[ORIG]** original: 4→6→8 staff too.

---

## 14. Items & Technology (S2 gamedev/15)

- Item shop visits every year from year 2, 5月2週; max 3 items/visit; prices rise after office move.
- Technologies (one-time buy; each purchase raises remaining tech prices): おもしろ (Fun up), 独創性 (Originality up), グラフィック, ナイスサウンド, バク消し (bug reduction/shorten debug), 炎 (1-2 employees show fire — strong boost). Use cost = 研究データ = floor(current/5), min 30, max 190. Repeated tech use in same dev weakens effect (even different types).
- Consumables: リポタンD2048 (restore all POWER; 500/2,000/5,500万 by office size), 転職の教科書 (job change; same price tiers).

---

## 15. New Game+ (周回プレイ) and ending (S2 gamedev/02; S1)

- Clear at 21年1月 (start of year 21; game runs 20 full years). Ending after 20 years; score/総資産 frozen thereafter but playable.
- Carries over to NG+: genre & content levels (must re-unlock via conditions again), direction points. Nothing else.
- Hi-score measured at clear time is saved; continuing to play doesn't re-measure.
- 高速モード (fast mode) unlocked from start in ++.
- Last 32 games kept in history (older deleted — even Hall of Fame ones, killing their sequels); sales chart records persist.

---

## 16. Unique/hidden mechanics from Japanese sources (not on English wikis or rarely documented)

1. **コンビネーション 判定は完全に仕様**: SRPG/教育/カードゲーム and 港湾/タイムスリップ/スパイ/芸能人 never get compat comments (S2 05/06/08).
2. **名前ネタ**: naming your software/console 「ゲーム発展国」 allegedly boosts sales; 「カイロソフト」 biases magazine reviews (S2 — unverified, dev in-joke).
3. **Challenge event carry-over bug**: if a challenge proposal fires as a contract ends, immediately starting a game makes the same employee propose again → double challenge, double 期待度 (S2).
4. **Training POWER exploit**: training only needs ~2 POWER bars; with the away-recovery timing trick you can train 9–10×/week — e.g. パチンコ: ~8,000万/week for expected all-stats +14~18 (S2).
5. **Direction points**: only granted at genre Lv2 and Lv5 (+2 each); genre/content level-up requires matching direction; first match attempt never levels up (S2 01/04).
6. **Year-1 economy (S4)**: 受注開発 is the lifeline (safe money + research data); first game should be cheap genre (パズル/テーブル/アドベンチャー) on the PC (no license); 総資金1億 → medium office is the first real milestone.
7. **Grand Prix requirements (S4, consistent with English wiki)**: review ≥38/40, sales 10–20M, fans ≥7,000, own console + legendary staff; 5 GP wins → カイロくん. Prize money: GP 10,000万; Runner-up 5,000万; Design/Music 1,000万; Worst −3,000万 (S2).
8. **Gamedex "豪華ゲスト" (カイロくん, 70,000万)** is part of カイロくん unlock conditions (S2).
9. **Original iOS achievements (32)** confirm original features: sales milestones 10万→1億本; office moves; Gamedex; HoF; fan letters; TV feature; release queue (行列); all contents/genres; Design/Music/Worst/Runner-up/Grand awards; hire X/A/M/G/K; own console; 2 hidden consoles (S2).
10. **Console install-base dynamics**: hardware with many games grows ~10万台; after own/Kairo console releases other consoles' growth stalls; discontinued consoles can't receive new games (S2 17).
11. **Salary explosion**: employee Lv-ups raise salary +20%/level — the reason to prefer training (パチンコ) over level-ups late-game (S2 01/12; S4).
12. **マスコット/ぬいぐるみ etc. ads have per-fan caps** — repeated same ad eventually stops working (S2 14).

---

## 17. ORIGINAL (2010) vs ++ (2019) — what differs (per JP sources)

| Feature | 2010 original | ++ remake |
|---|---|---|
| Genre×content compat | same 6-level system; ☆ lists nearly identical (++ added: レース×スノーボード, ネットSLG×水泳, 育成×脳トレ/ゲーム会社/街開発/卓球/F1, サウンドノベル×幕末, 体感×アイドル/バレーボール) | complete matrix above |
| Contents | 72 (per EN wiki) | 79 (adds 港湾, タイムスリップ, スパイ, 芸能人 + few) |
| Job tree | same 8 jobs | same |
| Staff | 32 (per achievements: 5 special X/A/M/G/K + 27 regular) | 45 (adds 森田かずお, 永下ひろみ, 角川かどみ, 杏仁なみこ, 猿元フリドリッヒ, 梶山奈保, カツヤマリン3世, 大島よしぢ, エビーチャン, ガッデム乳山, 第壱ともこ, 木下めぐこ, ...) |
| Consoles | ~22 + 2 hidden | same + slight rebalance |
| Own console | yes (same specs; ポテトチップ CPU, パンチカード media exist) | yes |
| Offices | 4/6/8 | same |
| Ads/contracts/training | same lists | same |
| NG+ | carry genre/content levels + direction pts | same |
| Version data | iOS 1.3.1 (2011-04-22), Android 2.0.3 (2016-06-09) | Switch/PS4/Steam 2019-2020; Apple Arcade "+++" adds trophies + 20+ office skins |

---

## 18. Key numbers cheat-sheet for clone design

- Review: 4×10pts; HoF ≥32; GP needs ≥38 (reported). 
- Bugs: 50–60 left → Worst Game Award (−3000万); bugs→research data when squashed; big bug count → 販売停止 risk.
- Direction points: +2 at genre Lv2 & Lv5; 8 directions max; match direction ↔ genre/content → level-up (not on first match).
- Research data tech cost: floor(current/5) ∈ [30,190].
- Salaries: end of March; +20% per employee level; first year free.
- Training: パチンコ 27% → all+6, uncapped; others capped, ~5% ×3 super-up.
- Office: 4→6 staff at 総資金1億 (year 4+), 6→8 at 3.5億+awards (or year 10+).
- Game history: last 32 games; sequels only for HoF games; series ends if sequel misses HoF.
- Fans: age-segmented; cap per ad; decay if idle or same genre+content twice.
- Console dev: December release best; growth ~10万台 per supported game.
- Clear: 20 years (ending), NG+ at 21年1月.

*All tables above are translated/condensed from the cited Japanese sources; where the wiki itself marks data as unverified or the two wikis disagree, the note is included inline.*
