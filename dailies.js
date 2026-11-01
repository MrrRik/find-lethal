/* Daily puzzles: one per day, titled with its date. The game shows a day's puzzle from that date on (the player's
 * local date); earlier days stay playable. Each board is a set puzzle plus a card from another puzzle (any set;
 * artSet: whose basic lands and tokens it shows), solver-checked: the opponent's life is exactly the most damage the
 * board can deal, and only one plan deals it. Medium and hard days need timing: a play outside main phase 1 (after
 * blocks, main 2) or a response / trigger order on the stack (checked by re-solving without that freedom).
 * Each puzzle has hidden notes (lethal line, timing, wrong lines, uniqueness).
 */
(() => {
  const { c, puzzle } = window.CARD_CATALOG;
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const title = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;
  const daily = (date, artSet, p) =>
    Object.assign(puzzle({ ...p, id: `daily-${date}`, title: title(date), set: "daily" }), { date, artSet });

  window.PUZZLES.push(
  daily("2026-11-01", "dft", {
    tier: "medium",
    opp: { life: 13, battlefield: [] },
    you: { hand: [c("Prowcatcher Specialist")], battlefield: [c("Pacesetter Paragon"), c("Mountain"), c("Mountain"), c("Mountain"), c("Rough Rhino Cavalry")] },
    explanation: "cast Prowcatcher Specialist → attack with Pacesetter Paragon + Prowcatcher Specialist + Rough Rhino Cavalry → activate Pacesetter Paragon (Exhaust — {2}{R}: +1/+1 counter, double strike).",
    notes: `
LETHAL: cast Prowcatcher Specialist → attack with Pacesetter Paragon + Prowcatcher Specialist + Rough Rhino Cavalry → activate Pacesetter Paragon (Exhaust — {2}{R}: +1/+1 counter, double strike) → (opponent: no blocks): exactly 13 damage (the most this board can deal).
RULES: Board from dft-02-pacesetter (DFT) plus Rough Rhino Cavalry from tla-08-koi-fire (TLA). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Rough Rhino Cavalry: at most 6. Any other order or target deals less than 13.
UNIQUENESS: Solver-checked: one plan reaches 13; 14 isn't reachable.`
  }),
  daily("2026-11-02", "blb", {
    tier: "easy",
    opp: { life: 7, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Blooming Blast"), c("Violent Urge")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Forest"), c("Forest"), c("Mountain"), c("Mountain")] },
    explanation: "cast Blooming Blast (gift promised) →Grizzly Bears → cast Violent Urge →Hill Giant → attack with Hill Giant.",
    notes: `
LETHAL: cast Blooming Blast (gift promised) →Grizzly Bears → cast Violent Urge →Hill Giant → attack with Hill Giant → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: Board from blb-03-gift-wrapped (BLB) plus Violent Urge from dsk-09-wickerfolk (DSK).
WRONG LINES: Without Violent Urge: at most 6. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-11-03", "ecl", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Shimmercreep"), c("The Chase Is On")], battlefield: [c("Gray Ogre"), c("Grizzly Bears"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
    explanation: "cast Shimmercreep → attack with Gray Ogre + Grizzly Bears → cast The Chase Is On →Grizzly Bears.",
    notes: `
LETHAL: cast Shimmercreep → attack with Gray Ogre + Grizzly Bears → (opponent: Krotiq Nestguard blocks Gray Ogre) → cast The Chase Is On →Grizzly Bears: exactly 8 damage (the most this board can deal).
RULES: Board from ecl-03-shimmercreep (ECL) plus The Chase Is On from mkm-05-ward-off (MKM). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without The Chase Is On: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-11-04", "eoe", {
    tier: "easy",
    opp: { life: 7, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Galvanizing Sawship")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Wargling")] },
    explanation: "cast Galvanizing Sawship → activate Galvanizing Sawship (Station (3+)) (stationed by Hill Giant) → attack with Galvanizing Sawship + Wargling.",
    notes: `
LETHAL: cast Galvanizing Sawship → activate Galvanizing Sawship (Station (3+)) (stationed by Hill Giant) → attack with Galvanizing Sawship + Wargling → (opponent: Grizzly Bears blocks Wargling): exactly 7 damage (the most this board can deal).
RULES: Board from eoe-01-sawship (EOE) plus Wargling from hob-09-wargling (HOB).
WRONG LINES: Without Wargling: at most 6. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-11-05", "fra", {
    tier: "medium",
    opp: { life: 4, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Leonardo, Leader in Blue")], battlefield: [c("Theorix Metamage", {"prepared":true}), c("Island"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains")], graveyard: [c("Island"), c("Island"), c("Island"), c("Island")], library: [c("Island"), c("Island"), c("Island")] },
    explanation: "cast Omit Variables → attack with Theorix Metamage → cast Leonardo, Leader in Blue (sneak, returning Theorix Metamage).",
    notes: `
LETHAL: cast Omit Variables → attack with Theorix Metamage → (opponent: no blocks) → cast Leonardo, Leader in Blue (sneak, returning Theorix Metamage): exactly 4 damage (the most this board can deal).
RULES: Board from fra-04-threshold (FRA) plus Leonardo, Leader in Blue from tmt-07-leader-in-blue (TMT). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Leonardo, Leader in Blue: at most 3. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
  }),
  daily("2026-11-06", "fin", {
    tier: "hard",
    opp: { life: 4, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Mountain"), c("Coral Sword")], battlefield: [c("Sabotender"), c("Sazh's Chocobo"), c("Ride the Shoopuf"), c("Mountain"), c("Forest"), c("Forest"), c("Forest")] },
    explanation: "play Mountain → put Sabotender's trigger on the stack first → put Sazh's Chocobo's trigger on the stack first → Ride the Shoopuf → Sazh's Chocobo → attack with Sabotender + Sazh's Chocobo → cast Coral Sword → Coral Sword → Sazh's Chocobo.",
    notes: `
LETHAL: play Mountain → put Sabotender's trigger on the stack first → put Sazh's Chocobo's trigger on the stack first → Ride the Shoopuf → Sazh's Chocobo → attack with Sabotender + Sazh's Chocobo → (opponent: Grizzly Bears blocks Sabotender) → cast Coral Sword → Coral Sword → Sazh's Chocobo: exactly 4 damage (the most this board can deal).
RULES: Board from fin-04-landfall plus Coral Sword from fin-10-limit-break. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Coral Sword: at most 3. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
  }),
  daily("2026-11-07", "tdm", {
    tier: "hard",
    opp: { life: 7, battlefield: [c("Krotiq Nestguard"), c("Grizzly Bears")] },
    you: { hand: [c("Pedal to the Metal")], battlefield: [c("Dalkovan Packbeasts"), c("Shocking Sharpshooter"), c("Mountain"), c("Mountain"), c("Mountain")] },
    explanation: "attack with Dalkovan Packbeasts + Shocking Sharpshooter → Shocking Sharpshooter → opponent → Shocking Sharpshooter → opponent → Shocking Sharpshooter → opponent → cast Pedal to the Metal (X=2) →Dalkovan Packbeasts.",
    notes: `
LETHAL: attack with Dalkovan Packbeasts + Shocking Sharpshooter → Shocking Sharpshooter → opponent → Shocking Sharpshooter → opponent → Shocking Sharpshooter → opponent → (opponent: Krotiq Nestguard blocks Shocking Sharpshooter, Grizzly Bears blocks Warrior) → cast Pedal to the Metal (X=2) →Dalkovan Packbeasts: exactly 7 damage (the most this board can deal).
RULES: Board from tdm-01-call-to-arms (TDM) plus Pedal to the Metal from sos-08-tackle-artist (SOS). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Pedal to the Metal: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-11-08", "spm", {
    tier: "medium",
    opp: { life: 7, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Stegron the Dinosaur Man")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Incubator", {"counters":{"+1/+1":2}}), c("Plains"), c("Swamp"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest")] },
    explanation: "activate Incubator ({2}: Transform this token) → attack with Gray Ogre + Hill Giant + Phyrexian Token → discard Stegron the Dinosaur Man for its ability → Gray Ogre.",
    notes: `
LETHAL: activate Incubator ({2}: Transform this token) → attack with Gray Ogre + Hill Giant + Phyrexian Token → (opponent: Grizzly Bears blocks Hill Giant) → discard Stegron the Dinosaur Man for its ability → Gray Ogre: exactly 7 damage (the most this board can deal).
RULES: Board from spm-04-dinosaur-formula (SPM) plus Incubator from mom-07-incubation-chamber (MOM). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Incubator: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-11-09", "lci", {
    tier: "easy",
    opp: { life: 5, battlefield: [] },
    you: { hand: [c("Deathcap Marionette")], battlefield: [c("Basking Capybara"), c("Swamp"), c("Swamp"), c("Slickshot Vault-Buster")], graveyard: [c("Forest"), c("Grizzly Bears"), c("Lightning Bolt")], library: [c("Forest"), c("Hill Giant")] },
    explanation: "cast Deathcap Marionette → Mill 2?: Mill 2 → attack with Basking Capybara + Slickshot Vault-Buster.",
    notes: `
LETHAL: cast Deathcap Marionette → Mill 2?: Mill 2 → attack with Basking Capybara + Slickshot Vault-Buster → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: Board from lci-03-dig-deep (LCI) plus Slickshot Vault-Buster from otj-10-crime-spree (OTJ).
WRONG LINES: Without Slickshot Vault-Buster: at most 4. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
  }),
  daily("2026-11-10", "woe", {
    tier: "medium",
    opp: { life: 6, battlefield: [c("Wall of Wood")] },
    you: { hand: [c("Monstrous Rage"), c("High Fae Negotiator")], battlefield: [c("Hill Giant"), c("Mountain"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
    explanation: "cast Monstrous Rage →Hill Giant → attack with Hill Giant → cast High Fae Negotiator (bargaining Monster).",
    notes: `
LETHAL: cast Monstrous Rage →Hill Giant → attack with Hill Giant → (opponent: Wall of Wood blocks Hill Giant) → cast High Fae Negotiator (bargaining Monster): exactly 6 damage (the most this board can deal).
RULES: Board from woe-01-monster-inside plus High Fae Negotiator from woe-10-double-bargain. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without High Fae Negotiator: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-11-11", "msh", {
    tier: "easy",
    opp: { life: 8, battlefield: [] },
    you: { hand: [c("Volcanic Villain")], battlefield: [c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Hill Giant"), c("Swamp"), c("Swamp")] },
    explanation: "cast Volcanic Villain → activate Volcanic Villain (Power-up — {5}{R}: two +1/+1 counters) → attack with Hill Giant + Volcanic Villain.",
    notes: `
LETHAL: cast Volcanic Villain → activate Volcanic Villain (Power-up — {5}{R}: two +1/+1 counters) → attack with Hill Giant + Volcanic Villain → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: Board from msh-01-volcanic-villain plus Hill Giant from msh-05-widows-bite.
WRONG LINES: Without Hill Giant: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-11-12", "hob", {
    tier: "medium",
    opp: { life: 6, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Shredder, Unrelenting")], battlefield: [c("Nighthowl Pursuer"), c("Krotiq Nestguard"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
    explanation: "attack with Nighthowl Pursuer → cast Shredder, Unrelenting (sneak, returning Nighthowl Pursuer) → Shredder, Unrelenting → Krotiq Nestguard.",
    notes: `
LETHAL: attack with Nighthowl Pursuer → (opponent: no blocks) → cast Shredder, Unrelenting (sneak, returning Nighthowl Pursuer) → Shredder, Unrelenting → Krotiq Nestguard: exactly 6 damage (the most this board can deal).
RULES: Board from hob-02-nighthowl (HOB) plus Shredder, Unrelenting from tmt-06-deathtouch (TMT). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Shredder, Unrelenting: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-11-13", "mkm", {
    tier: "hard",
    opp: { life: 12, battlefield: [c("Wall of Wood")] },
    you: { hand: [c("Case of the Burning Masks")], battlefield: [c("Case of the Burning Masks"), c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Alley Assailant", {"faceDown":true}), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")], library: [c("Grizzly Bears"), c("Lightning Bolt"), c("Mountain")] },
    explanation: "cast Case of the Burning Masks → Case of the Burning Masks → Wall of Wood → activate Alley Assailant (Turn face up {4}{B}{B}) → attack with Alley Assailant + Hill Giant → put Case of the Burning Masks's trigger on the stack first → activate Case of the Burning Masks (Solved — Sacrifice: exile the top three, play one this turn) → Choose the card you may play this turn: Lightning Bolt → cast Lightning Bolt (from exile) →opponent.",
    notes: `
LETHAL: cast Case of the Burning Masks → Case of the Burning Masks → Wall of Wood → activate Alley Assailant (Turn face up {4}{B}{B}) → attack with Alley Assailant + Hill Giant → (opponent: no blocks) → put Case of the Burning Masks's trigger on the stack first → activate Case of the Burning Masks (Solved — Sacrifice: exile the top three, play one this turn) → Choose the card you may play this turn: Lightning Bolt → cast Lightning Bolt (from exile) →opponent: exactly 12 damage (the most this board can deal).
RULES: Board from mkm-09-burning-masks plus Alley Assailant from mkm-02-unmasked. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Alley Assailant: at most 3. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
  }),
  daily("2026-11-14", "fra", {
    tier: "hard",
    opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Keeper of the Quiet Hour"), c("Plasma Bolt")], battlefield: [c("Kiora of Salt and Sand"), c("Hill Giant"), c("Forest"), c("Forest"), c("Forest"), c("Swamp"), c("Swamp"), c("Mountain"), c("Mountain")] },
    explanation: "cast Keeper of the Quiet Hour → activate Jace (−1: Surveil 1) → attack with Hill Giant + Kiora of Salt and Sand → Kiora of Salt and Sand → Hill Giant → cast Plasma Bolt →opponent.",
    notes: `
LETHAL: cast Keeper of the Quiet Hour → activate Jace (−1: Surveil 1) → attack with Hill Giant + Kiora of Salt and Sand → Kiora of Salt and Sand → Hill Giant → (opponent: Krotiq Nestguard blocks Kiora of Salt and Sand) → cast Plasma Bolt →opponent: exactly 6 damage (the most this board can deal).
RULES: Board from fra-05-kiora (FRA) plus Plasma Bolt from eoe-09-void (EOE). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Plasma Bolt: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-11-15", "otj", {
    tier: "medium",
    opp: { life: 15, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Tifa's Limit Break")], battlefield: [c("Quilled Charger"), c("Gray Ogre"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest")] },
    explanation: "activate Quilled Charger (Saddle 2) (saddled by Gray Ogre) → attack with Quilled Charger → cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Quilled Charger.",
    notes: `
LETHAL: activate Quilled Charger (Saddle 2) (saddled by Gray Ogre) → attack with Quilled Charger → cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Quilled Charger → (opponent: no blocks): exactly 15 damage (the most this board can deal).
RULES: Board from otj-03-saddle-up (OTJ) plus Tifa's Limit Break from fin-06-final-heaven (FIN). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Tifa's Limit Break: at most 5. Any other order or target deals less than 15.
UNIQUENESS: Solver-checked: one plan reaches 15; 16 isn't reachable.`
  }),
  daily("2026-11-16", "one", {
    tier: "easy",
    opp: { life: 6, battlefield: [] },
    you: { hand: [c("Vulshok Splitter")], battlefield: [c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Furnace Strider", {"tapped":true,"counters":{"oil":2}})] },
    explanation: "cast Vulshok Splitter → activate Furnace Strider (Remove an oil counter: target creature you control gains haste) → Rebel → attack with Gray Ogre + Rebel.",
    notes: `
LETHAL: cast Vulshok Splitter → activate Furnace Strider (Remove an oil counter: target creature you control gains haste) → Rebel → attack with Gray Ogre + Rebel → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: Board from one-02-rebel-arms plus Furnace Strider from one-06-rebels-ready.
WRONG LINES: Without Furnace Strider: at most 4. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-11-17", "sos", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Lightning Strike"), c("Corroding Dragonstorm")], battlefield: [c("Cuboid Colony"), c("Mountain"), c("Mountain"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
    explanation: "cast Corroding Dragonstorm → cast Lightning Strike →opponent → attack with Cuboid Colony.",
    notes: `
LETHAL: cast Corroding Dragonstorm → cast Lightning Strike →opponent → attack with Cuboid Colony → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: Board from sos-04-cuboid-colony (SOS) plus Corroding Dragonstorm from tdm-07-dragonstorm (TDM). TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Corroding Dragonstorm: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-11-18", "blb", {
    tier: "easy",
    opp: { life: 9, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Blooming Blast"), c("Giant Growth")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Forest")] },
    explanation: "cast Blooming Blast (gift promised) →Grizzly Bears → cast Giant Growth →Hill Giant → attack with Hill Giant.",
    notes: `
LETHAL: cast Blooming Blast (gift promised) →Grizzly Bears → cast Giant Growth →Hill Giant → attack with Hill Giant → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: Board from blb-03-gift-wrapped plus Giant Growth from blb-02-mouse-trap.
WRONG LINES: Without Giant Growth: at most 6. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
  }),
  daily("2026-11-19", "spm", {
    tier: "medium",
    opp: { life: 7, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Grow Extra Arms"), c("Yip Yip!")], battlefield: [c("Spider-Man, Web-Slinger"), c("Masked Meower"), c("Forest"), c("Plains")] },
    explanation: "cast Yip Yip! →Masked Meower → attack with Masked Meower + Spider-Man, Web-Slinger → cast Grow Extra Arms →Masked Meower.",
    notes: `
LETHAL: cast Yip Yip! →Masked Meower → attack with Masked Meower + Spider-Man, Web-Slinger → (opponent: Grizzly Bears blocks Spider-Man, Web-Slinger) → cast Grow Extra Arms →Masked Meower: exactly 7 damage (the most this board can deal).
RULES: Board from spm-06-extra-arms (SPM) plus Yip Yip! from tla-09-cadets (TLA). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Yip Yip!: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-11-20", "lci", {
    tier: "hard",
    opp: { life: 6, battlefield: [c("Wall of Wood")] },
    you: { hand: [c("Geological Appraiser")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Marshals' Pathcruiser")], library: [c("Forest"), c("Panicked Altisaur"), c("Staggering Size")] },
    explanation: "cast Geological Appraiser → activate Marshals' Pathcruiser (Crew 5) (crewed by Hill Giant + Geological Appraiser) → Discover 3: Cast it → Marshals' Pathcruiser → attack with Marshals' Pathcruiser.",
    notes: `
LETHAL: cast Geological Appraiser → activate Marshals' Pathcruiser (Crew 5) (crewed by Hill Giant + Geological Appraiser) → Discover 3: Cast it → Marshals' Pathcruiser → attack with Marshals' Pathcruiser → (opponent: Wall of Wood blocks Marshals' Pathcruiser): exactly 6 damage (the most this board can deal).
RULES: Board from lci-06-appraisal (LCI) plus Marshals' Pathcruiser from dft-05-pit-crew (DFT). TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Marshals' Pathcruiser: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-11-21", "tmt", {
    tier: "hard",
    opp: { life: 9, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Shredder, Unrelenting"), c("Repulsor Blast")], battlefield: [c("Mutant Town Musicians"), c("Grizzly Bears"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
    explanation: "cast Repulsor Blast →Krotiq Nestguard → attack with Grizzly Bears + Mutant Town Musicians → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → put Mutant Town Musicians's trigger on the stack first → Shredder, Unrelenting → Mutant Town Musicians.",
    notes: `
LETHAL: cast Repulsor Blast →Krotiq Nestguard → attack with Grizzly Bears + Mutant Town Musicians → (opponent: no blocks) → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → put Mutant Town Musicians's trigger on the stack first → Shredder, Unrelenting → Mutant Town Musicians: exactly 9 damage (the most this board can deal).
RULES: Board from tmt-06-deathtouch (TMT) plus Repulsor Blast from msh-04-repulsor-blast (MSH). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Repulsor Blast: at most 6. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
  }),
  daily("2026-11-22", "ecl", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Shimmercreep"), c("Plasma Bolt")], battlefield: [c("Gray Ogre"), c("Grizzly Bears"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Forest"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain")] },
    explanation: "cast Shimmercreep → attack with Gray Ogre + Grizzly Bears → cast Plasma Bolt →opponent.",
    notes: `
LETHAL: cast Shimmercreep → attack with Gray Ogre + Grizzly Bears → (opponent: Krotiq Nestguard blocks Gray Ogre) → cast Plasma Bolt →opponent: exactly 8 damage (the most this board can deal).
RULES: Board from ecl-03-shimmercreep (ECL) plus Plasma Bolt from eoe-10-wayfarer (EOE). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Plasma Bolt: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-11-23", "dsk", {
    tier: "easy",
    opp: { life: 10, battlefield: [] },
    you: { hand: [c("Grand Entryway // Elegant Rotunda")], battlefield: [c("Dashing Bloodsucker"), c("Plains"), c("Plains"), c("Gallant Pie-Wielder"), c("Forest"), c("Forest")] },
    explanation: "cast Grand Entryway → put Dashing Bloodsucker's trigger on the stack first → attack with Dashing Bloodsucker + Gallant Pie-Wielder.",
    notes: `
LETHAL: cast Grand Entryway → put Dashing Bloodsucker's trigger on the stack first → attack with Dashing Bloodsucker + Gallant Pie-Wielder → (opponent: no blocks): exactly 10 damage (the most this board can deal).
RULES: Board from dsk-01-grand-entrance (DSK) plus Gallant Pie-Wielder from woe-03-cookie-party (WOE).
WRONG LINES: Without Gallant Pie-Wielder: at most 6. Any other order or target deals less than 10.
UNIQUENESS: Solver-checked: one plan reaches 10; 11 isn't reachable.`
  }),
  daily("2026-11-24", "spm", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Stegron the Dinosaur Man"), c("Giant Growth")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Forest")] },
    explanation: "attack with Gray Ogre + Hill Giant → discard Stegron the Dinosaur Man for its ability → Gray Ogre → cast Giant Growth →Gray Ogre.",
    notes: `
LETHAL: attack with Gray Ogre + Hill Giant → (opponent: Grizzly Bears blocks Hill Giant) → discard Stegron the Dinosaur Man for its ability → Gray Ogre → cast Giant Growth →Gray Ogre: exactly 8 damage (the most this board can deal).
RULES: Board from spm-04-dinosaur-formula (SPM) plus Giant Growth from blb-02-mouse-trap (BLB). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Giant Growth: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-11-25", "mom", {
    tier: "easy",
    opp: { life: 12, battlefield: [] },
    you: { hand: [c("Fearless Skald")], battlefield: [c("Bonded Herdbeast"), c("Mountain"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Glory Seeker"), c("Island"), c("Island")] },
    explanation: "cast Fearless Skald → Fearless Skald → Bonded Herdbeast → attack with Bonded Herdbeast + Glory Seeker.",
    notes: `
LETHAL: cast Fearless Skald → Fearless Skald → Bonded Herdbeast → attack with Bonded Herdbeast + Glory Seeker → (opponent: no blocks): exactly 12 damage (the most this board can deal).
RULES: Board from mom-01-backup-plan plus Glory Seeker from mom-08-flash-backup.
WRONG LINES: Without Glory Seeker: at most 10. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
  }),
  daily("2026-11-26", "tla", {
    tier: "medium",
    opp: { life: 5, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Airbending Lesson")], battlefield: [c("Hill Giant"), c("Plains"), c("Plains"), c("Plains"), c("Fire Nation Cadets")] },
    explanation: "cast Airbending Lesson →Krotiq Nestguard → attack with Fire Nation Cadets + Hill Giant → activate Fire Nation Cadets ({2}: +1/+0).",
    notes: `
LETHAL: cast Airbending Lesson →Krotiq Nestguard → attack with Fire Nation Cadets + Hill Giant → activate Fire Nation Cadets ({2}: +1/+0) → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: Board from tla-02-airbend plus Fire Nation Cadets from tla-09-cadets. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Fire Nation Cadets: at most 3. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
  }),
  daily("2026-11-27", "mkm", {
    tier: "hard",
    opp: { life: 8, battlefield: [c("Wall of Wood")] },
    you: { hand: [c("Case of the Burning Masks"), c("Shock")], battlefield: [c("Case of the Burning Masks"), c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")], library: [c("Grizzly Bears"), c("Lightning Bolt"), c("Mountain")] },
    explanation: "cast Case of the Burning Masks → Case of the Burning Masks → Wall of Wood → cast Shock →opponent → attack with Hill Giant → put Case of the Burning Masks's trigger on the stack first → activate Case of the Burning Masks (Solved — Sacrifice: exile the top three, play one this turn) → Choose the card you may play this turn: Lightning Bolt → cast Lightning Bolt (from exile) →opponent.",
    notes: `
LETHAL: cast Case of the Burning Masks → Case of the Burning Masks → Wall of Wood → cast Shock →opponent → attack with Hill Giant → (opponent: no blocks) → put Case of the Burning Masks's trigger on the stack first → activate Case of the Burning Masks (Solved — Sacrifice: exile the top three, play one this turn) → Choose the card you may play this turn: Lightning Bolt → cast Lightning Bolt (from exile) →opponent: exactly 8 damage (the most this board can deal).
RULES: Board from mkm-09-burning-masks plus Shock from mkm-05-ward-off. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Shock: at most 3. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-11-28", "fin", {
    tier: "hard",
    opp: { life: 7, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Mountain"), c("Tifa's Limit Break")], battlefield: [c("Sabotender"), c("Sazh's Chocobo"), c("Ride the Shoopuf"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest")] },
    explanation: "play Mountain → put Sabotender's trigger on the stack first → put Sazh's Chocobo's trigger on the stack first → Ride the Shoopuf → Sazh's Chocobo → attack with Sabotender + Sazh's Chocobo → cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Sazh's Chocobo.",
    notes: `
LETHAL: play Mountain → put Sabotender's trigger on the stack first → put Sazh's Chocobo's trigger on the stack first → Ride the Shoopuf → Sazh's Chocobo → attack with Sabotender + Sazh's Chocobo → (opponent: Grizzly Bears blocks Sabotender) → cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Sazh's Chocobo: exactly 7 damage (the most this board can deal).
RULES: Board from fin-04-landfall plus Tifa's Limit Break from fin-06-final-heaven. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Tifa's Limit Break: at most 3. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-11-29", "hob", {
    tier: "medium",
    opp: { life: 5, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Monstrous Rage")], battlefield: [c("Key to the Side-Door"), c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Mountain")] },
    explanation: "attack with Gray Ogre + Hill Giant → cast Monstrous Rage →Gray Ogre.",
    notes: `
LETHAL: attack with Gray Ogre + Hill Giant → (opponent: Krotiq Nestguard blocks Hill Giant) → cast Monstrous Rage →Gray Ogre: exactly 5 damage (the most this board can deal).
RULES: Board from hob-06-side-door (HOB) plus Monstrous Rage from woe-01-monster-inside (WOE). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Monstrous Rage: at most 3. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
  }),
  daily("2026-11-30", "one", {
    tier: "easy",
    opp: { life: 8, battlefield: [] },
    you: { hand: [c("Vulshok Splitter")], battlefield: [c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Jawbone Duelist"), c("Swamp")] },
    explanation: "cast Vulshok Splitter → activate Vulshok Splitter (Equip {2}{R}) → Jawbone Duelist → attack with Gray Ogre + Jawbone Duelist.",
    notes: `
LETHAL: cast Vulshok Splitter → activate Vulshok Splitter (Equip {2}{R}) → Jawbone Duelist → attack with Gray Ogre + Jawbone Duelist → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: Board from one-02-rebel-arms plus Jawbone Duelist from one-04-spread-the-sickness.
WRONG LINES: Without Jawbone Duelist: at most 4. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-12-01", "otj", {
    tier: "medium",
    opp: { life: 6, battlefield: [c("Wall of Wood"), c("Grizzly Bears")] },
    you: { hand: [c("Jailbreak Scheme"), c("Shredder, Unrelenting")], battlefield: [c("Hill Giant"), c("Island"), c("Island"), c("Island"), c("Island"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
    explanation: "cast Jailbreak Scheme (Put a +1/+1 counter on target creature. It can't be blocked this turn) →Hill Giant → attack with Hill Giant → cast Shredder, Unrelenting (sneak, returning Hill Giant).",
    notes: `
LETHAL: cast Jailbreak Scheme (Put a +1/+1 counter on target creature. It can't be blocked this turn) →Hill Giant → attack with Hill Giant → (opponent: no blocks) → cast Shredder, Unrelenting (sneak, returning Hill Giant): exactly 6 damage (the most this board can deal).
RULES: Board from otj-01-jailbreak (OTJ) plus Shredder, Unrelenting from tmt-06-deathtouch (TMT). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Shredder, Unrelenting: at most 4. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-02", "dft", {
    tier: "easy",
    opp: { life: 3, battlefield: [c("Jibbirik Omnivore")] },
    you: { hand: [c("Gastal Thrillseeker")], battlefield: [c("Walking Sarcophagus"), c("Swamp"), c("Mountain"), c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain")] },
    explanation: "cast Gastal Thrillseeker → Gastal Thrillseeker → opponent → attack with Hill Giant + Walking Sarcophagus.",
    notes: `
LETHAL: cast Gastal Thrillseeker → Gastal Thrillseeker → opponent → attack with Hill Giant + Walking Sarcophagus → (opponent: Jibbirik Omnivore blocks Hill Giant): exactly 3 damage (the most this board can deal).
RULES: Board from dft-01-engines-on (DFT) plus Hill Giant from dsk-10-dread (DSK).
WRONG LINES: Without Hill Giant: at most 1. Any other order or target deals less than 3.
UNIQUENESS: Solver-checked: one plan reaches 3; 4 isn't reachable.`
  }),
  daily("2026-12-03", "sos", {
    tier: "medium",
    opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Lightning Strike"), c("Candy Grapple")], battlefield: [c("Cuboid Colony"), c("Mountain"), c("Mountain"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
    explanation: "cast Lightning Strike →opponent → cast Candy Grapple →Krotiq Nestguard → attack with Cuboid Colony.",
    notes: `
LETHAL: cast Lightning Strike →opponent → cast Candy Grapple →Krotiq Nestguard → attack with Cuboid Colony → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: Board from sos-04-cuboid-colony (SOS) plus Candy Grapple from woe-10-double-bargain (WOE). TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Candy Grapple: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-04", "spm", {
    tier: "hard",
    opp: { life: 6, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Grow Extra Arms"), c("Well-Worn Spatula")], battlefield: [c("Spider-Man, Web-Slinger"), c("Masked Meower"), c("Forest"), c("Plains"), c("Plains"), c("Plains"), c("Forest"), c("Forest")] },
    explanation: "cast Well-Worn Spatula → activate Well-Worn Spatula (Equip {1}) → Masked Meower → attack with Masked Meower + Spider-Man, Web-Slinger → cast Grow Extra Arms →Masked Meower.",
    notes: `
LETHAL: cast Well-Worn Spatula → activate Well-Worn Spatula (Equip {1}) → Masked Meower → attack with Masked Meower + Spider-Man, Web-Slinger → (opponent: Grizzly Bears blocks Spider-Man, Web-Slinger) → cast Grow Extra Arms →Masked Meower: exactly 6 damage (the most this board can deal).
RULES: Board from spm-06-extra-arms (SPM) plus Well-Worn Spatula from fra-10-scrounger (FRA). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Well-Worn Spatula: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-05", "tdm", {
    tier: "hard",
    opp: { life: 14, battlefield: [c("Krotiq Nestguard"), c("Grizzly Bears")] },
    you: { hand: [c("Leonardo, Leader in Blue")], battlefield: [c("Dalkovan Packbeasts"), c("Shocking Sharpshooter"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains")] },
    explanation: "attack with Dalkovan Packbeasts + Shocking Sharpshooter → Shocking Sharpshooter → opponent → Shocking Sharpshooter → opponent → Shocking Sharpshooter → opponent → cast Leonardo, Leader in Blue (sneak, returning Dalkovan Packbeasts) → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent.",
    notes: `
LETHAL: attack with Dalkovan Packbeasts + Shocking Sharpshooter → Shocking Sharpshooter → opponent → Shocking Sharpshooter → opponent → Shocking Sharpshooter → opponent → (opponent: Krotiq Nestguard blocks Shocking Sharpshooter, Grizzly Bears blocks Warrior) → cast Leonardo, Leader in Blue (sneak, returning Dalkovan Packbeasts) → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent: exactly 14 damage (the most this board can deal).
RULES: Board from tdm-01-call-to-arms (TDM) plus Leonardo, Leader in Blue from tmt-10-alliance (TMT). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Leonardo, Leader in Blue: at most 5. Any other order or target deals less than 14.
UNIQUENESS: Solver-checked: one plan reaches 14; 15 isn't reachable.`
  }),
  daily("2026-12-06", "tla", {
    tier: "medium",
    opp: { life: 5, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Combustion Technique")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Fire Nation Cadets"), c("Plains")], graveyard: [c("Airbending Lesson"), c("Yip Yip!")] },
    explanation: "cast Combustion Technique →Krotiq Nestguard → attack with Fire Nation Cadets + Hill Giant → activate Fire Nation Cadets ({2}: +1/+0).",
    notes: `
LETHAL: cast Combustion Technique →Krotiq Nestguard → attack with Fire Nation Cadets + Hill Giant → activate Fire Nation Cadets ({2}: +1/+0) → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: Board from tla-06-combustion plus Fire Nation Cadets from tla-09-cadets. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Fire Nation Cadets: at most 3. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
  }),
  daily("2026-12-07", "ecl", {
    tier: "easy",
    opp: { life: 7, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Cinder Strike")], battlefield: [c("Hill Giant"), c("Gray Ogre", {"sick":true}), c("Mountain"), c("Tarkir Duneshaper"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest")] },
    explanation: "cast Cinder Strike (blighting Gray Ogre) →Krotiq Nestguard → activate Tarkir Duneshaper ({4}{G/P}: Transform) → attack with Hill Giant + Tarkir Duneshaper.",
    notes: `
LETHAL: cast Cinder Strike (blighting Gray Ogre) →Krotiq Nestguard → activate Tarkir Duneshaper ({4}{G/P}: Transform) → attack with Hill Giant + Tarkir Duneshaper → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: Board from ecl-01-cinder-strike (ECL) plus Tarkir Duneshaper from mom-06-deadly-stampede (MOM).
WRONG LINES: Without Tarkir Duneshaper: at most 3. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-12-08", "tmt", {
    tier: "medium",
    opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Shredder, Unrelenting")], battlefield: [c("Hill Giant"), c("Grizzly Bears"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Krotiq Nestguard")] },
    explanation: "attack with Grizzly Bears + Hill Giant → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → Shredder, Unrelenting → Hill Giant.",
    notes: `
LETHAL: attack with Grizzly Bears + Hill Giant → (opponent: Krotiq Nestguard blocks Hill Giant) → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → Shredder, Unrelenting → Hill Giant: exactly 6 damage (the most this board can deal).
RULES: Board from tmt-01-shredder (TMT) plus Krotiq Nestguard from hob-02-nighthowl (HOB). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Krotiq Nestguard: at most 6. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-09", "lci", {
    tier: "easy",
    opp: { life: 6, battlefield: [] },
    you: { hand: [c("Deathcap Marionette")], battlefield: [c("Basking Capybara"), c("Swamp"), c("Swamp"), c("Merfolk Cave-Diver"), c("Forest")], graveyard: [c("Forest"), c("Grizzly Bears"), c("Lightning Bolt")], library: [c("Forest"), c("Hill Giant")] },
    explanation: "cast Deathcap Marionette → Mill 2?: Mill 2 → attack with Basking Capybara + Merfolk Cave-Diver.",
    notes: `
LETHAL: cast Deathcap Marionette → Mill 2?: Mill 2 → attack with Basking Capybara + Merfolk Cave-Diver → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: Board from lci-03-dig-deep plus Merfolk Cave-Diver from lci-01-unseen-currents.
WRONG LINES: Without Merfolk Cave-Diver: at most 4. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-10", "tmt", {
    tier: "medium",
    opp: { life: 6, battlefield: [c("Wall of Wood")] },
    you: { hand: [c("Tenderize"), c("Grow Extra Arms")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Forest"), c("Forest")] },
    explanation: "attack with Gray Ogre + Hill Giant → cast Grow Extra Arms →Gray Ogre.",
    notes: `
LETHAL: attack with Gray Ogre + Hill Giant → (opponent: Wall of Wood blocks Hill Giant) → cast Grow Extra Arms →Gray Ogre: exactly 6 damage (the most this board can deal).
RULES: Board from tmt-04-tenderize (TMT) plus Grow Extra Arms from spm-06-extra-arms (SPM). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Grow Extra Arms: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-11", "sos", {
    tier: "hard",
    opp: { life: 7, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Pedal to the Metal")], battlefield: [c("Adventurous Eater", {"prepared":true}), c("Leech Collector"), c("Swamp"), c("Swamp"), c("Mountain"), c("Mountain"), c("Mountain")] },
    explanation: "cast Have a Bite →Leech Collector → cast Bloodletting → attack with Adventurous Eater + Leech Collector → cast Pedal to the Metal (X=2) →Leech Collector.",
    notes: `
LETHAL: cast Have a Bite →Leech Collector → cast Bloodletting → attack with Adventurous Eater + Leech Collector → (opponent: Krotiq Nestguard blocks Adventurous Eater) → cast Pedal to the Metal (X=2) →Leech Collector: exactly 7 damage (the most this board can deal).
RULES: Board from sos-05-leech-collector plus Pedal to the Metal from sos-07-skywhale. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Pedal to the Metal: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-12-12", "hob", {
    tier: "hard",
    opp: { life: 6, battlefield: [c("Grizzly Bears"), c("Grizzly Bears")] },
    you: { hand: [c("Forest"), c("Full Bore")], battlefield: [c("Attercop"), c("Nighthowl Pursuer"), c("Beorn's Hospitality"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
    explanation: "play Forest → put Attercop's trigger on the stack first → Beorn's Hospitality → Attercop → attack with Attercop + Nighthowl Pursuer → cast Full Bore →Nighthowl Pursuer.",
    notes: `
LETHAL: play Forest → put Attercop's trigger on the stack first → Beorn's Hospitality → Attercop → attack with Attercop + Nighthowl Pursuer → (opponent: Grizzly Bears + Grizzly Bears blocks Attercop) → cast Full Bore →Nighthowl Pursuer: exactly 6 damage (the most this board can deal).
RULES: Board from hob-10-mirkwood (HOB) plus Full Bore from eoe-08-full-bore (EOE). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Full Bore: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-13", "blb", {
    tier: "hard",
    opp: { life: 7, battlefield: [c("Wall of Wood")] },
    you: { hand: [c("Daggerfang Duo")], battlefield: [c("Nightwhorl Hermit"), c("Swamp"), c("Swamp"), c("Swamp"), c("Giant Koi"), c("Mountain")], graveyard: [c("Hill Giant"), c("Gray Ogre"), c("Grizzly Bears"), c("Lightning Bolt"), c("Shock"), c("Mountain")], library: [c("Forest"), c("Forest")] },
    explanation: "cast Daggerfang Duo → Mill 2?: Mill 2 → attack with Giant Koi + Nightwhorl Hermit → activate Giant Koi (Waterbend {3}: can't be blocked) (waterbending: tapping Nightwhorl Hermit + Daggerfang Duo).",
    notes: `
LETHAL: cast Daggerfang Duo → Mill 2?: Mill 2 → attack with Giant Koi + Nightwhorl Hermit → activate Giant Koi (Waterbend {3}: can't be blocked) (waterbending: tapping Nightwhorl Hermit + Daggerfang Duo) → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: Board from blb-04-threshold (BLB) plus Giant Koi from tla-08-koi-fire (TLA). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Giant Koi: at most 2. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-12-14", "msh", {
    tier: "easy",
    opp: { life: 7, battlefield: [] },
    you: { hand: [c("Volcanic Villain")], battlefield: [c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Luke Cage, Power Man")] },
    explanation: "cast Volcanic Villain → activate Volcanic Villain (Power-up — {5}{R}: two +1/+1 counters) → attack with Luke Cage, Power Man + Volcanic Villain.",
    notes: `
LETHAL: cast Volcanic Villain → activate Volcanic Villain (Power-up — {5}{R}: two +1/+1 counters) → attack with Luke Cage, Power Man + Volcanic Villain → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: Board from msh-01-volcanic-villain plus Luke Cage, Power Man from msh-09-luke-cage.
WRONG LINES: Without Luke Cage, Power Man: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-12-15", "hob", {
    tier: "medium",
    opp: { life: 4, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Team Tactics")], battlefield: [c("Key to the Side-Door"), c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Mountain")] },
    explanation: "attack with Gray Ogre + Hill Giant → cast Team Tactics →Gray Ogre.",
    notes: `
LETHAL: attack with Gray Ogre + Hill Giant → (opponent: Krotiq Nestguard blocks Hill Giant) → cast Team Tactics →Gray Ogre: exactly 4 damage (the most this board can deal).
RULES: Board from hob-06-side-door (HOB) plus Team Tactics from msh-03-team-tactics (MSH). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Team Tactics: at most 3. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
  }),
  daily("2026-12-16", "otj", {
    tier: "easy",
    opp: { life: 4, battlefield: [c("Wall of Wood"), c("Grizzly Bears")] },
    you: { hand: [c("Shock"), c("Swooping Lookout")], battlefield: [c("Razzle-Dazzler"), c("Mountain"), c("Plains"), c("Plains"), c("Plains"), c("Plains")], exile: [c("Cunning Coyote")] },
    explanation: "cast Shock →opponent → cast Swooping Lookout → attack with Razzle-Dazzler.",
    notes: `
LETHAL: cast Shock →opponent → cast Swooping Lookout → attack with Razzle-Dazzler → (opponent: no blocks): exactly 4 damage (the most this board can deal).
RULES: Board from otj-09-razzle-dazzle (OTJ) plus Swooping Lookout from one-10-assembly-line (ONE).
WRONG LINES: Without Swooping Lookout: at most 2. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
  }),
  daily("2026-12-17", "woe", {
    tier: "hard",
    opp: { life: 6, battlefield: [c("Wall of Wood")] },
    you: { hand: [c("Monstrous Rage")], battlefield: [c("Hill Giant"), c("Mountain"), c("Gossip's Talent"), c("Island"), c("Island"), c("Forest")] },
    explanation: "activate Gossip's Talent (Level 2 ({1}{U})) → attack with Hill Giant → Gossip's Talent → Hill Giant → cast Monstrous Rage →Hill Giant.",
    notes: `
LETHAL: activate Gossip's Talent (Level 2 ({1}{U})) → attack with Hill Giant → Gossip's Talent → Hill Giant → cast Monstrous Rage →Hill Giant → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: Board from woe-01-monster-inside (WOE) plus Gossip's Talent from blb-06-gossip (BLB). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Gossip's Talent: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-18", "tmt", {
    tier: "hard",
    opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("The Last Ronin's Technique")], battlefield: [c("Raphael, Tough Turtle"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Scrounging Skyray"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
    explanation: "attack with Scrounging Skyray → cast The Last Ronin's Technique (sneak, returning Scrounging Skyray) → Raphael, Tough Turtle → opponent → Raphael, Tough Turtle → opponent → Raphael, Tough Turtle → opponent.",
    notes: `
LETHAL: attack with Scrounging Skyray → (opponent: no blocks) → cast The Last Ronin's Technique (sneak, returning Scrounging Skyray) → Raphael, Tough Turtle → opponent → Raphael, Tough Turtle → opponent → Raphael, Tough Turtle → opponent: exactly 6 damage (the most this board can deal).
RULES: Board from tmt-02-tough-turtle (TMT) plus Scrounging Skyray from dft-09-scrounging (DFT). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Scrounging Skyray: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-19", "hob", {
    tier: "hard",
    opp: { life: 6, battlefield: [c("Grizzly Bears"), c("Grizzly Bears")] },
    you: { hand: [c("Forest")], battlefield: [c("Wargling"), c("Hill Giant"), c("Beorn's Hospitality"), c("Fire Sages"), c("Mountain")] },
    explanation: "play Forest → Beorn's Hospitality → Hill Giant → attack with Fire Sages + Hill Giant + Wargling → put Wargling's trigger on the stack first → activate Fire Sages ({1}{R}{R}: +1/+1 counter).",
    notes: `
LETHAL: play Forest → Beorn's Hospitality → Hill Giant → attack with Fire Sages + Hill Giant + Wargling → put Wargling's trigger on the stack first → activate Fire Sages ({1}{R}{R}: +1/+1 counter) → (opponent: Grizzly Bears blocks Wargling, Grizzly Bears blocks Hill Giant): exactly 6 damage (the most this board can deal).
RULES: Board from hob-09-wargling (HOB) plus Fire Sages from tla-01-firebending (TLA). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Fire Sages: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-20", "tmt", {
    tier: "hard",
    opp: { life: 9, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Shredder, Unrelenting"), c("Volt Charge")], battlefield: [c("Mutant Town Musicians"), c("Grizzly Bears"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
    explanation: "cast Volt Charge →opponent → attack with Grizzly Bears + Mutant Town Musicians → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → put Mutant Town Musicians's trigger on the stack first → Shredder, Unrelenting → Mutant Town Musicians.",
    notes: `
LETHAL: cast Volt Charge →opponent → attack with Grizzly Bears + Mutant Town Musicians → (opponent: Krotiq Nestguard blocks Mutant Town Musicians) → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → put Mutant Town Musicians's trigger on the stack first → Shredder, Unrelenting → Mutant Town Musicians: exactly 9 damage (the most this board can deal).
RULES: Board from tmt-06-deathtouch (TMT) plus Volt Charge from one-07-oil-slick (ONE). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Volt Charge: at most 6. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
  }),
  daily("2026-12-21", "dsk", {
    tier: "easy",
    opp: { life: 9, battlefield: [] },
    you: { hand: [c("Grand Entryway // Elegant Rotunda")], battlefield: [c("Dashing Bloodsucker"), c("Plains"), c("Plains"), c("Glimmer Seeker")] },
    explanation: "cast Grand Entryway → put Dashing Bloodsucker's trigger on the stack first → attack with Dashing Bloodsucker + Glimmer Seeker.",
    notes: `
LETHAL: cast Grand Entryway → put Dashing Bloodsucker's trigger on the stack first → attack with Dashing Bloodsucker + Glimmer Seeker → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: Board from dsk-01-grand-entrance plus Glimmer Seeker from dsk-05-survivors.
WRONG LINES: Without Glimmer Seeker: at most 6. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
  }),
  daily("2026-12-22", "tmt", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Shredder, Unrelenting")], battlefield: [c("Hill Giant"), c("Grizzly Bears"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Alabaster Host Sanctifier")] },
    explanation: "attack with Alabaster Host Sanctifier + Grizzly Bears + Hill Giant → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → Shredder, Unrelenting → Hill Giant.",
    notes: `
LETHAL: attack with Alabaster Host Sanctifier + Grizzly Bears + Hill Giant → (opponent: Krotiq Nestguard blocks Hill Giant) → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → Shredder, Unrelenting → Hill Giant: exactly 8 damage (the most this board can deal).
RULES: Board from tmt-01-shredder (TMT) plus Alabaster Host Sanctifier from mom-05-siege-breaker (MOM). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Alabaster Host Sanctifier: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-12-23", "ecl", {
    tier: "easy",
    opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Cinder Strike"), c("Kindle the Inner Flame")], battlefield: [c("Hill Giant"), c("Gray Ogre", {"sick":true}), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
    explanation: "cast Cinder Strike (blighting Gray Ogre) →Krotiq Nestguard → cast Kindle the Inner Flame →Hill Giant → attack with Hill Giant + Hill Giant.",
    notes: `
LETHAL: cast Cinder Strike (blighting Gray Ogre) →Krotiq Nestguard → cast Kindle the Inner Flame →Hill Giant → attack with Hill Giant + Hill Giant → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: Board from ecl-01-cinder-strike plus Kindle the Inner Flame from ecl-07-kindle.
WRONG LINES: Without Kindle the Inner Flame: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-24", "tmt", {
    tier: "medium",
    opp: { life: 6, battlefield: [c("Wall of Wood")] },
    you: { hand: [c("Tenderize"), c("The Last Ronin's Technique")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Forest"), c("Forest"), c("Plains"), c("Plains")] },
    explanation: "cast Tenderize →Hill Giant + Wall of Wood → attack with Gray Ogre + Hill Giant → cast The Last Ronin's Technique (sneak, returning Gray Ogre).",
    notes: `
LETHAL: cast Tenderize →Hill Giant + Wall of Wood → attack with Gray Ogre + Hill Giant → (opponent: no blocks) → cast The Last Ronin's Technique (sneak, returning Gray Ogre): exactly 6 damage (the most this board can deal).
RULES: Board from tmt-04-tenderize plus The Last Ronin's Technique from tmt-09-musicians. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without The Last Ronin's Technique: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-25", "sos", {
    tier: "hard",
    opp: { life: 7, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Yip Yip!")], battlefield: [c("Adventurous Eater", {"prepared":true}), c("Leech Collector"), c("Swamp"), c("Swamp"), c("Plains")] },
    explanation: "cast Have a Bite →Leech Collector → cast Bloodletting → attack with Adventurous Eater + Leech Collector → cast Yip Yip! →Leech Collector.",
    notes: `
LETHAL: cast Have a Bite →Leech Collector → cast Bloodletting → attack with Adventurous Eater + Leech Collector → (opponent: Krotiq Nestguard blocks Adventurous Eater) → cast Yip Yip! →Leech Collector: exactly 7 damage (the most this board can deal).
RULES: Board from sos-05-leech-collector (SOS) plus Yip Yip! from tla-09-cadets (TLA). TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Yip Yip!: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-12-26", "tdm", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Fortress Kin-Guard")], battlefield: [c("Shocking Sharpshooter"), c("Plains"), c("Plains"), c("Dalkovan Packbeasts")] },
    explanation: "cast Fortress Kin-Guard → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → Fortress Kin-Guard endures 1: Create a 1/1 Spirit token → Shocking Sharpshooter → opponent → attack with Dalkovan Packbeasts + Shocking Sharpshooter → Shocking Sharpshooter → opponent → Shocking Sharpshooter → opponent → Shocking Sharpshooter → opponent.",
    notes: `
LETHAL: cast Fortress Kin-Guard → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → Fortress Kin-Guard endures 1: Create a 1/1 Spirit token → Shocking Sharpshooter → opponent → attack with Dalkovan Packbeasts + Shocking Sharpshooter → Shocking Sharpshooter → opponent → Shocking Sharpshooter → opponent → Shocking Sharpshooter → opponent → (opponent: Krotiq Nestguard blocks Shocking Sharpshooter): exactly 8 damage (the most this board can deal).
RULES: Board from tdm-02-kin-guard plus Dalkovan Packbeasts from tdm-01-call-to-arms.
WRONG LINES: Without Dalkovan Packbeasts: at most 2. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-12-27", "fra", {
    tier: "medium",
    opp: { life: 7, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Keeper of the Quiet Hour"), c("Whiplash Wordsmith")], battlefield: [c("Kiora of Salt and Sand"), c("Hill Giant"), c("Forest"), c("Forest"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
    explanation: "cast Keeper of the Quiet Hour → cast Whiplash Wordsmith → cast Vicious Verse →opponent → activate Jace (−1: Surveil 1) → attack with Hill Giant + Whiplash Wordsmith → Kiora of Salt and Sand → Hill Giant.",
    notes: `
LETHAL: cast Keeper of the Quiet Hour → cast Whiplash Wordsmith → cast Vicious Verse →opponent → activate Jace (−1: Surveil 1) → attack with Hill Giant + Whiplash Wordsmith → Kiora of Salt and Sand → Hill Giant → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: Board from fra-05-kiora plus Whiplash Wordsmith from fra-03-wordsmith.
WRONG LINES: Without Whiplash Wordsmith: at most 3. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-12-28", "fin", {
    tier: "easy",
    opp: { life: 6, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Samurai's Katana"), c("Shock")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
    explanation: "cast Samurai's Katana → cast Shock →Grizzly Bears → attack with Hero + Hill Giant.",
    notes: `
LETHAL: cast Samurai's Katana → cast Shock →Grizzly Bears → attack with Hero + Hill Giant → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: Board from fin-01-job-select plus Shock from fin-03-black-mages.
WRONG LINES: Without Shock: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-29", "lci", {
    tier: "medium",
    opp: { life: 5, battlefield: [c("Wall of Wood")] },
    you: { hand: [c("Cenote Scout"), c("Spyglass Siren")], battlefield: [c("Merfolk Cave-Diver"), c("Forest"), c("Plains"), c("Plains"), c("Island"), c("Island")], library: [c("Grizzly Bears")] },
    explanation: "cast Cenote Scout → Explore: Leave it on top → cast Spyglass Siren → activate Map ({1}, {T}, Sacrifice: target creature you control explores) → Merfolk Cave-Diver → Explore: Leave it on top → attack with Merfolk Cave-Diver.",
    notes: `
LETHAL: cast Cenote Scout → Explore: Leave it on top → cast Spyglass Siren → activate Map ({1}, {T}, Sacrifice: target creature you control explores) → Merfolk Cave-Diver → Explore: Leave it on top → attack with Merfolk Cave-Diver → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: Board from lci-01-unseen-currents plus Spyglass Siren from lci-08-map-room.
WRONG LINES: Without Spyglass Siren: at most 3. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
  }),
  daily("2026-12-30", "mkm", {
    tier: "easy",
    opp: { life: 11, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Convenient Target")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Alley Assailant", {"faceDown":true}), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
    explanation: "cast Convenient Target →Grizzly Bears → activate Alley Assailant (Turn face up {4}{B}{B}) → attack with Alley Assailant + Gray Ogre + Hill Giant.",
    notes: `
LETHAL: cast Convenient Target →Grizzly Bears → activate Alley Assailant (Turn face up {4}{B}{B}) → attack with Alley Assailant + Gray Ogre + Hill Giant → (opponent: no blocks): exactly 11 damage (the most this board can deal).
RULES: Board from mkm-01-prime-suspect plus Alley Assailant from mkm-02-unmasked.
WRONG LINES: Without Alley Assailant: at most 5. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
  }),
  daily("2026-12-31", "eoe", {
    tier: "medium",
    opp: { life: 7, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Weftstalker Ardent"), c("Knight Luminary")], battlefield: [c("Mountain"), c("Plains"), c("Plains"), c("Debris Field Crusher", {"counters":{"charge":3}}), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
    explanation: "cast Weftstalker Ardent (warp) → cast Knight Luminary (warp) → put Weftstalker Ardent's trigger on the stack first → activate Debris Field Crusher (Station (8+)) (stationed by Weftstalker Ardent) → activate Debris Field Crusher (Station (8+)) (stationed by Knight Luminary) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → attack with Debris Field Crusher.",
    notes: `
LETHAL: cast Weftstalker Ardent (warp) → cast Knight Luminary (warp) → put Weftstalker Ardent's trigger on the stack first → activate Debris Field Crusher (Station (8+)) (stationed by Weftstalker Ardent) → activate Debris Field Crusher (Station (8+)) (stationed by Knight Luminary) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → attack with Debris Field Crusher → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: Board from eoe-04-weftstalker plus Debris Field Crusher from eoe-07-drill-too-deep.
WRONG LINES: Without Debris Field Crusher: at most 2. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  })
  );
})();
