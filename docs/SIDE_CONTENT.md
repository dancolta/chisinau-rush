# Side content: AURA, stunts, daily challenges, street events

Things to do besides the story, built to be short, loud and screenshot-able. Code in `src/side/`,
numbers in `src/data/aura.js`, checks in `tools/aura.mjs`.

## The loop

1. You do something in the city: a fight, a drift, a taxi fare, a pothole, a granny helped home.
2. The street reacts at once: **+AURA** pops in the middle of the screen (or **−AURA, CRINGE**),
   and cool moments chained within 7 s grow a streak multiplier (×1.25 … ×3).
3. AURA fills the level bar above the minimap. Levels come with lei, clothes nobody sells, weapons,
   perks and, every few levels, a new title (from *NPC de fundal* to *Nașul Chișinăului*).
4. Three **daily challenges** give each session a to-do list; the neighbours' **Viber group**
   announces a **street event** every few minutes of free roam. Both pay AURA and lei.
5. Back to 1, with a reason to try something you haven't: challenges point at systems you ignore
   (taxi, potholes, photo mode, wrong-way driving), events drop you into minigames.

## What the research says, and what we took

| Source | Why it sticks | Here |
|---|---|---|
| GTA V random events | Short, optional, pre-scripted scenes that appear as you pass by; you choose to engage | Events are *offers* (blip + marker + Viber message) you walk or drive up to; ignore them and they lapse. Never forced, never during missions |
| Yakuza substories | Absurd but rooted in local characters; variety of *kind*, not just count | Seven events, seven different mechanics (timing bar, rhythm, chase, race, precision parking, button mash, power meter), all Chișinău clichés: trolleybus 22, a wedding, a pigeon with a plăcintă, rutiera 117, parking on the pavement, a Lada in a pothole, seed spitting |
| Saints Row activities | Activities are the respect currency; milestone unlocks | AURA is earned everywhere, levels unlock real items (clothes, weapons, nitro, fake papers) |
| Sleeping Dogs Face/Cop XP | A meter that fills from style; clumsiness costs you | Cringe (a granny beats you, you ram the trolleybus, you lose a street fight) takes AURA away, but never a level |
| Tony Hawk / Burnout | Every trick adds a multiplier step; bail = lose it all (risk/reward); near misses and drifts as score | Car stunt combo: drift, near miss, airtime, wrong way, flat out; banked after 2.2 s of calm, lost on a crash |
| Fortnite / Hitman dailies | A short daily list with one easy, one medium, one hard; a reroll for the one you hate | Exactly that, plus a bonus for all three |
| Variable rewards, streaks | Unpredictable payouts keep the loop alive; streaks with forgiveness | Random events and combo sizes vary; the streak is short (7 s) and forgiving (it just resets) |
| Brainrot slang (2025-26) | "Aura points" gained/lost for cool/lame moments, "NPC", "sigma" used ironically | AURA itself, +/− pops with CRINGE tags, titles NPC → Sigma → Nașul (the Moldovan boss move: godfather at every wedding) |

## Pillars and numbers

**AURA** (`Aura.js`). Gains are multiplied by the streak (×1 + 0.25 per link, max ×3, 7 s window);
repeating the same source within 25 s pays 20 % less each time (floor 30 %), so KO-farming one
bench isn't worth it. Losses reset the streak and never drop you below the start of your level.

| Up | AURA | Down (cringe) | AURA |
|---|---|---|---|
| KO / gopnik KO / cop KO | 10 / 15 / 10 | KO a granny | −40 |
| Street fight won | 30 + 8 per opponent | Knocked out by a granny | −60 |
| Escape the police | 25 × stars | Fainted | −25 |
| Talked your way out / fake papers | 40 / 25 | Lost / fled a street fight | −25 / −10 |
| Clean taxi fare / any fare | 25 / 8 | Bribe / jail | −10 / −30 |
| Race won, hot pizza | 60, 20 | Rammed the trolleybus / a police car | −20 / −10 |
| Pothole, dossier, carjack | 15, 10, 8 | Car wrecked, combo crashed | −15, −10 |
| New respect tier, crew joins | 40, 20 | Hit a granny | −8 |
| Story mission | 100 | Lost a minigame (dance, seeds, shock) | −8 … −15 |
| New outfit ("drip"), photo, bailing out at speed | 15, 5, 20 | Fell off a ledge / run over | −10 / −15 |

**Levels** (`levelCost(n) = 150 + 100·(n−1)`): level 2 at 150 AURA (the first few minutes), 5 at
1 200, 10 at 4 950, 20 at 19 950; after 20, a ★ every 2 500. Every level pays `20·n + 30` lei.
Titles: NPC de fundal (1), Venit de-afară (3), Cunoscut la chioșc (5), Șmecher de cartier (7),
Boss de scară (10), Legendă din Botanica (13), Sigma de Chișinău (16), Nașul Chișinăului (20).
Unlocks: NPC shirt (2), "Milano" glasses (3), water pistol (4), free kiosk item daily (5), gold cap
(6), purple-gold tracksuit + gopnik respect (7), frying pan (8), longer combo window (9), fake
papers + AURA chain (10), fence post (11), grannies' respect + umbrella (12), Legend jacket + 10 %
aura magnet (13), pepper spray (14), nitro (15), gold "Sigma" tracksuit + 2 rerolls (16), leaf
blower (17), gold tooth (18), the naș's white suit (19), the naș's hat + 1 000 lei (20). The
level-up card and its rewards wait for a calm second (no dialogue, cutscene or minigame).

**Stunts** (`Stunts.js`). Tricks: DRIFT (sliding > 3 m/s sideways above 8 m/s, ≈100 pts/s, min
50), LA MUSTAȚĂ / LA UN FIR DE PĂR (moving traffic passed within 1.1 m / 0.5 m at > 11 m/s:
60 / 100), ZBOR (airtime > 0.35 s, 220 pts/s), CONTRASENS (≥ 1.2 s against the lane, 1.5 pts/m),
FĂRĂ FRÂNĂ (2 s above 100 km/h, 80, once per combo). Each trick adds one multiplier step (max ×8);
2.2 s without a trick banks `points × multiplier / 25` AURA; a crash (force ≥ 16) loses it.

**Daily challenges** (`Challenges.js`). A game day (24 game hours, 24 real minutes; sleeping and
fainting count) brings one easy (60 AURA + 40 lei), one medium (120 + 80) and one hard (200 + 150)
challenge from a pool of 27, never two of the same kind, story-gated where needed; one free
reroll a day; all three: +250 AURA + 200 lei.

**Street events** (`Happenings.js`, `events/`). The first comes ~1 min into free roam, then one
every 2.5–4 min, counted only while you're free (no mission or side job, no stars, not at home,
no cutscene or dialogue). An event is an offer first: it starts when you walk or drive up to it
(32–95 m; landing next to it by a teleport doesn't count), lapses after 110 s and is withdrawn
when the police show up. Running, it's an activity mission: a story mission or a side job you
start yourself (taxi [T], pizza, a race) cuts in, and it fails cleanly if you leave (130–320 m).
It pays 80–250 AURA plus lei:

| Event | Mechanic | Pays |
|---|---|---|
| Troleibuzul 22 (poles off the wire) | 3-round timing bar, shocks on a miss | 110–150 AURA, 40 lei |
| Nunta fără DJ | Arrow-key hora on the brass-band beat; guests join while you're good | 150 (+100 full combo), 60 lei |
| Hoțul cu pene (a pigeon stole a plăcintă) | Chase; grab it or dive at it; it tires | 100 (dive 140), 20 lei, half a pie |
| Rutiera 117 | Race to the next stop; it leaves on "2", rubber-banded | 150 AURA, 60 lei |
| Parcare la moldovenește | Stop inside a box on the pavement, lined up; graded | 90–180 AURA, 30 lei |
| Lada în groapă | Mash E while Nea Petrică revs | 110 AURA, 40 lei |
| Campionatul de semințe | Hold-and-release power meter, 3 tries vs Jora's record | 100 AURA, 20 lei |
| Bunica cu sacoșe, Hoțul de poșete (the two older events, moved here) | Escort / chase | 80 / 90 AURA, 25 / 50 lei |

## Integration

Listens to existing events (`npc:ko`, `npc:hit`, `street:fight`, `player:crash`, `mission:pass`,
`respect`, `crew:join`, `outfit`, `shop:buy`, `crime`, `vehicle:*`) and to a few new one-line
emits: `player:hit` / `player:runover` (Combat), `police:escape` (Police), `police:deal`
(Director.busted), `taxi:fare` (taxiFare), `race:end` / `pizza:delivered` (activities). Emits `aura`, `side:levelup`,
`stunt:bank`, `daily:new`, `daily:done`, `happening:offer`, `happening:start`. Save data:
`progress.side` (save stays v3; old saves start at level 1). `g.story.events.t = 1e9` still
switches random events off; `g.side.auto = 'win' | 'lose'` makes the minigames play themselves.

## Progression: what everything is for, achievements, the daily loop

Playtest note: "make the flow of the XP and everything more clear, what it does". XP, rank, AURA,
respect, lei and cred piled up with no story. Now each one has one job, said in the UI (Progres
tab, the first-time cards, the HUD line):

| | What it is | What it gets you |
|---|---|---|
| ⭐ XP → rank (Cariera) | the story career, from missions and jobs | each rank: a bonus in lei (75 … 1 000) and, at 3 and 4, the Director's weapons |
| ✨ AURA → level | how cool the street thinks you are | clothes, perks, nitro, fake papers (the ladder above) |
| 🤝 Respect (👊 🥧 👮) | how each crowd treats you | per tier: tolls and tips, crew size, bribe odds, gifts (`RESPECT_PERKS`) |
| 💵 Lei | money | buying, repairs, bribes |

`cred` and `civic` stay as they were but are shown as **Tupeu** and **Simț civic** (they're
modifiers for talking your way out, not a third kind of respect). Code: `src/side/Goals.js`
(logic), `Stage.js` (the card queue), `Seeds.js`, `GoalsUI.js` (pause pages, title strip),
`src/ui/Rewards.js` (reward chips); numbers and words in `src/data/goals.js`; checks in
`tools/achievements.mjs`.

- **First-time cards.** The first lei, XP, AURA, respect, seed packet and achievement each get a
  short card saying what it is for (once per save, `meta.seen`).
- **HUD.** Under the AURA bar, one line takes turns every 6 s: the next AURA level and its prize,
  the next rank and its bonus, the day's closest challenge; a gain turns it to that currency.
  Every gain or loss of lei, XP, respect (and quiet AURA bonuses) shows as a chip under the money,
  merged when it comes twice in a blink, never over the dialogue box (the rest wait).
- **Achievements („Realizări").** 59: 12 sets of bronze/silver/gold plus 23 singles, 5 of them
  hidden. Counted from existing events and stats plus a few counters of their own (a three-star
  story mission comes from the story's `mission:rated`); a tier pays its lei the moment it
  unlocks (5 give clothes nobody sells). Nudges when a tier is within 10 %.
- **Daily streak.** The first session on a calendar day (after the prologue) pays day 1 … 7
  (50 lei → 500 lei + 250 AURA + mama's parcel); a missed day starts it over. The title screen
  shows where it stands.
- **Semințe de aur.** 30 glowing packets a few steps in from pavement corners (courtyards, parks),
  on the minimap only within 45 m; +10 lei and +15 AURA each, the achievement pays at 10/20/30.
  A teleport onto one doesn't pick it up.
- **One card at a time.** Achievements, the streak, first-time cards and new respect tiers share
  one slot low in the middle of the screen, FIFO, after a calm second; a dialogue, cutscene,
  banner, level-up, minigame or the district name puts a showing card on hold (a tall card also
  waits out a subtitle), and four achievements in a row show as one card.

Save data: `progress.meta` (save stays v3; a save without it counts what's already done once,
quietly, in one summary card). New events: `lei`, `xp` (Progress), `achievement`, `seed`.

## Next ideas

Real ramps and airtime (the car physics keeps wheels on the ground today; the stunt scorer already
reads `vehicle.airborne`), a weekly "Nașul's list" with bigger goals, AURA leaderboards once
accounts exist, event chains (the pigeon comes back with friends), photo-mode challenges with
stickers, and more events: escort a granny across the boulevard, the queue at the Primăria, a
gopnik "aura duel" (quick-time staring contest).
