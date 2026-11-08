/* Daily puzzles: one per day, titled with its date. The game shows a day's puzzle from that date on (the player's
 * local date); earlier days stay playable. Each board is a set puzzle plus a card from another puzzle (any set;
 * artSet: whose basic lands and tokens it shows) — from 2026-11-09 on, a rare or mythic (in hand with the lands to
 * cast it, or on the battlefield) that the winning plan needs — solver-checked: the opponent's life is exactly the most damage the
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
  daily("2026-11-09", "blb", {
    tier: "easy",
    opp: { life: 10, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Giant Growth")], battlefield: [c("Mouse Trapper"), c("Hill Giant"), c("Forest"), c("Helga, Skittish Seer")] },
    explanation: "Cast Giant Growth →Mouse Trapper → Mouse Trapper → Grizzly Bears → attack with Helga, Skittish Seer + Hill Giant + Mouse Trapper.",
    notes: `
LETHAL: cast Giant Growth →Mouse Trapper → Mouse Trapper → Grizzly Bears → attack with Helga, Skittish Seer + Hill Giant + Mouse Trapper → (opponent: no blocks): exactly 10 damage (the most this board can deal).
RULES: Board from blb-02-mouse-trap (BLB) plus Helga, Skittish Seer (mythic, BLB) on the battlefield.
WRONG LINES: Without Helga, Skittish Seer: at most 9. Any other order or target deals less than 10.
UNIQUENESS: Solver-checked: one plan reaches 10; 11 isn't reachable.`
  }),
  daily("2026-11-10", "dsk", {
    tier: "medium",
    opp: { life: 7, battlefield: [c("Wall of Wood")] },
    you: { hand: [c("Grand Entryway // Elegant Rotunda")], battlefield: [c("Glimmer Seeker"), c("Balemurk Leech"), c("Plains"), c("Plains"), c("Undead Sprinter")] },
    explanation: "Attack with Balemurk Leech + Glimmer Seeker + Undead Sprinter → cast Grand Entryway → put Balemurk Leech's trigger on the stack first.",
    notes: `
LETHAL: attack with Balemurk Leech + Glimmer Seeker + Undead Sprinter → (opponent: Wall of Wood blocks Glimmer Seeker) → cast Grand Entryway → put Balemurk Leech's trigger on the stack first: exactly 7 damage (the most this board can deal).
RULES: Board from dsk-05-survivors (DSK) plus Undead Sprinter (rare, DSK) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Undead Sprinter: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-11-11", "dft", {
    tier: "easy",
    opp: { life: 8, battlefield: [] },
    you: { hand: [c("Prowcatcher Specialist")], battlefield: [c("Pacesetter Paragon"), c("Mountain"), c("Mountain"), c("Mountain"), c("The Aetherspark")] },
    explanation: "Activate Pacesetter Paragon (Exhaust — {2}{R}: +1/+1 counter, double strike) → activate The Aetherspark (+1: Attach The Aetherspark to up to one target creature you control. Put a +1/+1 counter on that creature.) → Pacesetter Paragon → attack with Pacesetter Paragon.",
    notes: `
LETHAL: activate Pacesetter Paragon (Exhaust — {2}{R}: +1/+1 counter, double strike) → activate The Aetherspark (+1: Attach The Aetherspark to up to one target creature you control. Put a +1/+1 counter on that creature.) → Pacesetter Paragon → attack with Pacesetter Paragon → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: Board from dft-02-pacesetter (DFT) plus The Aetherspark (mythic, DFT) on the battlefield.
WRONG LINES: Without The Aetherspark: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-11-12", "sos", {
    tier: "medium",
    opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Lightning Strike"), c("Postmortem Professor")], battlefield: [c("Cuboid Colony"), c("Mountain"), c("Mountain"), c("Swamp"), c("Swamp")] },
    explanation: "Cast Postmortem Professor → cast Lightning Strike →opponent → attack with Cuboid Colony.",
    notes: `
LETHAL: cast Postmortem Professor → cast Lightning Strike →opponent → attack with Cuboid Colony → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: Board from sos-04-cuboid-colony (SOS) plus Postmortem Professor (rare, SOS) in hand. TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Postmortem Professor: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-11-13", "tla", {
    tier: "hard",
    opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [], battlefield: [c("Zuko, Exiled Prince"), c("Hill Giant"), c("Mountain"), c("Mountain"), c("The Earth King")], library: [c("Lightning Strike")] },
    explanation: "Attack with Hill Giant + The Earth King + Zuko, Exiled Prince → put The Earth King's trigger on the stack first → activate Zuko, Exiled Prince ({3}: Exile the top card; play it this turn) → cast Lightning Strike (from exile) →opponent.",
    notes: `
LETHAL: attack with Hill Giant + The Earth King + Zuko, Exiled Prince → put The Earth King's trigger on the stack first → activate Zuko, Exiled Prince ({3}: Exile the top card; play it this turn) → cast Lightning Strike (from exile) →opponent → (opponent: Krotiq Nestguard blocks Zuko, Exiled Prince): exactly 8 damage (the most this board can deal).
RULES: Board from tla-05-zuko (TLA) plus The Earth King (rare, TLA) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2). TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without The Earth King: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-11-14", "tmt", {
    tier: "hard",
    opp: { life: 10, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("The Last Ronin's Technique"), c("Mondo Gecko")], battlefield: [c("Mutant Town Musicians"), c("Raphael, Tough Turtle"), c("Grizzly Bears"), c("Plains"), c("Plains"), c("Island"), c("Island"), c("Island")] },
    explanation: "Cast Mondo Gecko → put Mutant Town Musicians's trigger on the stack first → Raphael, Tough Turtle → opponent → attack with Grizzly Bears + Mutant Town Musicians + Raphael, Tough Turtle → cast The Last Ronin's Technique (sneak, returning Grizzly Bears) → put Mutant Town Musicians's trigger on the stack first → put Raphael, Tough Turtle's trigger on the stack first → Raphael, Tough Turtle → opponent → put Mutant Town Musicians's trigger on the stack first → put Raphael, Tough Turtle's trigger on the stack first → Raphael, Tough Turtle → opponent → put Mutant Town Musicians's trigger on the stack first → Raphael, Tough Turtle → opponent.",
    notes: `
LETHAL: cast Mondo Gecko → put Mutant Town Musicians's trigger on the stack first → Raphael, Tough Turtle → opponent → attack with Grizzly Bears + Mutant Town Musicians + Raphael, Tough Turtle → (opponent: Krotiq Nestguard blocks Mutant Town Musicians) → cast The Last Ronin's Technique (sneak, returning Grizzly Bears) → put Mutant Town Musicians's trigger on the stack first → put Raphael, Tough Turtle's trigger on the stack first → Raphael, Tough Turtle → opponent → put Mutant Town Musicians's trigger on the stack first → put Raphael, Tough Turtle's trigger on the stack first → Raphael, Tough Turtle → opponent → put Mutant Town Musicians's trigger on the stack first → Raphael, Tough Turtle → opponent: exactly 10 damage (the most this board can deal).
RULES: Board from tmt-09-musicians (TMT) plus Mondo Gecko (mythic, TMT) in hand. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Mondo Gecko: at most 8. Any other order or target deals less than 10.
UNIQUENESS: Solver-checked: one plan reaches 10; 11 isn't reachable.`
  }),
  daily("2026-11-15", "spm", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Grow Extra Arms")], battlefield: [c("Spider-Man, Web-Slinger"), c("Masked Meower"), c("Forest"), c("Vannifar, Evolved Enigma")] },
    explanation: "Vannifar, Evolved Enigma: Put a +1/+1 counter on each colorless creature you control → attack with Masked Meower + Spider-Man, Web-Slinger + Vannifar, Evolved Enigma → cast Grow Extra Arms →Masked Meower.",
    notes: `
LETHAL: Vannifar, Evolved Enigma: Put a +1/+1 counter on each colorless creature you control → attack with Masked Meower + Spider-Man, Web-Slinger + Vannifar, Evolved Enigma → (opponent: Grizzly Bears blocks Spider-Man, Web-Slinger) → cast Grow Extra Arms →Masked Meower: exactly 8 damage (the most this board can deal).
RULES: Board from spm-06-extra-arms (SPM) plus Vannifar, Evolved Enigma (mythic, MKM) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Vannifar, Evolved Enigma: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-11-16", "ecl", {
    tier: "easy",
    opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Cinder Strike")], battlefield: [c("Hill Giant"), c("Gray Ogre", {"sick":true}), c("Mountain"), c("Shadow Urchin")] },
    explanation: "Cast Cinder Strike (blighting Gray Ogre) →Krotiq Nestguard → attack with Hill Giant + Shadow Urchin → Blight 1: Gray Ogre.",
    notes: `
LETHAL: cast Cinder Strike (blighting Gray Ogre) →Krotiq Nestguard → attack with Hill Giant + Shadow Urchin → Blight 1: Gray Ogre → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: Board from ecl-01-cinder-strike (ECL) plus Shadow Urchin (rare, ECL) on the battlefield.
WRONG LINES: Without Shadow Urchin: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-11-17", "fin", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Tifa's Limit Break")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Jill, Shiva's Dominant")] },
    explanation: "Attack with Gray Ogre + Hill Giant + Jill, Shiva's Dominant → cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Gray Ogre.",
    notes: `
LETHAL: attack with Gray Ogre + Hill Giant + Jill, Shiva's Dominant → (opponent: Grizzly Bears blocks Hill Giant) → cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Gray Ogre: exactly 8 damage (the most this board can deal).
RULES: Board from fin-06-final-heaven (FIN) plus Jill, Shiva's Dominant (rare, FIN) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Jill, Shiva's Dominant: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-11-18", "eoe", {
    tier: "easy",
    opp: { life: 7, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Galvanizing Sawship")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Rust Harvester")] },
    explanation: "Cast Galvanizing Sawship → activate Galvanizing Sawship (Station (3+)) (stationed by Hill Giant) → attack with Galvanizing Sawship + Rust Harvester.",
    notes: `
LETHAL: cast Galvanizing Sawship → activate Galvanizing Sawship (Station (3+)) (stationed by Hill Giant) → attack with Galvanizing Sawship + Rust Harvester → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: Board from eoe-01-sawship (EOE) plus Rust Harvester (rare, EOE) on the battlefield.
WRONG LINES: Without Rust Harvester: at most 6. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-11-19", "tla", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Yip Yip!"), c("Lightning Strike")], battlefield: [c("Fire Nation Cadets"), c("Hill Giant"), c("Plains"), c("Raging Battle Mouse")] },
    explanation: "Cast Yip Yip! →Fire Nation Cadets → attack with Fire Nation Cadets + Hill Giant + Raging Battle Mouse → cast Lightning Strike →opponent.",
    notes: `
LETHAL: cast Yip Yip! →Fire Nation Cadets → attack with Fire Nation Cadets + Hill Giant + Raging Battle Mouse → cast Lightning Strike →opponent → (opponent: Krotiq Nestguard blocks Fire Nation Cadets): exactly 8 damage (the most this board can deal).
RULES: Board from tla-09-cadets (TLA) plus Raging Battle Mouse (rare, WOE) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Raging Battle Mouse: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-11-20", "woe", {
    tier: "hard",
    opp: { life: 5, battlefield: [c("Siege Mastodon")] },
    you: { hand: [c("Conceited Witch"), c("Candy Grapple"), c("Invasion of Ravnica")], battlefield: [c("Hill Giant"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
    explanation: "Cast Price of Beauty →Hill Giant → cast Invasion of Ravnica → Invasion of Ravnica → Siege Mastodon → attack with Hill Giant → cast Candy Grapple (bargaining Wicked) →Hill Giant.",
    notes: `
LETHAL: cast Price of Beauty →Hill Giant → cast Invasion of Ravnica → Invasion of Ravnica → Siege Mastodon → attack with Hill Giant → (opponent: no blocks) → cast Candy Grapple (bargaining Wicked) →Hill Giant: exactly 5 damage (the most this board can deal).
RULES: Board from woe-07-wicked-bargain (WOE) plus Invasion of Ravnica (mythic, MOM) in hand. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Invasion of Ravnica: at most 4. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
  }),
  daily("2026-11-21", "spm", {
    tier: "hard",
    opp: { life: 6, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Stegron the Dinosaur Man")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Great Gilded Boat")] },
    explanation: "Activate Great Gilded Boat (Crew 2) (crewed by Gray Ogre) → attack with Great Gilded Boat + Hill Giant → Discard which card?: Unknown card → discard Stegron the Dinosaur Man for its ability → Hill Giant.",
    notes: `
LETHAL: activate Great Gilded Boat (Crew 2) (crewed by Gray Ogre) → attack with Great Gilded Boat + Hill Giant → Discard which card?: Unknown card → (opponent: Grizzly Bears blocks Great Gilded Boat) → discard Stegron the Dinosaur Man for its ability → Hill Giant: exactly 6 damage (the most this board can deal).
RULES: Board from spm-04-dinosaur-formula (SPM) plus Great Gilded Boat (rare, HOB) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Great Gilded Boat: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-11-22", "tmt", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Shredder, Unrelenting")], battlefield: [c("Hill Giant"), c("Grizzly Bears"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Tenured Tethermage")] },
    explanation: "Attack with Grizzly Bears + Hill Giant + Tenured Tethermage → cast Shredder, Unrelenting (sneak, returning Tenured Tethermage) → Shredder, Unrelenting → Hill Giant.",
    notes: `
LETHAL: attack with Grizzly Bears + Hill Giant + Tenured Tethermage → (opponent: Krotiq Nestguard blocks Hill Giant) → cast Shredder, Unrelenting (sneak, returning Tenured Tethermage) → Shredder, Unrelenting → Hill Giant: exactly 8 damage (the most this board can deal).
RULES: Board from tmt-01-shredder (TMT) plus Tenured Tethermage (rare, FRA) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Tenured Tethermage: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-11-23", "lci", {
    tier: "easy",
    opp: { life: 7, battlefield: [c("Wall of Wood")] },
    you: { hand: [c("Cenote Scout")], battlefield: [c("Merfolk Cave-Diver"), c("Forest"), c("Trumpeting Carnosaur")], library: [c("Grizzly Bears")] },
    explanation: "Cast Cenote Scout → Explore: Leave it on top → attack with Merfolk Cave-Diver + Trumpeting Carnosaur.",
    notes: `
LETHAL: cast Cenote Scout → Explore: Leave it on top → attack with Merfolk Cave-Diver + Trumpeting Carnosaur → (opponent: Wall of Wood blocks Trumpeting Carnosaur): exactly 7 damage (the most this board can deal).
RULES: Board from lci-01-unseen-currents (LCI) plus Trumpeting Carnosaur (rare, LCI) on the battlefield.
WRONG LINES: Without Trumpeting Carnosaur: at most 3. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-11-24", "dsk", {
    tier: "medium",
    opp: { life: 7, battlefield: [c("Wall of Wood")] },
    you: { hand: [c("Grand Entryway // Elegant Rotunda")], battlefield: [c("Glimmer Seeker"), c("Balemurk Leech"), c("Plains"), c("Plains"), c("The Swarmweaver")] },
    explanation: "Attack with Balemurk Leech + Glimmer Seeker + The Swarmweaver → cast Grand Entryway → put Balemurk Leech's trigger on the stack first.",
    notes: `
LETHAL: attack with Balemurk Leech + Glimmer Seeker + The Swarmweaver → (opponent: Wall of Wood blocks Glimmer Seeker) → cast Grand Entryway → put Balemurk Leech's trigger on the stack first: exactly 7 damage (the most this board can deal).
RULES: Board from dsk-05-survivors (DSK) plus The Swarmweaver (rare, DSK) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without The Swarmweaver: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-11-25", "msh", {
    tier: "easy",
    opp: { life: 7, battlefield: [] },
    you: { hand: [c("Volcanic Villain")], battlefield: [c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Loki, God of Mischief")] },
    explanation: "Cast Volcanic Villain → activate Volcanic Villain (Power-up — {5}{R}: two +1/+1 counters) → attack with Loki, God of Mischief + Volcanic Villain.",
    notes: `
LETHAL: cast Volcanic Villain → activate Volcanic Villain (Power-up — {5}{R}: two +1/+1 counters) → attack with Loki, God of Mischief + Volcanic Villain → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: Board from msh-01-volcanic-villain (MSH) plus Loki, God of Mischief (rare, MSH) on the battlefield.
WRONG LINES: Without Loki, God of Mischief: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-11-26", "sos", {
    tier: "medium",
    opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Lightning Strike"), c("Bolg's Company")], battlefield: [c("Cuboid Colony"), c("Mountain"), c("Mountain"), c("Swamp"), c("Mountain")] },
    explanation: "Cast Bolg's Company → cast Lightning Strike →opponent → attack with Cuboid Colony.",
    notes: `
LETHAL: cast Bolg's Company → cast Lightning Strike →opponent → attack with Cuboid Colony → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: Board from sos-04-cuboid-colony (SOS) plus Bolg's Company (rare, HOB) in hand. TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Bolg's Company: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-11-27", "blb", {
    tier: "hard",
    opp: { life: 8, battlefield: [c("Wall of Wood"), c("Grizzly Bears")] },
    you: { hand: [c("Giant Growth")], battlefield: [c("Gossip's Talent"), c("Hill Giant"), c("Gray Ogre"), c("Island"), c("Island"), c("Forest"), c("Valley Rotcaller")] },
    explanation: "Activate Gossip's Talent (Level 2 ({1}{U})) → attack with Gray Ogre + Hill Giant + Valley Rotcaller → put Valley Rotcaller's trigger on the stack first → Gossip's Talent → Hill Giant → cast Giant Growth →Hill Giant.",
    notes: `
LETHAL: activate Gossip's Talent (Level 2 ({1}{U})) → attack with Gray Ogre + Hill Giant + Valley Rotcaller → put Valley Rotcaller's trigger on the stack first → Gossip's Talent → Hill Giant → cast Giant Growth →Hill Giant → (opponent: Grizzly Bears blocks Gray Ogre): exactly 8 damage (the most this board can deal).
RULES: Board from blb-06-gossip (BLB) plus Valley Rotcaller (rare, BLB) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Valley Rotcaller: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-11-28", "dft", {
    tier: "hard",
    opp: { life: 7, battlefield: [c("Jibbirik Omnivore")] },
    you: { hand: [c("Dynamite Diver"), c("Deadly Cover-Up")], battlefield: [c("Clamorous Ironclad"), c("Mountain"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
    explanation: "Cast Dynamite Diver → activate Clamorous Ironclad (Crew 3) (crewed by Dynamite Diver) → attack with Clamorous Ironclad → cast Deadly Cover-Up → Dynamite Diver → opponent.",
    notes: `
LETHAL: cast Dynamite Diver → activate Clamorous Ironclad (Crew 3) (crewed by Dynamite Diver) → attack with Clamorous Ironclad → (opponent: no blocks) → cast Deadly Cover-Up → Dynamite Diver → opponent: exactly 7 damage (the most this board can deal).
RULES: Board from dft-04-dynamite-diver (DFT) plus Deadly Cover-Up (rare, MKM) in hand. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Deadly Cover-Up: at most 6. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-11-29", "tla", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [], battlefield: [c("Zuko, Exiled Prince"), c("Hill Giant"), c("Mountain"), c("Mountain"), c("Magda, the Hoardmaster")], library: [c("Lightning Strike")] },
    explanation: "Attack with Hill Giant + Magda, the Hoardmaster + Zuko, Exiled Prince → activate Zuko, Exiled Prince ({3}: Exile the top card; play it this turn) → cast Lightning Strike (from exile) →opponent.",
    notes: `
LETHAL: attack with Hill Giant + Magda, the Hoardmaster + Zuko, Exiled Prince → activate Zuko, Exiled Prince ({3}: Exile the top card; play it this turn) → cast Lightning Strike (from exile) →opponent → (opponent: Krotiq Nestguard blocks Zuko, Exiled Prince): exactly 8 damage (the most this board can deal).
RULES: Board from tla-05-zuko (TLA) plus Magda, the Hoardmaster (rare, OTJ) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Magda, the Hoardmaster: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-11-30", "one", {
    tier: "easy",
    opp: { life: 20, poison: 5, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Tyrranax Atrocity")], battlefield: [c("Branchblight Stalker"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Nissa, Ascended Animist")] },
    explanation: "Cast Tyrranax Atrocity → activate Nissa, Ascended Animist (−7: Until end of turn, creatures you control get +1/+1 for each Forest you control and gain trample.) → attack with Branchblight Stalker + Tyrranax Atrocity.",
    notes: `
LETHAL: cast Tyrranax Atrocity → activate Nissa, Ascended Animist (−7: Until end of turn, creatures you control get +1/+1 for each Forest you control and gain trample.) → attack with Branchblight Stalker + Tyrranax Atrocity → (opponent: Grizzly Bears blocks Branchblight Stalker): ten poison counters from 5 (the fewest this board can win from).
RULES: Board from one-01-fresh-venom (ONE) plus Nissa, Ascended Animist (mythic, ONE) on the battlefield.
WRONG LINES: Without Nissa, Ascended Animist: it needs at least 8 poison to start. Any other order or target falls short.
UNIQUENESS: Solver-checked: one plan wins from 5 poison; 4 poison isn't enough.`
  }),
  daily("2026-12-01", "fin", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Tifa's Limit Break")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Gogo, Master of Mimicry")] },
    explanation: "Attack with Gogo, Master of Mimicry + Gray Ogre + Hill Giant → cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Gray Ogre.",
    notes: `
LETHAL: attack with Gogo, Master of Mimicry + Gray Ogre + Hill Giant → (opponent: Grizzly Bears blocks Hill Giant) → cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Gray Ogre: exactly 8 damage (the most this board can deal).
RULES: Board from fin-06-final-heaven (FIN) plus Gogo, Master of Mimicry (mythic, FIN) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Gogo, Master of Mimicry: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-12-02", "tdm", {
    tier: "easy",
    opp: { life: 9, battlefield: [] },
    you: { hand: [c("Eshki Dragonclaw")], battlefield: [c("Hill Giant", {"sick":true}), c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Forest"), c("Island"), c("Mountain"), c("Forest")], graveyard: [c("Wild Ride")] },
    explanation: "Cast Eshki Dragonclaw → cast Wild Ride (harmonize) (tapping Hill Giant) →Eshki Dragonclaw → attack with Eshki Dragonclaw + Gray Ogre.",
    notes: `
LETHAL: cast Eshki Dragonclaw → cast Wild Ride (harmonize) (tapping Hill Giant) →Eshki Dragonclaw → attack with Eshki Dragonclaw + Gray Ogre → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: Board from tdm-04-wild-ride (TDM) plus Eshki Dragonclaw (rare, TDM) in hand.
WRONG LINES: Without Eshki Dragonclaw: at most 5. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
  }),
  daily("2026-12-03", "spm", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Grow Extra Arms")], battlefield: [c("Spider-Man, Web-Slinger"), c("Masked Meower"), c("Forest"), c("Bre of Clan Stoutarm")] },
    explanation: "Attack with Bre of Clan Stoutarm + Masked Meower + Spider-Man, Web-Slinger → cast Grow Extra Arms →Spider-Man, Web-Slinger.",
    notes: `
LETHAL: attack with Bre of Clan Stoutarm + Masked Meower + Spider-Man, Web-Slinger → (opponent: Grizzly Bears blocks Bre of Clan Stoutarm) → cast Grow Extra Arms →Spider-Man, Web-Slinger: exactly 8 damage (the most this board can deal).
RULES: Board from spm-06-extra-arms (SPM) plus Bre of Clan Stoutarm (rare, ECL) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Bre of Clan Stoutarm: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-12-04", "tmt", {
    tier: "hard",
    opp: { life: 9, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Shredder, Unrelenting")], battlefield: [c("Mutant Town Musicians"), c("Grizzly Bears"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Bruse Tarl, Roving Rancher")] },
    explanation: "Attack with Bruse Tarl, Roving Rancher + Grizzly Bears + Mutant Town Musicians → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → put Mutant Town Musicians's trigger on the stack first → Shredder, Unrelenting → Mutant Town Musicians.",
    notes: `
LETHAL: attack with Bruse Tarl, Roving Rancher + Grizzly Bears + Mutant Town Musicians → (opponent: Krotiq Nestguard blocks Bruse Tarl, Roving Rancher) → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → put Mutant Town Musicians's trigger on the stack first → Shredder, Unrelenting → Mutant Town Musicians: exactly 9 damage (the most this board can deal).
RULES: Board from tmt-06-deathtouch (TMT) plus Bruse Tarl, Roving Rancher (rare, OTJ) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Bruse Tarl, Roving Rancher: at most 6. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
  }),
  daily("2026-12-05", "eoe", {
    tier: "hard",
    opp: { life: 9, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Drill Too Deep")], battlefield: [c("Debris Field Crusher", {"counters":{"charge":3}}), c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Fire Lord Zuko")] },
    explanation: "Cast Drill Too Deep (Put five charge counters on target Spacecraft or Planet you control) →Debris Field Crusher → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → attack with Debris Field Crusher + Fire Lord Zuko + Hill Giant → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)).",
    notes: `
LETHAL: cast Drill Too Deep (Put five charge counters on target Spacecraft or Planet you control) →Debris Field Crusher → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → attack with Debris Field Crusher + Fire Lord Zuko + Hill Giant → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → (opponent: Krotiq Nestguard blocks Hill Giant): exactly 9 damage (the most this board can deal).
RULES: Board from eoe-07-drill-too-deep (EOE) plus Fire Lord Zuko (rare, TLA) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Fire Lord Zuko: at most 5. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
  }),
  daily("2026-12-06", "tmt", {
    tier: "medium",
    opp: { life: 9, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Shredder, Unrelenting")], battlefield: [c("Hill Giant"), c("Grizzly Bears"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Starving Revenant")] },
    explanation: "Attack with Grizzly Bears + Hill Giant + Starving Revenant → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → Shredder, Unrelenting → Hill Giant.",
    notes: `
LETHAL: attack with Grizzly Bears + Hill Giant + Starving Revenant → (opponent: Krotiq Nestguard blocks Starving Revenant) → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → Shredder, Unrelenting → Hill Giant: exactly 9 damage (the most this board can deal).
RULES: Board from tmt-01-shredder (TMT) plus Starving Revenant (rare, LCI) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Starving Revenant: at most 6. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
  }),
  daily("2026-12-07", "fra", {
    tier: "easy",
    opp: { life: 8, battlefield: [] },
    you: { hand: [c("Keeper of the Quiet Hour"), c("Frostbite Pyromental")], battlefield: [c("Inspired Tethermage"), c("Forest"), c("Forest"), c("Forest"), c("Island"), c("Mountain"), c("Mountain")] },
    explanation: "Cast Keeper of the Quiet Hour → cast Frostbite Pyromental → attack with Frostbite Pyromental + Inspired Tethermage.",
    notes: `
LETHAL: cast Keeper of the Quiet Hour → cast Frostbite Pyromental → attack with Frostbite Pyromental + Inspired Tethermage → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: Board from fra-01-empower (FRA) plus Frostbite Pyromental (rare, FRA) in hand.
WRONG LINES: Without Frostbite Pyromental: at most 4. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-12-08", "spm", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Stegron the Dinosaur Man")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Monument to Endurance")] },
    explanation: "Attack with Gray Ogre + Hill Giant → discard Stegron the Dinosaur Man for its ability → Gray Ogre → Monument to Endurance: Each opponent loses 3 life.",
    notes: `
LETHAL: attack with Gray Ogre + Hill Giant → (opponent: Grizzly Bears blocks Hill Giant) → discard Stegron the Dinosaur Man for its ability → Gray Ogre → Monument to Endurance: Each opponent loses 3 life: exactly 8 damage (the most this board can deal).
RULES: Board from spm-04-dinosaur-formula (SPM) plus Monument to Endurance (rare, DFT) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Monument to Endurance: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-12-09", "mom", {
    tier: "easy",
    opp: { life: 18, battlefield: [] },
    you: { hand: [c("Fearless Skald")], battlefield: [c("Bonded Herdbeast"), c("Mountain"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Borborygmos and Fblthp")] },
    explanation: "Cast Fearless Skald → Fearless Skald → Borborygmos and Fblthp → attack with Bonded Herdbeast + Borborygmos and Fblthp.",
    notes: `
LETHAL: cast Fearless Skald → Fearless Skald → Borborygmos and Fblthp → attack with Bonded Herdbeast + Borborygmos and Fblthp → (opponent: no blocks): exactly 18 damage (the most this board can deal).
RULES: Board from mom-01-backup-plan (MOM) plus Borborygmos and Fblthp (mythic, MOM) on the battlefield.
WRONG LINES: Without Borborygmos and Fblthp: at most 10. Any other order or target deals less than 18.
UNIQUENESS: Solver-checked: one plan reaches 18; 19 isn't reachable.`
  }),
  daily("2026-12-10", "tla", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Yip Yip!"), c("Lightning Strike")], battlefield: [c("Fire Nation Cadets"), c("Hill Giant"), c("Plains"), c("Rhuk, Hexgold Nabber")] },
    explanation: "Cast Yip Yip! →Fire Nation Cadets → attack with Fire Nation Cadets + Hill Giant + Rhuk, Hexgold Nabber → cast Lightning Strike →opponent.",
    notes: `
LETHAL: cast Yip Yip! →Fire Nation Cadets → attack with Fire Nation Cadets + Hill Giant + Rhuk, Hexgold Nabber → cast Lightning Strike →opponent → (opponent: Krotiq Nestguard blocks Fire Nation Cadets): exactly 8 damage (the most this board can deal).
RULES: Board from tla-09-cadets (TLA) plus Rhuk, Hexgold Nabber (rare, ONE) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Rhuk, Hexgold Nabber: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-12-11", "blb", {
    tier: "hard",
    opp: { life: 7, battlefield: [c("Wall of Wood"), c("Grizzly Bears")] },
    you: { hand: [c("Giant Growth")], battlefield: [c("Gossip's Talent"), c("Hill Giant"), c("Gray Ogre"), c("Island"), c("Island"), c("Forest"), c("Valley Flamecaller")] },
    explanation: "Activate Gossip's Talent (Level 2 ({1}{U})) → attack with Valley Flamecaller → Gossip's Talent → Valley Flamecaller → cast Giant Growth →Valley Flamecaller.",
    notes: `
LETHAL: activate Gossip's Talent (Level 2 ({1}{U})) → attack with Valley Flamecaller → Gossip's Talent → Valley Flamecaller → cast Giant Growth →Valley Flamecaller → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: Board from blb-06-gossip (BLB) plus Valley Flamecaller (rare, BLB) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Valley Flamecaller: at most 6. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-12-12", "woe", {
    tier: "hard",
    opp: { life: 9, battlefield: [c("Siege Mastodon")] },
    you: { hand: [c("Conceited Witch"), c("Candy Grapple")], battlefield: [c("Hill Giant"), c("Swamp"), c("Swamp"), c("Swamp"), c("Wildwood Mentor")] },
    explanation: "Cast Price of Beauty →Wildwood Mentor → attack with Hill Giant + Wildwood Mentor → Wildwood Mentor → Hill Giant → cast Candy Grapple (bargaining Wicked) →Siege Mastodon.",
    notes: `
LETHAL: cast Price of Beauty →Wildwood Mentor → attack with Hill Giant + Wildwood Mentor → Wildwood Mentor → Hill Giant → cast Candy Grapple (bargaining Wicked) →Siege Mastodon → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: Board from woe-07-wicked-bargain (WOE) plus Wildwood Mentor (rare, WOE) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Wildwood Mentor: at most 4. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
  }),
  daily("2026-12-13", "tmt", {
    tier: "medium",
    opp: { life: 14, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Karai's Technique")], battlefield: [c("Hill Giant"), c("Grizzly Bears"), c("Gray Ogre"), c("Plains"), c("Swamp"), c("Bloodletter of Aclazotz")] },
    explanation: "Attack with Bloodletter of Aclazotz + Gray Ogre + Grizzly Bears + Hill Giant → cast Karai's Technique (sneak, returning Grizzly Bears) (Target creature gets +3/+3) →Gray Ogre.",
    notes: `
LETHAL: attack with Bloodletter of Aclazotz + Gray Ogre + Grizzly Bears + Hill Giant → (opponent: Krotiq Nestguard blocks Hill Giant) → cast Karai's Technique (sneak, returning Grizzly Bears) (Target creature gets +3/+3) →Gray Ogre: exactly 14 damage (the most this board can deal).
RULES: Board from tmt-05-karai (TMT) plus Bloodletter of Aclazotz (mythic, LCI) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Bloodletter of Aclazotz: at most 5. Any other order or target deals less than 14.
UNIQUENESS: Solver-checked: one plan reaches 14; 15 isn't reachable.`
  }),
  daily("2026-12-14", "msh", {
    tier: "easy",
    opp: { life: 6, battlefield: [] },
    you: { hand: [c("Volcanic Villain")], battlefield: [c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Ms. Marvel, Kamala Khan")] },
    explanation: "Cast Volcanic Villain → activate Volcanic Villain (Power-up — {5}{R}: two +1/+1 counters) → attack with Ms. Marvel, Kamala Khan + Volcanic Villain.",
    notes: `
LETHAL: cast Volcanic Villain → activate Volcanic Villain (Power-up — {5}{R}: two +1/+1 counters) → attack with Ms. Marvel, Kamala Khan + Volcanic Villain → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: Board from msh-01-volcanic-villain (MSH) plus Ms. Marvel, Kamala Khan (rare, MSH) on the battlefield.
WRONG LINES: Without Ms. Marvel, Kamala Khan: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-15", "tla", {
    tier: "medium",
    opp: { life: 9, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Lightning Strike")], battlefield: [c("Fire Sages"), c("Hill Giant"), c("Mountain"), c("Conciliator's Duelist")] },
    explanation: "Attack with Conciliator's Duelist + Fire Sages + Hill Giant → cast Lightning Strike →Krotiq Nestguard → Conciliator's Duelist → Krotiq Nestguard.",
    notes: `
LETHAL: attack with Conciliator's Duelist + Fire Sages + Hill Giant → cast Lightning Strike →Krotiq Nestguard → Conciliator's Duelist → Krotiq Nestguard → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: Board from tla-01-firebending (TLA) plus Conciliator's Duelist (rare, SOS) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Conciliator's Duelist: at most 5. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
  }),
  daily("2026-12-16", "tdm", {
    tier: "easy",
    opp: { life: 10, battlefield: [] },
    you: { hand: [c("Rot-Curse Rakshasa")], battlefield: [c("Hill Giant", {"sick":true}), c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Swamp"), c("Swamp")], graveyard: [c("Wild Ride")] },
    explanation: "Cast Rot-Curse Rakshasa → cast Wild Ride (harmonize) (tapping Hill Giant) →Rot-Curse Rakshasa → attack with Gray Ogre + Rot-Curse Rakshasa.",
    notes: `
LETHAL: cast Rot-Curse Rakshasa → cast Wild Ride (harmonize) (tapping Hill Giant) →Rot-Curse Rakshasa → attack with Gray Ogre + Rot-Curse Rakshasa → (opponent: no blocks): exactly 10 damage (the most this board can deal).
RULES: Board from tdm-04-wild-ride (TDM) plus Rot-Curse Rakshasa (mythic, TDM) in hand.
WRONG LINES: Without Rot-Curse Rakshasa: at most 5. Any other order or target deals less than 10.
UNIQUENESS: Solver-checked: one plan reaches 10; 11 isn't reachable.`
  }),
  daily("2026-12-17", "hob", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [], battlefield: [c("Key to the Side-Door"), c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Ran and Shaw")] },
    explanation: "Attack with Gray Ogre + Hill Giant + Ran and Shaw → activate Ran and Shaw ({3}{R}: Dragons you control get +2/+0).",
    notes: `
LETHAL: attack with Gray Ogre + Hill Giant + Ran and Shaw → activate Ran and Shaw ({3}{R}: Dragons you control get +2/+0) → (opponent: Krotiq Nestguard blocks Hill Giant): exactly 8 damage (the most this board can deal).
RULES: Board from hob-06-side-door (HOB) plus Ran and Shaw (rare, TLA) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Ran and Shaw: at most 3. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-12-18", "ecl", {
    tier: "hard",
    opp: { life: 11, battlefield: [] },
    you: { hand: [c("Boggart Mischief"), c("The Death of Gwen Stacy")], battlefield: [c("Boneclub Berserker"), c("Goblin"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
    explanation: "Cast Boggart Mischief → Blight 1?: Blight Boneclub Berserker → attack with Boneclub Berserker + Goblin → cast The Death of Gwen Stacy → The Death of Gwen Stacy → Boneclub Berserker.",
    notes: `
LETHAL: cast Boggart Mischief → Blight 1?: Blight Boneclub Berserker → attack with Boneclub Berserker + Goblin → (opponent: no blocks) → cast The Death of Gwen Stacy → The Death of Gwen Stacy → Boneclub Berserker: exactly 11 damage (the most this board can deal).
RULES: Board from ecl-08-boggart-mischief (ECL) plus The Death of Gwen Stacy (rare, SPM) in hand. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without The Death of Gwen Stacy: at most 10. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
  }),
  daily("2026-12-19", "tmt", {
    tier: "hard",
    opp: { life: 9, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Shredder, Unrelenting")], battlefield: [c("Mutant Town Musicians"), c("Grizzly Bears"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Possibility Technician")] },
    explanation: "Attack with Grizzly Bears + Mutant Town Musicians + Possibility Technician → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → put Mutant Town Musicians's trigger on the stack first → Shredder, Unrelenting → Mutant Town Musicians.",
    notes: `
LETHAL: attack with Grizzly Bears + Mutant Town Musicians + Possibility Technician → (opponent: Krotiq Nestguard blocks Possibility Technician) → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → put Mutant Town Musicians's trigger on the stack first → Shredder, Unrelenting → Mutant Town Musicians: exactly 9 damage (the most this board can deal).
RULES: Board from tmt-06-deathtouch (TMT) plus Possibility Technician (rare, EOE) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Possibility Technician: at most 6. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
  }),
  daily("2026-12-20", "tla", {
    tier: "medium",
    opp: { life: 7, battlefield: [c("Krotiq Nestguard"), c("Krotiq Nestguard")] },
    you: { hand: [], battlefield: [c("Giant Koi"), c("Rough Rhino Cavalry"), c("Mountain"), c("Aven Interrupter")] },
    explanation: "Attack with Aven Interrupter + Giant Koi + Rough Rhino Cavalry → activate Giant Koi (Waterbend {3}: can't be blocked).",
    notes: `
LETHAL: attack with Aven Interrupter + Giant Koi + Rough Rhino Cavalry → activate Giant Koi (Waterbend {3}: can't be blocked) → (opponent: Krotiq Nestguard + Krotiq Nestguard blocks Rough Rhino Cavalry): exactly 7 damage (the most this board can deal).
RULES: Board from tla-08-koi-fire (TLA) plus Aven Interrupter (rare, OTJ) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Aven Interrupter: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-12-21", "dsk", {
    tier: "easy",
    opp: { life: 12, battlefield: [] },
    you: { hand: [c("Grand Entryway // Elegant Rotunda")], battlefield: [c("Dashing Bloodsucker"), c("Plains"), c("Plains"), c("Overlord of the Hauntwoods")] },
    explanation: "Cast Grand Entryway → put Dashing Bloodsucker's trigger on the stack first → attack with Dashing Bloodsucker + Overlord of the Hauntwoods.",
    notes: `
LETHAL: cast Grand Entryway → put Dashing Bloodsucker's trigger on the stack first → attack with Dashing Bloodsucker + Overlord of the Hauntwoods → (opponent: no blocks): exactly 12 damage (the most this board can deal).
RULES: Board from dsk-01-grand-entrance (DSK) plus Overlord of the Hauntwoods (mythic, DSK) on the battlefield.
WRONG LINES: Without Overlord of the Hauntwoods: at most 6. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
  }),
  daily("2026-12-22", "tmt", {
    tier: "medium",
    opp: { life: 9, battlefield: [c("Wall of Wood")] },
    you: { hand: [c("Tenderize"), c("Leonardo, Sewer Samurai")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Forest"), c("Forest"), c("Plains"), c("Plains"), c("Plains"), c("Plains")] },
    explanation: "Cast Tenderize →Hill Giant + Wall of Wood → attack with Gray Ogre + Hill Giant → cast Leonardo, Sewer Samurai (sneak, returning Gray Ogre).",
    notes: `
LETHAL: cast Tenderize →Hill Giant + Wall of Wood → attack with Gray Ogre + Hill Giant → (opponent: no blocks) → cast Leonardo, Sewer Samurai (sneak, returning Gray Ogre): exactly 9 damage (the most this board can deal).
RULES: Board from tmt-04-tenderize (TMT) plus Leonardo, Sewer Samurai (mythic, TMT) in hand. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Leonardo, Sewer Samurai: at most 5. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
  }),
  daily("2026-12-23", "fin", {
    tier: "easy",
    opp: { life: 4, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Samurai's Katana")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Golbez, Crystal Collector")] },
    explanation: "Cast Samurai's Katana → put Golbez, Crystal Collector's trigger on the stack first → attack with Golbez, Crystal Collector + Hero + Hill Giant.",
    notes: `
LETHAL: cast Samurai's Katana → put Golbez, Crystal Collector's trigger on the stack first → attack with Golbez, Crystal Collector + Hero + Hill Giant → (opponent: Grizzly Bears blocks Hill Giant): exactly 4 damage (the most this board can deal).
RULES: Board from fin-01-job-select (FIN) plus Golbez, Crystal Collector (rare, FIN) on the battlefield.
WRONG LINES: Without Golbez, Crystal Collector: at most 3. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
  }),
  daily("2026-12-24", "tmt", {
    tier: "medium",
    opp: { life: 14, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Leonardo, Big Brother"), c("The Last Ronin's Technique")], battlefield: [c("Hill Giant"), c("Grizzly Bears"), c("Gray Ogre"), c("Plains"), c("Plains"), c("Plains"), c("Leatherhead, Swamp Stalker")] },
    explanation: "Attack with Gray Ogre + Grizzly Bears + Hill Giant + Leatherhead, Swamp Stalker → cast The Last Ronin's Technique (sneak, returning Grizzly Bears) → cast Leonardo, Big Brother (sneak, returning Ninja Turtle Spirit).",
    notes: `
LETHAL: attack with Gray Ogre + Grizzly Bears + Hill Giant + Leatherhead, Swamp Stalker → (opponent: Krotiq Nestguard blocks Leatherhead, Swamp Stalker) → cast The Last Ronin's Technique (sneak, returning Grizzly Bears) → cast Leonardo, Big Brother (sneak, returning Ninja Turtle Spirit): exactly 14 damage (the most this board can deal).
RULES: Board from tmt-08-big-brother (TMT) plus Leatherhead, Swamp Stalker (rare, TMT) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Leatherhead, Swamp Stalker: at most 9. Any other order or target deals less than 14.
UNIQUENESS: Solver-checked: one plan reaches 14; 15 isn't reachable.`
  }),
  daily("2026-12-25", "tla", {
    tier: "hard",
    opp: { life: 8, battlefield: [c("Grizzly Bears")] },
    you: { hand: [c("Twin Blades")], battlefield: [c("Rough Rhino Cavalry"), c("Fire Sages"), c("Mountain"), c("Manifold Mouse")] },
    explanation: "Manifold Mouse → Manifold Mouse → Manifold Mouse gains which?: double strike → attack with Fire Sages + Manifold Mouse + Rough Rhino Cavalry → put Rough Rhino Cavalry's trigger on the stack first → cast Twin Blades → Twin Blades → Fire Sages.",
    notes: `
LETHAL: Manifold Mouse → Manifold Mouse → Manifold Mouse gains which?: double strike → attack with Fire Sages + Manifold Mouse + Rough Rhino Cavalry → put Rough Rhino Cavalry's trigger on the stack first → (opponent: Grizzly Bears blocks Rough Rhino Cavalry) → cast Twin Blades → Twin Blades → Fire Sages: exactly 8 damage (the most this board can deal).
RULES: Board from tla-07-twin-blades (TLA) plus Manifold Mouse (rare, BLB) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Manifold Mouse: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-12-26", "dft", {
    tier: "hard",
    opp: { life: 7, battlefield: [c("Jibbirik Omnivore")] },
    you: { hand: [c("Dynamite Diver"), c("The Last Ronin")], battlefield: [c("Clamorous Ironclad"), c("Mountain"), c("Swamp"), c("Forest"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
    explanation: "Cast Dynamite Diver → activate Clamorous Ironclad (Crew 3) (crewed by Dynamite Diver) → attack with Clamorous Ironclad → cast The Last Ronin → Dynamite Diver → opponent.",
    notes: `
LETHAL: cast Dynamite Diver → activate Clamorous Ironclad (Crew 3) (crewed by Dynamite Diver) → attack with Clamorous Ironclad → (opponent: no blocks) → cast The Last Ronin → Dynamite Diver → opponent: exactly 7 damage (the most this board can deal).
RULES: Board from dft-04-dynamite-diver (DFT) plus The Last Ronin (mythic, TMT) in hand. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without The Last Ronin: at most 6. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-12-27", "tmt", {
    tier: "medium",
    opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("The Last Ronin's Technique")], battlefield: [c("Raphael, Tough Turtle"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Raphael, the Nightwatcher")] },
    explanation: "Attack with Raphael, Tough Turtle + Raphael, the Nightwatcher → cast The Last Ronin's Technique (sneak, returning Raphael, Tough Turtle).",
    notes: `
LETHAL: attack with Raphael, Tough Turtle + Raphael, the Nightwatcher → (opponent: Krotiq Nestguard blocks Raphael, the Nightwatcher) → cast The Last Ronin's Technique (sneak, returning Raphael, Tough Turtle): exactly 6 damage (the most this board can deal).
RULES: Board from tmt-02-tough-turtle (TMT) plus Raphael, the Nightwatcher (rare, TMT) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Raphael, the Nightwatcher: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
  }),
  daily("2026-12-28", "fra", {
    tier: "easy",
    opp: { life: 7, battlefield: [] },
    you: { hand: [c("Keeper of the Quiet Hour")], battlefield: [c("Inspired Tethermage"), c("Forest"), c("Forest"), c("Forest"), c("Proctor of Potential")] },
    explanation: "Cast Keeper of the Quiet Hour → put Proctor of Potential's trigger on the stack first → attack with Inspired Tethermage + Proctor of Potential.",
    notes: `
LETHAL: cast Keeper of the Quiet Hour → put Proctor of Potential's trigger on the stack first → attack with Inspired Tethermage + Proctor of Potential → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: Board from fra-01-empower (FRA) plus Proctor of Potential (rare, FRA) on the battlefield.
WRONG LINES: Without Proctor of Potential: at most 4. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  }),
  daily("2026-12-29", "tla", {
    tier: "medium",
    opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Lightning Strike")], battlefield: [c("Fire Sages"), c("Hill Giant"), c("Mountain"), c("Yarus, Roar of the Old Gods")] },
    explanation: "Attack with Fire Sages + Hill Giant + Yarus, Roar of the Old Gods → cast Lightning Strike →opponent.",
    notes: `
LETHAL: attack with Fire Sages + Hill Giant + Yarus, Roar of the Old Gods → cast Lightning Strike →opponent → (opponent: Krotiq Nestguard blocks Yarus, Roar of the Old Gods): exactly 8 damage (the most this board can deal).
RULES: Board from tla-01-firebending (TLA) plus Yarus, Roar of the Old Gods (rare, MKM) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Yarus, Roar of the Old Gods: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
  }),
  daily("2026-12-30", "mom", {
    tier: "easy",
    opp: { life: 12, battlefield: [] },
    you: { hand: [c("Fearless Skald")], battlefield: [c("Bonded Herdbeast"), c("Mountain"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Baral and Kari Zev")] },
    explanation: "Cast Fearless Skald → Fearless Skald → Bonded Herdbeast → attack with Baral and Kari Zev + Bonded Herdbeast.",
    notes: `
LETHAL: cast Fearless Skald → Fearless Skald → Bonded Herdbeast → attack with Baral and Kari Zev + Bonded Herdbeast → (opponent: no blocks): exactly 12 damage (the most this board can deal).
RULES: Board from mom-01-backup-plan (MOM) plus Baral and Kari Zev (rare, MOM) on the battlefield.
WRONG LINES: Without Baral and Kari Zev: at most 10. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
  }),
  daily("2026-12-31", "tmt", {
    tier: "medium",
    opp: { life: 7, battlefield: [c("Krotiq Nestguard")] },
    you: { hand: [c("Karai's Technique")], battlefield: [c("Hill Giant"), c("Grizzly Bears"), c("Gray Ogre"), c("Plains"), c("Swamp"), c("Mutagen Man, Living Ooze")] },
    explanation: "Attack with Gray Ogre + Grizzly Bears + Hill Giant + Mutagen Man, Living Ooze → cast Karai's Technique (sneak, returning Grizzly Bears) (Target creature gets +3/+3) →Gray Ogre.",
    notes: `
LETHAL: attack with Gray Ogre + Grizzly Bears + Hill Giant + Mutagen Man, Living Ooze → (opponent: Krotiq Nestguard blocks Hill Giant) → cast Karai's Technique (sneak, returning Grizzly Bears) (Target creature gets +3/+3) →Gray Ogre: exactly 7 damage (the most this board can deal).
RULES: Board from tmt-05-karai (TMT) plus Mutagen Man, Living Ooze (rare, TMT) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Mutagen Man, Living Ooze: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
  })
  );
})();
