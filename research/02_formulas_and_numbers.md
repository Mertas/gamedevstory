# Game Dev Story (Kairosoft, 2010) — Formulas, Numbers & Data Tables

**Purpose:** Research notes for a Game Dev Story clone design doc.
**Compiled:** 2026-08-31. **Caution:** Kairosoft never published formulas; everything below is community-observed data. Contradictions between sources are listed explicitly. Numbers marked **[GAP]** were not found in any source and must be designed by us.

---

## 0. Sources used (with short tags used throughout)

| Tag | Source |
|---|---|
| [SW-GP] | https://strategywiki.org/wiki/Game_Dev_Story/Gameplay |
| [SW-WT] | https://strategywiki.org/wiki/Game_Dev_Story/Walkthrough |
| [SW-COMB] | https://strategywiki.org/wiki/Game_Dev_Story/Combinations |
| [SW-STAFF] | https://strategywiki.org/wiki/Game_Dev_Story/Staff |
| [GFAQS-AJ] | https://gamefaqs.gamespot.com/pc/359889-game-dev-story/faqs/61859 (ajonatan Strategy Guide, 2011) |
| [GFAQS-WYC] | https://gamefaqs.gamespot.com/iphone/610758-game-dev-story/faqs/62005 (WongYeangChiong FAQ v4.5, 2012) |
| [IGN] | https://www.ign.com/wikis/game-dev-story/Guide (5 subpages: Game Basics / Hiring, Contracts & Training / Hall of Fame / Special Events / Amazing Games; by Stephen Haberman, 2012) |
| [F-WIKI] | https://kairosoft.fandom.com/wiki/ (pages: Creating games, Magazine Reviews, Consoles, Tips, Transcript:Manual, GameDevStory.csv) |
| [F-CSV] | https://kairosoft.fandom.com/wiki/GameDevStory.csv — full English in-game string table (v2.17), **most authoritative for exact in-game wording/amounts** |
| [F-MANUAL] | https://kairosoft.fandom.com/wiki/Transcript:Manual_(Game_Dev_Story) — 29-page in-game manual verbatim |
| [R-KAIRO] | https://www.reddit.com/r/Kairosoft/comments/15cfntb/ (100M-unit sales thread, 2023) |

Note: [F-WIKI] "Bugs & Cheats (Game Dev Story)" page exists but is **empty** ("There is currently no text in this page"). GameFAQs extraction worked on both guides (no blocking). Reddit JSON API is blocked; only search snippets were usable.

---

## 1. Starting conditions

- Starting cash: **$500.0K**; starting Research Data: **10 points** [SW-GP].
- Starting staff: **Newb Ownerton** (Coder, Lv1, salary $20.0K/yr) and **John Gameson** (Writer, Lv1, salary $20.0K/yr) — note: GFAQS-WYC says starting staff is "S. Presso, Writer; Newb Ownerton, Coder" (S. Presso may be a 1.0-era default; both sources agree on 2 staff, Lv1). [SW-GP], [GFAQS-WYC]
- Office 1 capacity: **4 staff**; Office 2: 6; Office 3: 8. [GFAQS-WYC]
- Cheapest first game: **Puzzle + Reversi on PC, Normal direction = $55.0K** dev cost. [SW-GP]
- Game lasts 20 years ("main portion"); high score = total assets at year 20; can continue playing. [F-MANUAL 27/29]
- Game launches: iOS/Android Oct 9, 2010 (JP original: Oct 2010, Windows April 1997 original PC version — Wikipedia notes; iOS/Android 2010). [StrategyWiki main page]

---

## 2. Review score system (the "40 points")

- **4 critics/judges, each gives up to 10 points; total max 40.** "If the critics find a bug, your score will drop." [F-WIKI Creating games], [GFAQS-WYC]
- Review is "based on its total points and playability", plus how it appeals to different audiences — "one of the causes to have different judges to have different reviews" (i.e., judges differ). [F-WIKI Magazine Reviews]
- **Judge message → points table** (verbatim from [F-WIKI Magazine Reviews]):

| Message | Points |
|---|---|
| "A masterpiece!!" / "Amazing! I'm impressed!" / "An amazingly large game!" / "I bought 3 copies myself." / "It's... so beautiful...!" / "Perfect!" / "The game of the century!" / "This'll go down in history!" | **10** |
| "A guaranteed hit!" / "A rare masterpiece!!" / "An instant classic!" / "Everybody loved it!" / "I can't wait to play more!" / "I had a ball with this one!" / "I play this one every day!" / "I was about to cry!" / "They did a great job." | **9** |
| "A little rough, but good." / "Best game of the year." / "I had a lot of fun with it!" / "I give it a 'buy'." / "My pick of the week." / "Needs a twist." / "I could play this for days." | **8** |
| "It's a fun combination." / "Its content was good." / "Nice. What's next?" / "Rough around the edges." / "So close and yet so far..." / "They do good work." / "They've come a long way." / "A bit rough, but creative." | **7** |
| "It's easy to play, but..." / "Not for most players." / "This is pretty good!" / "It's for hardcore gamers." / "It all needs more work." / "Needs more polish." | **6** |
| "Good overall." / "Close. Try Harder." / "Some people may like it." / "Title screen wasn't bad..." / "Too short." / "Good idea. I enjoyed it." / "Look forward to a sequel." | **5** |
| "I like this kind of game." / "Rethink the combination." / "They worked hard on it." / "Needs work, technically." / "This shows promise!" / "Good job." / "Still needs work." | **4** |
| "The idea isn't bad, but..." / "Not bad. But not good." / "It went right to the trash." / "Why'd they do this to us?" / "Oh dear..." / "They need more practice." | **3** |

- **Hall of Fame threshold — CONTRADICTION:**
  - 32+ points: [F-WIKI Creating games] ("A minimum total of 32 points is needed to have a game inducted into the Hall of Fame"); same page: "If a game gets a review score of 32/40 or above, a sequel can be made out of it"; in-game manual (Menu→Sequel description) says **"32 points and above"** [GFAQS-WYC]; Screen Dynamite also says 32 [web].
  - 35+: [GFAQS-AJ] ("Hall of Fame is basically for game that have more than 35 review points... If your game exceed 100 for each criteria, you will most likely get it. But again this reviews are also randomly generated.").
  - 36+: [IGN Hall of Fame] ("you may be able to create a game with a total review score of 36 or higher").
  - **Design decision needed: 32 is the best-supported (in-game manual text).**
- **Randomness:** review scores include randomness — "reviews are also randomly generated... you might get different results even for the same scores" [GFAQS-AJ]; Jake's save/reload test produced different ratings [GFAQS-WYC FAQ]. ajonatan: first 40-point game did NOT win Grand Prize; his 38-point game won instead [GFAQS-AJ].
- Game attributes are **Fun, Creativity, Graphics, Sound** (called "Fun/Creativity/Graphics/Sound"; older guides sometimes say "Fun/Scenario"...). Fun affects sales; Creativity "can help make a hit"; Graphics and Sound "very important". [F-MANUAL 12/29], [IGN]
- GOTY hint: "you need to boost all four elements well over 150 each (200 is preferred)" [F-WIKI Tips]. WYC FAQ author: 500 Fun/300 Creativity/250 Graphics/250 Sound did NOT get 40/40 or GOTY while a lower-attribute game did — i.e., threshold alone insufficient (randomness + other factors). [GFAQS-WYC]
- **40/40 triggers:** unknown precisely — **[GAP]** exact mapping attribute totals → judge points.

---

## 3. Sales / units-sold model

**No published formula exists.** Community model (assembled from observations):

- **Genre+Type combination** has "a big effect on sales" (not so much on quality) [GFAQS-AJ]. Combination grades: **Amazing! / Creative / Not Bad / Hmm... / Not Good / Nothing** [GFAQS-AJ], [F-WIKI].
- **Console market share** is the key multiplier: "If you develop a game for a console with big Market share, you'll sell more units" [GFAQS-AJ]. Newer/expensive consoles → more money per game [F-WIKI Consoles]. Initial install base ("Quantity" at press conference) per console — see §7 table.
- **Fans:** "The more fans you have, the better the game will sell" [GFAQS-WYC]; fans split by age group (5-12 / 13-18 / 19-24 / 25-40 / 41+) and gender; fans age and drop off [F-MANUAL 21/29], [F-CSV #00072-78].
- **Hype & Fame:** two bars during development; "Fame and Hype can be increased (till a certain limit) with advertisement" [GFAQS-WYC]. Fame ↑ via ads; Hype ↑ via successful staff boosts. The 100M-unit seller: "advertised to get the fame all the way up and the hype was increased because my workers boost was successful", plus **radio segment** and **TV segment** coverage events each boosted sales further [R-KAIRO].
- **Price effect:** no price-setting mechanic exists (no price slider in any guide) — price is not a variable. **[GAP → design ourselves]**
- **Sequels** get **+50 free Fun points** automatically [GFAQS-WYC, Adam Shive tip].
- **Release timing:** "sales tend to spike during the winter holidays, so the timing of a release also affects its success" [F-MANUAL 25/29]; "Timing of your game release to match up with the GameDex (every July!) can boost your sales by 100%" [GFAQS-WYC, WasabiLinus tip].
- **Weekly decay:** "the sale will drop week-by-week except for M12 W1, where it will jump up" (December week-1 spike; plan releases to hit M11-M12) [GFAQS-AJ].
- **Competition:** another company releasing same-genre game at same time reduces your sales [F-WIKI Creating games].
- **Top-10 chart:** "We made it into the top 10!" boosts sales [F-CSV].
- **Hall of Fame entry** message: "That should really boost our sales!" [F-CSV].
- Revenue model: per-unit income for months after release, then wanes and game is delisted; sales records show units shipped [F-WIKI], [GFAQS-WYC Info menu].
- Anecdotal ceiling: 80M+ units in one game (ajonatan, with 9900+ fans) [GFAQS-AJ]; 100M units on custom console (6 HW engineers), Online RPG+Medieval [R-KAIRO].
- **[GAP]** Exact formula (rating multiplier × genre popularity × install base % × fan factor × hype/fame factor × ad factor × sequel factor) — NOT found anywhere. Must design.

---

## 4. Genre popularity (static table only)

**No time-varying popularity table was found in ANY source.** StrategyWiki lists a static popularity grade per genre; guides never show how popularity changes over the years (the game does change it — [SW-WT] "The popularity of game genres will vary in time"). **[GAP → we must design the drift model ourselves.]**

| Genre | Popularity | Unlock job | Level |
|---|---|---|---|
| RPG | A | Writer | 5 |
| Simulation | A | Coder | 4 |
| Sim RPG | A | Director | 1 |
| Table | C | Default | — |
| Action | B | Writer | 3 |
| Adventure | B | Default | — |
| Shooter | C | Writer | 3 |
| Action RPG | A | Producer | 3 |
| Racing | B | Sound Engineer | 3 |
| Online RPG | A | Producer | 5 |
| Online Sim | A | Hacker | 5 |
| Trivia | C | Default | — |
| Life | B | Designer | 3 |
| Board | B | Producer | 1 |
| Puzzle | B | Default | — |
| Music | B | Director | 5 |
| Audio Novel | B | Director | 2 |
| Motion | A | Hardware Engineer | 4 |
| Educational | B | Default | — |
| Card Game | A | Hardware Engineer | 3 |

[SW-WT — "GAME GENRE UNLOCKS"]

Game **Type** unlocks (job + training + min level, popularity grade): full table in [SW-WT] (Normal Sorting), ~100 types. Key extract:

| Type | Popularity | Job | Training | Min Lv |
|---|---|---|---|---|
| Fantasy | A | Writer | Reading | 2 |
| Virtual Pet | A | Coder | Pinball | 2 |
| Samurai | A | Writer | Movie | 1 |
| Romance | A | Writer | Reading | 2 |
| Word | A | Director | Lab Study | 3 |
| Bookstore | A | Sound Engineer | Stroll | 3 |
| Comics | A | Hardware Engineer | Reading | 1 |
| Movies | A | Writer | Movie | 1 |
| Game Co. | A | Coder | Game | 5 |
| Town | A | Producer | Museum | 2 |
| Architecture | A | Director | Long Trip | 1 |
| Lawyer | A | Director | Net Surf | 1 |
| Hunting | A | Designer | Game | 3 |
| Cutie | A | Designer | Concert | 3 |
| Cartoon | A | Writer | Anime | 3 |
| Cosplay | B | Writer | Anime | 5 |
| Swimsuit | A | Hacker | Anime | 1 |
| Mini-Skirt | A | Hacker | Short Trip | 5 |
| Fitness | A | Sound Engineer | Meditate | 1 |
| Sumo | A | Director | Stroll | 1 |
| Baseball | A | Coder | Stroll | 3 |
| F1 Racing | A | Coder | Long Trip | 2 |
| Dating | A | Designer | Anime | 3 |
| Harbor | A | Coder | Short Trip | 1 |
| Celebrity | A | Coder | Concert | 2 |
| Space | ? | Designer | Retreat (N/A) | ? |
| Jumprope | ? | Coder | Retreat (N/A) | ? |

(Only A-grade and special rows reproduced; full list of ~100 types incl. B/C grades is on [SW-WT].)

**Type unlock grid (job × training method)** — verbatim from [SW-WT "Grid View"] (numbers in parens = min level):

| | Coder | Writer | Designer | Snd Eng | Director | Producer | Hacker | HW Eng |
|---|---|---|---|---|---|---|---|---|
| Stroll | Chess (2), Conv. Store (3), High School, Baseball | | Train (2) | Wrestling (1), Bookstore (3) | Sumo (1) | | | |
| Reading | | Mystery (1), Fantasy (2), Detective, Romance(?) | | | | Drums (1) | | Comics (1) |
| Movie | Exploration (2) | Movies (1), Samurai (2) | Art (1) | | Martial Arts | Comedy (1) | | Medieval (2) |
| Anime | | Movies, Mystery, Romance (2), Cartoon (3), Cosplay (5) | Dating (3), Harbor, Time Travel | Checkers (1) | | | Swimsuit (2) | |
| Game | Dungeon (2), High School (3), Game Co. (5) | Wrestling (1) | Hunting (3) | | | | | |
| Jogging | Ping Pong (2), Sports | Basketball (2), Skiing | Volleyball (2), Soccer | | Snowboard (1) | Skiing (1) | | |
| Pinball | Virtual Pet (2), Mahjong | Pinball (1), Slots (3) | | | Horseshoes (2) | | | |
| Meditate | | Ogre (2) | Monster (1) | Fitness, Swimming | | Time Travel (1) | | |
| Concert | Celebrity (2) | Dance (2), Drums | Soccer (2), Cutie (3), Swimming | War | | | | |
| Net Surf | | Horror, Motorsport | | | Lawyer (1), Medieval | | | |
| Museum | Airplane (1) | | | | Pop Star (1), Swimsuit | Town (2) | | |
| College | | Junior High (1) | | | Fashion (2) | | | |
| Lab Study | Baseball (3), Stocks (4) | | | | Word (3) | | | President (2) |
| Short Trip | Harbor (1) | | | | | Cowboy (1) | Mini-skirt (5), Mushroom | |
| Long Trip | F1 Racing (2) | | | | Architecture (1), Spy (1) | Egypt (1) | Poncho | |
| Retreat (N/A) | Space | | Jumprope | | | | | |

---

## 5. Combination ("Amazing!") tables

Combination grades affect **sales**, not quality [GFAQS-AJ]. Full lists of Amazing!/Creative/Not Bad/Hmm.../Not Good pairings + a complete 20-genre × ~100-type grid are on [SW-COMB]. Key extracts:

**Amazing! pairings (column list, [SW-COMB]):** RPG×{Horror, Train, Art, Architecture, Cosplay, Dance, Golf, Sumo, F1 Racing}; Simulation×{Sports, Mini-Skirt, Swimming, Virtual Pet, Romance, Train, Bookstore, Comics, Movies, Game Co., Town, Architecture, Cutie, Cartoon, Pop Star, Mushroom, Motorsport, Soccer, F1 Racing}; Table×{Poncho, Mahjong}; Action×{Virtual Pet, Horror, Historical, Ninja, Ogre, Basketball, Sumo}; Adventure×{Detective, Mystery, Cowboy, Cartoon}; Shooter×{Robot, Horseshoes}; Action RPG×{Hunting, Poncho}; Racing×{Swimsuit, Snowboard, Motorsport}; Online RPG×{Medieval}; Online Sim×{Virtual Pet, Conv. Store, Game Co., Architecture, Cutie, Stocks, Pop Star, Mushroom, Swimming}; Trivia×{Comedy, Cosplay, Mini-Skirt, Sumo}; Life×{Word, Animal, Comics, Game Co., Town, Pop Star, Mushroom, Soccer, Ping Pong, F1 Racing, Dating}; Board×{Word, Chess}; Puzzle×{Checkers, Reversi}; Music×{Dance, Drums}; Audio Novel×{Romance, Horror, Movies, Cutie, Detective, Cowboy, Dating}; Motion×{Pop Star, Dance, Drums, Fitness, Skiing, Snowboard, Volleyball, Pinball, Slots}.

**"Amazing AA" (A-popularity genre + A-popularity type) combos [SW-WT]:** Action RPG+Hunting; Motion+Fitness; Online Sim+{Architecture, Cutie, Game Co., Virtual Pet}; Simulation+{Architecture, Bookstore, Comics, Cutie, F1 Racing, Game Co., Movies, Romance, Town, Virtual Pet}.

**Office-1-reachable Amazing combos** (4 basic jobs + first-office training only) [SW-WT]:
Adventure+Detective (Writer2 Reading); Adventure+Cartoon (Writer3 Anime); Life+Dating (Designer3 + Designer3 Anime); Life+Game Co. (Designer3 + Coder5 Game); Life+Wrestling (Designer3 + Writer1 Game); Puzzle+Reversi (default); Puzzle+Checkers (Snd Eng1 Anime); RPG+Fantasy (Writer5 + Writer2 Reading); Shooter+Robot (Writer3); Sim RPG+Town (Director + Producer2 Museum); Simulation+{Romance (Coder4 + Writer2 Reading), Train (Coder4 + Designer2 Stroll), Bookstore (Coder4 + Snd Eng3 Stroll), Movies (Coder4 + Writer1 Movie), Game Co. (Coder4 + Coder5 Game), Cartoon (Coder4 + Writer3 Anime)}; Trivia+Cosplay (Writer5 Anime).

IGN's own "Amazing Games" list (slightly different/subset): Animal-Life, Chess-Board, Cowboy-Adventure, Dance-Motion, Dating-Life, Detective-Audio Novel, Drums-Music, Fantasy-RPG, Fitness-Motion, Horror-Audio Novel, Mahjong-Table, Medieval-Online RPG, Motorsport-Racing, Mushroom-{Life, Online Sim, RPG, Simulation}, Ninja-Action, Pop-Star-Life, Reversi-Puzzle, Robot-Shooter, Romance-Audio Novel, Snowboard-Racing, Stocks-Online Sim, Town-Simulation, Train-Simulation, Virtual-Pet-Simulation [IGN Amazing Games]. (Genre-first naming; matches SW-COMB where comparable; e.g. IGN "Mushroom-RPG" = Amazing per SW-COMB; note IGN's list omits many.)

---

## 6. Direction system & direction points

8 direction axes: **Cuteness, Realism, Approachability, Niche Appeal, Simplicity, Innovation, Game World, Polish** [F-CSV #00057-64], [F-WIKI Creating games].

- "You start with some points, which are **increased by 2 when a genre reaches level 2 and level 5**" [F-WIKI Creating games]. (GFAQS-AJ: "Direction point is granted every time a genre reach lvl 2 and lvl 5.")
- Genre/type normally start as "New" and hit Lv1 after first use; **using Back before confirming a new project levels it to Lv1 immediately** (saves one development) [GFAQS-AJ].
- Direction matches (genre+type+direction synergy) can level up the genre/type and affect reputation/fan base [F-MANUAL 10/29, 11/29], [IGN Game Basics].
- **[GAP]** exact per-direction effect on final attributes; no numbers found.

**Development direction presets** (cost modifiers, [F-WIKI Creating games]):

| Direction | Effect |
|---|---|
| Normal | base cost, no focus |
| Speed | **+20%** initial cost; faster, lower quality |
| Quality | **+30%** initial cost; slower, more dev points |
| Research | **+50%** initial cost; more Research Data gained |
| Budget+ | **×2 (doubles)** development cost; Speed+Quality combined, eases staff burden |

---

## 7. Consoles

### 7.1 Market consoles (license required except PC)

Sources: [SW-WT] (Quantity/install base + dates + costs), [GFAQS-WYC] (dates + costs, no install base), [F-WIKI Consoles] (costs + removal dates + puns). **Install base ("Quantity" as announced at press conference) only in [SW-WT]** — "The amount of each console on the market will increase slowly over time. The numbers shown here should be the initial number (as announced at the press conference)."

| Console | Company | Available | Install base (initial) | License cost | Dev cost | Removed | Note |
|---|---|---|---|---|---|---|---|
| PC | — | Day 1 | 500K | None | $10.0K | Never | |
| Microx SX | Nipon | Day 1 | 800K | $200.0K | $50.0K | Y6 M2 | = MSX |
| Exodus | Senga | Y1 M11 | 990K | $400.0K | $180.0K | Y6 M6 | = Genesis |
| IES | Intendro | Y3 M2 | 1800K | $800.0K | $300.0K | Y7 M7 | = NES |
| Game Kid | Intendro | Y3 M11 | 2690K | $550.0K | $250.0K | Y16 M12 | = Game Boy |
| Play Gear | Senga | Y5 M6 | 2100K | $1,050.0K | $450.0K | Y10 M6 | = Game Gear |
| PCC-FQX | Nipon | Y6 M2 | 2300K | $680.0K | $300.0K | Y11 M2 | = PC-FX |
| NEONGEON | Nipon | Y7 M2 | 3030K | $2,200.0K | $400.0K | Y9 M4 | = Neo Geo |
| Game Swan | Microx | Y7 M6 | 3500K | $4,500.0K | $550.0K | Y17 M5 | = WonderSwan |
| Super IES | Intendro | Y7 M8 | 4000K | $5,000.0K | $600.0K | Y11 M7 | = SNES |
| Virtual Kid | Intendro | Y8 M8 | 3000K | $1,800.0K | $400.0K | Y11 M12 | = Virtual Boy |
| PlayStatus | Sonny | Y10 M6 | 6000K | $10,000.0K | $650.0K | Y18 M2 | = PlayStation |
| Playdion | Nipon | Y10 M8 | 3100K | $15,000.0K | $850.0K | Y19 M4 | = Playdia |
| Uranus | Senga | Y10 M11 | 6500K | $12,000.0K | $650.0K | Y19 M2 | = Saturn |
| Game-Box | Intendro | Y11 M2 | 8000K | $25,000.0K | $850.0K | Y18 M11 | = GameCube |
| Mini Status | Sonny | Y12 M6 | 6140K | $20,000.0K | $950.0K | Never | = PSP |
| Intendro DM | Intendro | Y16 M2 | 8500K | $35,000.0K | $1,000.0K | Never | = NDS |
| PlayStatus 2 | Sonny | Y17 M6 | 10,200K | $40,000.0K | $1,000.0K | Never | = PS2 |
| Microx 480 | Microx | Y17 M9 | 8000K | $50,000.0K | $1,200.0K | Never | = Xbox 360 |
| Whoops | Intendro | Y18 M5 | 12,000K | $80,000.0K | $1,600.0K | Never | = Wii |
| Harpo Drive | Senga | Y19 M7 | 15,010K | $90,000.0K | $1,300.0K | Never | = Dreamcast? |
| Play Popo X | Nipon | Y19 M11 | 15,670K | $99,999.9K | $1,500.0K | Never | = PS3-ish |
| **Jupiter 512** | Karoisoft | 2nd GOTY ([GFAQS-WYC], [F-WIKI]) / 3rd GOTY ([SW-WT]) | 18,000K | $64,000.0K | $350.0K | Never | [F-WIKI] adds: +16M units sold for one game |
| **GameJohn** | Karoisoft | 4th GOTY ([GFAQS-WYC]) / 5th GOTY ([SW-WT], [F-WIKI]) | 20,000K | $64,000.0K | $350.0K | Never | [F-WIKI] adds: +20M units sold for one game |

**Contradictions:** Jupiter 512/GameJohn unlock GOTY count differs (2nd/3rd and 4th/5th across sources); ajonatan's numbers "Jupiter 512 (18000K) and GameJohn (20000K)" are *market shares*, not license costs [GFAQS-AJ]. License cost in [SW-WT] for Jupiter 512 is listed as "64,000" (likely missing .0K). Removal dates only in [F-WIKI Consoles].

Rules: you're informed **3 months** before a console is discontinued; PC and all consoles from Mini Status onward never leave the market; making your own console removes your previous own console. [F-WIKI Consoles]

### 7.2 Your own console (Office 3 + ≥1 Hardware Engineer)

Components & costs [GFAQS-WYC], [F-WIKI Consoles]:

| CPU | Cost | Media | Cost | Type | Cost |
|---|---|---|---|---|---|
| 16-bit Chip | $1,000.0K | Cartridge | $3,000.0K | Console | $6,000.0K |
| 32-bit Chip | $10,000.0K | CD-ROM | $5,000.0K | Portable | $4,000.0K |
| 64-bit Chip | $50,000.0K | DVD-ROM | $15,000.0K | | |
| Potato Chip* | $90,000.0K | BD-ROM | $35,000.0K | | |
| | | Punch Cards** | $93,999.9K | | |

\* Potato Chip needs **4 Hardware Engineers**; ** Punch Cards needs **6 Hardware Engineers** [GFAQS-WYC], [F-WIKI].
- Own console never goes off market; console sales grow by releasing games for it; your fan base determines console sales; your popularity determines how well it sells vs other consoles [F-MANUAL 24/29], [GFAQS-AJ].
- Ultimate console (Potato + Punch Cards + Console type) = 90,000 + 93,999.9 + 6,000 = **$189,999.9K ≈ $190M** (matches [F-WIKI Tips] "$190-million to build the ultimate console").
- HW Engineer only needed to *initiate* console development — can be switched to another job mid-development [GFAQS-WYC, Adam Shive tip].
- Hackers CANNOT create consoles (only HW Engineers) [GFAQS-WYC].
- Karoisoft introduces rival consoles (Jupiter 512/GameJohn) when you dominate the market; they "easily exceed yours" [GFAQS-AJ].
- **[GAP]** exact formula for own-console install base growth; no numbers found.

---

## 8. Development process & dev points

- Flow: **Proposal (sets starting Fun & Creativity)** → development → **Art/character design starts at 40%** → **Sound/music starts at 80%** → 100% = finished → **Debugging** → release. [F-WIKI Creating games], [SW-GP]
- Proposal writer: needs Writer job ≥ Lv1 (or outsource); proposal quality depends on writer's Programming/Scenario. Graphics task: Designer (or high-Graphics staff). Sound: Sound Engineer (or high-Sound). [GFAQS-WYC], [SW-GP], [IGN]
- **Dev points** come from staff stats: Programming affects dev points + bonuses to proposal & art; Scenario aids Research Data & creative games; Graphics/Sound affect dev points contributed. [F-MANUAL 15-17/29], [IGN Game Basics]
- **Task repetition penalty:** assigning the same staff the same task twice in a row (or too often) reduces their contribution — rotate tasks. [GFAQS-WYC]
- **[GAP]** exact dev-point-per-stat formula, per-week point accumulation, and per-genre/type dev cost amounts (only the $55.0K Puzzle/Reversi example exists [SW-GP]).

---

## 9. Bugs & debugging

- Bugs are generated alongside Fun/Creativity/Graphics/Sound points during development (console dev, contracts, idle work too); **failed boosts generate large bug counts** [F-WIKI Creating games].
- Bug count depends on **Speed vs Quality direction** (Speed ↑ bugs, Quality ↓) — qualitative only; **no numeric formula found [GAP]**.
- **Debugging duration** depends on number of bugs and staff skill — "Higher program stats means bugs are removed faster" [F-WIKI Creating games].
- Each bug fixed grants **1–3 Research points** [F-WIKI Creating games]; [SW-GP]/[IGN] say "one Research Point" per bug (discrepancy: F-WIKI says 1–3, others say 1).
- Shipping with bugs: reviewers may find them → much lower review scores [F-WIKI], [F-MANUAL 13/29].
- Boost failure: +20–30 bugs and reduced hype/fame [F-WIKI Creating games].
- Staff boost success: +25–32 points in one category [F-WIKI Creating games]; IGN: +30–50 points, success chance caps at **80%**, chance depends on staff stats, can pay Research Data to improve odds [IGN Special Events].
- **Blackout event:** lose **half your points on all game parameters** (IGN says exactly "half"; F-WIKI says "between 20-50 points") — contradiction; F-WIKI's "20-50 points" may refer to a different event (equipment failure "will lose points").
- Bug Spray item: "Use Research Data to find bugs" (kills bugs) [GFAQS-WYC].

---

## 10. Staff: hiring, salaries, leveling, careers

### 10.1 Hiring methods (cost per office level, interviewee counts) [GFAQS-WYC]

| Method | Cost | Applicants |
|---|---|---|
| Word of Mouth (OL1) | $50.0k | 2–3 |
| Magazine Ad (OL1) | $120.0k | 4–5 |
| Online Ad (OL1) | $550.0k | 4–5 (slightly better quality) |
| Vocational School (OL2) | $800.0k | 6–7 |
| Open House (OL2) | $1,800.0k | 8–10 |
| Hollywood Agent (OL3) | $3,500.0k | 12–14 |

### 10.2 Salaries & level-up

- Annual salary paid **end of March**; contract fee on hire [F-MANUAL 20/29], [SW-GP].
- **Each level-up: +20% salary.** "watch out their Salary increment though, 20% of 10000K is 2000K" [GFAQS-WYC].
- Starting staff salaries: $20.0K/yr [SW-GP]. Late-game (20 yrs) top staff draw **10,000K+ each** with 200–400 per trait (600+ as hacker) [GFAQS-AJ].

### 10.3 Level-up costs (Research Data) and stat gains per class [GFAQS-WYC — verbatim]

| Class | PR Lv2 | PR Lv3 | PR Lv4 | PR Lv5 | Total PR | Total P/Sc/G/So |
|---|---|---|---|---|---|---|
| Coder | 15 | 25 | 40 | 55 | **135** | 39/7/7/7 |
| Writer | 15 | 20 | 30 | 50 | **115** | 10/42/10/14 |
| Designer | 15 | 25 | 28 | 45 | **113** | 7/8/34/4 |
| Sound Engineer | 15 | 25 | 35 | 50 | **125** | 11/4/10/36 |
| Director | 30 | 40 | 60 | 88 | **218** | 42/47/6/9 |
| Producer | 35 | 50 | 77 | 108 | **270** | 42/40/46/32 |
| Hardware Engineer | 40 | 60 | 90 | 135 | **325** | 53/51/17/19 |
| Hacker | 32 | 64 | 128 | 256 | **480** | 68/58/58/56 |

(Per-level stat breakdowns are in the source [GFAQS-WYC §VI]; totals shown here.)

### 10.4 Career change prerequisites

- **Director**: Writer Lv5 + Coder Lv5 [GFAQS-WYC], [SW-WT]
- **Producer**: Designer Lv5 + Sound Engineer Lv5
- **Hardware Engineer**: Director Lv5 + Producer Lv5
- **Hacker**: Hardware Engineer Lv5
- Same-character requirement: the *same* staff must max both prerequisites [GFAQS-WYC FAQ].
- Advanced jobs require Lv5+ [F-MANUAL 19/29].

### 10.5 Training table (cost, stat effects, power cost) [GFAQS-WYC verbatim]

| Method | Cost | P | Sc | G | So | Power Cost |
|---|---|---|---|---|---|---|
| Stroll (OL1) | $30.0k | | + | + | | −2 |
| Reading (OL1) | $30.0k | + | + | | | −2 |
| Movie (OL1) | $50.0k | | | + | + | −2 |
| Anime (OL1) | $70.0k | + | + | + | + | −3 |
| Game (OL1) | $100.0k | ++ | | + | | −3 |
| Jogging (OL2) | $120.0k | + | | | + | −4 |
| Pinball (OL2) | $80.0k | − | − | − | − | −5 |
| Meditate (OL2) | $90.0k | + | + | + | + | −5 |
| Concert (OL2) | $160.0k | + | | | + | −3 |
| Net Surf (OL2) | $280.0k | ++ | + | −− | | −4 |
| Museum (OL2) | $300.0k | + | ++ | ++ | −− | −4 |
| College (OL3) | $550.0k | −− | + | | | −6 |
| Lab Study (OL3) | $800.0k | ++ | −− | + | + | −7 |
| Short Trip (OL3) | $1,050.0k | ++ | ++ | + | + | −9 |
| Long Trip (OL3) | $2,500.0k | + | ++ | ++ | ++ | −11 |

(+ = up, ++ = more, − = down, −− = more down. Training unlocks types per §4 grid. Anime widely cited as best early/late training [GFAQS-WYC].)

### 10.6 Staff pool

- Full in-house staff list (names, stats P/Sc/G/So, level, contract fee, extra careers, energy) and outsource lists (proposal writers / graphic designers / sound engineers with fees per office level) — **verbatim in [GFAQS-WYC §VII]**; [SW-STAFF] has a partial table (first 6 coders). Key numbers:
  - Contract fees: starters $40–60K (Newb Ownerton $40K, S. Presso $40K, John Gameson $40K, Biggs Porkins $50K, Sam Ulation $50K, Gilly Bates $60K...); mid $130–850K; top: Cokie Bottleson $8,500K (120/180/140/78, careers W5/De1/Di3/HE2), Sophie Kairo $5,500K (144/96/170/180), Stephen Jobson $2,000K (112/168/130/104), Walt Sidney (Hacker) $4,500K (288/225/234/130), Dexter McPhee $7,500K, Francoise Bloom $8,888.8K (357/336/224/168, High energy), Mindy Crawford $1,500K.
  - Outsource fees: proposal writers $10K→$2,400K (William Tomato 120/282/75/24); graphics $10K→$2,050K (Kim Poster 19/33/282/65); sound $10K→$2,800K (Milk Puddingsky 178/168/65/301). [GFAQS-WYC]
- **Special characters** (unique "Default Career"): Mister X (Coder Lv5, $500K), King Ackbar (Director Lv2, $1,500K), Grizzly Bearington (Producer Lv1, $4,444.4K, unlock: 1st GOTY), Chimpan Z-Force (HW Eng Lv1, $6,553.5K, unlock: 3rd GOTY), Kairobot (Hacker Lv5, $6,553.6K, unlock: 5th GOTY) [GFAQS-WYC], [F-WIKI].
- **[GAP]** Exact hiring-pool probability tables / salary formula beyond "+20%/level"; exp curve is the PR table above (fixed research costs per level, not exp).

---

## 11. Items (traveling salesman, arrives first week of May — takes a week to reach desk) [GFAQS-WYC]

**Boosters** (use Research Data, reusable, price rises per purchase AND per office level). Price table [GFAQS-WYC]:

| Office | 1st | 2nd | 3rd | 4th | 5th | 6th |
|---|---|---|---|---|---|---|
| 1 | $200.0k | $300.0k | $400.0k | $800.0k | $2,200.0k | $5,000.0k |
| 2 | $350.0k | $450.0k | $550.0k | $950.0k | $2,350.0k | $5,150.0k |
| 3 | $700.0k | $800.0k | $900.0k | $1,300.0k | $2,700.0k | $5,500.0k |

- Boosters: **Fun Boost / Creativity Boost / Graphics Boost / Sound Boost / Bug Spray / Self-Help Book** ("Use Research Data to boost Fun/Creativity/Graphics/Sound / find bugs / motivate").
- **Key Job rule [GFAQS-WYC, Bryan]:** booster used by the *relevant career class* gives **18–22 points**; other jobs give **8–11** even with higher stats. 2nd use on a key job: 8–11; others 1–5. 3rd use: **0 points** regardless. Key jobs: Fun=Coder, Creativity=Writer, Graphics=Designer, Sound=Sound Engineer.
- IGN: fun boost yields 1–25 points, decreasing per use [IGN Hall of Fame].
- **Replenishable items:** Dead Bull ("Recharges staff & boosts research") and Career Change Manual ("Change one staff member's job") — price by office level: OL1 **$50.0k**, OL2 **$200.0k**, OL3 **$550.0k** [GFAQS-WYC]. Career Change Manual price rises with office — stock up early [GFAQS-AJ].

---

## 12. Advertising

[GFAQS-WYC — verbatim costs; F-CSV confirms names in order]

| Method | Cost | Office |
|---|---|---|
| Magazine Ads | $30.0k | 1 |
| Online Ads | $50.0k | 1 |
| Radio Ads | $80.0k | 1 |
| Demo Distribution | $150.0k | 1 |
| Marching Band | $250.0k | 1 |
| TV Ads | $350.0k | 2 |
| Animal Costumes | $500.0k | 2 |
| TV Sponsorship | $650.0k | 2 |
| Racecar Sponsorship | $1,200.0k | 2 |
| Card Game Contest | $3,300.0k | 3 |
| Blimp Sponsorship | $5,500.0k | 3 |
| Lunar Writing | $9,900.0k | 3 |

- Effect: adds fans (fan base) + raises Fame of in-development game; bigger fan base → harder to grow; cheap methods stop working at higher office levels ("However, our fan base did not change... You'll have to try using another method" [F-CSV]); late game only Lunar Writing matters [GFAQS-AJ].
- **[GAP]** exact fans-per-ad and fame-per-ad amounts; "increase fame while developing so it will sell better" is qualitative [GFAQS-WYC].

---

## 13. Contracts

- Earn money + Research Data; risk: fail → reputation drop → lose fans [SW-GP], [F-MANUAL 4/29].
- "Contract is good for instant money, and research point"; do contracts when staff idle; sales drop weekly except M12 W1 [GFAQS-AJ].
- IGN: don't accept jobs with < **10-week deadline**; pick later deadlines & low point requirements [IGN Hiring].
- F-WIKI Tips: "Tool Development is one of the better paying contracts RP-wise for relatively little work."
- **[GAP]** **Full contract reward tables (name, point requirement, deadline, cash reward, research reward) were NOT found in any source.** Must design.

---

## 14. Events

- **Gamedex (every July):** booth options & costs [GFAQS-WYC]: Don't attend (free) / Don't hire anyone **$150.0k** / Use costumes **$600.0k** / Hire booth babes **$2,500.0k** / Hire a guest star **$7,000.0k**. Adds *fame* (not fans directly); spending more → better next-game sales; overusing celebrity guests bores fans — rotate [GFAQS-WYC, Adam Shive]. F-CSV confirms option names (#00539-543).
- **Staff boost offer ("Excuse Me"):** employee offers mid-development; success +30–50 points (IGN) / +25–32 (F-WIKI); success chance depends on stats, max **80%**, Research Data can improve odds; failure → +20–30 bugs + hype/fame drop [IGN Special Events], [F-WIKI Creating games].
- **Blackout:** lose half of all game parameter points [IGN Special Events]; (F-WIKI says 20–50 points — likely equipment-failure event).
- **Global Game Awards (every year, M12 W3 [GFAQS-AJ]):** prize money from in-game strings [F-CSV #01108-01116]:
  - Best Design: **$100K**
  - Best Music: **$100K**
  - Runner Up: **$500K** (IGN says $300K — IGN likely wrong/old; CSV is authoritative)
  - Worst Game: **−$300K penalty**
  - Grand Prize (GOTY): **$1,000,000**
- **Media coverage events:** "A magazine wrote an article about <0>! That should really boost our sales." / "A TV show did a segment about <0>!" / "Oh no! A bug has been found in <0>!" [F-CSV #00999-10001].
- **Fan letters** (love/hate) affect hype/fame [IGN Special Events].
- **Similar-game warning:** another company releasing same genre at same time → sales hit [F-WIKI].
- **Console release announcements** give new dev options [IGN].
- **"People lining up"** event when a stat reaches 100; "game has a lot of X" message when passing 50 [F-WIKI Creating games].

---

## 15. Offices

| Office | Staff cap | Upgrade cost | Target cash (prompt) |
|---|---|---|---|
| 1 | 4 | — | — |
| 2 | 6 | $600.0k | $800.0k |
| 3 | 8 | $2,500.0k | $5,000.0k |

[GFAQS-WYC]

---

## 16. Research Data economy (summary)

- Earned: developing games, debugging (1–3/bug), contracts, staff chatting (seated near each other they generate research points [GFAQS-WYC FAQ]), "Research" direction (+50% cost).
- Spent on: staff level-ups (see §10.3 PR costs), boosters (see §11).
- Starting: 10 points [SW-GP].

---

## 17. Achievements (32 total, Game Center) [GFAQS-WYC]

Sales milestones: Sell 100K (10 pts), 500K (10), 1M (20), 5M (20), 10M (30), 20M (30), 50M (40), 100M (50). Others: Hall of Hamer (HoF game, 50), Grand Prize Win (50), Genre King (30, unlock every genre), Game Expert (30, unlock every type), Hardcore Hardware (own console, 40), Mystery Console (spaceship console, 40), Holy Grail (toilet console, 60), Design God / Music Man / Worst of the Worst / Close But No Cigar (10/10/10/30), Mystery Staffer X/A/B/C/K (10/10/10/20/100), Movin' On Up / Hittin' the Big Time (10/20), The Big Show (10, Gamedex), Fanboy/Fangirl Letter (10), Idiot Box (20, game on TV), Line Starts Here (10), Generate Some Buzz (10). (Full list in [GFAQS-WYC §IX].)

---

## 18. GAPS — numbers NOT found anywhere (must design ourselves)

1. **Sales formula** (rating × genre popularity × install-base% × fans × hype/fame × ads × sequel modifier × competition) — no numeric model exists in any source.
2. **Genre/type popularity drift over time** — only static A/B/C grades; no year-by-year table.
3. **Judge score mapping** (attribute totals → 3..10 points per judge) — only message strings; randomness confirmed but thresholds unknown.
4. **Dev points per week per stat** and **total dev cost per genre/type** (only example: $55.0K Puzzle/Reversi).
5. **Bug generation formula** (quality vs speed exact multipliers; debug speed per Programming point).
6. **Contract reward tables** (names, deadlines, point requirements, cash/RP rewards).
7. **Fans-per-advertising amounts**, fame/hype caps, fan growth by age group.
8. **Own-console install-base growth formula** and rivalry escalation numbers.
9. **Training stat deltas** (only +/++/−/−− qualitative) — exact points per training session.
10. **Staff hiring pool probabilities**, salary base formula (beyond +20%/level), energy (Power) regen rates.
11. **Direction-axis effects** (Cuteness/Realism/etc. → which attribute gets points).
12. **Sequel mechanics numbers** (carry-over % of original points beyond the +50 Fun note).
13. **Price effect** — the game has no price slider; if our clone adds pricing, model is ours.
14. Event probability tables (boost offer frequency, blackout frequency, media coverage triggers).

---

## 19. Known contradictions (quick list)

| Topic | Source A | Source B |
|---|---|---|
| Hall of Fame / sequel threshold | 32+ ([F-WIKI], in-game menu text [GFAQS-WYC]) | 35+ [GFAQS-AJ] / 36+ [IGN] |
| Jupiter 512 unlock | 2nd GOTY ([GFAQS-WYC], [F-WIKI]) | 3rd GOTY [SW-WT] |
| GameJohn unlock | 4th GOTY [GFAQS-WYC] | 5th GOTY ([SW-WT], [F-WIKI]) |
| Jupiter/GameJohn license cost | $64,000.0K ([GFAQS-WYC], [F-WIKI]) | $64,000 / 64,000K ambiguous [SW-WT] |
| Runner Up prize | $500K (in-game string [F-CSV]) | $300K [IGN] |
| Boost success gain | +25–32 ([F-WIKI]) | +30–50 [IGN] |
| Blackout loss | "half your points" [IGN] | "20–50 points" [F-WIKI] |
| Bug fix reward | 1 RP ([SW-GP], [IGN]) | 1–3 RP [F-WIKI] |
| Fun boost gain | 18–22 key job ([GFAQS-WYC]) | 1–25 per use [IGN] |
| Starting writer | John Gameson [SW-GP] | S. Presso [GFAQS-WYC] |
| Microx SX company | Nipon ([SW-WT], [GFAQS-WYC]) | Microx [F-WIKI Consoles] (likely wiki typo) |
