/* Puzzle bank.
 *
 * Every puzzle is played by the rules engine (engine.js), which follows the Magic rules: the
 * player wins the moment the opponent is at 0 or less, by any legal line. The turn starts in
 * precombat main and runs through every combat step with priority (instants and Treasure mana
 * at instant speed). The opponent has no responses and blocks in whatever way is worst for
 * the player, so a solution must beat every block. Reaching the end step with the opponent
 * alive fails.
 *
 * Cards come from the CARDS catalog below, so a card's rules are written once. Only the
 * fields the engine knows about matter for play; `text` is just the fallback card face.
 *   type, cost ("{1}{R}", hybrid "{R/G}" and Phyrexian "{R/P}" work), pt ("2/2"), colors (optional,
 *   read from the cost otherwise), kw (keywords: flying, reach, trample, menace, haste, vigilance,
 *   deathtouch, first strike, double strike, defender, lifelink, prowess, unblockable, can't block,
 *   can't attack, flash, indestructible, hexproof, shroud, "ward 2", "protection from red" /
 *   creatures / everything, intimidate, fear, shadow, horsemanship, skulk, islandwalk etc.,
 *   exalted, battle cry, wither, infect), targets ("any" | "creature" | "player" | "opponent-creature"),
 *   produces ("G": taps for mana; creatures not while summoning sick),
 *   abilities: [{ cost: "{R}", tap, sacSelf, targets, effect, text }] (activated abilities),
 *   effect (spells) / etb (creatures entering): { damage: n | "sacrificed", to: "opp" (no target),
 *   destroy, exile, bounce, tap, untap, counters: { "+1/+1": n }, pump: [p, t], grant: [keywords],
 *   steal, draw: n, lifeLoss: n, gainLife: n, create: card, self (affects the card itself),
 *   team: { pump, grant } },
 *   sacrifice: "creature" (additional cost), onAttack: { create: card } or { effect },
 *   onDeath: { effect, targets, filter, count } ("when this dies"), onTreasureSac: { pump },
 *   targetFilter: { controller, colors, notColors, kw, noKw, tapped, attacking, blocking,
 *   attackingOrBlocking, maxPower, minPower, artifact, nonArtifact }, targetCount: { min, max },
 *   modes: [{ text, effect, targets, targetFilter, targetCount }] ("Choose one —"), chooseColor
 *   (effects say "{color}"), cost with {X} (effects say "X"),
 *   aura: { targets, filter, static: { pump, grant } }, equip: { cost, static }, returnsToHand,
 *   static: { team: { pump, grant }, filter, other } (anthems).
 * Each side may list a library (known cards, top first) above its unknown libraryCount.
 *   atEndStep: "sacrifice" ("at the beginning of the end step, sacrifice it").
 * Board cards can add: tapped, sick (entered this turn, no haste), counters ({ "+1/+1": n } or
 *   { "-1/-1": n }), id (otherwise made from the name).
 * Your life is only shown (and tracked) if the puzzle sets you.life; otherwise it's irrelevant.
 *
 * Every puzzle carries `notes` (never shown to players): lethal math, rules relied on,
 * tempting wrong lines, and the uniqueness check (tools/solver.html lists every winning line).
 */
(() => {
  "use strict";

  const land = (t) => ({ type: "Basic Land — " + t, text: "" });
  const CARDS = {
    "Plains": land("Plains"), "Island": land("Island"), "Swamp": land("Swamp"),
    "Mountain": land("Mountain"), "Forest": land("Forest"),

    // ---- creatures ----
    "Grizzly Bears": { type: "Creature — Bear", cost: "{1}{G}", pt: "2/2", text: "" },
    "Craw Wurm": { type: "Creature — Wurm", cost: "{4}{G}{G}", pt: "6/4", text: "" },
    "Hill Giant": { type: "Creature — Giant", cost: "{3}{R}", pt: "3/3", text: "" },
    "Gray Ogre": { type: "Creature — Ogre", cost: "{2}{R}", pt: "2/2", text: "" },
    "Raging Goblin": { type: "Creature — Goblin Berserker", cost: "{R}", pt: "1/1", kw: ["haste"], text: "Haste" },
    "Serra Angel": { type: "Creature — Angel", cost: "{3}{W}{W}", pt: "4/4", kw: ["flying", "vigilance"], text: "Flying, vigilance" },
    "Air Elemental": { type: "Creature — Elemental", cost: "{3}{U}{U}", pt: "4/4", kw: ["flying"], text: "Flying" },
    "Wind Drake": { type: "Creature — Drake", cost: "{2}{U}", pt: "2/2", kw: ["flying"], text: "Flying" },
    "Storm Crow": { type: "Creature — Bird", cost: "{1}{U}", pt: "1/2", kw: ["flying"], text: "Flying" },
    "Giant Spider": { type: "Creature — Spider", cost: "{3}{G}", pt: "2/4", kw: ["reach"], text: "Reach" },
    "Savannah Lions": { type: "Creature — Cat", cost: "{W}", pt: "2/1", text: "" },
    "Silvercoat Lion": { type: "Creature — Cat", cost: "{1}{W}", pt: "2/2", text: "" },
    "Elite Vanguard": { type: "Creature — Human Soldier", cost: "{W}", pt: "2/1", text: "" },
    "Glory Seeker": { type: "Creature — Human Soldier", cost: "{1}{W}", pt: "2/2", text: "" },
    "Pillarfield Ox": { type: "Creature — Ox", cost: "{3}{W}", pt: "2/4", text: "" },
    "Siege Mastodon": { type: "Creature — Elephant", cost: "{4}{W}", pt: "3/5", text: "" },
    "Youthful Knight": { type: "Creature — Human Knight", cost: "{1}{W}", pt: "2/1", kw: ["first strike"], text: "First strike" },
    "Fencing Ace": { type: "Creature — Human Soldier", cost: "{1}{W}", pt: "1/1", kw: ["double strike"], text: "Double strike" },
    "Colossal Dreadmaw": { type: "Creature — Dinosaur", cost: "{4}{G}{G}", pt: "6/6", kw: ["trample"], text: "Trample" },
    "Centaur Courser": { type: "Creature — Centaur Warrior", cost: "{2}{G}", pt: "3/3", text: "" },
    "Trained Armodon": { type: "Creature — Elephant", cost: "{1}{G}{G}", pt: "3/3", text: "" },
    "Elvish Warrior": { type: "Creature — Elf Warrior", cost: "{G}{G}", pt: "2/3", text: "" },
    "Spined Wurm": { type: "Creature — Wurm", cost: "{4}{G}", pt: "5/4", text: "" },
    "Enormous Baloth": { type: "Creature — Beast", cost: "{6}{G}", pt: "7/7", text: "" },
    "Wall of Wood": { type: "Creature — Wall", cost: "{G}", pt: "0/3", kw: ["defender"], text: "Defender" },
    "Wall of Stone": { type: "Creature — Wall", cost: "{1}{R}{R}", pt: "0/8", kw: ["defender"], text: "Defender" },
    "Kraken Hatchling": { type: "Creature — Kraken", cost: "{U}", pt: "0/4", text: "" },
    "Ornithopter": { type: "Artifact Creature — Thopter", cost: "{0}", pt: "0/2", kw: ["flying"], text: "Flying" },
    "Phantom Warrior": { type: "Creature — Illusion Warrior", cost: "{1}{U}{U}", pt: "2/2", kw: ["unblockable"], text: "Phantom Warrior can't be blocked." },
    "Typhoid Rats": { type: "Creature — Rat", cost: "{B}", pt: "1/1", kw: ["deathtouch"], text: "Deathtouch" },
    "Walking Corpse": { type: "Creature — Zombie", cost: "{1}{B}", pt: "2/2", text: "" },
    "Child of Night": { type: "Creature — Vampire", cost: "{1}{B}", pt: "2/1", kw: ["lifelink"], text: "Lifelink" },
    "Vampire Nighthawk": { type: "Creature — Vampire Shaman", cost: "{1}{B}{B}", pt: "2/3", kw: ["flying", "deathtouch", "lifelink"], text: "Flying, deathtouch, lifelink" },
    "Boggart Brute": { type: "Creature — Goblin Warrior", cost: "{2}{R}", pt: "3/2", kw: ["menace"], text: "Menace" },
    "Monastery Swiftspear": { type: "Creature — Human Monk", cost: "{R}", pt: "1/2", kw: ["haste", "prowess"], text: "Haste. Prowess" },
    "Ball Lightning": { type: "Creature — Elemental", cost: "{R}{R}{R}", pt: "6/1", kw: ["trample", "haste"], atEndStep: "sacrifice",
      text: "Trample, haste. At the beginning of the end step, sacrifice Ball Lightning." },
    "Charging Monstrosaur": { type: "Creature — Dinosaur", cost: "{4}{R}", pt: "5/5", kw: ["trample", "haste"], text: "Trample, haste" },
    "Viashino Pyromancer": { type: "Creature — Viashino Wizard", cost: "{1}{R}", pt: "2/1", targets: "player", etb: { damage: 2 },
      text: "When Viashino Pyromancer enters the battlefield, it deals 2 damage to target player or planeswalker." },
    "Flametongue Kavu": { type: "Creature — Kavu", cost: "{3}{R}", pt: "4/2", targets: "creature", etb: { damage: 4 },
      text: "When Flametongue Kavu enters the battlefield, it deals 4 damage to target creature." },
    "Captain Lannery Storm": { type: "Legendary Creature — Human Pirate", cost: "{2}{R}", pt: "2/2", kw: ["haste"],
      onAttack: { create: { name: "Treasure", type: "Token Artifact — Treasure", text: "{T}, Sacrifice this artifact: Add one mana of any color." } },
      onTreasureSac: { pump: [1, 0] },
      text: "Haste. Whenever Captain Lannery Storm attacks, create a Treasure token. Whenever you sacrifice a Treasure, Captain Lannery Storm gets +1/+0 until end of turn." },

    // ---- creatures with abilities and keywords (mechanics) ----
    "Llanowar Elves": { type: "Creature — Elf Druid", cost: "{G}", pt: "1/1", produces: "G", text: "{T}: Add {G}." },
    "Shivan Dragon": { type: "Creature — Dragon", cost: "{4}{R}{R}", pt: "5/5", kw: ["flying"],
      abilities: [{ cost: "{R}", effect: { pump: [1, 0], self: true }, text: "{R}: +1/+0" }],
      text: "Flying. {R}: Shivan Dragon gets +1/+0 until end of turn." },
    "Prodigal Pyromancer": { type: "Creature — Human Wizard", cost: "{2}{R}", pt: "1/1",
      abilities: [{ tap: true, targets: "any", effect: { damage: 1 }, text: "{T}: 1 damage" }],
      text: "{T}: Prodigal Pyromancer deals 1 damage to any target." },
    "Mogg Fanatic": { type: "Creature — Goblin", cost: "{R}", pt: "1/1",
      abilities: [{ sacSelf: true, targets: "any", effect: { damage: 1 }, text: "Sacrifice: 1 damage" }],
      text: "Sacrifice Mogg Fanatic: It deals 1 damage to any target." },
    "Darksteel Myr": { type: "Artifact Creature — Myr", cost: "{3}", pt: "0/1", kw: ["indestructible"], text: "Indestructible" },
    "Akrasan Squire": { type: "Creature — Human Soldier", cost: "{W}", pt: "1/1", kw: ["exalted"], text: "Exalted" },
    "Gladecover Scout": { type: "Creature — Elf Scout", cost: "{G}", pt: "1/1", kw: ["hexproof"], text: "Hexproof" },
    "Ambush Viper": { type: "Creature — Snake", cost: "{1}{G}", pt: "2/1", kw: ["flash", "deathtouch"], text: "Flash. Deathtouch" },
    "Bladetusk Boar": { type: "Creature — Boar", cost: "{3}{R}", pt: "3/2", kw: ["intimidate"], text: "Intimidate" },
    "Severed Legion": { type: "Creature — Zombie", cost: "{1}{B}{B}", pt: "2/2", kw: ["fear"], text: "Fear" },
    "Glistener Elf": { type: "Creature — Phyrexian Elf Warrior", cost: "{G}", pt: "1/1", kw: ["infect"], text: "Infect" },
    "White Knight": { type: "Creature — Human Knight", cost: "{W}{W}", pt: "2/2", kw: ["first strike", "protection from black"],
      text: "First strike, protection from black" },
    "Black Knight": { type: "Creature — Human Knight", cost: "{B}{B}", pt: "2/2", kw: ["first strike", "protection from white"],
      text: "First strike, protection from white" },
    "Soltari Foot Soldier": { type: "Creature — Soltari Soldier", cost: "{W}", pt: "1/1", kw: ["shadow"], text: "Shadow" },
    "Accorder Paladin": { type: "Creature — Human Knight", cost: "{1}{W}", pt: "3/1", kw: ["battle cry"], text: "Battle cry" },

    // ---- spells ----
    "Lightning Bolt": { type: "Instant", cost: "{R}", targets: "any", effect: { damage: 3 }, text: "Lightning Bolt deals 3 damage to any target." },
    "Shock": { type: "Instant", cost: "{R}", targets: "any", effect: { damage: 2 }, text: "Shock deals 2 damage to any target." },
    "Lightning Strike": { type: "Instant", cost: "{1}{R}", targets: "any", effect: { damage: 3 }, text: "Lightning Strike deals 3 damage to any target." },
    "Lava Spike": { type: "Sorcery — Arcane", cost: "{R}", targets: "player", effect: { damage: 3 }, text: "Lava Spike deals 3 damage to target player or planeswalker." },
    "Lava Axe": { type: "Sorcery", cost: "{4}{R}", targets: "player", effect: { damage: 5 }, text: "Lava Axe deals 5 damage to target player or planeswalker." },
    "Murder": { type: "Instant", cost: "{1}{B}{B}", targets: "creature", effect: { destroy: true }, text: "Destroy target creature." },
    "Disfigure": { type: "Instant", cost: "{B}", targets: "creature", effect: { pump: [-2, -2] }, text: "Target creature gets -2/-2 until end of turn." },
    "Grasp of Darkness": { type: "Instant", cost: "{B}{B}", targets: "creature", effect: { pump: [-4, -4] }, text: "Target creature gets -4/-4 until end of turn." },
    "Giant Growth": { type: "Instant", cost: "{G}", targets: "creature", effect: { pump: [3, 3] }, text: "Target creature gets +3/+3 until end of turn." },
    "Titanic Growth": { type: "Instant", cost: "{1}{G}", targets: "creature", effect: { pump: [4, 4] }, text: "Target creature gets +4/+4 until end of turn." },
    "Battlegrowth": { type: "Instant", cost: "{G}", targets: "creature", effect: { counters: { "+1/+1": 1 } },
      text: "Put a +1/+1 counter on target creature." },
    "Brute Force": { type: "Instant", cost: "{R}", targets: "creature", effect: { pump: [3, 3] }, text: "Target creature gets +3/+3 until end of turn." },
    "Mighty Leap": { type: "Instant", cost: "{1}{W}", targets: "creature", effect: { pump: [2, 2], grant: ["flying"] },
      text: "Target creature gets +2/+2 and gains flying until end of turn." },
    "Kindled Fury": { type: "Instant", cost: "{R}", targets: "creature", effect: { pump: [1, 0], grant: ["first strike"] },
      text: "Target creature gets +1/+0 and gains first strike until end of turn." },
    "Assault Strobe": { type: "Sorcery", cost: "{R}", targets: "creature", effect: { grant: ["double strike"] },
      text: "Target creature gains double strike until end of turn." },
    "Unsummon": { type: "Instant", cost: "{U}", targets: "creature", effect: { bounce: true }, text: "Return target creature to its owner's hand." },
    "Act of Treason": { type: "Sorcery", cost: "{2}{R}", targets: "creature", effect: { steal: true },
      text: "Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn." },
    "Fling": { type: "Instant", cost: "{1}{R}", targets: "any", sacrifice: "creature", effect: { damage: "sacrificed" },
      text: "As an additional cost to cast this spell, sacrifice a creature. Fling deals damage equal to the sacrificed creature's power to any target." },
    "Overrun": { type: "Sorcery", cost: "{2}{G}{G}{G}", effect: { team: { pump: [3, 3], grant: ["trample"] } },
      text: "Creatures you control get +3/+3 and gain trample until end of turn." },
    "Inspired Charge": { type: "Instant", cost: "{2}{W}{W}", effect: { team: { pump: [2, 1] } },
      text: "Creatures you control get +2/+1 until end of turn." },

    // ---- cards for the newer rules (Oracle text from Scryfall) ----
    "Forked Bolt": { type: "Sorcery", cost: "{R}", targets: "any", targetCount: { min: 1, max: 2 }, divided: 2, effect: { divided: true },
      text: "Forked Bolt deals 2 damage divided as you choose among one or two targets." },
    "Fireball": { type: "Sorcery", cost: "{X}{R}", targets: "any", targetCount: { min: 1, max: 5 }, extraCostPerTarget: 1, effect: { evenly: true, damage: "X" },
      text: "This spell costs {1} more to cast for each target beyond the first. Fireball deals X damage divided evenly, rounded down, among any number of targets." },
    "Pyroclasm": { type: "Sorcery", cost: "{1}{R}", effect: { damageAll: { n: 2, creatures: "all" } }, text: "Pyroclasm deals 2 damage to each creature." },
    "Kolaghan's Command": { type: "Instant", cost: "{1}{B}{R}", chooseCount: 2, modes: [
      { text: "Return target creature card from your graveyard to your hand", targets: "graveyard-creature", effect: { regrow: true } },
      // (only the opponent here: making yourself discard never helps in these puzzles)
      { text: "Target player discards a card", targets: "opponent", effect: { discard: 1 } },
      { text: "Destroy target artifact", targets: "artifact", effect: { destroy: true } },
      { text: "Kolaghan's Command deals 2 damage to any target", targets: "any", effect: { damage: 2 } }],
      text: "Choose two — • Return target creature card from your graveyard to your hand. • Target player discards a card. • Destroy target artifact. • Kolaghan's Command deals 2 damage to any target." },
    "Prey Upon": { type: "Sorcery", cost: "{G}", effect: { fight: true },
      slots: [{ targets: "creature", filter: { controller: "you" } }, { targets: "creature", filter: { controller: "opponent" } }],
      text: "Target creature you control fights target creature you don't control." },
    "Opt": { type: "Instant", cost: "{U}", effect: { scry: 1, draw: 1 }, text: "Scry 1. Draw a card." },
    "Rancor": { type: "Enchantment — Aura", cost: "{G}", returnsToHand: true, aura: { targets: "creature", static: { pump: [2, 0], grant: ["trample"] } },
      text: "Enchant creature. Enchanted creature gets +2/+0 and has trample. When this Aura is put into a graveyard from the battlefield, return it to its owner's hand." },
    "Perilous Myr": { type: "Artifact Creature — Phyrexian Myr", cost: "{2}", pt: "1/1", onDeath: { targets: "any", effect: { damage: 2 } },
      text: "When this creature dies, it deals 2 damage to any target." },
    "Kazandu Mammoth": { type: "Creature — Elephant", cost: "{1}{G}{G}", pt: "3/3", landfall: { pump: [2, 2], self: true }, layout: "modal_dfc",
      faces: [{ name: "Kazandu Mammoth", type: "Creature — Elephant", cost: "{1}{G}{G}", pt: "3/3", landfall: { pump: [2, 2], self: true } },
        { name: "Kazandu Valley", type: "Land", produces: "G", entersTapped: true }],
      text: "Landfall — Whenever a land you control enters, this creature gets +2/+2 until end of turn. // Kazandu Valley: This land enters tapped. {T}: Add {G}." },

    "Sear": { type: "Instant", cost: "{1}{R}", targets: "creature-or-planeswalker", effect: { damage: 4 },
      text: "Sear deals 4 damage to target creature or planeswalker." },
    // (its −8 isn't here: it needs a library search, and from 3 loyalty it can't be reached in one turn)
    "Ajani, Outland Chaperone": { type: "Legendary Planeswalker — Ajani", cost: "{1}{W}{W}", loyalty: 3, abilities: [
      { loyalty: 1, effect: { create: { name: "Kithkin", type: "Token Creature — Kithkin", pt: "1/1", colors: ["G", "W"] } }, text: "+1: Create a 1/1 green and white Kithkin creature token." },
      { loyalty: -2, targets: "creature", filter: { tapped: true }, effect: { damage: 4 }, text: "−2: Ajani deals 4 damage to target tapped creature." }],
      text: "+1: Create a 1/1 green and white Kithkin creature token. −2: Ajani deals 4 damage to target tapped creature. −8: Look at the top X cards of your library, where X is your life total. You may put any number of nonland permanent cards with mana value 3 or less from among them onto the battlefield. Then shuffle." },
    "Firebolt": { type: "Sorcery", cost: "{R}", targets: "any", effect: { damage: 2 }, flashback: { cost: "{4}{R}" },
      text: "Firebolt deals 2 damage to any target. Flashback {4}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" },
    "Sol Ring": { type: "Artifact", cost: "{1}", produces: "C", manaAmount: 2, text: "{T}: Add {C}{C}." },
    "Utopia Sprawl": { type: "Enchantment — Aura", cost: "{G}", chooseColor: true, extraMana: true,
      aura: { targets: "land", filter: { subtype: "Forest" } },
      text: "Enchant Forest. As this Aura enters, choose a color. Whenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color." },

    // ---- Lorwyn Eclipsed (ECL) ----
    "Omni-Changeling": { type: "Creature — Shapeshifter", cost: "{3}{U}{U}", pt: "0/0", kw: ["changeling", "convoke"],
      entersAsCopy: { except: { kw: ["changeling"] } },
      text: "Changeling. Convoke. You may have this creature enter as a copy of any creature on the battlefield, except it has changeling." },
    "Kindle the Inner Flame": { type: "Kindred Sorcery — Elemental", cost: "{3}{R}", targets: "creature", targetFilter: { controller: "you" },
      effect: { createCopy: { except: { kw: ["haste"], atEndStep: "sacrifice" } } },
      flashback: { cost: "{1}{R}", behold: { type: "Elemental", count: 3 } },
      text: "Create a token that's a copy of target creature you control, except it has haste and \"At the beginning of the end step, sacrifice this token.\" Flashback—{1}{R}, Behold three Elementals." },
    "Spinerock Tyrant": { type: "Creature — Dragon", cost: "{3}{R}{R}", pt: "6/6", kw: ["flying", "wither"],
      triggers: [{ on: "cast", filter: { controller: "you", instantOrSorcery: true, singleTarget: true }, effect: { copyEventSpell: { gain: ["wither"] } } }],
      text: "Flying. Wither. Whenever you cast an instant or sorcery spell with a single target, you may copy it. If you do, those spells gain wither. You may choose new targets for the copy." },
    "Shimmerwilds Growth": { type: "Enchantment — Aura", cost: "{1}{G}", chooseColor: true, extraMana: true,
      aura: { targets: "land", setsColor: true },
      text: "Enchant land. As this Aura enters, choose a color. Enchanted land is the chosen color. Whenever enchanted land is tapped for mana, its controller adds an additional one mana of the chosen color." },
    "Cinder Strike": { type: "Sorcery", cost: "{R}", targets: "creature", blight: { n: 1, optional: true }, effect: { damage: 2 }, ifBlighted: { effect: { damage: 4 } },
      text: "As an additional cost to cast this spell, you may blight 1. Cinder Strike deals 2 damage to target creature. It deals 4 damage to that creature instead if this spell's additional cost was paid." },
    "Appeal to Eirdu": { type: "Instant", cost: "{3}{W}", kw: ["convoke"], targets: "creature", targetCount: { min: 1, max: 2 }, effect: { pump: [2, 1] },
      text: "Convoke. One or two target creatures each get +2/+1 until end of turn." },
    "Squawkroaster": { type: "Creature — Elemental", cost: "{3}{R}", pt: "*/4", kw: ["double strike"], vividPower: true,
      text: "Double strike. Vivid — Squawkroaster's power is equal to the number of colors among permanents you control." },
    "Feisty Spikeling": { type: "Creature — Shapeshifter", cost: "{1}{R/W}", pt: "2/1", kw: ["changeling", "first strike"],
      text: "Changeling (This card is every creature type.) During your turn, this creature has first strike." },
    "Mischievous Sneakling": { type: "Creature — Shapeshifter", cost: "{1}{U/B}", pt: "2/2", kw: ["changeling", "flash"],
      text: "Changeling (This card is every creature type.) Flash" },
    "Gangly Stompling": { type: "Creature — Shapeshifter", cost: "{2}{R/G}", pt: "4/2", kw: ["changeling", "trample"],
      text: "Changeling (This card is every creature type.) Trample" },
    "Boneclub Berserker": { type: "Creature — Goblin Berserker", cost: "{3}{R}", pt: "2/4", perOther: { type: "Goblin", pump: [2, 0] },
      text: "This creature gets +2/+0 for each other Goblin you control." },
    "Mudbutton Cursetosser": { type: "Creature — Goblin Warlock", cost: "{B}", pt: "2/1", kw: ["can't block"], behold: { type: "Goblin", orPay: "{2}" },
      onDeath: { targets: "creature", filter: { controller: "opponent", maxPower: 2 }, effect: { destroy: true } },
      text: "As an additional cost to cast this spell, behold a Goblin or pay {2}. This creature can't block. When this creature dies, destroy target creature an opponent controls with power 2 or less." },

    // ---- Phyrexia: All Will Be One (ONE): toxic, corrupted, proliferate, oil counters, For Mirrodin!, crew, affinity ----
    "Branchblight Stalker": { type: "Creature — Phyrexian Elf Scout", cost: "{1}{G}", pt: "3/1", kw: ["toxic 2"], text: "Toxic 2" },
    "Tyrranax Atrocity": { type: "Creature — Phyrexian Dinosaur", cost: "{3}{G}{G}", pt: "4/4", kw: ["haste", "toxic 3"], text: "Haste. Toxic 3" },
    "Pestilent Syphoner": { type: "Creature — Phyrexian Insect", cost: "{1}{B}", pt: "1/1", kw: ["flying", "toxic 1"], text: "Flying. Toxic 1" },
    "Jawbone Duelist": { type: "Creature — Phyrexian Soldier", cost: "{1}{W}", pt: "1/1", kw: ["double strike", "toxic 1"], text: "Double strike. Toxic 1" },
    "Apostle of Invasion": { type: "Creature — Phyrexian Angel", cost: "{4}{W}{W}", pt: "4/4", kw: ["flying"],
      conditional: [{ if: { corrupted: true }, grant: ["double strike"] }],
      text: "Flying. Corrupted — As long as an opponent has three or more poison counters, this creature has double strike." },
    "Bonepicker Skirge": { type: "Creature — Phyrexian Imp", cost: "{2}{B}", pt: "2/2", kw: ["flying"],
      conditional: [{ if: { corrupted: true }, grant: ["deathtouch", "lifelink"] }],
      text: "Flying. Corrupted — As long as an opponent has three or more poison counters, this creature has deathtouch and lifelink." },
    "Incisor Glider": { type: "Artifact Creature — Phyrexian Construct", cost: "{1}{W}", pt: "1/3", kw: ["flying"],
      triggers: [{ on: "attacks", self: true, if: { corrupted: true }, effect: { team: { pump: [1, 1] } } }],
      text: "Flying. Corrupted — Whenever this creature attacks, if an opponent has three or more poison counters, creatures you control get +1/+1 until end of turn." },
    "Zealot's Conviction": { type: "Enchantment — Aura", cost: "{W}", kw: ["flash"], aura: { targets: "creature", static: { pump: [1, 1] } },
      conditional: [{ if: { corrupted: true }, pump: [1, 0], grant: ["first strike"] }],
      text: "Flash. Enchant creature. Enchanted creature gets +1/+1. Corrupted — As long as an opponent has three or more poison counters, enchanted creature gets an additional +1/+0 and has first strike." },
    "Prologue to Phyresis": { type: "Instant", cost: "{1}{U}", effect: { poison: 1, to: "opp", draw: 1 },
      text: "Each opponent gets a poison counter. Draw a card." },
    "Whisper of the Dross": { type: "Instant", cost: "{B}", targets: "creature", effect: { pump: [-1, -1], proliferate: true },
      text: "Target creature gets -1/-1 until end of turn. Proliferate." },
    "Drown in Ichor": { type: "Sorcery", cost: "{1}{B}", targets: "creature", effect: { pump: [-4, -4], proliferate: true },
      text: "Target creature gets -4/-4 until end of turn. Proliferate." },
    "Volt Charge": { type: "Instant", cost: "{2}{R}", targets: "any", effect: { damage: 3, proliferate: true },
      text: "Volt Charge deals 3 damage to any target. Proliferate." },
    "Scheming Aspirant": { type: "Creature — Phyrexian Advisor", cost: "{1}{B}", pt: "1/3",
      triggers: [{ on: "proliferate", filter: { controller: "you" }, effect: { lifeLoss: 2, to: "opp", gainLife: 2 } }],
      text: "Whenever you proliferate, each opponent loses 2 life and you gain 2 life." },
    "Thrummingbird": { type: "Creature — Phyrexian Bird Horror", cost: "{1}{U}", pt: "1/1", kw: ["flying"],
      triggers: [{ on: "combatDamage", self: true, effect: { proliferate: true } }],
      text: "Flying. Whenever this creature deals combat damage to a player, proliferate." },
    "Blightbelly Rat": { type: "Creature — Phyrexian Rat", cost: "{1}{B}", pt: "2/2", kw: ["toxic 1"], onDeath: { effect: { proliferate: true } },
      text: "Toxic 1. When this creature dies, proliferate." },
    "Copper Longlegs": { type: "Creature — Phyrexian Spider", cost: "{1}{G}", pt: "1/3", kw: ["reach"],
      abilities: [{ cost: "{1}{G}", sacSelf: true, effect: { proliferate: true }, text: "{1}{G}, Sacrifice this creature: Proliferate" }],
      text: "Reach. {1}{G}, Sacrifice this creature: Proliferate." },
    "Ribskiff": { type: "Artifact — Vehicle", cost: "{4}", pt: "4/4", kw: ["toxic 2", "crew 3"], etb: { draw: 1 },
      text: "Toxic 2. When this Vehicle enters, draw a card. Crew 3" },
    "Meldweb Strider": { type: "Artifact — Vehicle", cost: "{4}{U}", pt: "5/5", kw: ["vigilance", "crew 3"], entersWithCounters: { oil: 1 },
      abilities: [{ removeCounters: { kind: "oil" }, effect: { becomeCreature: true, self: true }, text: "Remove an oil counter: it becomes an artifact creature" }],
      text: "Vigilance. This Vehicle enters with an oil counter on it. Remove an oil counter from this Vehicle: It becomes an artifact creature until end of turn. Crew 3" },
    "Chrome Prowler": { type: "Artifact Creature — Phyrexian Cat", cost: "{2}{U}", pt: "3/2", kw: ["flash"], etb: { tap: true }, targets: "opponent-creature",
      text: "Flash. When this creature enters, tap target creature an opponent controls." },
    "Furnace Strider": { type: "Creature — Phyrexian Beast", cost: "{4}{R}", pt: "4/5", entersWithCounters: { oil: 2 },
      abilities: [{ removeCounters: { kind: "oil" }, targets: "creature", filter: { controller: "you" }, effect: { grant: ["haste"] },
        text: "Remove an oil counter: target creature you control gains haste" }],
      text: "This creature enters with two oil counters on it. Remove an oil counter from this creature: Target creature you control gains haste until end of turn." },
    "Barbed Batterfist": { type: "Artifact — Equipment", cost: "{1}{R}", kw: ["for mirrodin!"], equip: { cost: "{1}", static: { pump: [1, -1] } },
      text: "For Mirrodin! (When this Equipment enters, create a 2/2 red Rebel creature token, then attach this to it.) Equipped creature gets +1/-1. Equip {1}" },
    "Vulshok Splitter": { type: "Artifact — Equipment", cost: "{3}{R}", kw: ["for mirrodin!"], equip: { cost: "{2}{R}", static: { pump: [2, 0] } },
      text: "For Mirrodin! (When this Equipment enters, create a 2/2 red Rebel creature token, then attach this to it.) Equipped creature gets +2/+0. Equip {2}{R}" },
    "Hexgold Halberd": { type: "Artifact — Equipment", cost: "{1}{R}", kw: ["for mirrodin!"], equip: { cost: "{2}{R}", static: { grant: ["first strike", "trample"] } },
      text: "For Mirrodin! (When this Equipment enters, create a 2/2 red Rebel creature token, then attach this to it.) During your turn, equipped creature has first strike and trample. Equip {2}{R}" },
    "Free from Flesh": { type: "Instant", cost: "{R}", targets: "creature", effect: { pump: [2, 2], counters: { oil: 2 } },
      text: "Target creature gets +2/+2 until end of turn. Put two oil counters on it." },
    "Sawblade Scamp": { type: "Creature — Phyrexian Beast", cost: "{R}", pt: "1/1", kw: ["haste"],
      triggers: [{ on: "cast", filter: { noncreature: true, controller: "you" }, effect: { counters: { oil: 1 }, self: true } }],
      abilities: [{ tap: true, removeCounters: { kind: "oil" }, effect: { damage: 1, to: "opp" }, text: "{T}, Remove an oil counter: 1 damage to each opponent" }],
      text: "Haste. Whenever you cast a noncreature spell, put an oil counter on this creature. {T}, Remove an oil counter from this creature: It deals 1 damage to each opponent." },
    "Trawler Drake": { type: "Creature — Phyrexian Drake", cost: "{2}{U}", pt: "0/0", kw: ["flying"], entersWithCounters: { oil: 1 }, perCounter: { kind: "oil", pump: [1, 1] },
      triggers: [{ on: "cast", filter: { noncreature: true, controller: "you" }, effect: { counters: { oil: 1 }, self: true } }],
      text: "Flying. This creature enters with an oil counter on it. This creature gets +1/+1 for each oil counter on it. Whenever you cast a noncreature spell, put an oil counter on this creature." },
    "Ichor Synthesizer": { type: "Creature — Phyrexian Wizard", cost: "{1}{U}", pt: "1/3",
      triggers: [{ on: "cast", filter: { noncreature: true, controller: "you" }, effect: { counters: { oil: 1 }, self: true } }],
      conditional: [{ if: { selfCounters: { kind: "oil", min: 4 } }, pump: [2, 0], grant: ["unblockable"] }],
      text: "Whenever you cast a noncreature spell, put an oil counter on this creature. As long as this creature has four or more oil counters on it, it gets +2/+0 and can't be blocked." },
    "Gitaxian Raptor": { type: "Creature — Phyrexian Bird", cost: "{2}{U}", pt: "1/4", kw: ["flying"], entersWithCounters: { oil: 3 },
      abilities: [{ removeCounters: { kind: "oil" }, effect: { pump: [1, -1], self: true }, text: "Remove an oil counter: +1/-1" }],
      text: "Flying. This creature enters with three oil counters on it. Remove an oil counter from this creature: This creature gets +1/-1 until end of turn." },
    "Aspirant's Ascent": { type: "Instant", cost: "{U}", targets: "creature", effect: { pump: [1, 3], grant: ["flying", "toxic 1"] },
      text: "Until end of turn, target creature gets +1/+3 and gains flying and toxic 1." },
    "Plated Onslaught": { type: "Instant", cost: "{3}{W}{W}", kw: ["affinity for artifacts"], effect: { team: { pump: [2, 1] } },
      text: "Affinity for artifacts (This spell costs {1} less to cast for each artifact you control.) Creatures you control get +2/+1 until end of turn." },
    "Swooping Lookout": { type: "Artifact Creature — Phyrexian Construct", cost: "{W}", pt: "1/2", kw: ["flying", "vigilance"], text: "Flying, vigilance" },
    "Orthodoxy Enforcer": { type: "Creature — Phyrexian Cleric", cost: "{3}{W}", pt: "2/4", kw: ["vigilance"],
      conditional: [{ if: { controls: { filter: { artifact: true }, min: 2 } }, pump: [2, 0] }],
      text: "Vigilance. This creature gets +2/+0 as long as you control two or more artifacts." },
    "Mandible Justiciar": { type: "Artifact Creature — Phyrexian Cleric", cost: "{1}{W}", pt: "2/1", kw: ["lifelink"],
      triggers: [{ on: "enters", other: true, filter: { artifact: true, controller: "you" }, effect: { pump: [1, 1], self: true } }],
      text: "Lifelink. Whenever another artifact you control enters, this creature gets +1/+1 until end of turn." },
    "Veil of Assimilation": { type: "Artifact", cost: "{1}{W}",
      triggers: [{ on: "enters", filter: { artifact: true, controller: "you" }, targets: "creature", targetFilter: { controller: "you" }, effect: { pump: [1, 1], grant: ["vigilance"] } }],
      text: "Whenever this artifact or another artifact you control enters, target creature you control gets +1/+1 and gains vigilance until end of turn." },
    "Prosthetic Injector": { type: "Artifact — Equipment", cost: "{1}", equip: { cost: "{1}", static: { pump: [0, 2], grant: ["toxic 1"] } },
      text: "Equipped creature gets +0/+2 and has toxic 1. Equip {1}" },
    "Slaughter Singer": { type: "Creature — Phyrexian Cleric", cost: "{G}{W}", pt: "2/2", kw: ["toxic 2"],
      triggers: [{ on: "attacks", other: true, filter: { controller: "you", toxic: true }, effect: { pump: [1, 1], to: "eventObject" } }],
      text: "Toxic 2. Whenever another creature you control with toxic attacks, it gets +1/+1 until end of turn." },

    // ---- March of the Machine (MOM): battles, backup, incubate, transforming with Phyrexian mana, convoke ----
    // (an Incubator token already on the battlefield, from an earlier turn)
    "Incubator": { ...JSON.parse(JSON.stringify(window.Engine.INCUBATOR)), token: true },
    "Knight": { type: "Token Creature — Knight", pt: "2/2", colors: ["W", "U"], kw: ["vigilance"], token: true, text: "Vigilance" },
    "Elemental": { type: "Token Creature — Elemental", pt: "1/1", colors: ["U", "R"], token: true, text: "" },
    "Fearless Skald": { type: "Creature — Dwarf Berserker", cost: "{4}{R}", pt: "3/2", kw: ["double strike"], backup: { n: 1, grant: ["double strike"] },
      text: "Backup 1 (When this creature enters, put a +1/+1 counter on target creature. If that's another creature, it gains the following ability until end of turn.) Double strike" },
    "Serpent-Blade Assailant": { type: "Creature — Elf Warrior", cost: "{2}{G}", pt: "2/1", kw: ["deathtouch"], backup: { n: 1, grant: ["deathtouch"] },
      text: "Backup 1 (When this creature enters, put a +1/+1 counter on target creature. If that's another creature, it gains the following ability until end of turn.) Deathtouch" },
    "Saiba Cryptomancer": { type: "Creature — Moonfolk Ninja", cost: "{1}{U}", pt: "0/1", kw: ["flash", "hexproof"], backup: { n: 1, grant: ["hexproof"] },
      text: "Flash. Backup 1 (When this creature enters, put a +1/+1 counter on target creature. If that's another creature, it gains the following ability until end of turn.) Hexproof" },
    "Kithkin Billyrider": { type: "Creature — Kithkin Knight", cost: "{2}{W}", pt: "1/3", kw: ["double strike"], text: "Double strike" },
    "Alabaster Host Sanctifier": { type: "Creature — Phyrexian Cleric", cost: "{1}{W}", pt: "2/2", kw: ["lifelink"], text: "Lifelink" },
    "Iridescent Blademaster": { type: "Creature — Elf Warrior", cost: "{1}{G}", pt: "2/2",
      abilities: [{ cost: "{3}{G}", effect: { pump: [2, 2], self: true }, text: "{3}{G}: +2/+2" }], text: "{3}{G}: This creature gets +2/+2 until end of turn." },
    "Bonded Herdbeast": { type: "Creature — Beast", cost: "{4}{G}", pt: "4/5", layout: "transform",
      abilities: [{ cost: "{4}{R/P}", sorcery: true, effect: { transform: true, self: true }, text: "{4}{R/P}: Transform" }],
      text: "{4}{R/P}: Transform this creature. Activate only as a sorcery. ({R/P} can be paid with either {R} or 2 life.)",
      faces: [{ name: "Bonded Herdbeast", type: "Creature — Beast", cost: "{4}{G}", pt: "4/5",
        abilities: [{ cost: "{4}{R/P}", sorcery: true, effect: { transform: true, self: true }, text: "{4}{R/P}: Transform" }],
        text: "{4}{R/P}: Transform this creature. Activate only as a sorcery. ({R/P} can be paid with either {R} or 2 life.)" },
        { name: "Plated Kilnbeast", type: "Creature — Phyrexian Beast", pt: "7/5", colors: ["G", "R"], kw: ["menace"], text: "Menace" }] },
    "Tarkir Duneshaper": { type: "Creature — Dog Warrior", cost: "{W}", pt: "1/2", layout: "transform",
      abilities: [{ cost: "{4}{G/P}", sorcery: true, effect: { transform: true, self: true }, text: "{4}{G/P}: Transform" }],
      text: "{4}{G/P}: Transform this creature. Activate only as a sorcery. ({G/P} can be paid with either {G} or 2 life.)",
      faces: [{ name: "Tarkir Duneshaper", type: "Creature — Dog Warrior", cost: "{W}", pt: "1/2",
        abilities: [{ cost: "{4}{G/P}", sorcery: true, effect: { transform: true, self: true }, text: "{4}{G/P}: Transform" }],
        text: "{4}{G/P}: Transform this creature. Activate only as a sorcery. ({G/P} can be paid with either {G} or 2 life.)" },
        { name: "Burnished Dunestomper", type: "Creature — Phyrexian Dog Warrior", pt: "4/3", colors: ["G", "W"], kw: ["trample"], text: "Trample" }] },
    "War-Trained Slasher": { type: "Creature — Wolverine Dinosaur", cost: "{3}{R}", pt: "4/3", kw: ["menace"],
      triggers: [{ on: "attacks", self: true, filter: { attackingBattle: true }, effect: { doublePower: true, self: true } }],
      text: "Menace. Whenever this creature attacks a battle, double its power until end of turn." },
    "Thrashing Frontliner": { type: "Creature — Phyrexian Lizard", cost: "{1}{R}", pt: "2/2", kw: ["trample"],
      triggers: [{ on: "attacks", self: true, filter: { attackingBattle: true }, effect: { pump: [1, 1], self: true } }],
      text: "Trample. Whenever this creature attacks a battle, it gets +1/+1 until end of turn." },
    "Norn's Inquisitor": { type: "Creature — Phyrexian Knight", cost: "{1}{W}", pt: "1/1", etb: { incubate: 2 },
      triggers: [{ on: "transforms", filter: { controller: "you", type: "Phyrexian" }, effect: { counters: { "+1/+1": 1 }, to: "eventObject" } }],
      text: "When this creature enters, incubate 2. (Create an Incubator token with two +1/+1 counters on it and \"{2}: Transform this token.\" It transforms into a 0/0 Phyrexian artifact creature.) Whenever a permanent you control transforms into a Phyrexian, put a +1/+1 counter on it." },
    "Elvish Vatkeeper": { type: "Creature — Phyrexian Elf", cost: "{1}{B}{G}", pt: "3/3", etb: { incubate: 2 },
      abilities: [{ cost: "{5}", targets: "artifact", filter: { controller: "you", subtype: "Incubator" }, effect: { transform: true, doubleCounters: "+1/+1" },
        text: "{5}: Transform target Incubator, double its +1/+1 counters" }],
      text: "When this creature enters, incubate 2. {5}: Transform target Incubator token you control. Double the number of +1/+1 counters on it." },
    "Eyes of Gitaxias": { type: "Sorcery", cost: "{2}{U}", effect: { incubate: 3, draw: 1 },
      text: "Incubate 3. (Create an Incubator token with three +1/+1 counters on it and \"{2}: Transform this token.\" It transforms into a 0/0 Phyrexian artifact creature.) Draw a card." },
    "Converter Beast": { type: "Creature — Phyrexian Beast", cost: "{3}{G}", pt: "0/1", etb: { incubate: 5 },
      text: "When this creature enters, incubate 5. (Create an Incubator token with five +1/+1 counters on it and \"{2}: Transform this token.\" It transforms into a 0/0 Phyrexian artifact creature.)" },
    "Furnace Gremlin": { type: "Creature — Phyrexian Gremlin", cost: "{1}{R}", pt: "1/2",
      abilities: [{ cost: "{1}{R}", effect: { pump: [1, 0], self: true }, text: "{1}{R}: +1/+0" }], onDeath: { effect: { incubate: "power" } },
      text: "{1}{R}: This creature gets +1/+0 until end of turn. When this creature dies, incubate X, where X is its power." },
    "Invasion of Belenon": { type: "Battle — Siege", cost: "{2}{W}", defense: "5", layout: "transform",
      etb: { create: { name: "Knight", type: "Token Creature — Knight", pt: "2/2", colors: ["W", "U"], kw: ["vigilance"] } },
      text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.) When this Siege enters, create a 2/2 white and blue Knight creature token with vigilance.",
      faces: [{ name: "Invasion of Belenon", type: "Battle — Siege", cost: "{2}{W}", defense: "5",
        etb: { create: { name: "Knight", type: "Token Creature — Knight", pt: "2/2", colors: ["W", "U"], kw: ["vigilance"] } },
        text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.) When this Siege enters, create a 2/2 white and blue Knight creature token with vigilance." },
        { name: "Belenon War Anthem", type: "Enchantment", colors: ["W"], static: { team: { pump: [1, 1] } }, text: "Creatures you control get +1/+1." }] },
    "Invasion of Kylem": { type: "Battle — Siege", cost: "{2}{R}{W}", defense: "5", layout: "transform",
      etb: { pump: [2, 0], grant: ["vigilance", "haste"] }, targets: "creature", targetCount: { min: 0, max: 2 },
      text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.) When this Siege enters, up to two target creatures each get +2/+0 and gain vigilance and haste until end of turn.",
      faces: [{ name: "Invasion of Kylem", type: "Battle — Siege", cost: "{2}{R}{W}", defense: "5",
        etb: { pump: [2, 0], grant: ["vigilance", "haste"] }, targets: "creature", targetCount: { min: 0, max: 2 },
        text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.) When this Siege enters, up to two target creatures each get +2/+0 and gain vigilance and haste until end of turn." },
        { name: "Valor's Reach Tag Team", type: "Sorcery", colors: ["R", "W"],
          effect: { create: { name: "Warrior", type: "Token Creature — Warrior", pt: "3/2", colors: ["R", "W"], count: 2,
            text: "Whenever this token and at least one other creature token attack, put a +1/+1 counter on this token." } },
          text: "Create two 3/2 red and white Warrior creature tokens with \"Whenever this token and at least one other creature token attack, put a +1/+1 counter on this token.\"" }] },
    "Ral's Reinforcements": { type: "Sorcery", cost: "{1}{R}", effect: { create: { name: "Elemental", type: "Token Creature — Elemental", pt: "1/1", colors: ["U", "R"], count: 2 } },
      text: "Create two 1/1 blue and red Elemental creature tokens." },
    "Stoke the Flames": { type: "Instant", cost: "{2}{R}{R}", kw: ["convoke"], targets: "any", effect: { damage: 4 },
      text: "Convoke. Stoke the Flames deals 4 damage to any target." },
    "Burning Sun's Fury": { type: "Instant", cost: "{1}{R}", kw: ["convoke"], targets: "creature", targetCount: { min: 0, max: 2 }, effect: { pump: [2, 0], grant: ["haste"] },
      text: "Convoke. Up to two target creatures each get +2/+0 and gain haste until end of turn." },
    "Inspired Charge": { type: "Instant", cost: "{2}{W}{W}", effect: { team: { pump: [2, 1] } }, text: "Creatures you control get +2/+1 until end of turn." },
    "Joyful Stormsculptor": { type: "Creature — Human Shaman", cost: "{3}{U}{R}", pt: "2/3",
      etb: { create: { name: "Elemental", type: "Token Creature — Elemental", pt: "1/1", colors: ["U", "R"], count: 2 } },
      triggers: [{ on: "cast", filter: { controller: "you", kw: "convoke" }, effect: { damage: 1, to: "opp", damageProtectedBattles: 1 } }],
      text: "When this creature enters, create two 1/1 blue and red Elemental creature tokens. Whenever you cast a spell that has convoke, this creature deals 1 damage to each opponent and each battle they protect." },
    "Kor Halberd": { type: "Artifact — Equipment", cost: "{W}", equip: { cost: "{1}", static: { pump: [1, 1], grant: ["vigilance"] } },
      text: "Equipped creature gets +1/+1 and has vigilance. Equip {1}" },

    // ---- Wilds of Eldraine (WOE): bargain, celebration, Roles, Food, Adventures ----
    // (tokens already on the battlefield from an earlier turn: a Food, and a Cursed Role on Cursed Courtier)
    "Food": { ...JSON.parse(JSON.stringify(window.Engine.FOOD)), token: true },
    "Cursed": { ...JSON.parse(JSON.stringify(window.Engine.ROLES.Cursed)), token: true, roleSeq: 0 },
    "Monstrous Rage": { type: "Instant", cost: "{R}", targets: "creature", effect: { pump: [2, 0], role: "Monster" },
      text: "Target creature gets +2/+0 until end of turn. Create a Monster Role token attached to it. (If you control another Role on it, put that one into the graveyard. Enchanted creature gets +1/+1 and has trample.)" },
    "Become Brutes": { type: "Sorcery", cost: "{1}{R}", targets: "creature", targetCount: { min: 1, max: 2 }, effect: { grant: ["haste"], role: "Monster" },
      text: "One or two target creatures each gain haste until end of turn. For each of those creatures, create a Monster Role token attached to it. (If you control another Role on it, put that one into the graveyard. Enchanted creature gets +1/+1 and has trample.)" },
    "Candy Grapple": { type: "Instant", cost: "{1}{B}", bargain: true, targets: "creature", effect: { pump: [-3, -3] }, ifBargained: { effect: { pump: [-5, -5] } },
      text: "Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.) Target creature gets -3/-3 until end of turn. If this spell was bargained, that creature gets -5/-5 until end of turn instead." },
    "Archon's Glory": { type: "Instant", cost: "{W}", bargain: true, targets: "creature", effect: { pump: [2, 2] }, ifBargained: { effect: { pump: [2, 2], grant: ["flying", "lifelink"] } },
      text: "Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.) Target creature gets +2/+2 until end of turn. If this spell was bargained, that creature also gains flying and lifelink until end of turn." },
    "High Fae Negotiator": { type: "Creature — Faerie Warlock", cost: "{3}{B}{B}", pt: "3/5", kw: ["flying"], bargain: true,
      triggers: [{ on: "enters", self: true, if: { bargained: true }, effect: { lifeLoss: 3, to: "opp", gainLife: 3 } }],
      text: "Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.) Flying. When this creature enters, if it was bargained, each opponent loses 3 life and you gain 3 life." },
    "Hamlet Glutton": { type: "Creature — Giant", cost: "{5}{G}{G}", pt: "6/6", kw: ["trample"], bargain: true, bargainLess: 2, etb: { gainLife: 3 },
      text: "Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.) This spell costs {2} less to cast if it's bargained. Trample. When this creature enters, you gain 3 life." },
    "Agatha's Champion": { type: "Creature — Human Knight", cost: "{4}{G}", pt: "4/4", kw: ["trample"], bargain: true,
      triggers: [{ on: "enters", self: true, if: { bargained: true }, targets: "creature", targetFilter: { controller: "opponent" }, count: { min: 0, max: 1 }, effect: { fightSelf: true } }],
      text: "Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.) Trample. When this creature enters, if it was bargained, it fights up to one target creature you don't control." },
    "Gallant Pie-Wielder": { type: "Creature — Dwarf Knight", cost: "{2}{W}", pt: "2/3", kw: ["first strike"],
      conditional: [{ if: { celebration: true }, grant: ["double strike"] }],
      text: "First strike. Celebration — This creature has double strike as long as two or more nonland permanents entered the battlefield under your control this turn." },
    "Grand Ball Guest": { type: "Creature — Human Peasant", cost: "{1}{R}", pt: "2/2",
      conditional: [{ if: { celebration: true }, pump: [1, 1], grant: ["trample"] }],
      text: "Celebration — This creature gets +1/+1 and has trample as long as two or more nonland permanents entered the battlefield under your control this turn." },
    "Tuinvale Guide": { type: "Creature — Faerie Scout", cost: "{3}{W}", pt: "2/3", kw: ["flying"],
      conditional: [{ if: { celebration: true }, pump: [1, 0], grant: ["lifelink"] }],
      text: "Flying. Celebration — This creature gets +1/+0 and has lifelink as long as two or more nonland permanents entered the battlefield under your control this turn." },
    "Ash, Party Crasher": { type: "Legendary Creature — Human Peasant", cost: "{R}{W}", pt: "2/2", kw: ["haste"],
      triggers: [{ on: "attacks", self: true, if: { celebration: true }, effect: { counters: { "+1/+1": 1 }, self: true } }],
      text: "Haste. Celebration — Whenever Ash attacks, if two or more nonland permanents entered the battlefield under your control this turn, put a +1/+1 counter on Ash." },
    "Cursed Courtier": { type: "Creature — Human Noble", cost: "{2}{W}", pt: "3/3", kw: ["lifelink"], etb: { role: "Cursed", self: true },
      text: "Lifelink. When this creature enters, create a Cursed Role token attached to it. (Enchanted creature is 1/1.)" },
    "Tough Cookie": { type: "Artifact Creature — Food Golem", cost: "{1}{G}", pt: "2/2", etb: { food: 1 },
      abilities: [{ cost: "{2}{G}", targets: "artifact", filter: { controller: "you", noncreature: true }, effect: { becomeCreature: true, setBase: [4, 4] },
        text: "{2}{G}: target noncreature artifact becomes a 4/4 artifact creature" },
        { cost: "{2}", tap: true, sacSelf: true, effect: { gainLife: 3 }, text: "{2}, {T}, Sacrifice: gain 3 life" }],
      text: "When this creature enters, create a Food token. {2}{G}: Until end of turn, target noncreature artifact you control becomes a 4/4 artifact creature. {2}, {T}, Sacrifice this creature: You gain 3 life." },
    "Mintstrosity": { type: "Creature — Horror", cost: "{1}{B}", pt: "3/1", onDeath: { effect: { food: 1 } },
      text: "When this creature dies, create a Food token." },
    "Two-Headed Hunter": { type: "Creature — Giant", cost: "{4}{R}", pt: "5/4", kw: ["menace"], layout: "adventure",
      faces: [{ name: "Two-Headed Hunter", type: "Creature — Giant", cost: "{4}{R}", pt: "5/4", kw: ["menace"], text: "Menace" },
        { name: "Twice the Rage", type: "Instant — Adventure", cost: "{1}{R}", targets: "creature", effect: { grant: ["double strike"] },
          text: "Target creature gains double strike until end of turn. (Then exile this card. You may cast the creature later from exile.)" }],
      text: "Menace // Twice the Rage {1}{R}: Target creature gains double strike until end of turn." },
    "Minecart Daredevil": { type: "Creature — Dwarf Knight", cost: "{2}{R}", pt: "4/2", layout: "adventure",
      faces: [{ name: "Minecart Daredevil", type: "Creature — Dwarf Knight", cost: "{2}{R}", pt: "4/2", text: "" },
        { name: "Ride the Rails", type: "Instant — Adventure", cost: "{1}{R}", targets: "creature", effect: { pump: [2, 1] },
          text: "Target creature gets +2/+1 until end of turn. (Then exile this card. You may cast the creature later from exile.)" }],
      text: "// Ride the Rails {1}{R}: Target creature gets +2/+1 until end of turn." },
    "Ferocious Werefox": { type: "Creature — Elf Fox Warrior", cost: "{3}{G}", pt: "4/3", kw: ["trample"], layout: "adventure",
      faces: [{ name: "Ferocious Werefox", type: "Creature — Elf Fox Warrior", cost: "{3}{G}", pt: "4/3", kw: ["trample"], text: "Trample" },
        { name: "Guard Change", type: "Instant — Adventure", cost: "{1}{G}", targets: "creature", targetFilter: { controller: "you" }, effect: { role: "Monster" },
          text: "Create a Monster Role token attached to target creature you control. (Enchanted creature gets +1/+1 and has trample.)" }],
      text: "Trample // Guard Change {1}{G}: Create a Monster Role token attached to target creature you control." },
    "Conceited Witch": { type: "Creature — Human Warlock", cost: "{2}{B}", pt: "2/3", kw: ["menace"], layout: "adventure",
      faces: [{ name: "Conceited Witch", type: "Creature — Human Warlock", cost: "{2}{B}", pt: "2/3", kw: ["menace"], text: "Menace" },
        { name: "Price of Beauty", type: "Sorcery — Adventure", cost: "{B}", targets: "creature", targetFilter: { controller: "you" }, effect: { role: "Wicked" },
          text: "Create a Wicked Role token attached to target creature you control. (Then exile this card. You may cast the creature later from exile.)" }],
      text: "Menace // Price of Beauty {B}: Create a Wicked Role token attached to target creature you control." },
    "Imodane's Recruiter": { type: "Creature — Human Knight", cost: "{2}{R}", pt: "2/2", layout: "adventure", etb: { team: { pump: [1, 0], grant: ["haste"] } },
      faces: [{ name: "Imodane's Recruiter", type: "Creature — Human Knight", cost: "{2}{R}", pt: "2/2", etb: { team: { pump: [1, 0], grant: ["haste"] } },
        text: "When this creature enters, creatures you control get +1/+0 and gain haste until end of turn." },
        { name: "Train Troops", type: "Sorcery — Adventure", cost: "{4}{W}",
          effect: { create: { name: "Knight", type: "Token Creature — Knight", pt: "2/2", colors: ["W"], kw: ["vigilance"], count: 2 } },
          text: "Create two 2/2 white Knight creature tokens with vigilance. (Then exile this card. You may cast the creature later from exile.)" }],
      text: "When this creature enters, creatures you control get +1/+0 and gain haste until end of turn. // Train Troops {4}{W}: Create two 2/2 white Knight creature tokens with vigilance." },

    // ---- The Lost Caverns of Ixalan (LCI): explore, discover, descend, craft, Map tokens ----
    "Map": { ...JSON.parse(JSON.stringify(window.Engine.MAP)), token: true },
    "Cenote Scout": { type: "Creature — Merfolk Scout", cost: "{G}", pt: "1/1", etb: { explore: 1, self: true },
      text: "When this creature enters, it explores. (Reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on this creature, then put the card back or put it into your graveyard.)" },
    "Pathfinding Axejaw": { type: "Creature — Dinosaur", cost: "{3}{G}", pt: "4/3", etb: { explore: 1, self: true },
      text: "When this creature enters, it explores. (Reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on this creature, then put the card back or put it into your graveyard.)" },
    "Kinjalli's Dawnrunner": { type: "Creature — Human Scout", cost: "{2}{W}", pt: "1/1", kw: ["double strike"], etb: { explore: 1, self: true },
      text: "Double strike. When this creature enters, it explores. (Reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on this creature, then put the card back or put it into your graveyard.)" },
    "Merfolk Cave-Diver": { type: "Creature — Merfolk Scout", cost: "{2}{U}", pt: "2/4",
      triggers: [{ on: "explores", filter: { controller: "you" }, effect: { pump: [1, 0], grant: ["unblockable"], self: true } }],
      text: "Whenever a creature you control explores, this creature gets +1/+0 until end of turn and can't be blocked this turn." },
    "Over the Edge": { type: "Sorcery", cost: "{1}{G}",
      modes: [{ text: "Destroy target artifact or enchantment", targets: "permanent", targetFilter: { artifactOrEnchantment: true }, effect: { destroy: true } },
        { text: "Target creature you control explores, then it explores again", targets: "creature", targetFilter: { controller: "you" }, effect: { explore: 2 } }],
      text: "Choose one — • Destroy target artifact or enchantment. • Target creature you control explores, then it explores again." },
    "Spyglass Siren": { type: "Creature — Siren Pirate", cost: "{U}", pt: "1/1", kw: ["flying"], etb: { map: 1 },
      text: "Flying. When this creature enters, create a Map token. (It's an artifact with \"{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery.\")" },
    "Etali's Favor": { type: "Enchantment — Aura", cost: "{2}{R}", aura: { targets: "creature", filter: { controller: "you" }, static: { pump: [1, 1], grant: ["trample"] } },
      etb: { discover: 3 },
      text: "Enchant creature you control. When this Aura enters, discover 3. Enchanted creature gets +1/+1 and has trample." },
    "Geological Appraiser": { type: "Creature — Human Artificer", cost: "{2}{R}{R}", pt: "3/2",
      triggers: [{ on: "enters", self: true, if: { wasCast: true }, effect: { discover: 3 } }],
      text: "When this creature enters, if you cast it, discover 3. (Exile cards from the top of your library until you exile a nonland card with mana value 3 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" },
    "Daring Discovery": { type: "Sorcery", cost: "{4}{R}", targets: "creature", targetCount: { min: 0, max: 3 }, effect: { grant: ["can't block"], discover: 4 },
      text: "Up to three target creatures can't block this turn. Discover 4." },
    "Basking Capybara": { type: "Creature — Capybara", cost: "{1}{G}", pt: "1/3", conditional: [{ if: { descend: 4 }, pump: [3, 0] }],
      text: "Descend 4 — This creature gets +3/+0 as long as there are four or more permanent cards in your graveyard." },
    "Echo of Dusk": { type: "Creature — Vampire Spirit", cost: "{1}{B}", pt: "2/2", conditional: [{ if: { descend: 4 }, pump: [1, 1], grant: ["lifelink"] }],
      text: "Descend 4 — As long as there are four or more permanent cards in your graveyard, this creature gets +1/+1 and has lifelink." },
    "Join the Dead": { type: "Instant", cost: "{1}{B}{B}", targets: "creature", effect: { pump: [-5, -5], pumpIfDescend: { n: 4, pump: [-10, -10] } },
      text: "Target creature gets -5/-5 until end of turn. Descend 4 — That creature gets -10/-10 until end of turn instead if there are four or more permanent cards in your graveyard." },
    "Chupacabra Echo": { type: "Creature — Beast Horror Spirit", cost: "{2}{B}{B}", pt: "3/2", etb: { pumpDescend: [-1, -1] }, targets: "opponent-creature",
      text: "Fathomless descent — When this creature enters, target creature an opponent controls gets -X/-X until end of turn, where X is the number of permanent cards in your graveyard." },
    "Deathcap Marionette": { type: "Creature — Fungus", cost: "{1}{B}", pt: "1/1", kw: ["deathtouch"], etb: { mill: 2, mayMill: true },
      text: "Deathtouch. When this creature enters, you may mill two cards." },
    "Mineshaft Spider": { type: "Creature — Spider", cost: "{3}{G}", pt: "3/4", kw: ["reach"], etb: { mill: 2, mayMill: true },
      text: "Reach. When this creature enters, you may mill two cards." },
    "Idol of the Deep King": { type: "Artifact", cost: "{2}{R}", kw: ["flash"], layout: "transform", etb: { damage: 2 }, targets: "any",
      craft: { cost: "{2}{R}", filter: { artifact: true }, text: "Craft with artifact {2}{R}" },
      text: "Flash. When this artifact enters, it deals 2 damage to any target. Craft with artifact {2}{R} ({2}{R}, Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)",
      faces: [{ name: "Idol of the Deep King", type: "Artifact", cost: "{2}{R}", kw: ["flash"], etb: { damage: 2 }, targets: "any",
        craft: { cost: "{2}{R}", filter: { artifact: true }, text: "Craft with artifact {2}{R}" },
        text: "Flash. When this artifact enters, it deals 2 damage to any target. Craft with artifact {2}{R}." },
        { name: "Sovereign's Macuahuitl", type: "Artifact — Equipment", colors: ["R"], etb: { attach: true }, targets: "creature", targetFilter: { controller: "you" },
          equip: { cost: "{2}", static: { pump: [2, 0] } },
          text: "When this Equipment enters, attach it to target creature you control. Equipped creature gets +2/+0. Equip {2}" }] },
    "Staggering Size": { type: "Instant", cost: "{1}{G}", targets: "creature", effect: { pump: [3, 3], grant: ["trample"] },
      text: "Target creature gets +3/+3 and gains trample until end of turn." },
    "Ancestors' Aid": { type: "Instant", cost: "{1}{R}", targets: "creature", effect: { pump: [2, 0], grant: ["first strike"],
      create: { name: "Treasure", type: "Token Artifact — Treasure", text: "{T}, Sacrifice this token: Add one mana of any color." } },
      text: "Target creature gets +2/+0 and gains first strike until end of turn. Create a Treasure token." },
    "Goblin Tomb Raider": { type: "Creature — Goblin Pirate", cost: "{R}", pt: "1/2",
      conditional: [{ if: { controls: { filter: { artifact: true }, min: 1 } }, pump: [1, 0], grant: ["haste"] }],
      text: "As long as you control an artifact, this creature gets +1/+0 and has haste." },
    "Panicked Altisaur": { type: "Creature — Dinosaur", cost: "{4}{R}", pt: "4/5", kw: ["reach"],
      abilities: [{ tap: true, effect: { damage: 2, to: "opp" }, text: "{T}: 2 damage to each opponent" }],
      text: "Reach. {T}: This creature deals 2 damage to each opponent." },

    // ---- Murders at Karlov Manor (MKM): disguise, suspect, investigate (Clues), collect evidence, Cases ----
    // (disguise: the cost to turn it face up; a card on the battlefield with faceDown: true is face down)
    "Clue": { ...JSON.parse(JSON.stringify(window.Engine.CLUE)), token: true },
    "Convenient Target": { type: "Enchantment — Aura", cost: "{R}", aura: { targets: "creature", static: { pump: [1, 1] } },
      etb: { suspect: true, to: "enchanted" },
      text: "Enchant creature. When this Aura enters, suspect enchanted creature. (It has menace and can't block.) Enchanted creature gets +1/+1. {2}{R}: Return this card from your graveyard to your hand." },
    "Alley Assailant": { type: "Creature — Vampire Rogue", cost: "{2}{B}", pt: "3/3", entersTapped: true, disguise: "{4}{B}{B}",
      triggers: [{ on: "turnedFaceUp", self: true, effect: { lifeLoss: 3, to: "opp", gainLife: 3 } }],
      text: "This creature enters tapped. Disguise {4}{B}{B} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.) When this creature is turned face up, target opponent loses 3 life and you gain 3 life." },
    "Case of the Gateway Express": { type: "Enchantment — Case", cost: "{1}{W}", etb: { eachDeals: 1 }, targets: "creature", targetFilter: { controller: "opponent" },
      toSolve: { attackedCount: 3 }, static: { team: { pump: [1, 0] }, if: { solved: true } },
      text: "When this Case enters, choose target creature you don't control. Each creature you control deals 1 damage to that creature. To solve — Three or more creatures attacked this turn. (If unsolved, solve at the beginning of your end step.) Solved — Creatures you control get +1/+0." },
    "Bite Down on Crime": { type: "Sorcery", cost: "{3}{G}", evidence: 6, evidenceLess: 2,
      slots: [{ targets: "creature", filter: { controller: "you" } }, { targets: "creature", filter: { controller: "opponent" } }], effect: { bite: true, pumpFirst: [2, 0] },
      text: "As an additional cost to cast this spell, you may collect evidence 6. This spell costs {2} less to cast if evidence was collected. (To collect evidence 6, exile cards with total mana value 6 or greater from your graveyard.) Target creature you control gets +2/+0 until end of turn. It deals damage equal to its power to target creature you don't control." },
    "Defenestrated Phantom": { type: "Creature — Spirit", cost: "{4}{W}{W}", pt: "4/3", kw: ["flying"], disguise: "{4}{W}",
      text: "Flying. Disguise {4}{W} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)" },
    "The Chase Is On": { type: "Instant", cost: "{2}{R}", targets: "creature", effect: { pump: [3, 0], grant: ["first strike"], investigate: 1 },
      text: "Target creature gets +3/+0 and gains first strike until end of turn. Investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" },
    "Caught Red-Handed": { type: "Instant", cost: "{4}{R}", uncounterable: true, targets: "creature", effect: { steal: true, suspect: true },
      text: "This spell can't be countered. (This includes by the ward ability.) Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. Suspect it. (It has menace and can't block.)" },
    "Wispdrinker Vampire": { type: "Creature — Vampire Rogue", cost: "{2}{W}{B}", pt: "2/4", kw: ["flying"],
      triggers: [{ on: "enters", other: true, filter: { controller: "you", creature: true, maxPower: 2 }, effect: { lifeLoss: 1, to: "opp", gainLife: 1 } }],
      abilities: [{ cost: "{5}{W}{B}", effect: { team: { grant: ["deathtouch", "lifelink"], filter: { maxPower: 2 } } }, text: "{5}{W}{B}: power 2 or less gain deathtouch and lifelink" }],
      text: "Flying. Whenever another creature you control with power 2 or less enters, each opponent loses 1 life and you gain 1 life. {5}{W}{B}: Creatures you control with power 2 or less gain deathtouch and lifelink until end of turn." },
    "Dog Walker": { type: "Creature — Human Citizen", cost: "{R}{W}", pt: "3/1", kw: ["vigilance"], disguise: "{R/W}{R/W}",
      triggers: [{ on: "turnedFaceUp", self: true, effect: { create: { name: "Dog", type: "Token Creature — Dog", pt: "1/1", colors: ["W"], tapped: true, count: 2 } } }],
      text: "Vigilance. Disguise {R/W}{R/W} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.) When this creature is turned face up, create two tapped 1/1 white Dog creature tokens." },
    "Granite Witness": { type: "Artifact Creature — Gargoyle Detective", cost: "{2}{W}{U}", pt: "3/2", kw: ["flying", "vigilance"], disguise: "{W/U}{W/U}",
      triggers: [{ on: "turnedFaceUp", self: true, targets: "creature", effect: { tapOrUntap: true } }],
      text: "Flying, vigilance. Disguise {W/U}{W/U} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.) When this creature is turned face up, you may tap or untap target creature." },
    "Bolrac-Clan Basher": { type: "Creature — Cyclops Warrior", cost: "{4}{R}{R}", pt: "3/2", kw: ["double strike", "trample"], disguise: "{3}{R}{R}",
      text: "Double strike, trample. Disguise {3}{R}{R} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)" },
    "Case of the Burning Masks": { type: "Enchantment — Case", cost: "{1}{R}{R}", etb: { damage: 3 }, targets: "opponent-creature",
      toSolve: { damageSources: 3 },
      abilities: [{ sacSelf: true, ifSolved: true, effect: { impulse: 3 }, text: "Solved — Sacrifice: exile the top three, play one this turn" }],
      text: "When this Case enters, it deals 3 damage to target creature an opponent controls. To solve — Three or more sources you controlled dealt damage this turn. (If unsolved, solve at the beginning of your end step.) Solved — Sacrifice this Case: Exile the top three cards of your library. Choose one of them. You may play that card this turn." },
    "Persuasive Interrogators": { type: "Creature — Gorgon Detective", cost: "{4}{B}{B}", pt: "5/6", etb: { investigate: 1 },
      triggers: [{ on: "sacrificed", filter: { controller: "you", type: "Clue" }, effect: { poison: 2, to: "opp" } }],
      text: "When this creature enters, investigate. Whenever you sacrifice a Clue, target opponent gets two poison counters. (A player with ten or more poison counters loses the game.)" },
    "Crime Novelist": { type: "Creature — Goblin Bard", cost: "{2}{R}", pt: "1/3",
      triggers: [{ on: "sacrificed", filter: { controller: "you", artifact: true }, effect: { counters: { "+1/+1": 1 }, self: true, addMana: "R" } }],
      text: "Whenever you sacrifice an artifact, put a +1/+1 counter on this creature and add {R}." },
    "Deduce": { type: "Instant", cost: "{1}{U}", effect: { draw: 1, investigate: 1 },
      text: "Draw a card. Investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" },
    "Novice Inspector": { type: "Creature — Human Detective", cost: "{W}", pt: "1/2", etb: { investigate: 1 },
      text: "When this creature enters, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" }
  };

  // c("Grizzly Bears", { tapped: true }) → a fresh copy of a catalog card
  function c(name, extra) {
    if (!CARDS[name]) throw new Error("Unknown card: " + name);
    return { name, ...JSON.parse(JSON.stringify(CARDS[name])), ...extra };
  }
  const many = (n, name, extra) => Array.from({ length: n }, () => c(name, extra));

  // Fill in defaults and give every card a unique id made from its name (bears, bears-2, …)
  function puzzle(p) {
    const opp = { life: 20, handCount: 0, libraryCount: 20, battlefield: [], graveyard: [], ...p.opp };
    const you = { hand: [], libraryCount: 20, battlefield: [], graveyard: [], ...p.you };   // no life: irrelevant
    const seen = {};
    [opp.battlefield, you.battlefield, you.hand, you.library, you.graveyard, you.exile, opp.library, opp.graveyard, opp.exile]
      .flat().filter(Boolean).forEach((card) => {
      if (card.id) return;
      const base = card.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      seen[base] = (seen[base] || 0) + 1;
      card.id = seen[base] > 1 ? `${base}-${seen[base]}` : base;
    });
    return {
      // difficulty: the set it belongs to (its category); tier: easy, medium or hard
      id: p.id, title: p.title, difficulty: p.set || p.difficulty, tier: p.tier,
      prompt: p.prompt || `Your opponent is at ${opp.life} life${opp.poison ? ` and has ${opp.poison} poison counters` : ""}. Find lethal.`,
      opponent: opp, player: you, landPlayed: !!p.landPlayed,
      explanation: p.explanation, notes: p.notes
    };
  }

  /* ======================= PHYREXIA: ALL WILL BE ONE (set ONE) ======================= */
  // Toxic, corrupted, proliferate, oil counters, For Mirrodin!, crew and affinity
  window.PUZZLES = [
    puzzle({
      id: "one-01-fresh-venom", title: "Fresh Venom", set: "one", tier: "easy",
      opp: { life: 20, poison: 8, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Tyrranax Atrocity")], battlefield: [c("Branchblight Stalker"), ...many(5, "Forest")] },
      explanation: "Life doesn't matter: 10 poison counters win. Cast Tyrranax Atrocity (haste) and attack with both. Grizzly Bears can block only one; the other's toxic gives at least 2 poison.",
      notes: `
LETHAL: Opponent has 8 poison. Cast Tyrranax Atrocity ({3}{G}{G}, haste, toxic 3). Attack with it and Branchblight Stalker
  (toxic 2). Bears blocks Tyrranax: Stalker gives 2 → 10. Bears blocks Stalker: Tyrranax gives 3 → 11.
RULES: Toxic N: combat damage to a player also gives N poison counters (702.164c). 10 poison loses (704.5c).
WRONG LINES: Attacking with Stalker alone (Bears blocks). Life total 20 is a red herring.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "one-02-rebel-arms", title: "Rebel Arms", set: "one", tier: "easy",
      opp: { life: 4 },
      you: { hand: [c("Vulshok Splitter")], battlefield: [c("Gray Ogre"), ...many(7, "Mountain")] },
      explanation: "For Mirrodin! makes a 2/2 Rebel and attaches the Splitter to it, but the Rebel just arrived and can't attack. Pay the equip cost to move the Splitter to Gray Ogre: 4 damage.",
      notes: `
LETHAL: Cast Vulshok Splitter ({3}{R}): For Mirrodin! makes a 2/2 Rebel with the Splitter attached. Equip {2}{R} onto Gray
  Ogre: 4/2. Attack: 4.
RULES: For Mirrodin! (702.163a). The Rebel token is summoning sick (302.6). Equip is sorcery speed.
WRONG LINES: Attacking with the Rebel (sick). Ogre alone: 2.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "one-03-corruption", title: "Corruption", set: "one", tier: "easy",
      opp: { life: 9, poison: 2 },
      you: { hand: [c("Prologue to Phyresis")], battlefield: [c("Apostle of Invasion"), c("Pestilent Syphoner"), c("Island"), c("Island")] },
      explanation: "Prologue to Phyresis gives the third poison counter: corrupted turns on and Apostle of Invasion has double strike. 8 + 1 = 9.",
      notes: `
LETHAL: Prologue to Phyresis ({1}{U}): 3 poison. Apostle of Invasion has double strike (corrupted). Attack with Apostle
  and Pestilent Syphoner: 4 + 4 + 1 = 9.
RULES: Corrupted: an opponent has three or more poison counters. A static ability: it applies as soon as that's true.
WRONG LINES: Attacking first and casting Prologue after damage. Apostle alone: 8.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "one-04-spread-the-sickness", title: "Spread the Sickness", set: "one", tier: "easy",
      opp: { life: 20, poison: 7, battlefield: [c("Giant Spider"), c("Elite Vanguard")] },
      you: { hand: [c("Whisper of the Dross")], battlefield: [c("Jawbone Duelist"), c("Branchblight Stalker"), c("Swamp")] },
      explanation: "Before combat, Whisper of the Dross kills Elite Vanguard and proliferates: 8 poison. Giant Spider can block only one attacker; the other gives 2 poison.",
      notes: `
LETHAL: Whisper of the Dross on Elite Vanguard (2/1 → dies), proliferate: 8 poison. Attack with Jawbone Duelist (double
  strike, toxic 1: 2 poison) and Branchblight Stalker (toxic 2). Spider blocks one: 8 + 2 = 10.
RULES: Proliferate (701.34a): the opponent has poison counters, so they get one more. Double strike deals combat damage
  twice: toxic applies each time.
WRONG LINES: Attacking first: both attackers get blocked; Whisper afterwards only proliferates (8). Whisper on the Spider
  (1/3): it still blocks. Whisper on your own creature kills it.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "one-05-sick-crew", title: "Sick Crew", set: "one", tier: "medium",
      opp: { life: 20, poison: 7, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Chrome Prowler")], battlefield: [c("Ribskiff"), c("Branchblight Stalker"), ...many(3, "Island")] },
      explanation: "Chrome Prowler taps Wall of Wood as it enters. It can't attack this turn, but crewing isn't a {T} cost: it can crew Ribskiff. Ribskiff and Branchblight Stalker give 2 poison each.",
      notes: `
LETHAL: Cast Chrome Prowler ({2}{U}): tap Wall of Wood. Crew Ribskiff (crew 3) with the summoning-sick Prowler (power 3).
  Attack with Ribskiff (toxic 2) and Stalker (toxic 2): 7 + 4 = 11.
RULES: Crew (702.122a): tapping creatures to crew isn't a {T} cost, so summoning-sick creatures can crew (302.6).
WRONG LINES: Crewing with Stalker: only Ribskiff attacks (9). Not casting Prowler: Wall blocks one attacker.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "one-06-rebels-ready", title: "Rebels, Ready", set: "one", tier: "medium",
      opp: { life: 7 },
      you: { hand: [c("Barbed Batterfist"), c("Vulshok Splitter"), c("Hexgold Halberd")],
        battlefield: [c("Furnace Strider", { tapped: true, counters: { oil: 2 } }), ...many(6, "Mountain")] },
      explanation: "Each Equipment brings a Rebel. Furnace Strider's oil counters give two of them haste. Batterfist and Splitter make a 3/1 and a 4/2: 7.",
      notes: `
LETHAL: Barbed Batterfist ({1}{R}): Rebel 3/1. Vulshok Splitter ({3}{R}): Rebel 4/2. Remove both oil counters from
  Furnace Strider: both Rebels gain haste. Attack: 3 + 4 = 7.
RULES: For Mirrodin!; Rebel tokens are summoning sick; removing an oil counter is a cost.
WRONG LINES: Halberd + Splitter: 2 + 4 = 6. Batterfist + Halberd: 3 + 2 (+ equip moves) = 5.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "one-07-oil-slick", title: "Oil Slick", set: "one", tier: "hard",
      opp: { life: 8, battlefield: [c("Giant Spider"), c("Wall of Wood")] },
      you: { hand: [c("Volt Charge"), c("Free from Flesh")],
        battlefield: [c("Ichor Synthesizer", { counters: { oil: 2 } }), c("Trawler Drake", { counters: { oil: 1 } }), ...many(4, "Mountain")] },
      explanation: "Every noncreature spell puts an oil counter on Ichor Synthesizer, and proliferate adds another. Volt Charge to the face (3), then Free from Flesh on the Synthesizer: 7 oil counters, a 5/5 that can't be blocked.",
      notes: `
LETHAL: Volt Charge ({2}{R}) at the opponent: casting it puts an oil counter on Ichor Synthesizer (3) and Trawler Drake (2);
  it deals 3 (8 → 5), then proliferate: Synthesizer 4, Drake 3. Free from Flesh ({R}) on the Synthesizer: cast trigger
  (5), then +2/+2 and two oil counters (7). Synthesizer: 1/3 +2/+2 +2/+0 = 5/5, can't be blocked. Attack: 5.
RULES: "Whenever you cast" triggers resolve before the spell. Proliferate (701.34a) adds one of each kind of counter.
  "As long as it has four or more oil counters" is a static ability (it applies at once). Either spell order works.
WRONG LINES: Volt Charge at Giant Spider (2/4 survives). Free from Flesh on the Drake: Giant Spider has reach and blocks
  it. No Volt Charge to the face: 5 < 8.
UNIQUENESS: Solver-checked (proliferate yes/no picks and trigger order count as one plan).`
    }),
    puzzle({
      id: "one-08-proliferation", title: "Proliferation", set: "one", tier: "hard",
      opp: { life: 13, battlefield: [c("Wall of Stone")] },
      you: { hand: [c("Drown in Ichor"), c("Volt Charge")],
        battlefield: [c("Scheming Aspirant", { sick: true }), c("Thrummingbird"), c("Blightbelly Rat"), c("Copper Longlegs"),
          c("Swamp"), c("Mountain"), c("Forest"), c("Forest"), c("Swamp")] },
      explanation: "Scheming Aspirant drains 2 each time you proliferate, even with nothing to add a counter to. Volt Charge the opponent, attack with everything (the Wall can stop only one), then Drown in Ichor your own Blightbelly Rat: the spell proliferates, and the Rat's death proliferates again.",
      notes: `
LETHAL: Volt Charge at the opponent: 3 + proliferate (Aspirant: 2) → 8. Attack with Thrummingbird, Blightbelly Rat and
  Copper Longlegs. Wall of Stone blocks the Rat: Bird 1 + Longlegs 1 → 6, Thrummingbird's trigger proliferates → 4.
  Main 2: Drown in Ichor on your own Rat: proliferate → 2; the Rat dies, its trigger proliferates → 0.
  (Wall blocks Longlegs instead: Rat 2 + Bird 1 → 5, proliferate → 3, Drown → -1.)
RULES: You may proliferate choosing nothing; "whenever you proliferate" still triggers. Wall of Stone has no reach.
  Scheming Aspirant came in this turn and can't attack. Drown's proliferate happens before the Rat dies (608.2c, 704).
WRONG LINES: Drown on Wall of Stone (0/8 survives: one proliferate). Keeping the Rat home: the Wall blocks Longlegs.
  Copper Longlegs' ability costs mana you need for the two spells.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "one-09-corrupted-squadron", title: "Corrupted Squadron", set: "one", tier: "hard",
      opp: { life: 6, poison: 2, battlefield: [c("Giant Spider")] },
      you: { hand: [c("Prologue to Phyresis"), c("Zealot's Conviction")],
        battlefield: [c("Incisor Glider"), c("Bonepicker Skirge"), c("Pestilent Syphoner"), c("Island"), c("Island"), c("Plains")] },
      explanation: "Cast Prologue to Phyresis before attacking: with 3 poison counters Incisor Glider's attack trigger pumps the team. Hold Zealot's Conviction (flash) until Giant Spider has blocked, then put it on an unblocked flier: +2/+1 with corrupted.",
      notes: `
LETHAL: Prologue to Phyresis ({1}{U}): 3 poison. Attack with Incisor Glider, Bonepicker Skirge and Pestilent Syphoner:
  Glider's corrupted trigger: creatures you control +1/+1 (2/4, 3/3, 2/2). Giant Spider blocks one. Zealot's Conviction
  ({W}, flash) on an unblocked one: +1/+1, plus +1/+0 and first strike (corrupted). Worst block (Skirge): 2 + 2 + 2 = 6.
RULES: Incisor Glider's trigger has an intervening "if" (603.4): corrupted must be true when it triggers. Zealot's
  Conviction has flash. Giant Spider has reach.
WRONG LINES: Prologue after attackers are declared: no team pump (4 at most). Conviction before blocks: the Spider blocks
  the enchanted creature.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "one-10-assembly-line", title: "Assembly Line", set: "one", tier: "hard",
      opp: { life: 6, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Prosthetic Injector"), c("Swooping Lookout"), c("Plated Onslaught")],
        battlefield: [c("Mandible Justiciar"), c("Orthodoxy Enforcer"), ...many(4, "Plains")] },
      explanation: "Cast the cheap artifacts first. Each one pumps Mandible Justiciar, two artifacts turn on Orthodoxy Enforcer, and with three artifacts Plated Onslaught (affinity) costs only {W}{W}. Both attackers are 6/x: the Wall stops one.",
      notes: `
LETHAL: Prosthetic Injector ({1}): Justiciar 3/2; two artifacts → Enforcer 4/4. Swooping Lookout ({W}): Justiciar 4/3;
  three artifacts. Plated Onslaught: {3}{W}{W} minus 3 = {W}{W}: +2/+1 to your creatures: Justiciar 6/4, Enforcer 6/5.
  Attack with both: Wall of Wood blocks one, 6 gets through.
RULES: Affinity for artifacts (702.41a) only reduces the generic part (601.2f). Orthodoxy Enforcer's +2/+0 is a static
  ability. The new Lookout is summoning sick but still counts as an artifact.
WRONG LINES: Plated Onslaught first ({2}{W}{W}: all four Plains): Justiciar 4/2, Enforcer 4/5 → 4. Equipping the Injector
  instead of casting the Lookout: Onslaught then costs 3 more than you have.
UNIQUENESS: Solver-checked.`
    })
  ];

  /* ========================== MARCH OF THE MACHINE (set MOM) ========================== */
  // Battles, backup, incubate, transforming with Phyrexian mana, convoke
  window.PUZZLES.push(
    puzzle({
      id: "mom-01-backup-plan", title: "Backup Plan", set: "mom", tier: "easy",
      opp: { life: 10 },
      you: { hand: [c("Fearless Skald")], battlefield: [c("Bonded Herdbeast"), c("Mountain"), ...many(4, "Forest")] },
      explanation: "Fearless Skald can't attack this turn, but its backup can go on Bonded Herdbeast: a +1/+1 counter and double strike. 5 + 5 = 10.",
      notes: `
LETHAL: Fearless Skald ({4}{R}): backup 1 on Bonded Herdbeast: 5/6 with double strike until end of turn. Attack: 10.
RULES: Backup (702.165a): another creature also gains the abilities printed below backup (double strike).
WRONG LINES: Backup on the Skald itself (summoning sick). Transforming Herdbeast ({4}{R/P}): a 7/5 menace = 7.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mom-02-hatch", title: "Hatch", set: "mom", tier: "easy",
      opp: { life: 5 },
      you: { hand: [c("Kor Halberd")], battlefield: [c("Incubator", { counters: { "+1/+1": 3 } }), c("Alabaster Host Sanctifier"), ...many(3, "Plains")] },
      explanation: "The Incubator has been here since last turn. Pay {2} to transform it: a 3/3 Phyrexian that isn't summoning sick. 3 + 2 = 5.",
      notes: `
LETHAL: Incubator: {2}: transform into a Phyrexian Token artifact creature, 0/0 with three +1/+1 counters = 3/3. It's been
  under your control since the turn began, so it can attack. Attack with it and Alabaster Host Sanctifier: 3 + 2 = 5.
RULES: Incubate (701.53); transforming keeps the same permanent (712.18), so it isn't summoning sick.
WRONG LINES: Kor Halberd + equip on the Sanctifier: 3.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mom-03-rally", title: "Rally", set: "mom", tier: "easy",
      opp: { life: 10 },
      you: { hand: [c("Invasion of Kylem")], battlefield: [c("Glory Seeker"), c("Bonded Herdbeast", { sick: true }), c("Mountain"), c("Plains"), c("Forest"), c("Forest")] },
      explanation: "A battle has an effect when it enters too. Invasion of Kylem gives two creatures +2/+0 and haste: Bonded Herdbeast (cast this turn) attacks for 6, Glory Seeker for 4.",
      notes: `
LETHAL: Invasion of Kylem ({2}{R}{W}): Herdbeast 6/5 haste, Glory Seeker 4/2. Attack: 10.
RULES: Battle (310): it enters with defense counters; its enters trigger works like any other.
WRONG LINES: Only one target: Herdbeast can't attack, or Seeker stays at 2.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mom-04-red-reinforcements", title: "Red Reinforcements", set: "mom", tier: "easy",
      opp: { life: 4, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Ral's Reinforcements"), c("Stoke the Flames")], battlefield: [c("Glory Seeker"), c("Mountain"), c("Plains"), c("Plains")] },
      explanation: "Stoke the Flames needs {R}{R}, and you have one Mountain. Ral's Reinforcements makes two blue and red Elementals: they're new, but they can still convoke, each paying {R}.",
      notes: `
LETHAL: Ral's Reinforcements (Mountain + Plains): two 1/1 blue and red Elementals. Stoke the Flames: convoke both
  Elementals ({R}{R}) and Glory Seeker ({1}), plus the other Plains ({1}): 4 damage to the opponent.
RULES: Convoke (702.51): any untapped creature you control, summoning sick or not, pays {1} or one mana of its color.
WRONG LINES: Stoke without the tokens: only one red source. Attacking: Wall of Wood blocks.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mom-05-siege-breaker", title: "Siege Breaker", set: "mom", tier: "medium",
      opp: { life: 9 },
      you: { battlefield: [c("Invasion of Belenon", { counters: { defense: 1 } }), c("Kithkin Billyrider"), c("Knight"), c("Alabaster Host Sanctifier"), c("Glory Seeker")] },
      explanation: "Send Kithkin Billyrider at your own Invasion of Belenon. Its first-strike damage defeats the Siege, you cast Belenon War Anthem for free, and the other attackers deal regular damage as 3/3s.",
      notes: `
LETHAL: Attack: Kithkin Billyrider → Invasion of Belenon (1 defense); Knight, Sanctifier and Glory Seeker → opponent.
  First-strike damage: 1 to the battle, its last defense counter: the Siege trigger exiles it and you cast Belenon War
  Anthem transformed, for free. It resolves before regular damage: three 3/3s → 9.
RULES: You can attack your own Siege (310.9b). Siege defeated (310.12b). Double strike: a first-strike damage step,
  then regular damage (510.4).
WRONG LINES: Everything at the opponent: 2 + 2 + 2 + 2 = 8.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mom-06-deadly-stampede", title: "Deadly Stampede", set: "mom", tier: "medium",
      opp: { life: 4, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Serpent-Blade Assailant")], battlefield: [c("Tarkir Duneshaper"), ...many(7, "Forest")] },
      explanation: "Back up Tarkir Duneshaper with Serpent-Blade Assailant (deathtouch) and transform it into Burnished Dunestomper (trample). Deathtouch plus trample: 1 damage is lethal to Wall of Wood, 4 go through.",
      notes: `
LETHAL: Serpent-Blade Assailant ({2}{G}): backup on Duneshaper: +1/+1 counter, deathtouch. Transform ({4}{G/P}):
  Burnished Dunestomper 4/3 trample → 5/4 deathtouch, trample. Wall of Wood blocks: 1 to it, 4 to the opponent.
RULES: Deathtouch + trample: 1 damage counts as lethal (702.2c, 702.19c). A transformed permanent keeps its counters and
  effects (712.18). Either order works.
WRONG LINES: No transform: no trample. No backup: 1 tramples over the 0/3 Wall.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mom-07-incubation-chamber", title: "Incubation Chamber", set: "mom", tier: "hard",
      opp: { life: 8 },
      you: { hand: [c("Norn's Inquisitor")],
        battlefield: [c("Elvish Vatkeeper"), c("Incubator", { counters: { "+1/+1": 2 } }), c("Plains"), c("Swamp"), ...many(5, "Forest")] },
      explanation: "Order matters. Cast Norn's Inquisitor first, then use Elvish Vatkeeper on the old Incubator: it transforms and its counters double to 4, and the Inquisitor adds one more. A 5/5 that's been here all turn, plus the Vatkeeper: 8.",
      notes: `
LETHAL: Norn's Inquisitor ({1}{W}) (its own Incubator is new: can't attack). Elvish Vatkeeper {5} on the old Incubator:
  transform, double the counters (2 → 4); Inquisitor: it transformed into a Phyrexian → +1 counter: 5/5. Attack with it
  and Vatkeeper (3): 8.
RULES: Incubator (701.53); doubling counters (701.10e); the old token has been here since the turn began.
WRONG LINES: Vatkeeper's ability before the Inquisitor: 4/4 + 3 = 7. {2} transform: 2/2 (3/3 with the Inquisitor) + 3.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mom-08-flash-backup", title: "Flash Backup", set: "mom", tier: "hard",
      opp: { life: 5, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Saiba Cryptomancer")], battlefield: [c("Kithkin Billyrider"), c("Glory Seeker"), c("Glory Seeker"), c("Island"), c("Island")] },
      explanation: "Attack with all three and wait. Saiba Cryptomancer has flash: after the Wall has blocked, its backup counter goes on whichever attacker got through.",
      notes: `
LETHAL: Attack with Kithkin Billyrider and both Glory Seekers. Wall of Wood blocks one. Then flash in Saiba Cryptomancer
  ({1}{U}): backup 1 on an unblocked attacker. Wall blocks Billyrider: 3 + 2 = 5. Wall blocks a Seeker: Billyrider gets
  the counter: 2 + 2 + 2 = 6.
RULES: Flash; backup is an enters trigger (702.165a); counters added after blockers still count for damage.
WRONG LINES: Cryptomancer before combat: the Wall blocks the creature with the counter (4 at most).
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mom-09-storm-the-gates", title: "Storm the Gates", set: "mom", tier: "hard",
      opp: { life: 12, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Burning Sun's Fury")],
        battlefield: [c("Joyful Stormsculptor"), c("Elemental"), c("Elemental"), c("Knight"), c("Invasion of Belenon", { counters: { defense: 1 } }), c("Mountain"), c("Mountain")] },
      explanation: "Attack with everything, then press Next phase so Wall of Wood blocks. Now cast Burning Sun's Fury on the two Elementals, paying with your two Mountains (\"Mana only\": no need to convoke). It's a spell that has convoke, so Joyful Stormsculptor deals 1 to the opponent and 1 to your Siege. The Siege falls, Belenon War Anthem comes in, and all your attackers grow before damage.",
      notes: `
LETHAL: Attack with Stormsculptor, both Elementals and the Knight. Wall of Wood blocks one (worst: Stormsculptor). Cast
  Burning Sun's Fury (paid with the two Mountains: the attackers are tapped and can't convoke, and don't need to) on
  both Elementals: Stormsculptor's trigger: 1 to the opponent (11) and 1 to
  Invasion of Belenon, its last defense counter. Cast Belenon War Anthem for free; it resolves before the Fury.
  Elementals 1 + 2 + 1 = 4 each, Knight 3: 11.
RULES: "A spell that has convoke" triggers whether or not you convoked. The battles the opponent protects are your
  Sieges (310.9e). A Siege's trigger: exile it, cast it transformed (310.12b).
WRONG LINES: Fury before combat: the Wall then blocks an Elemental (10 + 1). Without the anthem: 3 + 3 + 2 + 1 = 9.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mom-10-hatch-and-charge", title: "Hatch and Charge", set: "mom", tier: "hard",
      opp: { life: 9 },
      you: { hand: [c("Converter Beast"), c("Invasion of Kylem"), c("Eyes of Gitaxias")],
        battlefield: [c("Mountain"), c("Plains"), c("Island"), ...many(7, "Forest")] },
      explanation: "Converter Beast makes an Incubator with five counters; transform it right away. It's new, so it can't attack yet, but Invasion of Kylem gives it and Converter Beast +2/+0 and haste: 7 + 2.",
      notes: `
LETHAL: Converter Beast ({3}{G}): incubate 5. Incubator {2}: a 5/5 Phyrexian Token (summoning sick). Invasion of Kylem
  ({2}{R}{W}): the Token and Converter Beast get +2/+0 and haste. Attack: 7 + 2 = 9. All ten lands.
RULES: A token created this turn is summoning sick (302.6); haste lets it attack. Kylem's trigger needs creatures as it
  goes on the stack: transform the Incubator first.
WRONG LINES: Kylem before transforming (the Incubator isn't a creature). Eyes of Gitaxias: only 3 counters.
UNIQUENESS: Solver-checked.`
    })
  );

  /* =========================== WILDS OF ELDRAINE (set WOE) =========================== */
  // Bargain, celebration, Roles, Food, Adventures
  window.PUZZLES.push(
    puzzle({
      id: "woe-01-monster-inside", title: "Monster Inside", set: "woe", tier: "easy",
      opp: { life: 3, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Monstrous Rage")], battlefield: [c("Hill Giant"), c("Mountain")] },
      explanation: "Monstrous Rage gives +2/+0 and a Monster Role (+1/+1 and trample): a 6/4 trampler. The Wall soaks 3, the other 3 go through.",
      notes: `
LETHAL: Monstrous Rage on Hill Giant: 3/3 +2/+0 +1/+1 = 6/4 trample. Wall of Wood (0/3) blocks: 3 to it, 3 through.
RULES: Role tokens are Aura tokens (111.10k: Monster). Trample assigns lethal damage to blockers, the rest to the player.
WRONG LINES: None really: the only card. (Holding it until after blocks works the same.)
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "woe-02-sweet-deal", title: "Sweet Deal", set: "woe", tier: "easy",
      opp: { life: 3, battlefield: [c("Siege Mastodon")] },
      you: { hand: [c("Candy Grapple")], battlefield: [c("Hill Giant"), c("Food"), c("Swamp"), c("Swamp")] },
      explanation: "Bargain the Food: Candy Grapple then gives -5/-5 instead of -3/-3, enough to kill Siege Mastodon. Hill Giant attacks for 3.",
      notes: `
LETHAL: Candy Grapple, bargaining the Food token: -5/-5 on Siege Mastodon (3/5): dies. Hill Giant: 3.
RULES: Bargain (702.166): an optional additional cost, sacrifice an artifact, enchantment, or token.
WRONG LINES: Not bargaining: the Mastodon is 0/2 and still blocks.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "woe-03-cookie-party", title: "Cookie Party", set: "woe", tier: "easy",
      opp: { life: 7 },
      you: { hand: [c("Tough Cookie"), c("Mintstrosity")], battlefield: [c("Grand Ball Guest"), c("Gallant Pie-Wielder"), c("Forest"), c("Forest")] },
      explanation: "Celebration counts nonland permanents entering. Tough Cookie brings a Food token with it: two permanents. Grand Ball Guest becomes 3/3 with trample, Gallant Pie-Wielder gets double strike: 3 + 4.",
      notes: `
LETHAL: Tough Cookie ({1}{G}): it and its Food token enter: celebration. Grand Ball Guest 3/3 trample, Gallant
  Pie-Wielder double strike (2 + 2). Attack: 7.
RULES: Celebration: two or more nonland permanents entered under your control this turn. Tokens count.
WRONG LINES: Mintstrosity needs {B}. Without celebration: 2 + 2 = 4.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "woe-04-twice-the-rage", title: "Twice the Rage", set: "woe", tier: "easy",
      opp: { life: 6 },
      you: { hand: [c("Two-Headed Hunter")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain")] },
      explanation: "You can't afford Two-Headed Hunter, but you can cast its Adventure: Twice the Rage gives Hill Giant double strike. 3 + 3.",
      notes: `
LETHAL: Twice the Rage ({1}{R}, the Adventure half) on Hill Giant: double strike. Attack: 6.
RULES: Adventure (715): cast either half from your hand; the Adventure goes to exile, from where you can cast the creature later.
WRONG LINES: Two-Headed Hunter costs 5.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "woe-05-brute-force", title: "Brute Force", set: "woe", tier: "medium",
      opp: { life: 4, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Hamlet Glutton"), c("Become Brutes")], battlefield: [c("Food"), ...many(6, "Forest"), c("Mountain")] },
      explanation: "Bargain the Food: Hamlet Glutton costs {2} less. With the mana saved, Become Brutes gives it haste and a Monster Role: a 7/7 trampler, 4 over the Wall.",
      notes: `
LETHAL: Hamlet Glutton bargained ({3}{G}{G}): 6/6 trample. Become Brutes ({1}{R}) on it: haste, Monster Role (+1/+1,
  trample): 7/7. Wall of Wood blocks: 3 to it, 4 through.
RULES: Bargain cost reduction (702.166c). A creature cast this turn can attack with haste.
WRONG LINES: Glutton without bargaining costs all 7 lands: no haste.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "woe-06-lift-the-curse", title: "Lift the Curse", set: "woe", tier: "medium",
      opp: { life: 6, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Monstrous Rage")], battlefield: [c("Cursed Courtier"), c("Cursed", { attachedTo: "cursed-courtier" }), c("Hill Giant"), c("Mountain")] },
      explanation: "Cursed Courtier is stuck as a 1/1 under its own Cursed Role. Put a Monster Role on it: you can only have one Role on a creature, so the newer Monster Role stays and the Cursed one is gone. A 6/4 trampler plus Hill Giant.",
      notes: `
LETHAL: Monstrous Rage on Cursed Courtier: +2/+0 and a Monster Role. CR 704.5z: you control both Roles on it, so the
  older (Cursed) goes to the graveyard. Courtier: 3/3 +1/+1 +2/+0 = 6/4 trample. Attack with it and Hill Giant: Wall
  blocks the Courtier (3 tramples over) → 3 + 3; blocks the Giant → 6.
RULES: Roles (303.7a, 704.5z). Cursed Role sets base power and toughness 1/1 (layer 7b).
WRONG LINES: Rage on Hill Giant: 6 trample but the Courtier is 1/1: Wall blocks the Giant → 3 + 1.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "woe-07-wicked-bargain", title: "Wicked Bargain", set: "woe", tier: "hard",
      opp: { life: 4, battlefield: [c("Siege Mastodon")] },
      you: { hand: [c("Conceited Witch"), c("Candy Grapple")], battlefield: [c("Hill Giant"), ...many(3, "Swamp")] },
      explanation: "You have nothing to bargain, so make something: Price of Beauty (the Witch's Adventure) puts a Wicked Role on Hill Giant. Bargain that Role to Candy Grapple: the opponent loses 1 as it goes to the graveyard, and -5/-5 kills the Mastodon.",
      notes: `
LETHAL: Price of Beauty ({B}): Wicked Role on Hill Giant. Candy Grapple ({1}{B}) on Siege Mastodon, bargaining the Wicked
  Role: it's put into the graveyard: each opponent loses 1 (3). -5/-5: the Mastodon dies. Hill Giant: 3.
RULES: A Role is an enchantment token: it can be bargained. Wicked Role: "When this token is put into a graveyard from the
  battlefield, each opponent loses 1 life" (111.10q).
WRONG LINES: Grapple unbargained: the Mastodon (0/2) still blocks. Casting Conceited Witch: no Role.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "woe-08-party-crashers", title: "Party Crashers", set: "woe", tier: "hard",
      opp: { life: 7, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Become Brutes")], battlefield: [c("Ash, Party Crasher"), c("Gallant Pie-Wielder", { sick: true }), c("Mountain"), c("Mountain")] },
      explanation: "Become Brutes on both: Gallant Pie-Wielder gets haste, and the two Monster Roles are two nonland permanents entering. That's a celebration: Pie-Wielder gets double strike and Ash grows when it attacks.",
      notes: `
LETHAL: Become Brutes ({1}{R}) on Ash and Gallant Pie-Wielder: haste and a Monster Role each (two tokens entered:
  celebration). Pie-Wielder 3/4 double strike, trample; Ash 3/3 trample, attacks: +1/+1 counter (4/4).
  Wall of Wood blocks Ash: 1 tramples over + 3 + 3 = 7. Blocks Pie-Wielder: 3 first strike kills it, 3 more trample
  through + Ash 4 = 7.
RULES: Role tokens are nonland permanents (celebration). Ash's trigger has an intervening "if" (603.4).
WRONG LINES: Brutes on the Pie-Wielder only: one Role, no celebration.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "woe-09-champions-bargain", title: "Champion's Bargain", set: "woe", tier: "hard",
      opp: { life: 3, battlefield: [c("Hill Giant"), c("Wall of Stone")] },
      you: { hand: [c("Agatha's Champion"), c("Become Brutes")], battlefield: [c("Food"), c("Grizzly Bears"), ...many(6, "Forest"), c("Mountain")] },
      explanation: "Bargain the Food so Agatha's Champion fights Hill Giant as it enters. Then Become Brutes on the Champion (haste) and Grizzly Bears: Wall of Stone can only stop one of them.",
      notes: `
LETHAL: Agatha's Champion ({4}{G}), bargaining the Food: it fights Hill Giant (4 vs 3: the Giant dies, the Champion has
  3 damage). Become Brutes ({1}{R}) on the Champion and Grizzly Bears: haste, Monster Roles: 5/5 trample and 3/3 trample.
  Wall of Stone (0/8) blocks the Champion: Bears 3. Blocks the Bears: Champion 5.
RULES: The fight is an "if it was bargained" enters trigger. Trample can't get past an 0/8 with 5 or 3 power.
WRONG LINES: Fighting Wall of Stone (it survives, the Giant blocks too). Brutes on the Champion alone: the Wall blocks
  it and the 2/2 Bears deal 2. Not bargaining: no fight, so both attackers can be blocked.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "woe-10-double-bargain", title: "Double Bargain", set: "woe", tier: "hard",
      opp: { life: 6, battlefield: [c("Siege Mastodon")] },
      you: { hand: [c("High Fae Negotiator"), c("Candy Grapple")], battlefield: [c("Hill Giant"), c("Food"), c("Food"), ...many(7, "Swamp")] },
      explanation: "Each Food pays for one bargain. High Fae Negotiator, bargained, drains 3 as it enters. Candy Grapple, bargained, kills the Mastodon. Hill Giant does the rest.",
      notes: `
LETHAL: High Fae Negotiator ({3}{B}{B}) bargaining a Food: enters bargained: each opponent loses 3 (3). Candy Grapple
  ({1}{B}) bargaining the other Food: -5/-5, Siege Mastodon dies. Hill Giant: 3.
RULES: "If it was bargained" (702.166c) on a permanent: its enters trigger checks how it was cast.
WRONG LINES: Either spell unbargained: no drain, or the Mastodon survives as a 0/2 blocker.
UNIQUENESS: Solver-checked (the two Foods are interchangeable).`
    })
  );

  /* ======================= THE LOST CAVERNS OF IXALAN (set LCI) ======================= */
  // Explore, discover, descend, craft, Map tokens — with known cards on top of your library
  window.PUZZLES.push(
    puzzle({
      id: "lci-01-unseen-currents", title: "Unseen Currents", set: "lci", tier: "easy",
      opp: { life: 3, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Cenote Scout")], battlefield: [c("Merfolk Cave-Diver"), c("Forest")], library: [c("Grizzly Bears")] },
      explanation: "Cenote Scout explores as it enters. Whenever a creature you control explores, Merfolk Cave-Diver gets +1/+0 and can't be blocked: a 3/4 the Wall can't stop.",
      notes: `
LETHAL: Cenote Scout ({G}): it explores (Grizzly Bears on top: nonland, a +1/+1 counter on the Scout; top or graveyard,
  either way). Merfolk Cave-Diver's trigger: 3/4, can't be blocked. Attack: 3.
RULES: Explore (701.44): "explores" happens whatever was revealed (701.44b).
WRONG LINES: Attacking without the Scout: the Wall blocks.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "lci-02-into-the-depths", title: "Into the Depths", set: "lci", tier: "easy",
      opp: { life: 6, battlefield: [c("Wall of Wood"), c("Grizzly Bears"), c("Gray Ogre")] },
      you: { hand: [c("Daring Discovery")], battlefield: [c("Hill Giant"), ...many(5, "Mountain")], library: [c("Mountain"), c("Lightning Bolt")] },
      explanation: "Daring Discovery stops all three blockers, then discovers 4: the Mountain on top is skipped, and Lightning Bolt is cast for free at the opponent. Bolt plus Hill Giant: 6.",
      notes: `
LETHAL: Daring Discovery ({4}{R}) targeting Wall of Wood, Grizzly Bears and Gray Ogre: they can't block. Discover 4:
  exile the Mountain (a land), then Lightning Bolt (mana value 1): cast it free at the opponent (3). Hill Giant: 3.
RULES: Discover (701.57): the land goes to the bottom; the found card is cast without paying its cost or put in hand.
WRONG LINES: Bolt into your hand: no mana left. Leaving a blocker untargeted.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "lci-03-dig-deep", title: "Dig Deep", set: "lci", tier: "easy",
      opp: { life: 4 },
      you: { hand: [c("Deathcap Marionette")], battlefield: [c("Basking Capybara"), c("Swamp"), c("Swamp")],
        library: [c("Forest"), c("Hill Giant")], graveyard: [c("Forest"), c("Grizzly Bears"), c("Lightning Bolt")] },
      explanation: "Basking Capybara needs four permanent cards in your graveyard (Lightning Bolt doesn't count). Deathcap Marionette mills a Forest and Hill Giant: now there are four, and the Capybara is a 4/3.",
      notes: `
LETHAL: Deathcap Marionette ({1}{B}): mill two (Forest, Hill Giant). Graveyard: Forest, Grizzly Bears, Forest, Hill
  Giant = 4 permanent cards (+ Bolt). Basking Capybara: descend 4: 4/3. Attack: 4.
RULES: Descend: permanent cards (lands, creatures…) in your graveyard; instants and sorceries don't count.
WRONG LINES: Not milling (it's optional): 1/3.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "lci-04-forged-anew", title: "Forged Anew", set: "lci", tier: "easy",
      opp: { life: 5 },
      you: { battlefield: [c("Hill Giant"), c("Idol of the Deep King"), c("Map"), ...many(3, "Mountain")], library: [c("Lightning Bolt")] },
      explanation: "Craft Idol of the Deep King, exiling the Map as its material: it comes back as Sovereign's Macuahuitl, which attaches to Hill Giant as it enters. 5 damage.",
      notes: `
LETHAL: Craft with artifact {2}{R}: exile the Idol and the Map; the Idol returns transformed: Sovereign's Macuahuitl,
  attached to Hill Giant (+2/+0). Attack: 5.
RULES: Craft (702.167a): sorcery speed; the material can be another artifact you control or one in your graveyard.
WRONG LINES: Using the Map to explore (Bolt on top: a counter): 4.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "lci-05-deeper-still", title: "Deeper Still", set: "lci", tier: "medium",
      opp: { life: 7, battlefield: [c("Giant Spider"), c("Wall of Wood")] },
      you: { hand: [c("Over the Edge"), c("Ancestors' Aid")], battlefield: [c("Merfolk Cave-Diver"), c("Forest"), c("Island"), c("Forest")],
        library: [c("Mountain"), c("Grizzly Bears")] },
      explanation: "Over the Edge: Merfolk Cave-Diver explores twice. The first finds a Mountain (to your hand: play it), the second Grizzly Bears (+1/+1 counter). Two explores, two triggers: an unblockable 5/5. The Mountain pays for Ancestors' Aid: 7.",
      notes: `
LETHAL: Over the Edge ({1}{G}), explore mode, on Merfolk Cave-Diver: explore 1: Mountain → hand; explore 2: Grizzly
  Bears → +1/+1 counter. Two Cave-Diver triggers: +2/+0, can't be blocked: 5/5. Play the Mountain; Ancestors' Aid
  ({1}{R}: Mountain + Forest): +2/+0, first strike. Attack: 7.
RULES: A land revealed by explore goes to your hand, and you haven't played a land this turn.
WRONG LINES: Ancestors' Aid needs the Mountain: cast Over the Edge first.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "lci-06-appraisal", title: "Appraisal", set: "lci", tier: "medium",
      opp: { life: 3, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Geological Appraiser")], battlefield: [c("Hill Giant"), ...many(4, "Mountain")],
        library: [c("Forest"), c("Panicked Altisaur"), c("Staggering Size")] },
      explanation: "Geological Appraiser discovers 3: it skips the Forest and Panicked Altisaur (mana value 5) and finds Staggering Size. Cast it free on Hill Giant: 6/6 trample, 3 over the Wall. (You couldn't cast it from hand: no green mana.)",
      notes: `
LETHAL: Geological Appraiser ({2}{R}{R}): you cast it, so discover 3: Forest (land) and Panicked Altisaur (MV 5) are
  skipped; Staggering Size (MV 2): cast free on Hill Giant: 6/6 trample. Wall of Wood blocks: 3 through.
RULES: Discover casts without paying (no green needed). The skipped cards go to the bottom.
WRONG LINES: Staggering Size into your hand: you have no {G}.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "lci-07-join-the-dead", title: "Join the Dead", set: "lci", tier: "hard",
      opp: { life: 4, battlefield: [c("Colossal Dreadmaw")] },
      you: { hand: [c("Deathcap Marionette"), c("Join the Dead")],
        battlefield: [c("Hill Giant"), c("Cenote Scout", { sick: true }), c("Map"), ...many(6, "Swamp")],
        library: [c("Grizzly Bears"), c("Wall of Wood"), c("Gray Ogre")], graveyard: [c("Forest")] },
      explanation: "Fill your graveyard to four permanent cards: Deathcap Marionette mills two, and the Map makes Hill Giant explore Gray Ogre (a counter, and the Ogre into the graveyard). Join the Dead is then -10/-10: the Dreadmaw dies, and the 4/4 Giant hits for 4.",
      notes: `
LETHAL: Deathcap Marionette ({1}{B}): mill Grizzly Bears and Wall of Wood (graveyard: 3). Map ({1}) on Hill Giant:
  explore Gray Ogre: +1/+1 counter, Ogre into the graveyard (4). Join the Dead ({1}{B}{B}): descend 4: -10/-10,
  Colossal Dreadmaw (6/6) dies. Hill Giant 4/4: 4.
RULES: Descend counts permanent cards; explore lets you put a nonland card into your graveyard.
WRONG LINES: -5/-5 leaves the Dreadmaw a 1/1 blocker. The Map on the summoning-sick Scout: Giant only 3.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "lci-08-map-room", title: "Map Room", set: "lci", tier: "hard",
      opp: { life: 6, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Kinjalli's Dawnrunner"), c("Spyglass Siren")],
        battlefield: [c("Merfolk Cave-Diver"), c("Map"), c("Plains"), c("Plains"), c("Island"), c("Island")],
        library: [c("Grizzly Bears"), c("Island"), c("Hill Giant")] },
      explanation: "Spyglass Siren brings a second Map. Use both on Merfolk Cave-Diver: each explore gives +1/+0 and unblockable. Keep Grizzly Bears on top after the first explore, so the second explore finds it again: two counters. 6 unblockable.",
      notes: `
LETHAL: Spyglass Siren ({U}): a second Map. Map ({1}) on Cave-Diver: Grizzly Bears: +1/+1 counter; leave it on top.
  Map ({1}) again: Grizzly Bears again: another counter. Two Cave-Diver triggers: +2/+0, can't be blocked.
  2/4 + 2 counters + 2/+0 = 6/6 unblockable.
RULES: After a nonland card is explored you choose top or graveyard (701.44a).
WRONG LINES: Bears into the graveyard: the second explore finds the Island (to hand, no counter): 5. Kinjalli's
  Dawnrunner (3 mana) leaves only one Map affordable.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "lci-09-chupacabra", title: "Chupacabra", set: "lci", tier: "hard",
      opp: { life: 3, battlefield: [c("Siege Mastodon")] },
      you: { hand: [c("Chupacabra Echo"), c("Mineshaft Spider")], battlefield: [c("Hill Giant"), ...many(4, "Swamp"), ...many(4, "Forest")],
        library: [c("Grizzly Bears"), c("Forest")], graveyard: [c("Swamp"), c("Gray Ogre"), c("Mountain")] },
      explanation: "Chupacabra Echo shrinks a creature by the number of permanent cards in your graveyard. Three isn't enough for Siege Mastodon (3/5). Mineshaft Spider first, milling two more: -5/-5 and the Giant is free.",
      notes: `
LETHAL: Mineshaft Spider ({3}{G}): mill Grizzly Bears and Forest (graveyard: 5 permanent cards). Chupacabra Echo
  ({2}{B}{B}): -5/-5 on Siege Mastodon: dies. Hill Giant: 3.
RULES: Fathomless descent counts as the trigger resolves.
WRONG LINES: Echo first: -3/-3, the Mastodon blocks as a 0/2.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "lci-10-sovereign", title: "Sovereign", set: "lci", tier: "hard",
      opp: { life: 5, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Idol of the Deep King")], battlefield: [c("Hill Giant"), c("Map"), ...many(6, "Mountain")], library: [c("Lightning Bolt")] },
      explanation: "Cast Idol of the Deep King and use its 2 damage on Grizzly Bears. Then craft the Idol with the Map: it returns as Sovereign's Macuahuitl on Hill Giant. 5 damage, no blocker.",
      notes: `
LETHAL: Idol of the Deep King ({2}{R}): 2 damage to Grizzly Bears (dies). Craft {2}{R}, exiling the Map: Sovereign's
  Macuahuitl, attached to Hill Giant: 5/3. Attack: 5.
RULES: Craft is sorcery speed; the Idol can craft the turn it enters (no {T} in the cost).
WRONG LINES: The Idol's 2 damage to the face: the Bears block. The Map on the Giant: a counter, 4.
UNIQUENESS: Solver-checked.`
    })
  );

  /* ======================= MURDERS AT KARLOV MANOR (set MKM) ======================= */
  // Disguise (face-down 2/2s with ward 2), suspect, investigate and Clues, collect evidence, Cases
  window.PUZZLES.push(
    puzzle({
      id: "mkm-01-prime-suspect", title: "Prime Suspect", set: "mkm", tier: "easy",
      opp: { life: 5, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Convenient Target")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Mountain")] },
      explanation: "A suspected creature can't block. Put Convenient Target on the opponent's Grizzly Bears: it's a suspect now, so Hill Giant and Gray Ogre attack freely for 5.",
      notes: `
LETHAL: Convenient Target ({R}) on Grizzly Bears: it's suspected (menace, can't block). Attack with Hill Giant and Gray
  Ogre: no blockers: 5.
RULES: Suspected (701.60c): menace and "This creature can't block". An Aura can enchant any creature.
WRONG LINES: Target on Hill Giant: 4/4 menace, the Bears block the Ogre: 4. On Gray Ogre: 3/3 menace, the Bears block
  the Giant: 3.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mkm-02-unmasked", title: "Unmasked", set: "mkm", tier: "easy",
      opp: { life: 5, battlefield: [c("Grizzly Bears")] },
      you: { battlefield: [c("Alley Assailant", { faceDown: true }), c("Gray Ogre"), ...many(6, "Swamp")] },
      explanation: "Your face-down creature is Alley Assailant. Turning it face up (its disguise cost, {4}{B}{B}) drains 3. Attack with both: Grizzly Bears blocks one, the other deals at least 2.",
      notes: `
LETHAL: Turn Alley Assailant face up ({4}{B}{B}): the opponent loses 3 (2 left). Attack with it (3/3) and Gray Ogre:
  the Bears block one, the other deals 3 or 2. (Turning it up after blocks works the same: 2 + 3.)
RULES: Disguise (702.168d): turning face up is a special action, any time you have priority, no stack. It doesn't
  enter the battlefield, so "enters tapped" doesn't apply (708.8).
WRONG LINES: Attacking without turning it up: 2.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mkm-03-case-closed", title: "Case Closed", set: "mkm", tier: "easy",
      opp: { life: 7, battlefield: [c("Hill Giant")] },
      you: { hand: [c("Case of the Gateway Express")],
        battlefield: [c("Case of the Gateway Express", { solved: true }), c("Elite Vanguard"), c("Savannah Lions"), c("Glory Seeker"), c("Plains"), c("Plains")] },
      explanation: "Your solved Case gives your creatures +1/+0. A second Case of the Gateway Express makes each of your three creatures deal 1 damage to Hill Giant: it dies, and three 3-power attackers deal 9.",
      notes: `
LETHAL: Case of the Gateway Express ({1}{W}) targeting Hill Giant: Elite Vanguard, Savannah Lions and Glory Seeker each
  deal 1: 3 damage, it dies. Attack with all three (3/1, 3/1, 3/2 with the solved Case): 9.
RULES: Cases (719.3): the solved one's "Solved — creatures you control get +1/+0" works; the new one isn't solved (it
  could only solve at your end step).
WRONG LINES: Attacking into the Giant: it blocks one, 6.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mkm-04-evidence-locker", title: "Evidence Locker", set: "mkm", tier: "easy",
      opp: { life: 5, battlefield: [c("Siege Mastodon")] },
      you: { hand: [c("Bite Down on Crime")], battlefield: [c("Hill Giant"), c("Forest"), c("Forest")],
        graveyard: [c("Colossal Dreadmaw"), c("Lightning Bolt")] },
      explanation: "Collect evidence 6 by exiling Colossal Dreadmaw from your graveyard: Bite Down on Crime costs {2} less, just {1}{G}. Hill Giant becomes 5/3 and deals 5 to Siege Mastodon. Then it attacks for 5.",
      notes: `
LETHAL: Bite Down on Crime, collecting evidence 6 (exile Colossal Dreadmaw, mana value 6): {1}{G}. Hill Giant +2/+0
  (5/3) deals 5 to Siege Mastodon (3/5): dies. Attack: 5.
RULES: Collect evidence (701.59a): exile cards from your graveyard with total mana value 6 or more. Bite: only your
  creature deals damage.
WRONG LINES: Without evidence it costs {3}{G}: you have two lands. Lightning Bolt (mana value 1) isn't enough evidence.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mkm-05-ward-off", title: "Ward Off", set: "mkm", tier: "medium",
      opp: { life: 6, battlefield: [c("Defenestrated Phantom", { faceDown: true, id: "face-down" })] },
      you: { hand: [c("Shock"), c("The Chase Is On")], battlefield: [c("Hill Giant"), ...many(6, "Mountain")] },
      explanation: "The opponent's face-down creature is a 2/2 with ward {2}. Shock it and pay the ward: 3 mana. The other 3 pay for The Chase Is On: a 6/3 Hill Giant with no blocker left.",
      notes: `
LETHAL: Shock ({R}) the face-down creature; ward {2} triggers: pay {2}. 2 damage: the 2/2 dies. The Chase Is On
  ({2}{R}) on Hill Giant: 6/3 first strike. Attack: 6.
RULES: A face-down creature is a 2/2 with ward {2} (702.168a). Ward counters the spell unless its cost is paid
  (702.21a). It's the opponent's: it stays face down (the opponent never acts).
WRONG LINES: Shock to the face + Chase: the face-down blocks the Giant, 2. Not enough mana for both Chase and a warded
  Shock if the Clue is cracked.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mkm-06-caught-red-handed", title: "Caught Red-Handed", set: "mkm", tier: "medium",
      opp: { life: 3, battlefield: [c("Siege Mastodon"), c("Grizzly Bears")] },
      you: { hand: [c("Caught Red-Handed")], battlefield: [c("Hill Giant"), ...many(5, "Mountain")] },
      explanation: "Take Siege Mastodon: it's untapped, has haste and is suspected (menace, can't block). Grizzly Bears alone can't block a menace creature, so the Mastodon's 3 gets in.",
      notes: `
LETHAL: Caught Red-Handed ({4}{R}) on Siege Mastodon: you control it, untapped, haste, suspected (menace). Attack with
  it: the Bears alone can't block it (menace): 3.
RULES: Suspect (701.60c). Gain control until end of turn; haste lets it attack.
WRONG LINES: Taking the Bears: the Mastodon blocks the Giant and the Bears deal 2. Attacking without it: blocked.
UNIQUENESS: Solver-checked (attacking with Hill Giant as well also wins: a bigger version of the same plan).`
    }),
    puzzle({
      id: "mkm-07-dog-walker", title: "Dog Walker", set: "mkm", tier: "hard",
      opp: { life: 8, battlefield: [c("Wall of Wood"), c("Grizzly Bears")] },
      you: { hand: [c("Dog Walker"), c("The Chase Is On")], battlefield: [c("Wispdrinker Vampire"), ...many(4, "Plains"), ...many(4, "Mountain")] },
      explanation: "Wispdrinker Vampire drains 1 for each creature with power 2 or less that enters. Cast Dog Walker face down (a 2/2: drain), then turn it face up for two Dogs (two drains). The Chase Is On makes the Vampire a 5/4 flyer: 3 + 5.",
      notes: `
LETHAL: Dog Walker face down ({3}): a 2/2 enters: drain 1 (7). Turn it face up ({R/W}{R/W}): two tapped 1/1 Dogs
  enter: drain 2 (5). The Chase Is On ({2}{R}) on Wispdrinker Vampire: 5/4 flying first strike. Attack: 5.
RULES: A face-down creature entering is a 2/2 (power 2 or less). Turning face up isn't entering (708.8): no drain for
  the 3/1. The Wall and the Bears can't block a flyer.
WRONG LINES: Dog Walker face up ({R}{W}): power 3, no drain, no Dogs: 5. Cracking the Clue instead of turning it up.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mkm-08-two-faces", title: "Two Faces", set: "mkm", tier: "hard",
      opp: { life: 6, battlefield: [c("Wall of Wood"), c("Giant Spider")] },
      you: { battlefield: [c("Granite Witness", { faceDown: true }), c("Bolrac-Clan Basher", { faceDown: true }),
        c("Plains"), c("Island"), ...many(5, "Mountain")] },
      explanation: "Turn Granite Witness face up first and tap Giant Spider, the only creature that can block a flyer. Attack with both: the Witness flies in for 3. Bolrac-Clan Basher (turn it up too) has double strike and trample: if the Wall blocks it, first strike kills the Wall and the second hit tramples over for 3.",
      notes: `
LETHAL: Turn Granite Witness face up ({W/U}{W/U}: Plains + Island): tap Giant Spider. Turn Bolrac-Clan Basher face up
  ({3}{R}{R}: Mountains), before or after blocks. Attack with both. Wall of Wood can't block the flying Witness: 3.
  The Wall blocks the Basher: first strike 3 kills it (0/3); regular damage: blocked, no blocker left, trample: all 3
  to the player (702.19e). No block: 6 + 3.
RULES: Turning face up is a special action at any priority (116.2b). A first-strike damage step happens if a first or
  double striker is in combat when combat damage would begin.
WRONG LINES: Tapping the Wall: the Spider blocks the Basher (3 first strike, then 1 lethal and 2 trample) = 3 + 2 = 5.
  Attacking with the Witness face down: the Spider blocks it.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mkm-09-burning-masks", title: "Burning Masks", set: "mkm", tier: "hard",
      opp: { life: 6, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Case of the Burning Masks")],
        battlefield: [c("Case of the Burning Masks", { solved: true }), c("Hill Giant"), ...many(4, "Mountain")],
        library: [c("Grizzly Bears"), c("Lightning Bolt"), c("Mountain")] },
      explanation: "The new Case burns away Wall of Wood. Sacrifice the solved Case to exile your top three cards and choose Lightning Bolt: the last Mountain casts it. Bolt plus Hill Giant: 6.",
      notes: `
LETHAL: Case of the Burning Masks ({1}{R}{R}): 3 damage to Wall of Wood: dies. Sacrifice the solved Case: exile Grizzly
  Bears, Lightning Bolt and Mountain; choose Bolt: cast it ({R}) at the opponent: 3. Hill Giant: 3.
RULES: Cases (719.3c): only a solved Case has its Solved ability. The chosen card may be played this turn from exile.
WRONG LINES: Choosing the Mountain (an extra land, nothing to spend it on): 3. Bolting the Wall: the new Case needs a
  creature target, Giant 3. Grizzly Bears can't attack this turn.
UNIQUENESS: Solver-checked.`
    }),
    puzzle({
      id: "mkm-10-interrogation", title: "Interrogation", set: "mkm", tier: "hard",
      opp: { life: 20, poison: 4 },
      you: { hand: [c("Deduce")], battlefield: [c("Persuasive Interrogators"), c("Crime Novelist"), c("Clue"),
        c("Island"), c("Plains"), ...many(5, "Swamp")], library: [c("Novice Inspector")] },
      explanation: "Each Clue you sacrifice gives 2 poison: you need three. Crack the Clue (draw Novice Inspector), Deduce and the Inspector make two more. Crime Novelist adds {R} each time you sacrifice an artifact, which pays for the next Clue.",
      notes: `
LETHAL: Three Clues sacrificed: 4 + 6 = 10 poison. Mana: Clue ({2}) → {R} back, draws Novice Inspector; Deduce ({1}{U},
  the {R} + Island) → Clue; Novice Inspector ({W}) → Clue; Clue ({2}) → {R}; Clue ({R} + a land). 7 lands.
RULES: Investigate (701.16a). Crime Novelist's trigger isn't a mana ability (a sacrifice to an activated ability's cost):
  it resolves and adds {R}. Poison: 10 loses (704.5c).
WRONG LINES: Without using the Novelist's mana: 9 needed. Deduce first: it draws the Inspector, the same plan.
UNIQUENESS: Solver-checked (the order of the steps is free).`
    })
  );

  // The catalog and helpers, for tools that build puzzles (a puzzle maker is planned again later)
  window.CARD_CATALOG = { CARDS, c, puzzle };
})();
