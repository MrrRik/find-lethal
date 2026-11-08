/* Set puzzles 11-20: each set's rares and mythics. Each board is one of the set's puzzles 1-10 plus one rare or mythic
 * of that set (in hand with the lands to cast it, or on the battlefield), solver-checked: the opponent's life is exactly
 * the most damage the board can deal (poison puzzles: their poison is the fewest the board can win from), only one plan
 * does it, and that plan needs the rare. Loaded after rares.js, where these cards live. Each puzzle has hidden notes.
 */
(() => {
  const { c, puzzle } = window.CARD_CATALOG;
  window.PUZZLES.push(
    // ---- Phyrexia: All Will Be One (ONE) ----
    puzzle({
      id: "one-11-karumonix", title: "Karumonix", set: "one", tier: "easy",
      opp: { life: 20, poison: 7, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Tyrranax Atrocity")], battlefield: [c("Branchblight Stalker"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Karumonix, the Rat King")] },
      explanation: "Cast Tyrranax Atrocity → attack with Branchblight Stalker + Karumonix, the Rat King + Tyrranax Atrocity.",
      notes: `
LETHAL: cast Tyrranax Atrocity → attack with Branchblight Stalker + Karumonix, the Rat King + Tyrranax Atrocity → (opponent: Grizzly Bears blocks Tyrranax Atrocity): ten poison counters from 7 (the fewest this board can win from).
RULES: The board of one-01-fresh-venom plus Karumonix, the Rat King (rare) on the battlefield.
WRONG LINES: Without Karumonix, the Rat King: it needs at least 8 poison to start. Any other order or target falls short.
UNIQUENESS: Solver-checked: one plan wins from 7 poison; 6 poison isn't enough.`
    }),
    puzzle({
      id: "one-12-tyrranax-rex", title: "Tyrranax Rex", set: "one", tier: "easy",
      opp: { life: 20, poison: 3, battlefield: [c("Giant Spider"), c("Elite Vanguard")] },
      you: { hand: [c("Whisper of the Dross")], battlefield: [c("Jawbone Duelist"), c("Branchblight Stalker"), c("Swamp"), c("Tyrranax Rex")] },
      explanation: "Cast Whisper of the Dross →Elite Vanguard → Proliferate: Add one → attack with Branchblight Stalker + Jawbone Duelist + Tyrranax Rex.",
      notes: `
LETHAL: cast Whisper of the Dross →Elite Vanguard → Proliferate: Add one → attack with Branchblight Stalker + Jawbone Duelist + Tyrranax Rex → (opponent: Giant Spider blocks Branchblight Stalker): ten poison counters from 3 (the fewest this board can win from).
RULES: The board of one-04-spread-the-sickness plus Tyrranax Rex (mythic) on the battlefield.
WRONG LINES: Without Tyrranax Rex: it needs at least 7 poison to start. Any other order or target falls short.
UNIQUENESS: Solver-checked: one plan wins from 3 poison; 2 poison isn't enough.`
    }),
    puzzle({
      id: "one-13-venerated-rotpriest", title: "Venerated Rotpriest", set: "one", tier: "easy",
      opp: { life: 20, poison: 7, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Tyrranax Atrocity")], battlefield: [c("Branchblight Stalker"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Venerated Rotpriest")] },
      explanation: "Cast Tyrranax Atrocity → attack with Branchblight Stalker + Tyrranax Atrocity + Venerated Rotpriest.",
      notes: `
LETHAL: cast Tyrranax Atrocity → attack with Branchblight Stalker + Tyrranax Atrocity + Venerated Rotpriest → (opponent: Grizzly Bears blocks Tyrranax Atrocity): ten poison counters from 7 (the fewest this board can win from).
RULES: The board of one-01-fresh-venom plus Venerated Rotpriest (rare) on the battlefield.
WRONG LINES: Without Venerated Rotpriest: it needs at least 8 poison to start. Any other order or target falls short.
UNIQUENESS: Solver-checked: one plan wins from 7 poison; 6 poison isn't enough.`
    }),
    puzzle({
      id: "one-14-venser", title: "Venser", set: "one", tier: "easy",
      opp: { life: 20, poison: 6, battlefield: [c("Giant Spider"), c("Elite Vanguard")] },
      you: { hand: [c("Whisper of the Dross")], battlefield: [c("Jawbone Duelist"), c("Branchblight Stalker"), c("Swamp"), c("Venser, Corpse Puppet")] },
      explanation: "Cast Whisper of the Dross →Elite Vanguard → Proliferate: Add one → attack with Branchblight Stalker + Jawbone Duelist + Venser, Corpse Puppet.",
      notes: `
LETHAL: cast Whisper of the Dross →Elite Vanguard → Proliferate: Add one → attack with Branchblight Stalker + Jawbone Duelist + Venser, Corpse Puppet → (opponent: Giant Spider blocks Branchblight Stalker): ten poison counters from 6 (the fewest this board can win from).
RULES: The board of one-04-spread-the-sickness plus Venser, Corpse Puppet (rare) on the battlefield.
WRONG LINES: Without Venser, Corpse Puppet: it needs at least 7 poison to start. Any other order or target falls short.
UNIQUENESS: Solver-checked: one plan wins from 6 poison; 5 poison isn't enough.`
    }),
    puzzle({
      id: "one-15-vraska", title: "Vraska", set: "one", tier: "medium",
      opp: { life: 20, poison: 5, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Chrome Prowler")], battlefield: [c("Ribskiff"), c("Branchblight Stalker"), c("Island"), c("Island"), c("Island"), c("Vraska, Betrayal's Sting")] },
      explanation: "Cast Chrome Prowler → Chrome Prowler → Wall of Wood → activate Ribskiff (Crew 3) (crewed by Chrome Prowler) → activate Vraska, Betrayal's Sting (0: You draw a card and lose 1 life. Proliferate.) → Proliferate: Add one → Proliferate: Add one → attack with Branchblight Stalker + Ribskiff.",
      notes: `
LETHAL: cast Chrome Prowler → Chrome Prowler → Wall of Wood → activate Ribskiff (Crew 3) (crewed by Chrome Prowler) → activate Vraska, Betrayal's Sting (0: You draw a card and lose 1 life. Proliferate.) → Proliferate: Add one → Proliferate: Add one → attack with Branchblight Stalker + Ribskiff → (opponent: no blocks): ten poison counters from 5 (the fewest this board can win from).
RULES: The board of one-05-sick-crew plus Vraska, Betrayal's Sting (mythic) on the battlefield.
WRONG LINES: Without Vraska, Betrayal's Sting: it needs at least 6 poison to start. Any other order or target falls short.
UNIQUENESS: Solver-checked: one plan wins from 5 poison; 4 poison isn't enough.`
    }),
    puzzle({
      id: "one-16-staff-of-compleation", title: "Staff of Compleation", set: "one", tier: "medium",
      opp: { life: 20, poison: 5, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Chrome Prowler")], battlefield: [c("Ribskiff"), c("Branchblight Stalker"), c("Island"), c("Island"), c("Island"), c("Staff of Compleation")] },
      explanation: "Cast Chrome Prowler → Chrome Prowler → Wall of Wood → activate Ribskiff (Crew 3) (crewed by Chrome Prowler) → activate Staff of Compleation ({T}, Pay 3 life: Proliferate) → Proliferate: Add one → attack with Branchblight Stalker + Ribskiff.",
      notes: `
LETHAL: cast Chrome Prowler → Chrome Prowler → Wall of Wood → activate Ribskiff (Crew 3) (crewed by Chrome Prowler) → activate Staff of Compleation ({T}, Pay 3 life: Proliferate) → Proliferate: Add one → attack with Branchblight Stalker + Ribskiff → (opponent: no blocks): ten poison counters from 5 (the fewest this board can win from).
RULES: The board of one-05-sick-crew plus Staff of Compleation (mythic) on the battlefield.
WRONG LINES: Without Staff of Compleation: it needs at least 6 poison to start. Any other order or target falls short.
UNIQUENESS: Solver-checked: one plan wins from 5 poison; 4 poison isn't enough.`
    }),
    puzzle({
      id: "one-17-kemba", title: "Kemba", set: "one", tier: "hard",
      opp: { life: 5, battlefield: [] },
      you: { hand: [c("Vulshok Splitter"), c("Kemba, Kha Enduring")], battlefield: [c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Plains"), c("Plains")] },
      explanation: "Cast Kemba, Kha Enduring → cast Vulshok Splitter → activate Vulshok Splitter (Equip {2}{R}) → Gray Ogre → attack with Gray Ogre.",
      notes: `
LETHAL: cast Kemba, Kha Enduring → cast Vulshok Splitter → activate Vulshok Splitter (Equip {2}{R}) → Gray Ogre → attack with Gray Ogre → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: The board of one-02-rebel-arms plus Kemba, Kha Enduring (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without Kemba, Kha Enduring: at most 4. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "one-18-urabrask-s-forge", title: "Urabrask's Forge", set: "one", tier: "hard",
      opp: { life: 5, battlefield: [] },
      you: { hand: [c("Vulshok Splitter"), c("Urabrask's Forge")], battlefield: [c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Vulshok Splitter → cast Urabrask's Forge → activate Vulshok Splitter (Equip {2}{R}) → Gray Ogre → attack with Gray Ogre + Phyrexian Horror.",
      notes: `
LETHAL: cast Vulshok Splitter → cast Urabrask's Forge → activate Vulshok Splitter (Equip {2}{R}) → Gray Ogre → attack with Gray Ogre + Phyrexian Horror → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: The board of one-02-rebel-arms plus Urabrask's Forge (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Urabrask's Forge: at most 4. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "one-19-koth", title: "Koth", set: "one", tier: "hard",
      opp: { life: 20, poison: 5, battlefield: [c("Giant Spider"), c("Elite Vanguard")] },
      you: { hand: [c("Whisper of the Dross"), c("Koth, Fire of Resistance")], battlefield: [c("Jawbone Duelist"), c("Branchblight Stalker"), c("Swamp"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Whisper of the Dross →Elite Vanguard → Proliferate: Add one → cast Koth, Fire of Resistance → activate Koth, Fire of Resistance (−3: Koth deals damage to target creature equal to the number of Mountains you control.) → Giant Spider → attack with Branchblight Stalker + Jawbone Duelist.",
      notes: `
LETHAL: cast Whisper of the Dross →Elite Vanguard → Proliferate: Add one → cast Koth, Fire of Resistance → activate Koth, Fire of Resistance (−3: Koth deals damage to target creature equal to the number of Mountains you control.) → Giant Spider → attack with Branchblight Stalker + Jawbone Duelist → (opponent: no blocks): ten poison counters from 5 (the fewest this board can win from).
RULES: The board of one-04-spread-the-sickness plus Koth, Fire of Resistance (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Koth, Fire of Resistance: it needs at least 7 poison to start. Any other order or target falls short.
UNIQUENESS: Solver-checked: one plan wins from 5 poison; 4 poison isn't enough.`
    }),
    puzzle({
      id: "one-20-blade-of-shared-souls", title: "Blade of Shared Souls", set: "one", tier: "hard",
      opp: { life: 20, poison: 5, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Tyrranax Atrocity"), c("Blade of Shared Souls")], battlefield: [c("Branchblight Stalker"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Island"), c("Island"), c("Island")] },
      explanation: "Cast Tyrranax Atrocity → cast Blade of Shared Souls → Blade of Shared Souls → Tyrranax Atrocity → attack with Branchblight Stalker + Tyrranax Atrocity + Tyrranax Atrocity.",
      notes: `
LETHAL: cast Tyrranax Atrocity → cast Blade of Shared Souls → Blade of Shared Souls → Tyrranax Atrocity → attack with Branchblight Stalker + Tyrranax Atrocity + Tyrranax Atrocity → (opponent: Grizzly Bears blocks Tyrranax Atrocity): ten poison counters from 5 (the fewest this board can win from).
RULES: The board of one-01-fresh-venom plus Blade of Shared Souls (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Blade of Shared Souls: it needs at least 8 poison to start. Any other order or target falls short.
UNIQUENESS: Solver-checked: one plan wins from 5 poison; 4 poison isn't enough.`
    }),
    // ---- March of the Machine (MOM) ----
    puzzle({
      id: "mom-11-djeru-and-hazoret", title: "Djeru and Hazoret", set: "mom", tier: "easy",
      opp: { life: 10, battlefield: [] },
      you: { hand: [c("Kor Halberd"), c("Djeru and Hazoret")], battlefield: [c("Incubator", {"counters":{"+1/+1":3}}), c("Alabaster Host Sanctifier"), c("Plains"), c("Plains"), c("Plains"), c("Mountain"), c("Mountain"), c("Plains"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Djeru and Hazoret → activate Incubator ({2}: Transform this token) → attack with Alabaster Host Sanctifier + Djeru and Hazoret + Phyrexian Token.",
      notes: `
LETHAL: cast Djeru and Hazoret → activate Incubator ({2}: Transform this token) → attack with Alabaster Host Sanctifier + Djeru and Hazoret + Phyrexian Token → (opponent: no blocks): exactly 10 damage (the most this board can deal).
RULES: The board of mom-02-hatch plus Djeru and Hazoret (rare) in your hand, with 5 lands to cast it.
WRONG LINES: Without Djeru and Hazoret: at most 5. Any other order or target deals less than 10.
UNIQUENESS: Solver-checked: one plan reaches 10; 11 isn't reachable.`
    }),
    puzzle({
      id: "mom-12-grafted-butcher", title: "Grafted Butcher", set: "mom", tier: "easy",
      opp: { life: 10, battlefield: [] },
      you: { hand: [c("Grafted Butcher")], battlefield: [c("Invasion of Belenon", {"counters":{"defense":1}}), c("Kithkin Billyrider"), c("Knight"), c("Alabaster Host Sanctifier"), c("Glory Seeker"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Grafted Butcher → attack with Alabaster Host Sanctifier + Glory Seeker + Kithkin Billyrider (→ Invasion of Belenon) + Knight → Cast Belenon War Anthem (Invasion of Belenon transformed) for free?: Cast it.",
      notes: `
LETHAL: cast Grafted Butcher → attack with Alabaster Host Sanctifier + Glory Seeker + Kithkin Billyrider (→ Invasion of Belenon) + Knight → (opponent: no blocks) → Cast Belenon War Anthem (Invasion of Belenon transformed) for free?: Cast it: exactly 10 damage (the most this board can deal).
RULES: The board of mom-05-siege-breaker plus Grafted Butcher (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without Grafted Butcher: at most 9. Any other order or target deals less than 10.
UNIQUENESS: Solver-checked: one plan reaches 10; 11 isn't reachable.`
    }),
    puzzle({
      id: "mom-13-ancient-imperiosaur", title: "Ancient Imperiosaur", set: "mom", tier: "easy",
      opp: { life: 7, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Ral's Reinforcements"), c("Stoke the Flames")], battlefield: [c("Glory Seeker"), c("Mountain"), c("Plains"), c("Plains"), c("Ancient Imperiosaur")] },
      explanation: "Cast Ral's Reinforcements → cast Stoke the Flames (convoking Glory Seeker + Elemental + Elemental) →opponent → attack with Ancient Imperiosaur.",
      notes: `
LETHAL: cast Ral's Reinforcements → cast Stoke the Flames (convoking Glory Seeker + Elemental + Elemental) →opponent → attack with Ancient Imperiosaur → (opponent: Wall of Wood blocks Ancient Imperiosaur): exactly 7 damage (the most this board can deal).
RULES: The board of mom-04-red-reinforcements plus Ancient Imperiosaur (rare) on the battlefield.
WRONG LINES: Without Ancient Imperiosaur: at most 4. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "mom-14-archpriest-of-shadows", title: "Archpriest of Shadows", set: "mom", tier: "easy",
      opp: { life: 12, battlefield: [] },
      you: { hand: [c("Norn's Inquisitor")], battlefield: [c("Elvish Vatkeeper"), c("Incubator", {"counters":{"+1/+1":2}}), c("Plains"), c("Swamp"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Archpriest of Shadows")] },
      explanation: "Cast Norn's Inquisitor → activate Elvish Vatkeeper ({5}: Transform target Incubator, double its +1/+1 counters) → Incubator → attack with Archpriest of Shadows + Elvish Vatkeeper + Phyrexian Token.",
      notes: `
LETHAL: cast Norn's Inquisitor → activate Elvish Vatkeeper ({5}: Transform target Incubator, double its +1/+1 counters) → Incubator → attack with Archpriest of Shadows + Elvish Vatkeeper + Phyrexian Token → (opponent: no blocks): exactly 12 damage (the most this board can deal).
RULES: The board of mom-07-incubation-chamber plus Archpriest of Shadows (rare) on the battlefield.
WRONG LINES: Without Archpriest of Shadows: at most 8. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
    }),
    puzzle({
      id: "mom-15-bloated-processor", title: "Bloated Processor", set: "mom", tier: "medium",
      opp: { life: 8, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Saiba Cryptomancer")], battlefield: [c("Kithkin Billyrider"), c("Glory Seeker"), c("Glory Seeker"), c("Island"), c("Island"), c("Bloated Processor")] },
      explanation: "Attack with Bloated Processor + Glory Seeker + Glory Seeker + Kithkin Billyrider → cast Saiba Cryptomancer → Saiba Cryptomancer → Kithkin Billyrider.",
      notes: `
LETHAL: attack with Bloated Processor + Glory Seeker + Glory Seeker + Kithkin Billyrider → (opponent: Wall of Wood blocks Bloated Processor) → cast Saiba Cryptomancer → Saiba Cryptomancer → Kithkin Billyrider: exactly 8 damage (the most this board can deal).
RULES: The board of mom-08-flash-backup plus Bloated Processor (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Bloated Processor: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "mom-16-dusk-legion-duelist", title: "Dusk Legion Duelist", set: "mom", tier: "medium",
      opp: { life: 7, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Saiba Cryptomancer")], battlefield: [c("Kithkin Billyrider"), c("Glory Seeker"), c("Glory Seeker"), c("Island"), c("Island"), c("Dusk Legion Duelist")] },
      explanation: "Attack with Dusk Legion Duelist + Glory Seeker + Glory Seeker + Kithkin Billyrider → cast Saiba Cryptomancer → Saiba Cryptomancer → Glory Seeker.",
      notes: `
LETHAL: attack with Dusk Legion Duelist + Glory Seeker + Glory Seeker + Kithkin Billyrider → (opponent: Wall of Wood blocks Kithkin Billyrider) → cast Saiba Cryptomancer → Saiba Cryptomancer → Glory Seeker: exactly 7 damage (the most this board can deal).
RULES: The board of mom-08-flash-backup plus Dusk Legion Duelist (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Dusk Legion Duelist: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "mom-17-voldaren-thrillseeker", title: "Voldaren Thrillseeker", set: "mom", tier: "hard",
      opp: { life: 7, battlefield: [] },
      you: { hand: [c("Kor Halberd")], battlefield: [c("Incubator", {"counters":{"+1/+1":3}}), c("Alabaster Host Sanctifier"), c("Plains"), c("Plains"), c("Plains"), c("Voldaren Thrillseeker")] },
      explanation: "Activate Incubator ({2}: Transform this token) → attack with Alabaster Host Sanctifier + Phyrexian Token + Voldaren Thrillseeker → activate Voldaren Thrillseeker ({1}, Sacrifice this creature: damage equal to its power to any target) → opponent.",
      notes: `
LETHAL: activate Incubator ({2}: Transform this token) → attack with Alabaster Host Sanctifier + Phyrexian Token + Voldaren Thrillseeker → (opponent: no blocks) → activate Voldaren Thrillseeker ({1}, Sacrifice this creature: damage equal to its power to any target) → opponent: exactly 7 damage (the most this board can deal).
RULES: The board of mom-02-hatch plus Voldaren Thrillseeker (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Voldaren Thrillseeker: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "mom-18-monastery-mentor", title: "Monastery Mentor", set: "mom", tier: "hard",
      opp: { life: 7, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Saiba Cryptomancer")], battlefield: [c("Kithkin Billyrider"), c("Glory Seeker"), c("Glory Seeker"), c("Island"), c("Island"), c("Monastery Mentor")] },
      explanation: "Attack with Glory Seeker + Glory Seeker + Kithkin Billyrider + Monastery Mentor → cast Saiba Cryptomancer → Saiba Cryptomancer → Glory Seeker.",
      notes: `
LETHAL: attack with Glory Seeker + Glory Seeker + Kithkin Billyrider + Monastery Mentor → (opponent: Wall of Wood blocks Kithkin Billyrider) → cast Saiba Cryptomancer → Saiba Cryptomancer → Glory Seeker: exactly 7 damage (the most this board can deal).
RULES: The board of mom-08-flash-backup plus Monastery Mentor (mythic) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Monastery Mentor: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "mom-19-boon-bringer-valkyrie", title: "Boon-Bringer Valkyrie", set: "mom", tier: "hard",
      opp: { life: 6, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Serpent-Blade Assailant"), c("Boon-Bringer Valkyrie")], battlefield: [c("Tarkir Duneshaper"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Serpent-Blade Assailant → Serpent-Blade Assailant → Tarkir Duneshaper → cast Boon-Bringer Valkyrie → Boon-Bringer Valkyrie → Tarkir Duneshaper → activate Tarkir Duneshaper ({4}{G/P}: Transform) → attack with Tarkir Duneshaper.",
      notes: `
LETHAL: cast Serpent-Blade Assailant → Serpent-Blade Assailant → Tarkir Duneshaper → cast Boon-Bringer Valkyrie → Boon-Bringer Valkyrie → Tarkir Duneshaper → activate Tarkir Duneshaper ({4}{G/P}: Transform) → attack with Tarkir Duneshaper → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of mom-06-deadly-stampede plus Boon-Bringer Valkyrie (rare) in your hand, with 5 lands to cast it.
WRONG LINES: Without Boon-Bringer Valkyrie: at most 4. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "mom-20-invasion-of-innistrad", title: "Invasion of Innistrad", set: "mom", tier: "hard",
      opp: { life: 5, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Serpent-Blade Assailant"), c("Invasion of Innistrad")], battlefield: [c("Tarkir Duneshaper"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Serpent-Blade Assailant → Serpent-Blade Assailant → Tarkir Duneshaper → cast Invasion of Innistrad → Invasion of Innistrad → Wall of Wood → activate Tarkir Duneshaper ({4}{G/P}: Transform) → attack with Tarkir Duneshaper.",
      notes: `
LETHAL: cast Serpent-Blade Assailant → Serpent-Blade Assailant → Tarkir Duneshaper → cast Invasion of Innistrad → Invasion of Innistrad → Wall of Wood → activate Tarkir Duneshaper ({4}{G/P}: Transform) → attack with Tarkir Duneshaper → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: The board of mom-06-deadly-stampede plus Invasion of Innistrad (mythic) in your hand, with 4 lands to cast it.
WRONG LINES: Without Invasion of Innistrad: at most 4. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    // ---- Wilds of Eldraine (WOE) ----
    puzzle({
      id: "woe-11-food-fight", title: "Food Fight", set: "woe", tier: "easy",
      opp: { life: 7, battlefield: [c("Siege Mastodon")] },
      you: { hand: [c("Candy Grapple"), c("Food Fight")], battlefield: [c("Hill Giant"), c("Food"), c("Swamp"), c("Swamp"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Food Fight → activate Food ({2}, Sacrifice this artifact: 1 + Food Fights damage to any target) → opponent.",
      notes: `
LETHAL: cast Food Fight → activate Food ({2}, Sacrifice this artifact: 1 + Food Fights damage to any target) → opponent: exactly 7 damage (the most this board can deal).
RULES: The board of woe-02-sweet-deal plus Food Fight (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without Food Fight: at most 3. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "woe-12-a-tale-for-the-ages", title: "A Tale for the Ages", set: "woe", tier: "easy",
      opp: { life: 5, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Monstrous Rage"), c("A Tale for the Ages")], battlefield: [c("Hill Giant"), c("Mountain"), c("Plains"), c("Plains")] },
      explanation: "Cast Monstrous Rage →Hill Giant → cast A Tale for the Ages → attack with Hill Giant.",
      notes: `
LETHAL: cast Monstrous Rage →Hill Giant → cast A Tale for the Ages → attack with Hill Giant → (opponent: Wall of Wood blocks Hill Giant): exactly 5 damage (the most this board can deal).
RULES: The board of woe-01-monster-inside plus A Tale for the Ages (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without A Tale for the Ages: at most 3. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "woe-13-agatha-of-the-vile-cauldron", title: "Agatha of the Vile Cauldron", set: "woe", tier: "easy",
      opp: { life: 8, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Become Brutes"), c("Agatha of the Vile Cauldron")], battlefield: [c("Ash, Party Crasher"), c("Gallant Pie-Wielder", {"sick":true}), c("Mountain"), c("Mountain"), c("Mountain"), c("Forest")] },
      explanation: "Cast Agatha of the Vile Cauldron → cast Become Brutes →Gallant Pie-Wielder + Agatha of the Vile Cauldron → attack with Agatha of the Vile Cauldron + Ash, Party Crasher + Gallant Pie-Wielder.",
      notes: `
LETHAL: cast Agatha of the Vile Cauldron → cast Become Brutes →Gallant Pie-Wielder + Agatha of the Vile Cauldron → attack with Agatha of the Vile Cauldron + Ash, Party Crasher + Gallant Pie-Wielder → (opponent: Wall of Wood blocks Ash, Party Crasher): exactly 8 damage (the most this board can deal).
RULES: The board of woe-08-party-crashers plus Agatha of the Vile Cauldron (mythic) in your hand, with 2 lands to cast it.
WRONG LINES: Without Agatha of the Vile Cauldron: at most 7. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "woe-14-goddric", title: "Goddric", set: "woe", tier: "easy",
      opp: { life: 11, battlefield: [] },
      you: { hand: [c("Tough Cookie"), c("Mintstrosity"), c("Goddric, Cloaked Reveler")], battlefield: [c("Grand Ball Guest"), c("Gallant Pie-Wielder"), c("Forest"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Tough Cookie → cast Goddric, Cloaked Reveler → attack with Gallant Pie-Wielder + Goddric, Cloaked Reveler + Grand Ball Guest.",
      notes: `
LETHAL: cast Tough Cookie → cast Goddric, Cloaked Reveler → attack with Gallant Pie-Wielder + Goddric, Cloaked Reveler + Grand Ball Guest → (opponent: no blocks): exactly 11 damage (the most this board can deal).
RULES: The board of woe-03-cookie-party plus Goddric, Cloaked Reveler (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Goddric, Cloaked Reveler: at most 7. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "woe-15-archon-of-the-wild-rose", title: "Archon of the Wild Rose", set: "woe", tier: "medium",
      opp: { life: 10, battlefield: [c("Siege Mastodon")] },
      you: { hand: [c("Conceited Witch"), c("Candy Grapple")], battlefield: [c("Hill Giant"), c("Swamp"), c("Swamp"), c("Swamp"), c("Archon of the Wild Rose")] },
      explanation: "Cast Price of Beauty →Hill Giant → attack with Archon of the Wild Rose + Hill Giant → cast Candy Grapple (bargaining Wicked) →Hill Giant.",
      notes: `
LETHAL: cast Price of Beauty →Hill Giant → attack with Archon of the Wild Rose + Hill Giant → (opponent: no blocks) → cast Candy Grapple (bargaining Wicked) →Hill Giant: exactly 10 damage (the most this board can deal).
RULES: The board of woe-07-wicked-bargain plus Archon of the Wild Rose (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Archon of the Wild Rose: at most 4. Any other order or target deals less than 10.
UNIQUENESS: Solver-checked: one plan reaches 10; 11 isn't reachable.`
    }),
    puzzle({
      id: "woe-16-agatha-s-soul-cauldron", title: "Agatha's Soul Cauldron", set: "woe", tier: "medium",
      opp: { life: 5, battlefield: [c("Siege Mastodon")] },
      you: { hand: [c("Conceited Witch"), c("Candy Grapple"), c("Agatha's Soul Cauldron")], battlefield: [c("Hill Giant"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Price of Beauty →Hill Giant → cast Candy Grapple (bargaining Wicked) →Siege Mastodon → cast Agatha's Soul Cauldron → activate Agatha's Soul Cauldron ({T}: Exile target card from a graveyard (a creature card: +1/+1 counter on target creature you control)) → siege-mastodon → Agatha's Soul Cauldron → Hill Giant → attack with Hill Giant.",
      notes: `
LETHAL: cast Price of Beauty →Hill Giant → cast Candy Grapple (bargaining Wicked) →Siege Mastodon → cast Agatha's Soul Cauldron → activate Agatha's Soul Cauldron ({T}: Exile target card from a graveyard (a creature card: +1/+1 counter on target creature you control)) → siege-mastodon → Agatha's Soul Cauldron → Hill Giant → attack with Hill Giant → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: The board of woe-07-wicked-bargain plus Agatha's Soul Cauldron (mythic) in your hand, with 2 lands to cast it.
WRONG LINES: Without Agatha's Soul Cauldron: at most 4. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "woe-17-virtue-of-knowledge", title: "Virtue of Knowledge", set: "woe", tier: "hard",
      opp: { life: 8, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Become Brutes"), c("Virtue of Knowledge")], battlefield: [c("Ash, Party Crasher"), c("Gallant Pie-Wielder", {"sick":true}), c("Mountain"), c("Mountain"), c("Island"), c("Island"), c("Island"), c("Island"), c("Island")] },
      explanation: "Cast Become Brutes →Ash, Party Crasher + Gallant Pie-Wielder → attack with Ash, Party Crasher + Gallant Pie-Wielder → cast Vantress Visions →stack:0.",
      notes: `
LETHAL: cast Become Brutes →Ash, Party Crasher + Gallant Pie-Wielder → attack with Ash, Party Crasher + Gallant Pie-Wielder → cast Vantress Visions →stack:0 → (opponent: Wall of Wood blocks Ash, Party Crasher): exactly 8 damage (the most this board can deal).
RULES: The board of woe-08-party-crashers plus Virtue of Knowledge (mythic) in your hand, with 5 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2). TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Virtue of Knowledge: at most 7. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "woe-18-the-end", title: "The End", set: "woe", tier: "hard",
      opp: { life: 5, battlefield: [c("Siege Mastodon")] },
      you: { hand: [c("Conceited Witch"), c("Candy Grapple"), c("The End")], battlefield: [c("Hill Giant"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Price of Beauty →Hill Giant → cast The End →Siege Mastodon → attack with Hill Giant → cast Candy Grapple (bargaining Wicked) →Hill Giant.",
      notes: `
LETHAL: cast Price of Beauty →Hill Giant → cast The End →Siege Mastodon → attack with Hill Giant → (opponent: no blocks) → cast Candy Grapple (bargaining Wicked) →Hill Giant: exactly 5 damage (the most this board can deal).
RULES: The board of woe-07-wicked-bargain plus The End (rare) in your hand, with 4 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without The End: at most 4. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "woe-19-hylda-s-crown-of-winter", title: "Hylda's Crown of Winter", set: "woe", tier: "hard",
      opp: { life: 5, battlefield: [c("Siege Mastodon")] },
      you: { hand: [c("Conceited Witch"), c("Candy Grapple")], battlefield: [c("Hill Giant"), c("Swamp"), c("Swamp"), c("Swamp"), c("Hylda's Crown of Winter")] },
      explanation: "Cast Price of Beauty →Hill Giant → activate Hylda's Crown of Winter ({T}: Tap target creature (costs {1} less during your turn)) → Siege Mastodon → attack with Hill Giant → cast Candy Grapple (bargaining Hylda's Crown of Winter) →Hill Giant.",
      notes: `
LETHAL: cast Price of Beauty →Hill Giant → activate Hylda's Crown of Winter ({T}: Tap target creature (costs {1} less during your turn)) → Siege Mastodon → attack with Hill Giant → (opponent: no blocks) → cast Candy Grapple (bargaining Hylda's Crown of Winter) →Hill Giant: exactly 5 damage (the most this board can deal).
RULES: The board of woe-07-wicked-bargain plus Hylda's Crown of Winter (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Hylda's Crown of Winter: at most 4. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "woe-20-charming-scoundrel", title: "Charming Scoundrel", set: "woe", tier: "hard",
      opp: { life: 9, battlefield: [] },
      you: { hand: [c("Two-Headed Hunter"), c("Charming Scoundrel")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Twice the Rage →Hill Giant → cast Charming Scoundrel → Charming Scoundrel: Create a Wicked Role token attached to target creature you control → Charming Scoundrel → Hill Giant → attack with Charming Scoundrel + Hill Giant.",
      notes: `
LETHAL: cast Twice the Rage →Hill Giant → cast Charming Scoundrel → Charming Scoundrel: Create a Wicked Role token attached to target creature you control → Charming Scoundrel → Hill Giant → attack with Charming Scoundrel + Hill Giant → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: The board of woe-04-twice-the-rage plus Charming Scoundrel (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without Charming Scoundrel: at most 6. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    // ---- The Lost Caverns of Ixalan (LCI) ----
    puzzle({
      id: "lci-11-abuelo", title: "Abuelo", set: "lci", tier: "easy",
      opp: { life: 5, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Cenote Scout")], battlefield: [c("Merfolk Cave-Diver"), c("Forest"), c("Abuelo, Ancestral Echo")], library: [c("Grizzly Bears")] },
      explanation: "Cast Cenote Scout → Explore: Leave it on top → attack with Abuelo, Ancestral Echo + Merfolk Cave-Diver.",
      notes: `
LETHAL: cast Cenote Scout → Explore: Leave it on top → attack with Abuelo, Ancestral Echo + Merfolk Cave-Diver → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: The board of lci-01-unseen-currents plus Abuelo, Ancestral Echo (rare) on the battlefield.
WRONG LINES: Without Abuelo, Ancestral Echo: at most 3. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "lci-12-aclazotz", title: "Aclazotz", set: "lci", tier: "easy",
      opp: { life: 8, battlefield: [] },
      you: { hand: [c("Deathcap Marionette")], battlefield: [c("Basking Capybara"), c("Swamp"), c("Swamp"), c("Aclazotz, Deepest Betrayal")], graveyard: [c("Forest"), c("Grizzly Bears"), c("Lightning Bolt")], library: [c("Forest"), c("Hill Giant")] },
      explanation: "Cast Deathcap Marionette → Mill 2?: Mill 2 → attack with Aclazotz, Deepest Betrayal + Basking Capybara.",
      notes: `
LETHAL: cast Deathcap Marionette → Mill 2?: Mill 2 → attack with Aclazotz, Deepest Betrayal + Basking Capybara → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: The board of lci-03-dig-deep plus Aclazotz, Deepest Betrayal (mythic) on the battlefield.
WRONG LINES: Without Aclazotz, Deepest Betrayal: at most 4. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "lci-13-bedrock-tortoise", title: "Bedrock Tortoise", set: "lci", tier: "easy",
      opp: { life: 11, battlefield: [] },
      you: { hand: [], battlefield: [c("Hill Giant"), c("Idol of the Deep King"), c("Map"), c("Mountain"), c("Mountain"), c("Mountain"), c("Bedrock Tortoise")], library: [c("Lightning Bolt")] },
      explanation: "Activate Idol of the Deep King (Craft with artifact {2}{R}) (with Map) → Sovereign's Macuahuitl → Hill Giant → attack with Bedrock Tortoise + Hill Giant.",
      notes: `
LETHAL: activate Idol of the Deep King (Craft with artifact {2}{R}) (with Map) → Sovereign's Macuahuitl → Hill Giant → attack with Bedrock Tortoise + Hill Giant → (opponent: no blocks): exactly 11 damage (the most this board can deal).
RULES: The board of lci-04-forged-anew plus Bedrock Tortoise (rare) on the battlefield.
WRONG LINES: Without Bedrock Tortoise: at most 5. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "lci-14-bringer-of-the-last-gift", title: "Bringer of the Last Gift", set: "lci", tier: "easy",
      opp: { life: 12, battlefield: [c("Wall of Wood"), c("Grizzly Bears"), c("Gray Ogre")] },
      you: { hand: [c("Daring Discovery")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Bringer of the Last Gift")], library: [c("Mountain"), c("Lightning Bolt")] },
      explanation: "Cast Daring Discovery →Wall of Wood + Grizzly Bears + Gray Ogre → Discover 4: Cast it → opponent → attack with Bringer of the Last Gift + Hill Giant.",
      notes: `
LETHAL: cast Daring Discovery →Wall of Wood + Grizzly Bears + Gray Ogre → Discover 4: Cast it → opponent → attack with Bringer of the Last Gift + Hill Giant → (opponent: no blocks): exactly 12 damage (the most this board can deal).
RULES: The board of lci-02-into-the-depths plus Bringer of the Last Gift (rare) on the battlefield.
WRONG LINES: Without Bringer of the Last Gift: at most 6. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
    }),
    puzzle({
      id: "lci-15-fabrication-foundry", title: "Fabrication Foundry", set: "lci", tier: "medium",
      opp: { life: 6, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Idol of the Deep King")], battlefield: [c("Hill Giant"), c("Map"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Fabrication Foundry")], library: [c("Lightning Bolt")] },
      explanation: "Cast Idol of the Deep King → Idol of the Deep King → Grizzly Bears → activate Map ({1}, {T}, Sacrifice: target creature you control explores) → Hill Giant → Explore: Leave it on top → activate Idol of the Deep King (Craft with artifact {2}{R}) (with Fabrication Foundry) → Sovereign's Macuahuitl → Hill Giant → attack with Hill Giant.",
      notes: `
LETHAL: cast Idol of the Deep King → Idol of the Deep King → Grizzly Bears → activate Map ({1}, {T}, Sacrifice: target creature you control explores) → Hill Giant → Explore: Leave it on top → activate Idol of the Deep King (Craft with artifact {2}{R}) (with Fabrication Foundry) → Sovereign's Macuahuitl → Hill Giant → attack with Hill Giant → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of lci-10-sovereign plus Fabrication Foundry (rare) on the battlefield.
WRONG LINES: Without Fabrication Foundry: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "lci-16-dire-flail", title: "Dire Flail", set: "lci", tier: "medium",
      opp: { life: 9, battlefield: [c("Giant Spider"), c("Wall of Wood")] },
      you: { hand: [c("Over the Edge"), c("Ancestors' Aid")], battlefield: [c("Merfolk Cave-Diver"), c("Forest"), c("Island"), c("Forest"), c("Dire Flail")], library: [c("Mountain"), c("Grizzly Bears")] },
      explanation: "Cast Over the Edge (Target creature you control explores, then it explores again) →Merfolk Cave-Diver → Explore: Leave it on top → play Mountain → cast Ancestors' Aid →Merfolk Cave-Diver → activate Dire Flail (Equip {1}) → Merfolk Cave-Diver → attack with Merfolk Cave-Diver.",
      notes: `
LETHAL: cast Over the Edge (Target creature you control explores, then it explores again) →Merfolk Cave-Diver → Explore: Leave it on top → play Mountain → cast Ancestors' Aid →Merfolk Cave-Diver → activate Dire Flail (Equip {1}) → Merfolk Cave-Diver → attack with Merfolk Cave-Diver → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: The board of lci-05-deeper-still plus Dire Flail (rare) on the battlefield.
WRONG LINES: Without Dire Flail: at most 7. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "lci-17-magmatic-galleon", title: "Magmatic Galleon", set: "lci", tier: "hard",
      opp: { life: 8, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Geological Appraiser")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Magmatic Galleon")], library: [c("Forest"), c("Panicked Altisaur"), c("Staggering Size")] },
      explanation: "Cast Geological Appraiser → activate Magmatic Galleon (Crew 2) (crewed by Geological Appraiser) → Discover 3: Cast it → Magmatic Galleon → attack with Hill Giant + Magmatic Galleon.",
      notes: `
LETHAL: cast Geological Appraiser → activate Magmatic Galleon (Crew 2) (crewed by Geological Appraiser) → Discover 3: Cast it → Magmatic Galleon → attack with Hill Giant + Magmatic Galleon → (opponent: Wall of Wood blocks Hill Giant): exactly 8 damage (the most this board can deal).
RULES: The board of lci-06-appraisal plus Magmatic Galleon (rare) on the battlefield. TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Magmatic Galleon: at most 3. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "lci-18-the-belligerent", title: "The Belligerent", set: "lci", tier: "hard",
      opp: { life: 8, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Geological Appraiser")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("The Belligerent")], library: [c("Forest"), c("Panicked Altisaur"), c("Staggering Size")] },
      explanation: "Cast Geological Appraiser → activate The Belligerent (Crew 3) (crewed by Geological Appraiser) → Discover 3: Cast it → The Belligerent → attack with Hill Giant + The Belligerent.",
      notes: `
LETHAL: cast Geological Appraiser → activate The Belligerent (Crew 3) (crewed by Geological Appraiser) → Discover 3: Cast it → The Belligerent → attack with Hill Giant + The Belligerent → (opponent: Wall of Wood blocks Hill Giant): exactly 8 damage (the most this board can deal).
RULES: The board of lci-06-appraisal plus The Belligerent (rare) on the battlefield. TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without The Belligerent: at most 3. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "lci-19-quintorius-kand", title: "Quintorius Kand", set: "lci", tier: "hard",
      opp: { life: 8, battlefield: [] },
      you: { hand: [c("Quintorius Kand")], battlefield: [c("Hill Giant"), c("Idol of the Deep King"), c("Map"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Plains"), c("Mountain"), c("Mountain"), c("Mountain")], library: [c("Lightning Bolt")] },
      explanation: "Cast Quintorius Kand → activate Idol of the Deep King (Craft with artifact {2}{R}) (with Map) → Sovereign's Macuahuitl → Hill Giant → activate Quintorius Kand (−3: Discover 4.) → Discover 4: Cast it → opponent → attack with Hill Giant.",
      notes: `
LETHAL: cast Quintorius Kand → activate Idol of the Deep King (Craft with artifact {2}{R}) (with Map) → Sovereign's Macuahuitl → Hill Giant → activate Quintorius Kand (−3: Discover 4.) → Discover 4: Cast it → opponent → attack with Hill Giant → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: The board of lci-04-forged-anew plus Quintorius Kand (mythic) in your hand, with 5 lands to cast it.
WRONG LINES: Without Quintorius Kand: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "lci-20-the-enigma-jewel", title: "The Enigma Jewel", set: "lci", tier: "hard",
      opp: { life: 6, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Idol of the Deep King")], battlefield: [c("Hill Giant"), c("Map"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("The Enigma Jewel")], library: [c("Lightning Bolt")] },
      explanation: "Cast Idol of the Deep King → Idol of the Deep King → Grizzly Bears → activate Map ({1}, {T}, Sacrifice: target creature you control explores) → Hill Giant → Explore: Leave it on top → activate Idol of the Deep King (Craft with artifact {2}{R}) (with The Enigma Jewel) → Sovereign's Macuahuitl → Hill Giant → attack with Hill Giant.",
      notes: `
LETHAL: cast Idol of the Deep King → Idol of the Deep King → Grizzly Bears → activate Map ({1}, {T}, Sacrifice: target creature you control explores) → Hill Giant → Explore: Leave it on top → activate Idol of the Deep King (Craft with artifact {2}{R}) (with The Enigma Jewel) → Sovereign's Macuahuitl → Hill Giant → attack with Hill Giant → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of lci-10-sovereign plus The Enigma Jewel (mythic) on the battlefield.
WRONG LINES: Without The Enigma Jewel: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    // ---- Murders at Karlov Manor (MKM) ----
    puzzle({
      id: "mkm-11-archdruid-s-charm", title: "Archdruid's Charm", set: "mkm", tier: "easy",
      opp: { life: 6, battlefield: [c("Siege Mastodon")] },
      you: { hand: [c("Bite Down on Crime"), c("Archdruid's Charm")], battlefield: [c("Hill Giant"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest")], graveyard: [c("Colossal Dreadmaw"), c("Lightning Bolt")] },
      explanation: "Cast Archdruid's Charm (+1/+1 counter on target creature you control; it deals damage equal to its power to target creature you don't control) →Hill Giant + Siege Mastodon → cast Bite Down on Crime (collecting evidence: Colossal Dreadmaw) →Hill Giant + Siege Mastodon → attack with Hill Giant.",
      notes: `
LETHAL: cast Archdruid's Charm (+1/+1 counter on target creature you control; it deals damage equal to its power to target creature you don't control) →Hill Giant + Siege Mastodon → cast Bite Down on Crime (collecting evidence: Colossal Dreadmaw) →Hill Giant + Siege Mastodon → attack with Hill Giant → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of mkm-04-evidence-locker plus Archdruid's Charm (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Archdruid's Charm: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "mkm-12-assassin-s-trophy", title: "Assassin's Trophy", set: "mkm", tier: "easy",
      opp: { life: 8, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Assassin's Trophy")], battlefield: [c("Alley Assailant", {"faceDown":true}), c("Gray Ogre"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Forest")] },
      explanation: "Cast Assassin's Trophy →Grizzly Bears → activate Alley Assailant (Turn face up {4}{B}{B}) → attack with Alley Assailant + Gray Ogre.",
      notes: `
LETHAL: cast Assassin's Trophy →Grizzly Bears → activate Alley Assailant (Turn face up {4}{B}{B}) → attack with Alley Assailant + Gray Ogre → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: The board of mkm-02-unmasked plus Assassin's Trophy (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without Assassin's Trophy: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "mkm-13-aurelia", title: "Aurelia", set: "mkm", tier: "easy",
      opp: { life: 7, battlefield: [c("Siege Mastodon"), c("Grizzly Bears")] },
      you: { hand: [c("Caught Red-Handed"), c("Aurelia, the Law Above")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Plains"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Caught Red-Handed →Siege Mastodon → cast Aurelia, the Law Above → attack with Aurelia, the Law Above + Siege Mastodon.",
      notes: `
LETHAL: cast Caught Red-Handed →Siege Mastodon → cast Aurelia, the Law Above → attack with Aurelia, the Law Above + Siege Mastodon → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: The board of mkm-06-caught-red-handed plus Aurelia, the Law Above (rare) in your hand, with 5 lands to cast it.
WRONG LINES: Without Aurelia, the Law Above: at most 3. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "mkm-14-axebane-ferox", title: "Axebane Ferox", set: "mkm", tier: "easy",
      opp: { life: 9, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Convenient Target"), c("Axebane Ferox")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Forest"), c("Forest"), c("Forest"), c("Forest")] },
      explanation: "Cast Convenient Target →Grizzly Bears → cast Axebane Ferox → attack with Axebane Ferox + Gray Ogre + Hill Giant.",
      notes: `
LETHAL: cast Convenient Target →Grizzly Bears → cast Axebane Ferox → attack with Axebane Ferox + Gray Ogre + Hill Giant → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: The board of mkm-01-prime-suspect plus Axebane Ferox (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Axebane Ferox: at most 5. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "mkm-15-treacherous-greed", title: "Treacherous Greed", set: "mkm", tier: "medium",
      opp: { life: 8, battlefield: [c("Siege Mastodon")] },
      you: { hand: [c("Bite Down on Crime"), c("Treacherous Greed")], battlefield: [c("Hill Giant"), c("Forest"), c("Forest"), c("Plains"), c("Swamp"), c("Plains")], graveyard: [c("Colossal Dreadmaw"), c("Lightning Bolt")] },
      explanation: "Cast Bite Down on Crime (collecting evidence: Colossal Dreadmaw) →Hill Giant + Siege Mastodon → attack with Hill Giant → cast Treacherous Greed (sacrificing Hill Giant).",
      notes: `
LETHAL: cast Bite Down on Crime (collecting evidence: Colossal Dreadmaw) →Hill Giant + Siege Mastodon → attack with Hill Giant → (opponent: no blocks) → cast Treacherous Greed (sacrificing Hill Giant): exactly 8 damage (the most this board can deal).
RULES: The board of mkm-04-evidence-locker plus Treacherous Greed (rare) in your hand, with 3 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Treacherous Greed: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "mkm-16-aurelia-s-vindicator", title: "Aurelia's Vindicator", set: "mkm", tier: "medium",
      opp: { life: 10, battlefield: [c("Wall of Wood"), c("Giant Spider")] },
      you: { hand: [], battlefield: [c("Granite Witness", {"faceDown":true}), c("Bolrac-Clan Basher", {"faceDown":true}), c("Plains"), c("Island"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Aurelia's Vindicator")] },
      explanation: "Activate Granite Witness (Turn face up {W/U}{W/U}) → Granite Witness → Giant Spider → Tap or untap Giant Spider?: Tap it → activate Bolrac-Clan Basher (Turn face up {3}{R}{R}) → attack with Aurelia's Vindicator + Bolrac-Clan Basher + Granite Witness.",
      notes: `
LETHAL: activate Granite Witness (Turn face up {W/U}{W/U}) → Granite Witness → Giant Spider → Tap or untap Giant Spider?: Tap it → activate Bolrac-Clan Basher (Turn face up {3}{R}{R}) → attack with Aurelia's Vindicator + Bolrac-Clan Basher + Granite Witness → (opponent: Wall of Wood blocks Bolrac-Clan Basher): exactly 10 damage (the most this board can deal).
RULES: The board of mkm-08-two-faces plus Aurelia's Vindicator (mythic) on the battlefield.
WRONG LINES: Without Aurelia's Vindicator: at most 6. Any other order or target deals less than 10.
UNIQUENESS: Solver-checked: one plan reaches 10; 11 isn't reachable.`
    }),
    puzzle({
      id: "mkm-17-kylox", title: "Kylox", set: "mkm", tier: "hard",
      opp: { life: 9, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Convenient Target"), c("Kylox, Visionary Inventor")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Island"), c("Mountain"), c("Island"), c("Island"), c("Island"), c("Island"), c("Island")] },
      explanation: "Cast Convenient Target →Grizzly Bears → cast Kylox, Visionary Inventor → attack with Gray Ogre + Hill Giant + Kylox, Visionary Inventor → Sacrifice Hill Giant?: Keep it → Sacrifice Gray Ogre?: Keep it.",
      notes: `
LETHAL: cast Convenient Target →Grizzly Bears → cast Kylox, Visionary Inventor → attack with Gray Ogre + Hill Giant + Kylox, Visionary Inventor → Sacrifice Hill Giant?: Keep it → Sacrifice Gray Ogre?: Keep it → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: The board of mkm-01-prime-suspect plus Kylox, Visionary Inventor (rare) in your hand, with 7 lands to cast it.
WRONG LINES: Without Kylox, Visionary Inventor: at most 5. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "mkm-18-agrus-kos", title: "Agrus Kos", set: "mkm", tier: "hard",
      opp: { life: 8, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Agrus Kos, Spirit of Justice")], battlefield: [c("Alley Assailant", {"faceDown":true}), c("Gray Ogre"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Mountain"), c("Plains"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Agrus Kos, Spirit of Justice → Agrus Kos, Spirit of Justice → Grizzly Bears → activate Alley Assailant (Turn face up {4}{B}{B}) → attack with Alley Assailant + Gray Ogre.",
      notes: `
LETHAL: cast Agrus Kos, Spirit of Justice → Agrus Kos, Spirit of Justice → Grizzly Bears → activate Alley Assailant (Turn face up {4}{B}{B}) → attack with Alley Assailant + Gray Ogre → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: The board of mkm-02-unmasked plus Agrus Kos, Spirit of Justice (mythic) in your hand, with 4 lands to cast it.
WRONG LINES: Without Agrus Kos, Spirit of Justice: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "mkm-19-anzrag", title: "Anzrag", set: "mkm", tier: "hard",
      opp: { life: 6, battlefield: [c("Siege Mastodon"), c("Grizzly Bears")] },
      you: { hand: [c("Caught Red-Handed"), c("Anzrag, the Quake-Mole")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Forest"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Anzrag, the Quake-Mole → cast Caught Red-Handed →Anzrag, the Quake-Mole → attack with Anzrag, the Quake-Mole + Hill Giant → attack with Hill Giant.",
      notes: `
LETHAL: cast Anzrag, the Quake-Mole → cast Caught Red-Handed →Anzrag, the Quake-Mole → attack with Anzrag, the Quake-Mole + Hill Giant → (opponent: Siege Mastodon + Grizzly Bears blocks Anzrag, the Quake-Mole) → attack with Hill Giant → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of mkm-06-caught-red-handed plus Anzrag, the Quake-Mole (mythic) in your hand, with 4 lands to cast it.
WRONG LINES: Without Anzrag, the Quake-Mole: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "mkm-20-conspiracy-unraveler", title: "Conspiracy Unraveler", set: "mkm", tier: "hard",
      opp: { life: 12, battlefield: [c("Wall of Wood"), c("Giant Spider")] },
      you: { hand: [], battlefield: [c("Granite Witness", {"faceDown":true}), c("Bolrac-Clan Basher", {"faceDown":true}), c("Plains"), c("Island"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Conspiracy Unraveler")] },
      explanation: "Activate Granite Witness (Turn face up {W/U}{W/U}) → Granite Witness → Giant Spider → Tap or untap Giant Spider?: Tap it → activate Bolrac-Clan Basher (Turn face up {3}{R}{R}) → attack with Bolrac-Clan Basher + Conspiracy Unraveler + Granite Witness.",
      notes: `
LETHAL: activate Granite Witness (Turn face up {W/U}{W/U}) → Granite Witness → Giant Spider → Tap or untap Giant Spider?: Tap it → activate Bolrac-Clan Basher (Turn face up {3}{R}{R}) → attack with Bolrac-Clan Basher + Conspiracy Unraveler + Granite Witness → (opponent: Wall of Wood blocks Bolrac-Clan Basher): exactly 12 damage (the most this board can deal).
RULES: The board of mkm-08-two-faces plus Conspiracy Unraveler (mythic) on the battlefield.
WRONG LINES: Without Conspiracy Unraveler: at most 6. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
    }),
    // ---- Outlaws of Thunder Junction (OTJ) ----
    puzzle({
      id: "otj-11-rush-of-dread", title: "Rush of Dread", set: "otj", tier: "easy",
      opp: { life: 7, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Longhorn Sharpshooter"), c("Rush of Dread")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Rush of Dread (Target opponent sacrifices half their creatures, rounded up + Target opponent loses half their life, rounded up) →opponent + opponent → attack with Hill Giant.",
      notes: `
LETHAL: cast Rush of Dread (Target opponent sacrifices half their creatures, rounded up + Target opponent loses half their life, rounded up) →opponent + opponent → attack with Hill Giant → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: The board of otj-04-sharpshooter plus Rush of Dread (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Rush of Dread: at most 3. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "otj-12-annie-joins-up", title: "Annie Joins Up", set: "otj", tier: "easy",
      opp: { life: 6, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Annie Joins Up")], battlefield: [c("Quilled Charger"), c("Gray Ogre"), c("Mountain"), c("Forest"), c("Plains"), c("Mountain")] },
      explanation: "Cast Annie Joins Up → Annie Joins Up → Grizzly Bears → attack with Gray Ogre + Quilled Charger.",
      notes: `
LETHAL: cast Annie Joins Up → Annie Joins Up → Grizzly Bears → attack with Gray Ogre + Quilled Charger → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of otj-03-saddle-up plus Annie Joins Up (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Annie Joins Up: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "otj-13-ghired", title: "Ghired", set: "otj", tier: "easy",
      opp: { life: 7, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Shock"), c("Ghired, Mirror of the Wilds")], battlefield: [c("Omenport Vigilante"), c("Mountain"), c("Mountain"), c("Forest"), c("Plains")] },
      explanation: "Cast Shock →Grizzly Bears → cast Ghired, Mirror of the Wilds → attack with Ghired, Mirror of the Wilds + Omenport Vigilante.",
      notes: `
LETHAL: cast Shock →Grizzly Bears → cast Ghired, Mirror of the Wilds → attack with Ghired, Mirror of the Wilds + Omenport Vigilante → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: The board of otj-02-vigilante-justice plus Ghired, Mirror of the Wilds (mythic) in your hand, with 3 lands to cast it.
WRONG LINES: Without Ghired, Mirror of the Wilds: at most 4. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "otj-14-malcolm", title: "Malcolm", set: "otj", tier: "easy",
      opp: { life: 6, battlefield: [c("Wall of Wood"), c("Grizzly Bears")] },
      you: { hand: [c("Jailbreak Scheme"), c("Malcolm, the Eyes")], battlefield: [c("Hill Giant"), c("Island"), c("Island"), c("Island"), c("Island"), c("Island"), c("Mountain")] },
      explanation: "Cast Jailbreak Scheme (Put a +1/+1 counter on target creature. It can't be blocked this turn) →Hill Giant → cast Malcolm, the Eyes → attack with Hill Giant + Malcolm, the Eyes.",
      notes: `
LETHAL: cast Jailbreak Scheme (Put a +1/+1 counter on target creature. It can't be blocked this turn) →Hill Giant → cast Malcolm, the Eyes → attack with Hill Giant + Malcolm, the Eyes → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of otj-01-jailbreak plus Malcolm, the Eyes (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without Malcolm, the Eyes: at most 4. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "otj-15-assimilation-aegis", title: "Assimilation Aegis", set: "otj", tier: "medium",
      opp: { life: 5, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Longhorn Sharpshooter"), c("Assimilation Aegis")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Plains"), c("Island"), c("Plains")] },
      explanation: "Plot Longhorn Sharpshooter → Longhorn Sharpshooter → opponent → cast Assimilation Aegis → Assimilation Aegis → Grizzly Bears → attack with Hill Giant.",
      notes: `
LETHAL: plot Longhorn Sharpshooter → Longhorn Sharpshooter → opponent → cast Assimilation Aegis → Assimilation Aegis → Grizzly Bears → attack with Hill Giant → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: The board of otj-04-sharpshooter plus Assimilation Aegis (mythic) in your hand, with 3 lands to cast it.
WRONG LINES: Without Assimilation Aegis: at most 3. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "otj-16-calamity", title: "Calamity", set: "otj", tier: "medium",
      opp: { life: 12, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Shock"), c("Calamity, Galloping Inferno")], battlefield: [c("Omenport Vigilante"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Shock →Grizzly Bears → cast Calamity, Galloping Inferno → activate Calamity, Galloping Inferno (Saddle 1) (saddled by Omenport Vigilante) → attack with Calamity, Galloping Inferno.",
      notes: `
LETHAL: cast Shock →Grizzly Bears → cast Calamity, Galloping Inferno → activate Calamity, Galloping Inferno (Saddle 1) (saddled by Omenport Vigilante) → attack with Calamity, Galloping Inferno → (opponent: no blocks): exactly 12 damage (the most this board can deal).
RULES: The board of otj-02-vigilante-justice plus Calamity, Galloping Inferno (rare) in your hand, with 6 lands to cast it.
WRONG LINES: Without Calamity, Galloping Inferno: at most 4. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
    }),
    puzzle({
      id: "otj-17-ornery-tumblewagg", title: "Ornery Tumblewagg", set: "otj", tier: "hard",
      opp: { life: 5, battlefield: [c("Wall of Wood"), c("Grizzly Bears")] },
      you: { hand: [c("Jailbreak Scheme"), c("Ornery Tumblewagg")], battlefield: [c("Hill Giant"), c("Island"), c("Island"), c("Island"), c("Island"), c("Forest"), c("Forest"), c("Forest")] },
      explanation: "Cast Jailbreak Scheme (Put a +1/+1 counter on target creature. It can't be blocked this turn) →Hill Giant → cast Ornery Tumblewagg → Ornery Tumblewagg → Hill Giant → attack with Hill Giant.",
      notes: `
LETHAL: cast Jailbreak Scheme (Put a +1/+1 counter on target creature. It can't be blocked this turn) →Hill Giant → cast Ornery Tumblewagg → Ornery Tumblewagg → Hill Giant → attack with Hill Giant → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: The board of otj-01-jailbreak plus Ornery Tumblewagg (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Ornery Tumblewagg: at most 4. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "otj-18-roxanne", title: "Roxanne", set: "otj", tier: "hard",
      opp: { life: 6, battlefield: [c("Wall of Wood"), c("Grizzly Bears")] },
      you: { hand: [c("Jailbreak Scheme"), c("Roxanne, Starfall Savant")], battlefield: [c("Hill Giant"), c("Island"), c("Island"), c("Island"), c("Island"), c("Mountain"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Jailbreak Scheme (Put a +1/+1 counter on target creature. It can't be blocked this turn) →Hill Giant → cast Roxanne, Starfall Savant → Meteorite → opponent → attack with Hill Giant.",
      notes: `
LETHAL: cast Jailbreak Scheme (Put a +1/+1 counter on target creature. It can't be blocked this turn) →Hill Giant → cast Roxanne, Starfall Savant → Meteorite → opponent → attack with Hill Giant → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of otj-01-jailbreak plus Roxanne, Starfall Savant (rare) in your hand, with 5 lands to cast it.
WRONG LINES: Without Roxanne, Starfall Savant: at most 4. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "otj-19-slickshot-show-off", title: "Slickshot Show-Off", set: "otj", tier: "hard",
      opp: { life: 4, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Longhorn Sharpshooter"), c("Slickshot Show-Off")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Plot Longhorn Sharpshooter → Longhorn Sharpshooter → Grizzly Bears → cast Slickshot Show-Off → attack with Hill Giant + Slickshot Show-Off.",
      notes: `
LETHAL: plot Longhorn Sharpshooter → Longhorn Sharpshooter → Grizzly Bears → cast Slickshot Show-Off → attack with Hill Giant + Slickshot Show-Off → (opponent: no blocks): exactly 4 damage (the most this board can deal).
RULES: The board of otj-04-sharpshooter plus Slickshot Show-Off (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without Slickshot Show-Off: at most 3. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
    }),
    puzzle({
      id: "otj-20-the-gitrog", title: "The Gitrog", set: "otj", tier: "hard",
      opp: { life: 9, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Longhorn Sharpshooter"), c("The Gitrog, Ravenous Ride")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Swamp"), c("Forest"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Plot Longhorn Sharpshooter → Longhorn Sharpshooter → Grizzly Bears → cast The Gitrog, Ravenous Ride → attack with Hill Giant + The Gitrog, Ravenous Ride.",
      notes: `
LETHAL: plot Longhorn Sharpshooter → Longhorn Sharpshooter → Grizzly Bears → cast The Gitrog, Ravenous Ride → attack with Hill Giant + The Gitrog, Ravenous Ride → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: The board of otj-04-sharpshooter plus The Gitrog, Ravenous Ride (mythic) in your hand, with 5 lands to cast it.
WRONG LINES: Without The Gitrog, Ravenous Ride: at most 3. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    // ---- Bloomburrow (BLB) ----
    puzzle({
      id: "blb-11-dragonhawk", title: "Dragonhawk", set: "blb", tier: "easy",
      opp: { life: 10, battlefield: [c("Colossal Dreadmaw")] },
      you: { hand: [c("Giant Growth"), c("Longstalk Brawl"), c("Dragonhawk, Fate's Tempest")], battlefield: [c("Heartfire Hero"), c("Forest"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Giant Growth →Heartfire Hero → cast Dragonhawk, Fate's Tempest → cast Longstalk Brawl (gift promised) →Heartfire Hero + Colossal Dreadmaw.",
      notes: `
LETHAL: cast Giant Growth →Heartfire Hero → cast Dragonhawk, Fate's Tempest → cast Longstalk Brawl (gift promised) →Heartfire Hero + Colossal Dreadmaw: exactly 10 damage (the most this board can deal).
RULES: The board of blb-10-heartfire plus Dragonhawk, Fate's Tempest (mythic) in your hand, with 5 lands to cast it.
WRONG LINES: Without Dragonhawk, Fate's Tempest: at most 6. Any other order or target deals less than 10.
UNIQUENESS: Solver-checked: one plan reaches 10; 11 isn't reachable.`
    }),
    puzzle({
      id: "blb-12-emberheart-challenger", title: "Emberheart Challenger", set: "blb", tier: "easy",
      opp: { life: 9, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Blooming Blast"), c("Emberheart Challenger")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Emberheart Challenger → cast Blooming Blast (gift promised) →Grizzly Bears → attack with Emberheart Challenger + Hill Giant.",
      notes: `
LETHAL: cast Emberheart Challenger → cast Blooming Blast (gift promised) →Grizzly Bears → attack with Emberheart Challenger + Hill Giant → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: The board of blb-03-gift-wrapped plus Emberheart Challenger (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without Emberheart Challenger: at most 6. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "blb-13-mabel", title: "Mabel", set: "blb", tier: "easy",
      opp: { life: 7, battlefield: [] },
      you: { hand: [c("Intrepid Rabbit"), c("Mabel, Heir to Cragflame")], battlefield: [c("Hill Giant"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Mountain"), c("Plains"), c("Mountain")] },
      explanation: "Cast Mabel, Heir to Cragflame → activate Cragflame (Equip {2}) → Mabel, Heir to Cragflame → attack with Hill Giant + Mabel, Heir to Cragflame.",
      notes: `
LETHAL: cast Mabel, Heir to Cragflame → activate Cragflame (Equip {2}) → Mabel, Heir to Cragflame → attack with Hill Giant + Mabel, Heir to Cragflame → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: The board of blb-01-litter plus Mabel, Heir to Cragflame (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Mabel, Heir to Cragflame: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "blb-14-baylen", title: "Baylen", set: "blb", tier: "easy",
      opp: { life: 13, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Giant Growth")], battlefield: [c("Mouse Trapper"), c("Hill Giant"), c("Forest"), c("Baylen, the Haymaker")] },
      explanation: "Cast Giant Growth →Mouse Trapper → Mouse Trapper → Grizzly Bears → attack with Baylen, the Haymaker + Hill Giant + Mouse Trapper.",
      notes: `
LETHAL: cast Giant Growth →Mouse Trapper → Mouse Trapper → Grizzly Bears → attack with Baylen, the Haymaker + Hill Giant + Mouse Trapper → (opponent: no blocks): exactly 13 damage (the most this board can deal).
RULES: The board of blb-02-mouse-trap plus Baylen, the Haymaker (rare) on the battlefield.
WRONG LINES: Without Baylen, the Haymaker: at most 9. Any other order or target deals less than 13.
UNIQUENESS: Solver-checked: one plan reaches 13; 14 isn't reachable.`
    }),
    puzzle({
      id: "blb-15-season-of-loss", title: "Season of Loss", set: "blb", tier: "medium",
      opp: { life: 7, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Blooming Blast"), c("Season of Loss")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Blooming Blast (gift promised) →Grizzly Bears → attack with Hill Giant → cast Season of Loss ({P} — Each player sacrifices a creature + {P} — Each player sacrifices a creature + {P}{P}{P} — Each opponent loses X life (X: creature cards in your graveyard)) → +  + .",
      notes: `
LETHAL: cast Blooming Blast (gift promised) →Grizzly Bears → attack with Hill Giant → (opponent: no blocks) → cast Season of Loss ({P} — Each player sacrifices a creature + {P} — Each player sacrifices a creature + {P}{P}{P} — Each opponent loses X life (X: creature cards in your graveyard)) → +  + : exactly 7 damage (the most this board can deal).
RULES: The board of blb-03-gift-wrapped plus Season of Loss (mythic) in your hand, with 5 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Season of Loss: at most 6. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "blb-16-innkeeper-s-talent", title: "Innkeeper's Talent", set: "blb", tier: "medium",
      opp: { life: 11, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Innkeeper's Talent")], battlefield: [c("Blacksmith's Talent"), c("Sword"), c("Quaketusk Boar"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Forest"), c("Forest")] },
      explanation: "Cast Innkeeper's Talent → activate Blacksmith's Talent (Level 2 ({2}{R})) → activate Blacksmith's Talent (Level 3 ({3}{R})) → put Blacksmith's Talent's trigger on the stack first → Blacksmith's Talent → Quaketusk Boar → Innkeeper's Talent → Quaketusk Boar → attack with Quaketusk Boar.",
      notes: `
LETHAL: cast Innkeeper's Talent → activate Blacksmith's Talent (Level 2 ({2}{R})) → activate Blacksmith's Talent (Level 3 ({3}{R})) → put Blacksmith's Talent's trigger on the stack first → Blacksmith's Talent → Quaketusk Boar → Innkeeper's Talent → Quaketusk Boar → attack with Quaketusk Boar → (opponent: Wall of Wood blocks Quaketusk Boar): exactly 11 damage (the most this board can deal).
RULES: The board of blb-07-blacksmith plus Innkeeper's Talent (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without Innkeeper's Talent: at most 9. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "blb-17-hearthborn-battler", title: "Hearthborn Battler", set: "blb", tier: "hard",
      opp: { life: 8, battlefield: [c("Wall of Wood"), c("Grizzly Bears")] },
      you: { hand: [c("Giant Growth"), c("Hearthborn Battler")], battlefield: [c("Gossip's Talent"), c("Hill Giant"), c("Gray Ogre"), c("Island"), c("Island"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Activate Gossip's Talent (Level 2 ({1}{U})) → cast Hearthborn Battler → attack with Hill Giant → Gossip's Talent → Hill Giant → cast Giant Growth →Hill Giant → Hearthborn Battler → opponent.",
      notes: `
LETHAL: activate Gossip's Talent (Level 2 ({1}{U})) → cast Hearthborn Battler → attack with Hill Giant → Gossip's Talent → Hill Giant → cast Giant Growth →Hill Giant → Hearthborn Battler → opponent → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: The board of blb-06-gossip plus Hearthborn Battler (rare) in your hand, with 3 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Hearthborn Battler: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "blb-18-coiling-rebirth", title: "Coiling Rebirth", set: "blb", tier: "hard",
      opp: { life: 8, battlefield: [c("Colossal Dreadmaw")] },
      you: { hand: [c("Giant Growth"), c("Longstalk Brawl"), c("Coiling Rebirth")], battlefield: [c("Heartfire Hero"), c("Forest"), c("Forest"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Giant Growth →Heartfire Hero → attack with Heartfire Hero → cast Coiling Rebirth (gift promised) →Heartfire Hero → cast Longstalk Brawl (gift promised) →Heartfire Hero + Colossal Dreadmaw.",
      notes: `
LETHAL: cast Giant Growth →Heartfire Hero → attack with Heartfire Hero → (opponent: Colossal Dreadmaw blocks Heartfire Hero) → cast Coiling Rebirth (gift promised) →Heartfire Hero → cast Longstalk Brawl (gift promised) →Heartfire Hero + Colossal Dreadmaw: exactly 8 damage (the most this board can deal).
RULES: The board of blb-10-heartfire plus Coiling Rebirth (rare) in your hand, with 5 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Coiling Rebirth: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "blb-19-hired-claw", title: "Hired Claw", set: "blb", tier: "hard",
      opp: { life: 7, battlefield: [c("Wall of Wood"), c("Grizzly Bears")] },
      you: { hand: [c("Giant Growth")], battlefield: [c("Gossip's Talent"), c("Hill Giant"), c("Gray Ogre"), c("Island"), c("Island"), c("Forest"), c("Hired Claw")] },
      explanation: "Activate Gossip's Talent (Level 2 ({1}{U})) → attack with Hill Giant + Hired Claw → put Gossip's Talent's trigger on the stack first → Gossip's Talent → Hill Giant → Hired Claw → opponent → cast Giant Growth →Hill Giant.",
      notes: `
LETHAL: activate Gossip's Talent (Level 2 ({1}{U})) → attack with Hill Giant + Hired Claw → put Gossip's Talent's trigger on the stack first → Gossip's Talent → Hill Giant → Hired Claw → opponent → cast Giant Growth →Hill Giant → (opponent: Grizzly Bears blocks Hired Claw): exactly 7 damage (the most this board can deal).
RULES: The board of blb-06-gossip plus Hired Claw (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Hired Claw: at most 6. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "blb-20-colossification", title: "Colossification", set: "blb", tier: "hard",
      opp: { life: 11, battlefield: [c("Colossal Dreadmaw")] },
      you: { hand: [c("Giant Growth"), c("Longstalk Brawl"), c("Colossification")], battlefield: [c("Heartfire Hero"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest")] },
      explanation: "Cast Giant Growth →Heartfire Hero → cast Colossification →Colossal Dreadmaw → attack with Heartfire Hero → cast Longstalk Brawl (gift promised) →Heartfire Hero + Colossal Dreadmaw.",
      notes: `
LETHAL: cast Giant Growth →Heartfire Hero → cast Colossification →Colossal Dreadmaw → attack with Heartfire Hero → (opponent: no blocks) → cast Longstalk Brawl (gift promised) →Heartfire Hero + Colossal Dreadmaw: exactly 11 damage (the most this board can deal).
RULES: The board of blb-10-heartfire plus Colossification (rare) in your hand, with 7 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Colossification: at most 6. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    // ---- Duskmourn: House of Horror (DSK) ----
    puzzle({
      id: "dsk-11-grievous-wound", title: "Grievous Wound", set: "dsk", tier: "easy",
      opp: { life: 6, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Grand Entryway // Elegant Rotunda"), c("Grievous Wound")], battlefield: [c("Glimmer Seeker"), c("Balemurk Leech"), c("Plains"), c("Plains"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Grievous Wound →opponent → attack with Balemurk Leech + Glimmer Seeker.",
      notes: `
LETHAL: cast Grievous Wound →opponent → attack with Balemurk Leech + Glimmer Seeker → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of dsk-05-survivors plus Grievous Wound (rare) in your hand, with 5 lands to cast it.
WRONG LINES: Without Grievous Wound: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "dsk-12-fear-of-missing-out", title: "Fear of Missing Out", set: "dsk", tier: "easy",
      opp: { life: 6, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Manifest Dread"), c("Fear of Missing Out")], battlefield: [c("Hand That Feeds"), c("Forest"), c("Forest"), c("Mountain"), c("Mountain")], graveyard: [c("Forest"), c("Gray Ogre")], library: [c("Shock"), c("Mountain")] },
      explanation: "Cast Fear of Missing Out → cast Shock →opponent → attack with Hand That Feeds.",
      notes: `
LETHAL: cast Fear of Missing Out → cast Shock →opponent → attack with Hand That Feeds → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of dsk-03-feeding-time plus Fear of Missing Out (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without Fear of Missing Out: at most 4. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "dsk-13-abhorrent-oculus", title: "Abhorrent Oculus", set: "dsk", tier: "easy",
      opp: { life: 17, battlefield: [] },
      you: { hand: [c("Shock"), c("Violent Urge")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Abhorrent Oculus")], graveyard: [c("Forest"), c("Grizzly Bears"), c("Over the Edge")] },
      explanation: "Cast Shock →opponent → cast Violent Urge →Abhorrent Oculus → attack with Abhorrent Oculus + Hill Giant.",
      notes: `
LETHAL: cast Shock →opponent → cast Violent Urge →Abhorrent Oculus → attack with Abhorrent Oculus + Hill Giant → (opponent: no blocks): exactly 17 damage (the most this board can deal).
RULES: The board of dsk-02-violent-urge plus Abhorrent Oculus (mythic) on the battlefield.
WRONG LINES: Without Abhorrent Oculus: at most 10. Any other order or target deals less than 17.
UNIQUENESS: Solver-checked: one plan reaches 17; 18 isn't reachable.`
    }),
    puzzle({
      id: "dsk-14-balustrade-wurm", title: "Balustrade Wurm", set: "dsk", tier: "easy",
      opp: { life: 9, battlefield: [c("Wall of Wood")] },
      you: { hand: [], battlefield: [c("Erratic Apparition"), c("Ticket Booth // Tunnel of Hate", {"unlocked":[true,false]}), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Balustrade Wurm")] },
      explanation: "Activate Ticket Booth // Tunnel of Hate (Unlock Tunnel of Hate ({4}{R}{R})) → attack with Balustrade Wurm + Erratic Apparition → Ticket Booth // Tunnel of Hate → Balustrade Wurm.",
      notes: `
LETHAL: activate Ticket Booth // Tunnel of Hate (Unlock Tunnel of Hate ({4}{R}{R})) → attack with Balustrade Wurm + Erratic Apparition → Ticket Booth // Tunnel of Hate → Balustrade Wurm → (opponent: Wall of Wood blocks Balustrade Wurm): exactly 9 damage (the most this board can deal).
RULES: The board of dsk-06-tunnel-of-hate plus Balustrade Wurm (rare) on the battlefield.
WRONG LINES: Without Balustrade Wurm: at most 4. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "dsk-15-doomsday-excruciator", title: "Doomsday Excruciator", set: "dsk", tier: "medium",
      opp: { life: 11, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Grand Entryway // Elegant Rotunda")], battlefield: [c("Glimmer Seeker"), c("Balemurk Leech"), c("Plains"), c("Plains"), c("Doomsday Excruciator")] },
      explanation: "Attack with Balemurk Leech + Doomsday Excruciator + Glimmer Seeker → cast Grand Entryway → put Balemurk Leech's trigger on the stack first.",
      notes: `
LETHAL: attack with Balemurk Leech + Doomsday Excruciator + Glimmer Seeker → (opponent: Wall of Wood blocks Glimmer Seeker) → cast Grand Entryway → put Balemurk Leech's trigger on the stack first: exactly 11 damage (the most this board can deal).
RULES: The board of dsk-05-survivors plus Doomsday Excruciator (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Doomsday Excruciator: at most 5. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "dsk-16-marina-vendrell", title: "Marina Vendrell", set: "dsk", tier: "medium",
      opp: { life: 8, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Grand Entryway // Elegant Rotunda")], battlefield: [c("Glimmer Seeker"), c("Balemurk Leech"), c("Plains"), c("Plains"), c("Marina Vendrell")] },
      explanation: "Attack with Balemurk Leech + Glimmer Seeker + Marina Vendrell → cast Grand Entryway → put Balemurk Leech's trigger on the stack first.",
      notes: `
LETHAL: attack with Balemurk Leech + Glimmer Seeker + Marina Vendrell → (opponent: Wall of Wood blocks Glimmer Seeker) → cast Grand Entryway → put Balemurk Leech's trigger on the stack first: exactly 8 damage (the most this board can deal).
RULES: The board of dsk-05-survivors plus Marina Vendrell (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Marina Vendrell: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "dsk-17-the-mindskinner", title: "The Mindskinner", set: "dsk", tier: "hard",
      opp: { life: 9, battlefield: [c("Typhoid Rats")] },
      you: { hand: [c("Grand Entryway // Elegant Rotunda"), c("The Mindskinner")], battlefield: [c("Infernal Phantom"), c("Balemurk Leech"), c("Plains"), c("Plains"), c("Island"), c("Island"), c("Island")] },
      explanation: "Cast Grand Entryway → put Infernal Phantom's trigger on the stack first → put Balemurk Leech's trigger on the stack first → put Infernal Phantom's trigger on the stack first → attack with Infernal Phantom → Infernal Phantom → opponent → cast The Mindskinner.",
      notes: `
LETHAL: cast Grand Entryway → put Infernal Phantom's trigger on the stack first → put Balemurk Leech's trigger on the stack first → put Infernal Phantom's trigger on the stack first → attack with Infernal Phantom → (opponent: Typhoid Rats blocks Infernal Phantom) → Infernal Phantom → opponent → cast The Mindskinner: exactly 9 damage (the most this board can deal).
RULES: The board of dsk-08-infernal plus The Mindskinner (rare) in your hand, with 3 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without The Mindskinner: at most 8. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "dsk-18-overlord-of-the-floodpits", title: "Overlord of the Floodpits", set: "dsk", tier: "hard",
      opp: { life: 13, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Ticket Booth // Tunnel of Hate")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Overlord of the Floodpits")], library: [c("Quaketusk Boar"), c("Shock")] },
      explanation: "Cast Tunnel of Hate → attack with Hill Giant + Overlord of the Floodpits → put Overlord of the Floodpits's trigger on the stack first → Ticket Booth // Tunnel of Hate → Overlord of the Floodpits → Discard which card?: Quaketusk Boar → cast Shock →Grizzly Bears.",
      notes: `
LETHAL: cast Tunnel of Hate → attack with Hill Giant + Overlord of the Floodpits → put Overlord of the Floodpits's trigger on the stack first → Ticket Booth // Tunnel of Hate → Overlord of the Floodpits → Discard which card?: Quaketusk Boar → cast Shock →Grizzly Bears → (opponent: no blocks): exactly 13 damage (the most this board can deal).
RULES: The board of dsk-07-ticket-booth plus Overlord of the Floodpits (mythic) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Overlord of the Floodpits: at most 5. Any other order or target deals less than 13.
UNIQUENESS: Solver-checked: one plan reaches 13; 14 isn't reachable.`
    }),
    puzzle({
      id: "dsk-19-dissection-tools", title: "Dissection Tools", set: "dsk", tier: "hard",
      opp: { life: 12, battlefield: [c("Typhoid Rats")] },
      you: { hand: [c("Grand Entryway // Elegant Rotunda")], battlefield: [c("Infernal Phantom"), c("Balemurk Leech"), c("Plains"), c("Plains"), c("Dissection Tools")] },
      explanation: "Cast Grand Entryway → put Infernal Phantom's trigger on the stack first → put Balemurk Leech's trigger on the stack first → put Infernal Phantom's trigger on the stack first → activate Dissection Tools (Equip ) → Balemurk Leech → attack with Balemurk Leech + Infernal Phantom → Infernal Phantom → opponent.",
      notes: `
LETHAL: cast Grand Entryway → put Infernal Phantom's trigger on the stack first → put Balemurk Leech's trigger on the stack first → put Infernal Phantom's trigger on the stack first → activate Dissection Tools (Equip ) → Balemurk Leech → attack with Balemurk Leech + Infernal Phantom → (opponent: Typhoid Rats blocks Infernal Phantom) → Infernal Phantom → opponent: exactly 12 damage (the most this board can deal).
RULES: The board of dsk-08-infernal plus Dissection Tools (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Dissection Tools: at most 8. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
    }),
    puzzle({
      id: "dsk-20-chainsaw", title: "Chainsaw", set: "dsk", tier: "hard",
      opp: { life: 8, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Grand Entryway // Elegant Rotunda"), c("Chainsaw")], battlefield: [c("Glimmer Seeker"), c("Balemurk Leech"), c("Plains"), c("Plains"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Chainsaw → Chainsaw → Wall of Wood → attack with Balemurk Leech + Glimmer Seeker → cast Grand Entryway → put Balemurk Leech's trigger on the stack first.",
      notes: `
LETHAL: cast Chainsaw → Chainsaw → Wall of Wood → attack with Balemurk Leech + Glimmer Seeker → (opponent: no blocks) → cast Grand Entryway → put Balemurk Leech's trigger on the stack first: exactly 8 damage (the most this board can deal).
RULES: The board of dsk-05-survivors plus Chainsaw (rare) in your hand, with 2 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Chainsaw: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    // ---- Aetherdrift (DFT) ----
    puzzle({
      id: "dft-11-debris-beetle", title: "Debris Beetle", set: "dft", tier: "easy",
      opp: { life: 9, battlefield: [] },
      you: { hand: [c("Prowcatcher Specialist"), c("Debris Beetle")], battlefield: [c("Pacesetter Paragon"), c("Mountain"), c("Mountain"), c("Mountain"), c("Swamp"), c("Forest"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Debris Beetle → activate Pacesetter Paragon (Exhaust — {2}{R}: +1/+1 counter, double strike) → attack with Pacesetter Paragon.",
      notes: `
LETHAL: cast Debris Beetle → activate Pacesetter Paragon (Exhaust — {2}{R}: +1/+1 counter, double strike) → attack with Pacesetter Paragon → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: The board of dft-02-pacesetter plus Debris Beetle (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Debris Beetle: at most 6. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "dft-12-gas-guzzler", title: "Gas Guzzler", set: "dft", tier: "easy",
      opp: { life: 10, battlefield: [c("Caelorna, Coral Tyrant")] },
      you: { hand: [], battlefield: [c("Pacesetter Paragon", {"counters":{"+1/+1":1}}), c("Elvish Refueler"), c("Adrenaline Jockey"), c("Mountain"), c("Mountain"), c("Mountain"), c("Forest"), c("Forest"), c("Gas Guzzler")] },
      explanation: "Activate Pacesetter Paragon (Exhaust — {2}{R}: +1/+1 counter, double strike) → attack with Adrenaline Jockey + Elvish Refueler + Gas Guzzler + Pacesetter Paragon.",
      notes: `
LETHAL: activate Pacesetter Paragon (Exhaust — {2}{R}: +1/+1 counter, double strike) → attack with Adrenaline Jockey + Elvish Refueler + Gas Guzzler + Pacesetter Paragon → (opponent: no blocks): exactly 10 damage (the most this board can deal).
RULES: The board of dft-07-refuel plus Gas Guzzler (rare) on the battlefield.
WRONG LINES: Without Gas Guzzler: at most 8. Any other order or target deals less than 10.
UNIQUENESS: Solver-checked: one plan reaches 10; 11 isn't reachable.`
    }),
    puzzle({
      id: "dft-13-agonasaur-rex", title: "Agonasaur Rex", set: "dft", tier: "easy",
      opp: { life: 12, battlefield: [c("Grizzly Bears"), c("Grizzly Bears")] },
      you: { hand: [], battlefield: [c("Reckless Velocitaur"), c("Canyon Vaulter"), c("Marshals' Pathcruiser"), c("Agonasaur Rex")] },
      explanation: "Activate Marshals' Pathcruiser (Crew 5) (crewed by Reckless Velocitaur + Canyon Vaulter) → put Reckless Velocitaur's trigger on the stack first → attack with Agonasaur Rex + Marshals' Pathcruiser.",
      notes: `
LETHAL: activate Marshals' Pathcruiser (Crew 5) (crewed by Reckless Velocitaur + Canyon Vaulter) → put Reckless Velocitaur's trigger on the stack first → attack with Agonasaur Rex + Marshals' Pathcruiser → (opponent: Grizzly Bears + Grizzly Bears blocks Agonasaur Rex): exactly 12 damage (the most this board can deal).
RULES: The board of dft-05-pit-crew plus Agonasaur Rex (rare) on the battlefield.
WRONG LINES: Without Agonasaur Rex: at most 8. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
    }),
    puzzle({
      id: "dft-14-brightglass-gearhulk", title: "Brightglass Gearhulk", set: "dft", tier: "easy",
      opp: { life: 8, battlefield: [c("Jibbirik Omnivore")] },
      you: { hand: [c("Dynamite Diver")], battlefield: [c("Clamorous Ironclad"), c("Mountain"), c("Brightglass Gearhulk")] },
      explanation: "Cast Dynamite Diver → activate Clamorous Ironclad (Crew 3) (crewed by Dynamite Diver) → attack with Brightglass Gearhulk + Clamorous Ironclad.",
      notes: `
LETHAL: cast Dynamite Diver → activate Clamorous Ironclad (Crew 3) (crewed by Dynamite Diver) → attack with Brightglass Gearhulk + Clamorous Ironclad → (opponent: Jibbirik Omnivore blocks Brightglass Gearhulk): exactly 8 damage (the most this board can deal).
RULES: The board of dft-04-dynamite-diver plus Brightglass Gearhulk (mythic) on the battlefield.
WRONG LINES: Without Brightglass Gearhulk: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "dft-15-loot", title: "Loot", set: "dft", tier: "medium",
      opp: { life: 11, battlefield: [] },
      you: { hand: [c("Prowcatcher Specialist")], battlefield: [c("Pacesetter Paragon"), c("Mountain"), c("Mountain"), c("Mountain"), c("Loot, the Pathfinder")] },
      explanation: "Cast Prowcatcher Specialist → attack with Loot, the Pathfinder + Pacesetter Paragon + Prowcatcher Specialist → activate Loot, the Pathfinder (Exhaust — {R}, {T}: 3 damage to any target) → opponent.",
      notes: `
LETHAL: cast Prowcatcher Specialist → attack with Loot, the Pathfinder + Pacesetter Paragon + Prowcatcher Specialist → activate Loot, the Pathfinder (Exhaust — {R}, {T}: 3 damage to any target) → opponent → (opponent: no blocks): exactly 11 damage (the most this board can deal).
RULES: The board of dft-02-pacesetter plus Loot, the Pathfinder (mythic) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Loot, the Pathfinder: at most 6. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "dft-16-full-throttle", title: "Full Throttle", set: "dft", tier: "medium",
      opp: { life: 24, battlefield: [c("Grizzly Bears"), c("Grizzly Bears")] },
      you: { hand: [c("Full Throttle")], battlefield: [c("Reckless Velocitaur"), c("Canyon Vaulter"), c("Marshals' Pathcruiser"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Full Throttle → activate Marshals' Pathcruiser (Crew 5) (crewed by Reckless Velocitaur + Canyon Vaulter) → put Reckless Velocitaur's trigger on the stack first → attack with Marshals' Pathcruiser → attack with Marshals' Pathcruiser → attack with Marshals' Pathcruiser.",
      notes: `
LETHAL: cast Full Throttle → activate Marshals' Pathcruiser (Crew 5) (crewed by Reckless Velocitaur + Canyon Vaulter) → put Reckless Velocitaur's trigger on the stack first → attack with Marshals' Pathcruiser → (opponent: no blocks) → attack with Marshals' Pathcruiser → (opponent: no blocks) → attack with Marshals' Pathcruiser → (opponent: no blocks): exactly 24 damage (the most this board can deal).
RULES: The board of dft-05-pit-crew plus Full Throttle (rare) in your hand, with 6 lands to cast it.
WRONG LINES: Without Full Throttle: at most 8. Any other order or target deals less than 24.
UNIQUENESS: Solver-checked: one plan reaches 24; 25 isn't reachable.`
    }),
    puzzle({
      id: "dft-17-howlsquad-heavy", title: "Howlsquad Heavy", set: "dft", tier: "hard",
      opp: { life: 7, battlefield: [c("Jibbirik Omnivore")] },
      you: { hand: [c("Dynamite Diver"), c("Howlsquad Heavy")], battlefield: [c("Clamorous Ironclad"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Dynamite Diver → cast Howlsquad Heavy → activate Clamorous Ironclad (Crew 3) (crewed by Howlsquad Heavy + Goblin) → attack with Clamorous Ironclad + Dynamite Diver → put Speed's trigger on the stack first → Dynamite Diver → opponent.",
      notes: `
LETHAL: cast Dynamite Diver → cast Howlsquad Heavy → activate Clamorous Ironclad (Crew 3) (crewed by Howlsquad Heavy + Goblin) → attack with Clamorous Ironclad + Dynamite Diver → (opponent: Jibbirik Omnivore blocks Dynamite Diver) → put Speed's trigger on the stack first → Dynamite Diver → opponent: exactly 7 damage (the most this board can deal).
RULES: The board of dft-04-dynamite-diver plus Howlsquad Heavy (rare) in your hand, with 3 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Howlsquad Heavy: at most 6. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "dft-18-explosive-getaway", title: "Explosive Getaway", set: "dft", tier: "hard",
      opp: { life: 7, battlefield: [c("Jibbirik Omnivore")] },
      you: { hand: [c("Dynamite Diver"), c("Explosive Getaway")], battlefield: [c("Clamorous Ironclad"), c("Mountain"), c("Mountain"), c("Plains"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Dynamite Diver → activate Clamorous Ironclad (Crew 3) (crewed by Dynamite Diver) → attack with Clamorous Ironclad → cast Explosive Getaway →Clamorous Ironclad → Dynamite Diver → opponent.",
      notes: `
LETHAL: cast Dynamite Diver → activate Clamorous Ironclad (Crew 3) (crewed by Dynamite Diver) → attack with Clamorous Ironclad → (opponent: no blocks) → cast Explosive Getaway →Clamorous Ironclad → Dynamite Diver → opponent: exactly 7 damage (the most this board can deal).
RULES: The board of dft-04-dynamite-diver plus Explosive Getaway (rare) in your hand, with 5 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Explosive Getaway: at most 6. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "dft-19-spectacular-pileup", title: "Spectacular Pileup", set: "dft", tier: "hard",
      opp: { life: 7, battlefield: [c("Jibbirik Omnivore")] },
      you: { hand: [c("Dynamite Diver"), c("Spectacular Pileup")], battlefield: [c("Clamorous Ironclad"), c("Mountain"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Dynamite Diver → activate Clamorous Ironclad (Crew 3) (crewed by Dynamite Diver) → attack with Clamorous Ironclad → cast Spectacular Pileup → Dynamite Diver → opponent.",
      notes: `
LETHAL: cast Dynamite Diver → activate Clamorous Ironclad (Crew 3) (crewed by Dynamite Diver) → attack with Clamorous Ironclad → (opponent: no blocks) → cast Spectacular Pileup → Dynamite Diver → opponent: exactly 7 damage (the most this board can deal).
RULES: The board of dft-04-dynamite-diver plus Spectacular Pileup (rare) in your hand, with 5 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Spectacular Pileup: at most 6. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "dft-20-waxen-shapethief", title: "Waxen Shapethief", set: "dft", tier: "hard",
      opp: { life: 10, battlefield: [c("Grizzly Bears"), c("Grizzly Bears")] },
      you: { hand: [c("Waxen Shapethief")], battlefield: [c("Reckless Velocitaur"), c("Canyon Vaulter"), c("Marshals' Pathcruiser"), c("Island"), c("Island"), c("Island"), c("Island")] },
      explanation: "Cast Waxen Shapethief → Waxen Shapethief: Copy Reckless Velocitaur → activate Marshals' Pathcruiser (Crew 5) (crewed by Reckless Velocitaur + Canyon Vaulter + Reckless Velocitaur) → put Reckless Velocitaur's trigger on the stack first → put Canyon Vaulter's trigger on the stack first → attack with Marshals' Pathcruiser.",
      notes: `
LETHAL: cast Waxen Shapethief → Waxen Shapethief: Copy Reckless Velocitaur → activate Marshals' Pathcruiser (Crew 5) (crewed by Reckless Velocitaur + Canyon Vaulter + Reckless Velocitaur) → put Reckless Velocitaur's trigger on the stack first → put Canyon Vaulter's trigger on the stack first → attack with Marshals' Pathcruiser → (opponent: no blocks): exactly 10 damage (the most this board can deal).
RULES: The board of dft-05-pit-crew plus Waxen Shapethief (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Waxen Shapethief: at most 8. Any other order or target deals less than 10.
UNIQUENESS: Solver-checked: one plan reaches 10; 11 isn't reachable.`
    }),
    // ---- Tarkir: Dragonstorm (TDM) ----
    puzzle({
      id: "tdm-11-inevitable-defeat", title: "Inevitable Defeat", set: "tdm", tier: "easy",
      opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Twinmaw Stormbrood"), c("Inevitable Defeat")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Mountain"), c("Plains"), c("Swamp"), c("Mountain")] },
      explanation: "Cast Inevitable Defeat →Krotiq Nestguard → attack with Gray Ogre + Hill Giant.",
      notes: `
LETHAL: cast Inevitable Defeat →Krotiq Nestguard → attack with Gray Ogre + Hill Giant → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: The board of tdm-05-charring-bite plus Inevitable Defeat (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Inevitable Defeat: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "tdm-12-craterhoof-behemoth", title: "Craterhoof Behemoth", set: "tdm", tier: "easy",
      opp: { life: 16, battlefield: [] },
      you: { hand: [c("Craterhoof Behemoth")], battlefield: [c("Hill Giant", {"sick":true}), c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest")], graveyard: [c("Wild Ride")] },
      explanation: "Cast Wild Ride (harmonize) (tapping Hill Giant) →Gray Ogre → cast Craterhoof Behemoth → attack with Craterhoof Behemoth + Gray Ogre.",
      notes: `
LETHAL: cast Wild Ride (harmonize) (tapping Hill Giant) →Gray Ogre → cast Craterhoof Behemoth → attack with Craterhoof Behemoth + Gray Ogre → (opponent: no blocks): exactly 16 damage (the most this board can deal).
RULES: The board of tdm-04-wild-ride plus Craterhoof Behemoth (mythic) in your hand, with 8 lands to cast it.
WRONG LINES: Without Craterhoof Behemoth: at most 5. Any other order or target deals less than 16.
UNIQUENESS: Solver-checked: one plan reaches 16; 17 isn't reachable.`
    }),
    puzzle({
      id: "tdm-13-ambling-stormshell", title: "Ambling Stormshell", set: "tdm", tier: "easy",
      opp: { life: 12, battlefield: [c("Dragon Sniper")] },
      you: { hand: [c("Caustic Exhale")], battlefield: [c("Stormshriek Feral"), c("Hill Giant"), c("Swamp"), c("Mountain"), c("Mountain"), c("Ambling Stormshell")] },
      explanation: "Cast Caustic Exhale (beholding Stormshriek Feral) →Dragon Sniper → activate Stormshriek Feral ({1}{R}: +1/+0) → attack with Ambling Stormshell + Hill Giant + Stormshriek Feral.",
      notes: `
LETHAL: cast Caustic Exhale (beholding Stormshriek Feral) →Dragon Sniper → activate Stormshriek Feral ({1}{R}: +1/+0) → attack with Ambling Stormshell + Hill Giant + Stormshriek Feral → (opponent: no blocks): exactly 12 damage (the most this board can deal).
RULES: The board of tdm-06-caustic-exhale plus Ambling Stormshell (rare) on the battlefield.
WRONG LINES: Without Ambling Stormshell: at most 7. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
    }),
    puzzle({
      id: "tdm-14-dalkovan-encampment", title: "Dalkovan Encampment", set: "tdm", tier: "easy",
      opp: { life: 6, battlefield: [] },
      you: { hand: [c("Dalkovan Encampment")], battlefield: [c("Hill Giant", {"sick":true}), c("Gray Ogre"), c("Mountain"), c("Mountain")], graveyard: [c("Wild Ride")] },
      explanation: "Play Dalkovan Encampment → cast Wild Ride (harmonize) (tapping Gray Ogre) →Hill Giant → attack with Hill Giant.",
      notes: `
LETHAL: play Dalkovan Encampment → cast Wild Ride (harmonize) (tapping Gray Ogre) →Hill Giant → attack with Hill Giant → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of tdm-04-wild-ride plus Dalkovan Encampment (rare) in your hand.
WRONG LINES: Without Dalkovan Encampment: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "tdm-15-naga-fleshcrafter", title: "Naga Fleshcrafter", set: "tdm", tier: "medium",
      opp: { life: 9, battlefield: [c("Krotiq Nestguard"), c("Grizzly Bears")] },
      you: { hand: [c("Naga Fleshcrafter")], battlefield: [c("Dalkovan Packbeasts"), c("Shocking Sharpshooter"), c("Island"), c("Island"), c("Island"), c("Island")] },
      explanation: "Cast Naga Fleshcrafter → Naga Fleshcrafter: Copy Shocking Sharpshooter → Shocking Sharpshooter → opponent → attack with Dalkovan Packbeasts + Shocking Sharpshooter → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → Shocking Sharpshooter → opponent.",
      notes: `
LETHAL: cast Naga Fleshcrafter → Naga Fleshcrafter: Copy Shocking Sharpshooter → Shocking Sharpshooter → opponent → attack with Dalkovan Packbeasts + Shocking Sharpshooter → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → Shocking Sharpshooter → opponent → (opponent: Krotiq Nestguard blocks Shocking Sharpshooter, Grizzly Bears blocks Warrior): exactly 9 damage (the most this board can deal).
RULES: The board of tdm-01-call-to-arms plus Naga Fleshcrafter (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Naga Fleshcrafter: at most 5. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "tdm-16-flamehold-grappler", title: "Flamehold Grappler", set: "tdm", tier: "medium",
      opp: { life: 5, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Fortress Kin-Guard"), c("Flamehold Grappler")], battlefield: [c("Shocking Sharpshooter"), c("Plains"), c("Plains"), c("Island"), c("Mountain"), c("Plains")] },
      explanation: "Cast Flamehold Grappler → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → cast Fortress Kin-Guard → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → Fortress Kin-Guard endures 1: Create a 1/1 Spirit token → Shocking Sharpshooter → opponent → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → Fortress Kin-Guard endures 1: Create a 1/1 Spirit token → Shocking Sharpshooter → opponent.",
      notes: `
LETHAL: cast Flamehold Grappler → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → cast Fortress Kin-Guard → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → Fortress Kin-Guard endures 1: Create a 1/1 Spirit token → Shocking Sharpshooter → opponent → put Shocking Sharpshooter's trigger on the stack first → Shocking Sharpshooter → opponent → Fortress Kin-Guard endures 1: Create a 1/1 Spirit token → Shocking Sharpshooter → opponent: exactly 5 damage (the most this board can deal).
RULES: The board of tdm-02-kin-guard plus Flamehold Grappler (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Flamehold Grappler: at most 2. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "tdm-17-awaken-the-honored-dead", title: "Awaken the Honored Dead", set: "tdm", tier: "hard",
      opp: { life: 14, battlefield: [c("Krotiq Nestguard"), c("Krotiq Nestguard")] },
      you: { hand: [c("Awaken the Honored Dead")], battlefield: [c("Marshal of the Lost"), c("Dragonback Lancer"), c("Dalkovan Packbeasts"), c("Swamp"), c("Forest"), c("Island")] },
      explanation: "Cast Awaken the Honored Dead → Awaken the Honored Dead → Krotiq Nestguard → attack with Dalkovan Packbeasts + Dragonback Lancer + Marshal of the Lost → put Marshal of the Lost's trigger on the stack first → Marshal of the Lost → Dragonback Lancer → put Dragonback Lancer's trigger on the stack first.",
      notes: `
LETHAL: cast Awaken the Honored Dead → Awaken the Honored Dead → Krotiq Nestguard → attack with Dalkovan Packbeasts + Dragonback Lancer + Marshal of the Lost → put Marshal of the Lost's trigger on the stack first → Marshal of the Lost → Dragonback Lancer → put Dragonback Lancer's trigger on the stack first → (opponent: Krotiq Nestguard blocks Marshal of the Lost): exactly 14 damage (the most this board can deal).
RULES: The board of tdm-08-marshal-of-the-lost plus Awaken the Honored Dead (rare) in your hand, with 3 lands to cast it. TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Awaken the Honored Dead: at most 13. Any other order or target deals less than 14.
UNIQUENESS: Solver-checked: one plan reaches 14; 15 isn't reachable.`
    }),
    puzzle({
      id: "tdm-18-felothar", title: "Felothar", set: "tdm", tier: "hard",
      opp: { life: 15, battlefield: [c("Krotiq Nestguard"), c("Krotiq Nestguard")] },
      you: { hand: [c("Felothar, Dawn of the Abzan")], battlefield: [c("Marshal of the Lost"), c("Dragonback Lancer"), c("Dalkovan Packbeasts"), c("Plains"), c("Swamp"), c("Forest")] },
      explanation: "Cast Felothar, Dawn of the Abzan → Sacrifice one?: Sacrifice Felothar, Dawn of the Abzan → attack with Dalkovan Packbeasts + Dragonback Lancer + Marshal of the Lost → put Marshal of the Lost's trigger on the stack first → Marshal of the Lost → Dragonback Lancer → put Dragonback Lancer's trigger on the stack first.",
      notes: `
LETHAL: cast Felothar, Dawn of the Abzan → Sacrifice one?: Sacrifice Felothar, Dawn of the Abzan → attack with Dalkovan Packbeasts + Dragonback Lancer + Marshal of the Lost → put Marshal of the Lost's trigger on the stack first → Marshal of the Lost → Dragonback Lancer → put Dragonback Lancer's trigger on the stack first → (opponent: Krotiq Nestguard blocks Marshal of the Lost, Krotiq Nestguard blocks Warrior): exactly 15 damage (the most this board can deal).
RULES: The board of tdm-08-marshal-of-the-lost plus Felothar, Dawn of the Abzan (rare) in your hand, with 3 lands to cast it. TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Felothar, Dawn of the Abzan: at most 13. Any other order or target deals less than 15.
UNIQUENESS: Solver-checked: one plan reaches 15; 16 isn't reachable.`
    }),
    puzzle({
      id: "tdm-19-herd-heirloom", title: "Herd Heirloom", set: "tdm", tier: "hard",
      opp: { life: 15, battlefield: [c("Krotiq Nestguard"), c("Krotiq Nestguard")] },
      you: { hand: [c("Herd Heirloom")], battlefield: [c("Marshal of the Lost"), c("Dragonback Lancer"), c("Dalkovan Packbeasts"), c("Forest"), c("Forest")] },
      explanation: "Cast Herd Heirloom → attack with Dalkovan Packbeasts + Dragonback Lancer + Marshal of the Lost → put Marshal of the Lost's trigger on the stack first → Marshal of the Lost → Marshal of the Lost → put Dragonback Lancer's trigger on the stack first → activate Herd Heirloom ({T}: Target creature you control with power 4 or greater gains trample and draws on combat damage) → Marshal of the Lost.",
      notes: `
LETHAL: cast Herd Heirloom → attack with Dalkovan Packbeasts + Dragonback Lancer + Marshal of the Lost → put Marshal of the Lost's trigger on the stack first → Marshal of the Lost → Marshal of the Lost → put Dragonback Lancer's trigger on the stack first → activate Herd Heirloom ({T}: Target creature you control with power 4 or greater gains trample and draws on combat damage) → Marshal of the Lost → (opponent: Krotiq Nestguard blocks Warrior, Krotiq Nestguard blocks Warrior): exactly 15 damage (the most this board can deal).
RULES: The board of tdm-08-marshal-of-the-lost plus Herd Heirloom (rare) in your hand, with 2 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2). TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Herd Heirloom: at most 13. Any other order or target deals less than 15.
UNIQUENESS: Solver-checked: one plan reaches 15; 16 isn't reachable.`
    }),
    puzzle({
      id: "tdm-20-frostcliff-siege", title: "Frostcliff Siege", set: "tdm", tier: "hard",
      opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Corroding Dragonstorm"), c("Boulderborn Dragon"), c("Frostcliff Siege")], battlefield: [c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Island"), c("Mountain"), c("Island")] },
      explanation: "Cast Corroding Dragonstorm → cast Boulderborn Dragon → cast Frostcliff Siege → Frostcliff Siege: Temur → cast Corroding Dragonstorm → attack with Boulderborn Dragon.",
      notes: `
LETHAL: cast Corroding Dragonstorm → cast Boulderborn Dragon → cast Frostcliff Siege → Frostcliff Siege: Temur → cast Corroding Dragonstorm → attack with Boulderborn Dragon → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: The board of tdm-07-dragonstorm plus Frostcliff Siege (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Frostcliff Siege: at most 4. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    // ---- Final Fantasy (FIN) ----
    puzzle({
      id: "fin-11-deadly-embrace", title: "Deadly Embrace", set: "fin", tier: "easy",
      opp: { life: 6, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Samurai's Katana"), c("Deadly Embrace")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Samurai's Katana → cast Deadly Embrace →Grizzly Bears → attack with Hero + Hill Giant.",
      notes: `
LETHAL: cast Samurai's Katana → cast Deadly Embrace →Grizzly Bears → attack with Hero + Hill Giant → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of fin-01-job-select plus Deadly Embrace (rare) in your hand, with 5 lands to cast it.
WRONG LINES: Without Deadly Embrace: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "fin-12-seifer-almasy", title: "Seifer Almasy", set: "fin", tier: "easy",
      opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Thunder Magic"), c("Seifer Almasy")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Thunder Magic (Thundara: 4 damage to target creature) →Krotiq Nestguard → cast Seifer Almasy → attack with Hill Giant.",
      notes: `
LETHAL: cast Thunder Magic (Thundara: 4 damage to target creature) →Krotiq Nestguard → cast Seifer Almasy → attack with Hill Giant → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of fin-02-thundara plus Seifer Almasy (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Seifer Almasy: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "fin-13-vivi-ornitier", title: "Vivi Ornitier", set: "fin", tier: "easy",
      opp: { life: 11, battlefield: [] },
      you: { hand: [c("Clash of the Eikons"), c("Vivi Ornitier")], battlefield: [c("Summon: Choco/Mog", {"counters":{"lore":3}}), c("Hill Giant"), c("Gray Ogre"), c("Forest"), c("Island"), c("Mountain"), c("Island")] },
      explanation: "Cast Vivi Ornitier → cast Clash of the Eikons (Remove a lore counter from target Saga you control + Put a lore counter on target Saga you control) →Summon: Choco/Mog + Summon: Choco/Mog → attack with Gray Ogre + Hill Giant + Summon: Choco/Mog.",
      notes: `
LETHAL: cast Vivi Ornitier → cast Clash of the Eikons (Remove a lore counter from target Saga you control + Put a lore counter on target Saga you control) →Summon: Choco/Mog + Summon: Choco/Mog → attack with Gray Ogre + Hill Giant + Summon: Choco/Mog → (opponent: no blocks): exactly 11 damage (the most this board can deal).
RULES: The board of fin-08-stampede plus Vivi Ornitier (mythic) in your hand, with 3 lands to cast it.
WRONG LINES: Without Vivi Ornitier: at most 10. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "fin-14-dion", title: "Dion", set: "fin", tier: "easy",
      opp: { life: 11, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Tifa's Limit Break")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Dion, Bahamut's Dominant")] },
      explanation: "Cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Dion, Bahamut's Dominant → attack with Dion, Bahamut's Dominant + Gray Ogre + Hill Giant.",
      notes: `
LETHAL: cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Dion, Bahamut's Dominant → attack with Dion, Bahamut's Dominant + Gray Ogre + Hill Giant → (opponent: Grizzly Bears blocks Hill Giant): exactly 11 damage (the most this board can deal).
RULES: The board of fin-06-final-heaven plus Dion, Bahamut's Dominant (rare) on the battlefield.
WRONG LINES: Without Dion, Bahamut's Dominant: at most 6. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "fin-15-aerith-gainsborough", title: "Aerith Gainsborough", set: "fin", tier: "medium",
      opp: { life: 8, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Tifa's Limit Break")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Aerith Gainsborough")] },
      explanation: "Attack with Aerith Gainsborough + Gray Ogre + Hill Giant → cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Gray Ogre.",
      notes: `
LETHAL: attack with Aerith Gainsborough + Gray Ogre + Hill Giant → (opponent: Grizzly Bears blocks Hill Giant) → cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Gray Ogre: exactly 8 damage (the most this board can deal).
RULES: The board of fin-06-final-heaven plus Aerith Gainsborough (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Aerith Gainsborough: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "fin-16-ardyn", title: "Ardyn", set: "fin", tier: "medium",
      opp: { life: 11, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Tifa's Limit Break")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Ardyn, the Usurper")] },
      explanation: "Attack with Ardyn, the Usurper + Gray Ogre + Hill Giant → cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Hill Giant.",
      notes: `
LETHAL: attack with Ardyn, the Usurper + Gray Ogre + Hill Giant → (opponent: Grizzly Bears blocks Ardyn, the Usurper) → cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Hill Giant: exactly 11 damage (the most this board can deal).
RULES: The board of fin-06-final-heaven plus Ardyn, the Usurper (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Ardyn, the Usurper: at most 6. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "fin-17-sephiroth", title: "Sephiroth", set: "fin", tier: "hard",
      opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Clash of the Eikons"), c("Sephiroth, Fabled SOLDIER")], battlefield: [c("Summon: Primal Garuda", {"counters":{"lore":1}}), c("Hill Giant"), c("Forest"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Clash of the Eikons (Put a lore counter on target Saga you control) →Summon: Primal Garuda → Summon: Primal Garuda → Hill Giant → attack with Hill Giant + Summon: Primal Garuda → cast Sephiroth, Fabled SOLDIER → Sacrifice one?: Sacrifice Summon: Primal Garuda.",
      notes: `
LETHAL: cast Clash of the Eikons (Put a lore counter on target Saga you control) →Summon: Primal Garuda → Summon: Primal Garuda → Hill Giant → attack with Hill Giant + Summon: Primal Garuda → (opponent: no blocks) → cast Sephiroth, Fabled SOLDIER → Sacrifice one?: Sacrifice Summon: Primal Garuda: exactly 8 damage (the most this board can deal).
RULES: The board of fin-05-slipstream plus Sephiroth, Fabled SOLDIER (mythic) in your hand, with 3 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Sephiroth, Fabled SOLDIER: at most 7. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "fin-18-tifa-lockhart", title: "Tifa Lockhart", set: "fin", tier: "hard",
      opp: { life: 6, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Mountain")], battlefield: [c("Sabotender"), c("Sazh's Chocobo"), c("Ride the Shoopuf"), c("Tifa Lockhart")] },
      explanation: "Play Mountain → put Sabotender's trigger on the stack first → put Sazh's Chocobo's trigger on the stack first → put Tifa Lockhart's trigger on the stack first → Ride the Shoopuf → Tifa Lockhart → attack with Sabotender + Sazh's Chocobo + Tifa Lockhart.",
      notes: `
LETHAL: play Mountain → put Sabotender's trigger on the stack first → put Sazh's Chocobo's trigger on the stack first → put Tifa Lockhart's trigger on the stack first → Ride the Shoopuf → Tifa Lockhart → attack with Sabotender + Sazh's Chocobo + Tifa Lockhart → (opponent: Grizzly Bears blocks Sabotender): exactly 6 damage (the most this board can deal).
RULES: The board of fin-04-landfall plus Tifa Lockhart (rare) on the battlefield. TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Tifa Lockhart: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "fin-19-cloud", title: "Cloud", set: "fin", tier: "hard",
      opp: { life: 8, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Tifa's Limit Break")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Cloud, Midgar Mercenary")] },
      explanation: "Attack with Cloud, Midgar Mercenary + Gray Ogre + Hill Giant → cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Gray Ogre.",
      notes: `
LETHAL: attack with Cloud, Midgar Mercenary + Gray Ogre + Hill Giant → (opponent: Grizzly Bears blocks Hill Giant) → cast Tifa's Limit Break (Final Heaven: triple target creature's power and toughness) →Gray Ogre: exactly 8 damage (the most this board can deal).
RULES: The board of fin-06-final-heaven plus Cloud, Midgar Mercenary (mythic) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Cloud, Midgar Mercenary: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "fin-20-traveling-chocobo", title: "Traveling Chocobo", set: "fin", tier: "hard",
      opp: { life: 5, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Mountain"), c("Traveling Chocobo")], battlefield: [c("Sabotender"), c("Sazh's Chocobo"), c("Ride the Shoopuf"), c("Forest"), c("Forest"), c("Forest")] },
      explanation: "Cast Traveling Chocobo → play Mountain → put Sabotender's trigger on the stack first → put Sabotender's trigger on the stack first → put Sazh's Chocobo's trigger on the stack first → put Sazh's Chocobo's trigger on the stack first → Ride the Shoopuf → Sabotender → Ride the Shoopuf → Sazh's Chocobo → attack with Sabotender + Sazh's Chocobo.",
      notes: `
LETHAL: cast Traveling Chocobo → play Mountain → put Sabotender's trigger on the stack first → put Sabotender's trigger on the stack first → put Sazh's Chocobo's trigger on the stack first → put Sazh's Chocobo's trigger on the stack first → Ride the Shoopuf → Sabotender → Ride the Shoopuf → Sazh's Chocobo → attack with Sabotender + Sazh's Chocobo → (opponent: Grizzly Bears blocks Sabotender): exactly 5 damage (the most this board can deal).
RULES: The board of fin-04-landfall plus Traveling Chocobo (mythic) in your hand, with 3 lands to cast it.
WRONG LINES: Without Traveling Chocobo: at most 3. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    // ---- Edge of Eternities (EOE) ----
    puzzle({
      id: "eoe-11-archenemy-s-charm", title: "Archenemy's Charm", set: "eoe", tier: "easy",
      opp: { life: 9, battlefield: [c("Grizzly Bears"), c("Galvanizing Sawship")] },
      you: { hand: [c("Systems Override"), c("Archenemy's Charm")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Systems Override →Galvanizing Sawship → cast Archenemy's Charm (Exile target creature or planeswalker) →Grizzly Bears → attack with Galvanizing Sawship + Hill Giant.",
      notes: `
LETHAL: cast Systems Override →Galvanizing Sawship → cast Archenemy's Charm (Exile target creature or planeswalker) →Grizzly Bears → attack with Galvanizing Sawship + Hill Giant → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: The board of eoe-06-systems-override plus Archenemy's Charm (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Archenemy's Charm: at most 6. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "eoe-12-frenzied-baloth", title: "Frenzied Baloth", set: "eoe", tier: "easy",
      opp: { life: 4, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Frenzied Baloth")], battlefield: [c("Wurmwall Sweeper"), c("Hemosymbic Mite"), c("Gray Ogre"), c("Forest"), c("Forest")] },
      explanation: "Cast Frenzied Baloth → attack with Frenzied Baloth + Gray Ogre + Hemosymbic Mite → Hemosymbic Mite → Gray Ogre.",
      notes: `
LETHAL: cast Frenzied Baloth → attack with Frenzied Baloth + Gray Ogre + Hemosymbic Mite → Hemosymbic Mite → Gray Ogre → (opponent: Krotiq Nestguard blocks Gray Ogre): exactly 4 damage (the most this board can deal).
RULES: The board of eoe-05-mite plus Frenzied Baloth (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without Frenzied Baloth: at most 2. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
    }),
    puzzle({
      id: "eoe-13-alpharael", title: "Alpharael", set: "eoe", tier: "easy",
      opp: { life: 13, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Tragic Trajectory")], battlefield: [c("Hill Giant"), c("Lander"), c("Swamp"), c("Swamp"), c("Swamp"), c("Alpharael, Stonechosen")] },
      explanation: "Activate Lander ({2}, {T}, Sacrifice: search for a basic land) → cast Tragic Trajectory →Krotiq Nestguard → attack with Alpharael, Stonechosen + Hill Giant.",
      notes: `
LETHAL: activate Lander ({2}, {T}, Sacrifice: search for a basic land) → cast Tragic Trajectory →Krotiq Nestguard → attack with Alpharael, Stonechosen + Hill Giant → (opponent: no blocks): exactly 13 damage (the most this board can deal).
RULES: The board of eoe-03-tragic-trajectory plus Alpharael, Stonechosen (mythic) on the battlefield.
WRONG LINES: Without Alpharael, Stonechosen: at most 3. Any other order or target deals less than 13.
UNIQUENESS: Solver-checked: one plan reaches 13; 14 isn't reachable.`
    }),
    puzzle({
      id: "eoe-14-anticausal-vestige", title: "Anticausal Vestige", set: "eoe", tier: "easy",
      opp: { life: 13, battlefield: [] },
      you: { hand: [c("Red Tiger Mechan"), c("Plasma Bolt")], battlefield: [c("Mountain"), c("Mountain"), c("Mountain"), c("Anticausal Vestige")] },
      explanation: "Cast Red Tiger Mechan (warp) → cast Plasma Bolt →opponent → attack with Anticausal Vestige + Red Tiger Mechan.",
      notes: `
LETHAL: cast Red Tiger Mechan (warp) → cast Plasma Bolt →opponent → attack with Anticausal Vestige + Red Tiger Mechan → (opponent: no blocks): exactly 13 damage (the most this board can deal).
RULES: The board of eoe-02-warp-speed plus Anticausal Vestige (rare) on the battlefield.
WRONG LINES: Without Anticausal Vestige: at most 6. Any other order or target deals less than 13.
UNIQUENESS: Solver-checked: one plan reaches 13; 14 isn't reachable.`
    }),
    puzzle({
      id: "eoe-15-haliya", title: "Haliya", set: "eoe", tier: "medium",
      opp: { life: 9, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Drill Too Deep"), c("Haliya, Guided by Light")], battlefield: [c("Debris Field Crusher", {"counters":{"charge":3}}), c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Haliya, Guided by Light (warp) → activate Debris Field Crusher (Station (8+)) (stationed by Hill Giant) → activate Debris Field Crusher (Station (8+)) (stationed by Haliya, Guided by Light) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → attack with Debris Field Crusher.",
      notes: `
LETHAL: cast Haliya, Guided by Light (warp) → activate Debris Field Crusher (Station (8+)) (stationed by Hill Giant) → activate Debris Field Crusher (Station (8+)) (stationed by Haliya, Guided by Light) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → attack with Debris Field Crusher → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: The board of eoe-07-drill-too-deep plus Haliya, Guided by Light (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Haliya, Guided by Light: at most 5. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "eoe-16-hardlight-containment", title: "Hardlight Containment", set: "eoe", tier: "medium",
      opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Weftstalker Ardent"), c("Galactic Wayfarer"), c("Plasma Bolt"), c("Hardlight Containment")], battlefield: [c("Hill Giant"), c("Forest"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain"), c("Plains")] },
      explanation: "Cast Weftstalker Ardent (warp) → cast Galactic Wayfarer → put Weftstalker Ardent's trigger on the stack first → cast Plasma Bolt →opponent → cast Hardlight Containment →Lander → Hardlight Containment → Krotiq Nestguard → attack with Hill Giant.",
      notes: `
LETHAL: cast Weftstalker Ardent (warp) → cast Galactic Wayfarer → put Weftstalker Ardent's trigger on the stack first → cast Plasma Bolt →opponent → cast Hardlight Containment →Lander → Hardlight Containment → Krotiq Nestguard → attack with Hill Giant → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: The board of eoe-10-wayfarer plus Hardlight Containment (rare) in your hand, with 1 land to cast it.
WRONG LINES: Without Hardlight Containment: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "eoe-17-warmaker-gunship", title: "Warmaker Gunship", set: "eoe", tier: "hard",
      opp: { life: 3, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Weftstalker Ardent"), c("Knight Luminary"), c("Warmaker Gunship")], battlefield: [c("Mountain"), c("Plains"), c("Plains"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Weftstalker Ardent (warp) → cast Knight Luminary (warp) → put Weftstalker Ardent's trigger on the stack first → cast Warmaker Gunship → put Weftstalker Ardent's trigger on the stack first → Warmaker Gunship → Krotiq Nestguard.",
      notes: `
LETHAL: cast Weftstalker Ardent (warp) → cast Knight Luminary (warp) → put Weftstalker Ardent's trigger on the stack first → cast Warmaker Gunship → put Weftstalker Ardent's trigger on the stack first → Warmaker Gunship → Krotiq Nestguard: exactly 3 damage (the most this board can deal).
RULES: The board of eoe-04-weftstalker plus Warmaker Gunship (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Warmaker Gunship: at most 2. Any other order or target deals less than 3.
UNIQUENESS: Solver-checked: one plan reaches 3; 4 isn't reachable.`
    }),
    puzzle({
      id: "eoe-18-pinnacle-emissary", title: "Pinnacle Emissary", set: "eoe", tier: "hard",
      opp: { life: 9, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Drill Too Deep"), c("Pinnacle Emissary")], battlefield: [c("Debris Field Crusher", {"counters":{"charge":3}}), c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Island"), c("Mountain"), c("Island")] },
      explanation: "Cast Pinnacle Emissary (warp) → activate Debris Field Crusher (Station (8+)) (stationed by Hill Giant) → activate Debris Field Crusher (Station (8+)) (stationed by Pinnacle Emissary) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → attack with Debris Field Crusher.",
      notes: `
LETHAL: cast Pinnacle Emissary (warp) → activate Debris Field Crusher (Station (8+)) (stationed by Hill Giant) → activate Debris Field Crusher (Station (8+)) (stationed by Pinnacle Emissary) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → activate Debris Field Crusher ({1}{R}: +2/+0 (8+)) → attack with Debris Field Crusher → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: The board of eoe-07-drill-too-deep plus Pinnacle Emissary (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Pinnacle Emissary: at most 5. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "eoe-19-ouroboroid", title: "Ouroboroid", set: "eoe", tier: "hard",
      opp: { life: 4, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Ouroboroid")], battlefield: [c("Wurmwall Sweeper"), c("Hemosymbic Mite"), c("Gray Ogre"), c("Forest"), c("Forest"), c("Forest"), c("Forest")] },
      explanation: "Cast Ouroboroid → activate Wurmwall Sweeper (Station (4+)) (stationed by Hemosymbic Mite) → Hemosymbic Mite → Ouroboroid → activate Wurmwall Sweeper (Station (4+)) (stationed by Gray Ogre) → activate Wurmwall Sweeper (Station (4+)) (stationed by Ouroboroid) → attack with Wurmwall Sweeper.",
      notes: `
LETHAL: cast Ouroboroid → activate Wurmwall Sweeper (Station (4+)) (stationed by Hemosymbic Mite) → Hemosymbic Mite → Ouroboroid → activate Wurmwall Sweeper (Station (4+)) (stationed by Gray Ogre) → activate Wurmwall Sweeper (Station (4+)) (stationed by Ouroboroid) → attack with Wurmwall Sweeper → (opponent: no blocks): exactly 4 damage (the most this board can deal).
RULES: The board of eoe-05-mite plus Ouroboroid (mythic) in your hand, with 4 lands to cast it.
WRONG LINES: Without Ouroboroid: at most 2. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
    }),
    puzzle({
      id: "eoe-20-entropic-battlecruiser", title: "Entropic Battlecruiser", set: "eoe", tier: "hard",
      opp: { life: 11, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Weftstalker Ardent"), c("Galactic Wayfarer"), c("Plasma Bolt")], battlefield: [c("Hill Giant"), c("Forest"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain"), c("Entropic Battlecruiser")] },
      explanation: "Cast Weftstalker Ardent (warp) → cast Galactic Wayfarer → put Weftstalker Ardent's trigger on the stack first → cast Plasma Bolt →opponent → activate Entropic Battlecruiser (Station (8+)) (stationed by Hill Giant) → activate Entropic Battlecruiser (Station (8+)) (stationed by Weftstalker Ardent) → activate Entropic Battlecruiser (Station (8+)) (stationed by Galactic Wayfarer) → attack with Entropic Battlecruiser.",
      notes: `
LETHAL: cast Weftstalker Ardent (warp) → cast Galactic Wayfarer → put Weftstalker Ardent's trigger on the stack first → cast Plasma Bolt →opponent → activate Entropic Battlecruiser (Station (8+)) (stationed by Hill Giant) → activate Entropic Battlecruiser (Station (8+)) (stationed by Weftstalker Ardent) → activate Entropic Battlecruiser (Station (8+)) (stationed by Galactic Wayfarer) → attack with Entropic Battlecruiser → (opponent: no blocks): exactly 11 damage (the most this board can deal).
RULES: The board of eoe-10-wayfarer plus Entropic Battlecruiser (rare) on the battlefield.
WRONG LINES: Without Entropic Battlecruiser: at most 5. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    // ---- Marvel's Spider-Man (SPM) ----
    puzzle({
      id: "spm-11-agent-venom", title: "Agent Venom", set: "spm", tier: "easy",
      opp: { life: 8, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Pumpkin Bombardment"), c("Stegron the Dinosaur Man"), c("Agent Venom")], battlefield: [c("Hobgoblin, Mantled Marauder"), c("Mountain"), c("Mountain"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Discard Stegron the Dinosaur Man for its ability → Hobgoblin, Mantled Marauder → cast Pumpkin Bombardment (discarding Agent Venom) →Grizzly Bears → attack with Hobgoblin, Mantled Marauder.",
      notes: `
LETHAL: discard Stegron the Dinosaur Man for its ability → Hobgoblin, Mantled Marauder → cast Pumpkin Bombardment (discarding Agent Venom) →Grizzly Bears → attack with Hobgoblin, Mantled Marauder → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: The board of spm-05-hobgoblin plus Agent Venom (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Agent Venom: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "spm-12-cosmic-spider-man", title: "Cosmic Spider-Man", set: "spm", tier: "easy",
      opp: { life: 11, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Thwip!"), c("Cosmic Spider-Man")], battlefield: [c("Wraith, Vicious Vigilante"), c("Plains"), c("Plains"), c("Island"), c("Swamp"), c("Mountain"), c("Forest")] },
      explanation: "Cast Thwip! →Wraith, Vicious Vigilante → cast Cosmic Spider-Man → attack with Cosmic Spider-Man + Wraith, Vicious Vigilante.",
      notes: `
LETHAL: cast Thwip! →Wraith, Vicious Vigilante → cast Cosmic Spider-Man → attack with Cosmic Spider-Man + Wraith, Vicious Vigilante → (opponent: no blocks): exactly 11 damage (the most this board can deal).
RULES: The board of spm-03-wraith plus Cosmic Spider-Man (mythic) in your hand, with 5 lands to cast it.
WRONG LINES: Without Cosmic Spider-Man: at most 6. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "spm-13-rocket-powered-goblin-glider", title: "Rocket-Powered Goblin Glider", set: "spm", tier: "easy",
      opp: { life: 4, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Spider-Man India"), c("Rocket-Powered Goblin Glider")], battlefield: [c("Angry Rabble"), c("Lurking Lizards"), c("Hill Giant", {"tapped":true}), c("Forest"), c("Plains"), c("Mountain"), c("Forest"), c("Forest"), c("Forest")] },
      explanation: "Cast Rocket-Powered Goblin Glider → activate Rocket-Powered Goblin Glider (Equip {2}) → Angry Rabble → attack with Angry Rabble.",
      notes: `
LETHAL: cast Rocket-Powered Goblin Glider → activate Rocket-Powered Goblin Glider (Equip {2}) → Angry Rabble → attack with Angry Rabble → (opponent: no blocks): exactly 4 damage (the most this board can deal).
RULES: The board of spm-10-india plus Rocket-Powered Goblin Glider (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Rocket-Powered Goblin Glider: at most 3. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
    }),
    puzzle({
      id: "spm-14-anti-venom", title: "Anti-Venom", set: "spm", tier: "easy",
      opp: { life: 10, battlefield: [c("Grizzly Bears"), c("Krotiq Nestguard")] },
      you: { hand: [c("Pumpkin Bombardment"), c("Electro's Bolt")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Swamp"), c("Anti-Venom, Horrifying Healer")] },
      explanation: "Cast Pumpkin Bombardment (discarding Electro's Bolt) →Grizzly Bears → cast Electro's Bolt (mayhem) →Krotiq Nestguard → attack with Anti-Venom, Horrifying Healer + Gray Ogre + Hill Giant.",
      notes: `
LETHAL: cast Pumpkin Bombardment (discarding Electro's Bolt) →Grizzly Bears → cast Electro's Bolt (mayhem) →Krotiq Nestguard → attack with Anti-Venom, Horrifying Healer + Gray Ogre + Hill Giant → (opponent: no blocks): exactly 10 damage (the most this board can deal).
RULES: The board of spm-07-electros-bolt plus Anti-Venom, Horrifying Healer (mythic) on the battlefield.
WRONG LINES: Without Anti-Venom, Horrifying Healer: at most 5. Any other order or target deals less than 10.
UNIQUENESS: Solver-checked: one plan reaches 10; 11 isn't reachable.`
    }),
    puzzle({
      id: "spm-15-spider-ham", title: "Spider-Ham", set: "spm", tier: "medium",
      opp: { life: 6, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Grow Extra Arms"), c("Spider-Ham, Peter Porker")], battlefield: [c("Spider-Man, Web-Slinger"), c("Masked Meower"), c("Forest"), c("Forest"), c("Forest")] },
      explanation: "Cast Spider-Ham, Peter Porker → attack with Masked Meower + Spider-Man, Web-Slinger → cast Grow Extra Arms →Masked Meower.",
      notes: `
LETHAL: cast Spider-Ham, Peter Porker → attack with Masked Meower + Spider-Man, Web-Slinger → (opponent: Grizzly Bears blocks Spider-Man, Web-Slinger) → cast Grow Extra Arms →Masked Meower: exactly 6 damage (the most this board can deal).
RULES: The board of spm-06-extra-arms plus Spider-Ham, Peter Porker (rare) in your hand, with 2 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Spider-Ham, Peter Porker: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "spm-16-ara-a", title: "Araña", set: "spm", tier: "medium",
      opp: { life: 9, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Stegron the Dinosaur Man")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Araña, Heart of the Spider")] },
      explanation: "Attack with Araña, Heart of the Spider + Gray Ogre + Hill Giant → Araña, Heart of the Spider → Gray Ogre → discard Stegron the Dinosaur Man for its ability → Gray Ogre.",
      notes: `
LETHAL: attack with Araña, Heart of the Spider + Gray Ogre + Hill Giant → Araña, Heart of the Spider → Gray Ogre → (opponent: Grizzly Bears blocks Hill Giant) → discard Stegron the Dinosaur Man for its ability → Gray Ogre: exactly 9 damage (the most this board can deal).
RULES: The board of spm-04-dinosaur-formula plus Araña, Heart of the Spider (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Araña, Heart of the Spider: at most 5. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "spm-17-villainous-wrath", title: "Villainous Wrath", set: "spm", tier: "hard",
      opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Spider-Man, Web-Slinger"), c("Villainous Wrath")], battlefield: [c("Spider-Man India"), c("Hill Giant", {"tapped":true}), c("Plains"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Spider-Man, Web-Slinger (web-slinging, returning Hill Giant) → Spider-Man India → Spider-Man India → attack with Spider-Man India → cast Villainous Wrath.",
      notes: `
LETHAL: cast Spider-Man, Web-Slinger (web-slinging, returning Hill Giant) → Spider-Man India → Spider-Man India → attack with Spider-Man India → (opponent: no blocks) → cast Villainous Wrath: exactly 6 damage (the most this board can deal).
RULES: The board of spm-02-web-slinger plus Villainous Wrath (rare) in your hand, with 5 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Villainous Wrath: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "spm-18-iron-spider", title: "Iron Spider", set: "spm", tier: "hard",
      opp: { life: 8, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Raging Goblinoids")], battlefield: [c("Masked Meower"), c("Angry Rabble"), c("Lurking Lizards"), c("Mountain"), c("Mountain"), c("Mountain"), c("Iron Spider, Stark Upgrade")] },
      explanation: "Activate Masked Meower (Discard a card, Sacrifice: Draw a card) (discarding Raging Goblinoids) → cast Raging Goblinoids (mayhem) → put Angry Rabble's trigger on the stack first → attack with Angry Rabble + Iron Spider, Stark Upgrade + Lurking Lizards + Raging Goblinoids → activate Iron Spider, Stark Upgrade ({T}: Put a +1/+1 counter on each artifact creature and/or Vehicle you control).",
      notes: `
LETHAL: activate Masked Meower (Discard a card, Sacrifice: Draw a card) (discarding Raging Goblinoids) → cast Raging Goblinoids (mayhem) → put Angry Rabble's trigger on the stack first → attack with Angry Rabble + Iron Spider, Stark Upgrade + Lurking Lizards + Raging Goblinoids → activate Iron Spider, Stark Upgrade ({T}: Put a +1/+1 counter on each artifact creature and/or Vehicle you control) → (opponent: Grizzly Bears blocks Raging Goblinoids): exactly 8 damage (the most this board can deal).
RULES: The board of spm-08-printed-value plus Iron Spider, Stark Upgrade (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Iron Spider, Stark Upgrade: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "spm-19-spider-punk", title: "Spider-Punk", set: "spm", tier: "hard",
      opp: { life: 7, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Stegron the Dinosaur Man"), c("Spider-Punk")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Spider-Punk → Spider-Punk: Haste → attack with Gray Ogre + Hill Giant + Spider-Punk → discard Stegron the Dinosaur Man for its ability → Gray Ogre.",
      notes: `
LETHAL: cast Spider-Punk → Spider-Punk: Haste → attack with Gray Ogre + Hill Giant + Spider-Punk → (opponent: Grizzly Bears blocks Hill Giant) → discard Stegron the Dinosaur Man for its ability → Gray Ogre: exactly 7 damage (the most this board can deal).
RULES: The board of spm-04-dinosaur-formula plus Spider-Punk (rare) in your hand, with 2 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Spider-Punk: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "spm-20-arachne", title: "Arachne", set: "spm", tier: "hard",
      opp: { life: 8, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Grow Extra Arms")], battlefield: [c("Spider-Man, Web-Slinger"), c("Masked Meower"), c("Forest"), c("Arachne, Psionic Weaver")] },
      explanation: "Attack with Arachne, Psionic Weaver + Masked Meower + Spider-Man, Web-Slinger → cast Grow Extra Arms →Masked Meower.",
      notes: `
LETHAL: attack with Arachne, Psionic Weaver + Masked Meower + Spider-Man, Web-Slinger → (opponent: Grizzly Bears blocks Spider-Man, Web-Slinger) → cast Grow Extra Arms →Masked Meower: exactly 8 damage (the most this board can deal).
RULES: The board of spm-06-extra-arms plus Arachne, Psionic Weaver (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Arachne, Psionic Weaver: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    // ---- Avatar: The Last Airbender (TLA) ----
    puzzle({
      id: "tla-11-bumi", title: "Bumi", set: "tla", tier: "easy",
      opp: { life: 7, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Bumi, Unleashed")], battlefield: [c("Zuko, Exiled Prince"), c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain")], library: [c("Lightning Strike")] },
      explanation: "Cast Bumi, Unleashed → Bumi, Unleashed → Mountain → attack with Hill Giant + Mountain + Zuko, Exiled Prince.",
      notes: `
LETHAL: cast Bumi, Unleashed → Bumi, Unleashed → Mountain → attack with Hill Giant + Mountain + Zuko, Exiled Prince → (opponent: Krotiq Nestguard blocks Zuko, Exiled Prince): exactly 7 damage (the most this board can deal).
RULES: The board of tla-05-zuko plus Bumi, Unleashed (mythic) in your hand, with 5 lands to cast it.
WRONG LINES: Without Bumi, Unleashed: at most 6. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "tla-12-diligent-zookeeper", title: "Diligent Zookeeper", set: "tla", tier: "easy",
      opp: { life: 5, battlefield: [] },
      you: { hand: [c("Earthbending Lesson"), c("Diligent Zookeeper")], battlefield: [c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest")] },
      explanation: "Cast Earthbending Lesson →Forest → cast Diligent Zookeeper → attack with Forest.",
      notes: `
LETHAL: cast Earthbending Lesson →Forest → cast Diligent Zookeeper → attack with Forest → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: The board of tla-03-earthbend plus Diligent Zookeeper (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Diligent Zookeeper: at most 4. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "tla-13-ozai", title: "Ozai", set: "tla", tier: "easy",
      opp: { life: 10, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Airbending Lesson"), c("Ozai, the Phoenix King")], battlefield: [c("Hill Giant"), c("Plains"), c("Plains"), c("Plains"), c("Swamp"), c("Swamp"), c("Mountain"), c("Mountain"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Airbending Lesson →Krotiq Nestguard → cast Ozai, the Phoenix King → attack with Hill Giant + Ozai, the Phoenix King.",
      notes: `
LETHAL: cast Airbending Lesson →Krotiq Nestguard → cast Ozai, the Phoenix King → attack with Hill Giant + Ozai, the Phoenix King → (opponent: no blocks): exactly 10 damage (the most this board can deal).
RULES: The board of tla-02-airbend plus Ozai, the Phoenix King (mythic) in your hand, with 6 lands to cast it.
WRONG LINES: Without Ozai, the Phoenix King: at most 3. Any other order or target deals less than 10.
UNIQUENESS: Solver-checked: one plan reaches 10; 11 isn't reachable.`
    }),
    puzzle({
      id: "tla-14-suki", title: "Suki", set: "tla", tier: "easy",
      opp: { life: 4, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Combustion Technique"), c("Suki, Courageous Rescuer")], battlefield: [c("Hill Giant"), c("Mountain"), c("Mountain"), c("Plains"), c("Plains"), c("Plains")], graveyard: [c("Airbending Lesson"), c("Yip Yip!")] },
      explanation: "Cast Combustion Technique →Krotiq Nestguard → cast Suki, Courageous Rescuer → attack with Hill Giant.",
      notes: `
LETHAL: cast Combustion Technique →Krotiq Nestguard → cast Suki, Courageous Rescuer → attack with Hill Giant → (opponent: no blocks): exactly 4 damage (the most this board can deal).
RULES: The board of tla-06-combustion plus Suki, Courageous Rescuer (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Suki, Courageous Rescuer: at most 3. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
    }),
    puzzle({
      id: "tla-15-wartime-protestors", title: "Wartime Protestors", set: "tla", tier: "medium",
      opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Lightning Strike"), c("Wartime Protestors")], battlefield: [c("Fire Sages"), c("Hill Giant"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Wartime Protestors → attack with Fire Sages + Hill Giant + Wartime Protestors → cast Lightning Strike →opponent.",
      notes: `
LETHAL: cast Wartime Protestors → attack with Fire Sages + Hill Giant + Wartime Protestors → cast Lightning Strike →opponent → (opponent: Krotiq Nestguard blocks Wartime Protestors): exactly 8 damage (the most this board can deal).
RULES: The board of tla-01-firebending plus Wartime Protestors (rare) in your hand, with 4 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Wartime Protestors: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "tla-16-badgermole-cub", title: "Badgermole Cub", set: "tla", tier: "medium",
      opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Yip Yip!"), c("Lightning Strike")], battlefield: [c("Fire Nation Cadets"), c("Hill Giant"), c("Plains"), c("Badgermole Cub")] },
      explanation: "Cast Yip Yip! →Fire Nation Cadets → attack with Badgermole Cub + Fire Nation Cadets + Hill Giant → cast Lightning Strike →opponent.",
      notes: `
LETHAL: cast Yip Yip! →Fire Nation Cadets → attack with Badgermole Cub + Fire Nation Cadets + Hill Giant → cast Lightning Strike →opponent → (opponent: Krotiq Nestguard blocks Fire Nation Cadets): exactly 8 damage (the most this board can deal).
RULES: The board of tla-09-cadets plus Badgermole Cub (mythic) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Badgermole Cub: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "tla-17-aang", title: "Aang", set: "tla", tier: "hard",
      opp: { life: 14, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Twin Blades"), c("Aang, Swift Savior")], battlefield: [c("Rough Rhino Cavalry"), c("Fire Sages"), c("Mountain"), c("Plains"), c("Island"), c("Plains")] },
      explanation: "Cast Aang, Swift Savior → Aang, Swift Savior → Grizzly Bears → attack with Fire Sages + Rough Rhino Cavalry → put Rough Rhino Cavalry's trigger on the stack first → cast Twin Blades → Twin Blades → Rough Rhino Cavalry.",
      notes: `
LETHAL: cast Aang, Swift Savior → Aang, Swift Savior → Grizzly Bears → attack with Fire Sages + Rough Rhino Cavalry → put Rough Rhino Cavalry's trigger on the stack first → cast Twin Blades → Twin Blades → Rough Rhino Cavalry → (opponent: no blocks): exactly 14 damage (the most this board can deal).
RULES: The board of tla-07-twin-blades plus Aang, Swift Savior (rare) in your hand, with 3 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Aang, Swift Savior: at most 6. Any other order or target deals less than 14.
UNIQUENESS: Solver-checked: one plan reaches 14; 15 isn't reachable.`
    }),
    puzzle({
      id: "tla-18-aang-s-iceberg", title: "Aang's Iceberg", set: "tla", tier: "hard",
      opp: { life: 14, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Twin Blades"), c("Aang's Iceberg")], battlefield: [c("Rough Rhino Cavalry"), c("Fire Sages"), c("Mountain"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Twin Blades → Twin Blades → Rough Rhino Cavalry → attack with Fire Sages + Rough Rhino Cavalry → put Rough Rhino Cavalry's trigger on the stack first → cast Aang's Iceberg → Aang's Iceberg → Grizzly Bears.",
      notes: `
LETHAL: cast Twin Blades → Twin Blades → Rough Rhino Cavalry → attack with Fire Sages + Rough Rhino Cavalry → put Rough Rhino Cavalry's trigger on the stack first → cast Aang's Iceberg → Aang's Iceberg → Grizzly Bears → (opponent: no blocks): exactly 14 damage (the most this board can deal).
RULES: The board of tla-07-twin-blades plus Aang's Iceberg (rare) in your hand, with 3 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Aang's Iceberg: at most 6. Any other order or target deals less than 14.
UNIQUENESS: Solver-checked: one plan reaches 14; 15 isn't reachable.`
    }),
    puzzle({
      id: "tla-19-obsessive-pursuit", title: "Obsessive Pursuit", set: "tla", tier: "hard",
      opp: { life: 7, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Obsessive Pursuit")], battlefield: [c("Zuko, Exiled Prince"), c("Hill Giant"), c("Mountain"), c("Mountain"), c("Swamp"), c("Swamp")], library: [c("Lightning Strike")] },
      explanation: "Cast Obsessive Pursuit → activate Clue ({2}, Sacrifice: Draw a card) → attack with Hill Giant + Zuko, Exiled Prince → put Zuko, Exiled Prince's trigger on the stack first → Obsessive Pursuit → Hill Giant → cast Lightning Strike →opponent.",
      notes: `
LETHAL: cast Obsessive Pursuit → activate Clue ({2}, Sacrifice: Draw a card) → attack with Hill Giant + Zuko, Exiled Prince → put Zuko, Exiled Prince's trigger on the stack first → Obsessive Pursuit → Hill Giant → cast Lightning Strike →opponent → (opponent: Krotiq Nestguard blocks Zuko, Exiled Prince): exactly 7 damage (the most this board can deal).
RULES: The board of tla-05-zuko plus Obsessive Pursuit (rare) in your hand, with 2 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Obsessive Pursuit: at most 6. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "tla-20-airbender-ascension", title: "Airbender Ascension", set: "tla", tier: "hard",
      opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Lightning Strike"), c("Airbender Ascension")], battlefield: [c("Fire Sages"), c("Hill Giant"), c("Mountain"), c("Plains"), c("Plains")] },
      explanation: "Cast Airbender Ascension → Airbender Ascension → Krotiq Nestguard → attack with Fire Sages + Hill Giant → cast Lightning Strike →opponent.",
      notes: `
LETHAL: cast Airbender Ascension → Airbender Ascension → Krotiq Nestguard → attack with Fire Sages + Hill Giant → cast Lightning Strike →opponent → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: The board of tla-01-firebending plus Airbender Ascension (rare) in your hand, with 2 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Airbender Ascension: at most 5. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    // ---- Lorwyn Eclipsed (ECL) ----
    puzzle({
      id: "ecl-11-grub-s-command", title: "Grub's Command", set: "ecl", tier: "easy",
      opp: { life: 7, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Bogslither's Embrace"), c("Grub's Command")], battlefield: [c("Hill Giant"), c("Grizzly Bears", {"sick":true}), c("Swamp"), c("Swamp"), c("Swamp"), c("Mountain"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Grub's Command (Creatures you control get +1/+1 and gain haste + Destroy target artifact or creature) → + Krotiq Nestguard → attack with Grizzly Bears + Hill Giant.",
      notes: `
LETHAL: cast Grub's Command (Creatures you control get +1/+1 and gain haste + Destroy target artifact or creature) → + Krotiq Nestguard → attack with Grizzly Bears + Hill Giant → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: The board of ecl-05-bogslither plus Grub's Command (rare) in your hand, with 5 lands to cast it.
WRONG LINES: Without Grub's Command: at most 3. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "ecl-12-adept-watershaper", title: "Adept Watershaper", set: "ecl", tier: "easy",
      opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Shimmercreep"), c("Adept Watershaper")], battlefield: [c("Gray Ogre"), c("Grizzly Bears"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Adept Watershaper → cast Shimmercreep → attack with Gray Ogre + Grizzly Bears.",
      notes: `
LETHAL: cast Adept Watershaper → cast Shimmercreep → attack with Gray Ogre + Grizzly Bears → (opponent: Krotiq Nestguard blocks Gray Ogre): exactly 6 damage (the most this board can deal).
RULES: The board of ecl-03-shimmercreep plus Adept Watershaper (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Adept Watershaper: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "ecl-13-brigid-s-command", title: "Brigid's Command", set: "ecl", tier: "easy",
      opp: { life: 8, battlefield: [c("Krotiq Nestguard"), c("Grizzly Bears")] },
      you: { hand: [c("Cinder Strike"), c("Brigid's Command")], battlefield: [c("Hill Giant"), c("Mudbutton Cursetosser"), c("Mountain"), c("Forest"), c("Plains"), c("Forest")] },
      explanation: "Cast Cinder Strike →Grizzly Bears → cast Brigid's Command (Target creature you control gets +3/+3 + Target creature you control fights target creature an opponent controls) →Hill Giant + Hill Giant + Krotiq Nestguard → attack with Hill Giant + Mudbutton Cursetosser.",
      notes: `
LETHAL: cast Cinder Strike →Grizzly Bears → cast Brigid's Command (Target creature you control gets +3/+3 + Target creature you control fights target creature an opponent controls) →Hill Giant + Hill Giant + Krotiq Nestguard → attack with Hill Giant + Mudbutton Cursetosser → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: The board of ecl-06-cursetosser plus Brigid's Command (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Brigid's Command: at most 3. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "ecl-14-kinbinding", title: "Kinbinding", set: "ecl", tier: "easy",
      opp: { life: 4, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Cinder Strike"), c("Kinbinding")], battlefield: [c("Hill Giant"), c("Gray Ogre", {"sick":true}), c("Mountain"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Cinder Strike (blighting Gray Ogre) →Krotiq Nestguard → cast Kinbinding → attack with Hill Giant.",
      notes: `
LETHAL: cast Cinder Strike (blighting Gray Ogre) →Krotiq Nestguard → cast Kinbinding → attack with Hill Giant → (opponent: no blocks): exactly 4 damage (the most this board can deal).
RULES: The board of ecl-01-cinder-strike plus Kinbinding (rare) in your hand, with 5 lands to cast it.
WRONG LINES: Without Kinbinding: at most 3. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
    }),
    puzzle({
      id: "ecl-15-doran", title: "Doran", set: "ecl", tier: "medium",
      opp: { life: 13, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Explosive Prodigy"), c("Doran, Besieged by Time")], battlefield: [c("Hill Giant"), c("Grizzly Bears"), c("Silvergill Mentor"), c("Kinsbaile Aspirant"), c("Mountain"), c("Mountain"), c("Plains"), c("Swamp"), c("Forest"), c("Plains")] },
      explanation: "Cast Explosive Prodigy → put Kinsbaile Aspirant's trigger on the stack first → Explosive Prodigy → Krotiq Nestguard → cast Doran, Besieged by Time → attack with Grizzly Bears + Hill Giant + Kinsbaile Aspirant + Silvergill Mentor → put Doran, Besieged by Time's trigger on the stack first → put Doran, Besieged by Time's trigger on the stack first → put Doran, Besieged by Time's trigger on the stack first.",
      notes: `
LETHAL: cast Explosive Prodigy → put Kinsbaile Aspirant's trigger on the stack first → Explosive Prodigy → Krotiq Nestguard → cast Doran, Besieged by Time → attack with Grizzly Bears + Hill Giant + Kinsbaile Aspirant + Silvergill Mentor → put Doran, Besieged by Time's trigger on the stack first → put Doran, Besieged by Time's trigger on the stack first → put Doran, Besieged by Time's trigger on the stack first → (opponent: no blocks): exactly 13 damage (the most this board can deal).
RULES: The board of ecl-04-explosive-prodigy plus Doran, Besieged by Time (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Doran, Besieged by Time: at most 10. Any other order or target deals less than 13.
UNIQUENESS: Solver-checked: one plan reaches 13; 14 isn't reachable.`
    }),
    puzzle({
      id: "ecl-16-ajani", title: "Ajani", set: "ecl", tier: "medium",
      opp: { life: 11, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Explosive Prodigy"), c("Ajani, Outland Chaperone")], battlefield: [c("Hill Giant"), c("Grizzly Bears"), c("Silvergill Mentor"), c("Kinsbaile Aspirant"), c("Mountain"), c("Mountain"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Explosive Prodigy → put Kinsbaile Aspirant's trigger on the stack first → Explosive Prodigy → Krotiq Nestguard → cast Ajani, Outland Chaperone → activate Ajani, Outland Chaperone (+1: Create a 1/1 green and white Kithkin creature token.) → attack with Grizzly Bears + Hill Giant + Kinsbaile Aspirant + Silvergill Mentor.",
      notes: `
LETHAL: cast Explosive Prodigy → put Kinsbaile Aspirant's trigger on the stack first → Explosive Prodigy → Krotiq Nestguard → cast Ajani, Outland Chaperone → activate Ajani, Outland Chaperone (+1: Create a 1/1 green and white Kithkin creature token.) → attack with Grizzly Bears + Hill Giant + Kinsbaile Aspirant + Silvergill Mentor → (opponent: no blocks): exactly 11 damage (the most this board can deal).
RULES: The board of ecl-04-explosive-prodigy plus Ajani, Outland Chaperone (mythic) in your hand, with 3 lands to cast it.
WRONG LINES: Without Ajani, Outland Chaperone: at most 10. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "ecl-17-kirol", title: "Kirol", set: "ecl", tier: "hard",
      opp: { life: 14, battlefield: [] },
      you: { hand: [c("Boggart Mischief"), c("Kirol, Attentive First-Year")], battlefield: [c("Boneclub Berserker"), c("Goblin"), c("Swamp"), c("Swamp"), c("Swamp"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Kirol, Attentive First-Year → cast Boggart Mischief → activate Kirol, Attentive First-Year (Tap two untapped creatures you control: Copy target triggered ability you control (once each turn)) → stack:0 → Blight 1?: Blight Kirol, Attentive First-Year → Blight 1?: Blight Kirol, Attentive First-Year → attack with Boneclub Berserker.",
      notes: `
LETHAL: cast Kirol, Attentive First-Year → cast Boggart Mischief → activate Kirol, Attentive First-Year (Tap two untapped creatures you control: Copy target triggered ability you control (once each turn)) → stack:0 → Blight 1?: Blight Kirol, Attentive First-Year → Blight 1?: Blight Kirol, Attentive First-Year → attack with Boneclub Berserker → (opponent: no blocks): exactly 14 damage (the most this board can deal).
RULES: The board of ecl-08-boggart-mischief plus Kirol, Attentive First-Year (rare) in your hand, with 3 lands to cast it. TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Kirol, Attentive First-Year: at most 10. Any other order or target deals less than 14.
UNIQUENESS: Solver-checked: one plan reaches 14; 15 isn't reachable.`
    }),
    puzzle({
      id: "ecl-18-ashling-s-command", title: "Ashling's Command", set: "ecl", tier: "hard",
      opp: { life: 13, battlefield: [] },
      you: { hand: [c("Boggart Mischief"), c("Ashling's Command")], battlefield: [c("Boneclub Berserker"), c("Goblin"), c("Swamp"), c("Swamp"), c("Swamp"), c("Island"), c("Mountain"), c("Island"), c("Island"), c("Island")] },
      explanation: "Cast Boggart Mischief → Blight 1?: Blight Boneclub Berserker → attack with Boneclub Berserker + Goblin → cast Ashling's Command (You draw two cards + 2 damage to each creature target player controls) → + yourself.",
      notes: `
LETHAL: cast Boggart Mischief → Blight 1?: Blight Boneclub Berserker → attack with Boneclub Berserker + Goblin → (opponent: no blocks) → cast Ashling's Command (You draw two cards + 2 damage to each creature target player controls) → + yourself: exactly 13 damage (the most this board can deal).
RULES: The board of ecl-08-boggart-mischief plus Ashling's Command (rare) in your hand, with 5 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Ashling's Command: at most 10. Any other order or target deals less than 13.
UNIQUENESS: Solver-checked: one plan reaches 13; 14 isn't reachable.`
    }),
    puzzle({
      id: "ecl-19-mirrorform", title: "Mirrorform", set: "ecl", tier: "hard",
      opp: { life: 20, battlefield: [] },
      you: { hand: [c("Boggart Mischief"), c("Mirrorform")], battlefield: [c("Boneclub Berserker"), c("Goblin"), c("Swamp"), c("Swamp"), c("Swamp"), c("Island"), c("Island"), c("Island"), c("Island"), c("Island"), c("Island")] },
      explanation: "Cast Boggart Mischief → cast Mirrorform →Boneclub Berserker → Blight 1?: Blight Boneclub Berserker → attack with Boneclub Berserker + Boneclub Berserker.",
      notes: `
LETHAL: cast Boggart Mischief → cast Mirrorform →Boneclub Berserker → Blight 1?: Blight Boneclub Berserker → attack with Boneclub Berserker + Boneclub Berserker → (opponent: no blocks): exactly 20 damage (the most this board can deal).
RULES: The board of ecl-08-boggart-mischief plus Mirrorform (mythic) in your hand, with 6 lands to cast it. TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Mirrorform: at most 10. Any other order or target deals less than 20.
UNIQUENESS: Solver-checked: one plan reaches 20; 21 isn't reachable.`
    }),
    puzzle({
      id: "ecl-20-dawnhand-dissident", title: "Dawnhand Dissident", set: "ecl", tier: "hard",
      opp: { life: 12, battlefield: [] },
      you: { hand: [c("Boggart Mischief")], battlefield: [c("Boneclub Berserker"), c("Goblin"), c("Swamp"), c("Swamp"), c("Swamp"), c("Dawnhand Dissident")] },
      explanation: "Cast Boggart Mischief → Blight 1?: Blight Dawnhand Dissident → attack with Boneclub Berserker + Goblin → activate Dawnhand Dissident ({T}, Blight 1: Surveil 1) (blighting Goblin).",
      notes: `
LETHAL: cast Boggart Mischief → Blight 1?: Blight Dawnhand Dissident → attack with Boneclub Berserker + Goblin → (opponent: no blocks) → activate Dawnhand Dissident ({T}, Blight 1: Surveil 1) (blighting Goblin): exactly 12 damage (the most this board can deal).
RULES: The board of ecl-08-boggart-mischief plus Dawnhand Dissident (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Dawnhand Dissident: at most 10. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
    }),
    // ---- Teenage Mutant Ninja Turtles (TMT) ----
    puzzle({
      id: "tmt-11-krang", title: "Krang", set: "tmt", tier: "easy",
      opp: { life: 13, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Karai's Technique"), c("Krang, Utrom Warlord")], battlefield: [c("Hill Giant"), c("Grizzly Bears"), c("Gray Ogre"), c("Plains"), c("Swamp"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Krang, Utrom Warlord → attack with Gray Ogre + Grizzly Bears + Hill Giant + Krang, Utrom Warlord.",
      notes: `
LETHAL: cast Krang, Utrom Warlord → attack with Gray Ogre + Grizzly Bears + Hill Giant + Krang, Utrom Warlord → (opponent: Krotiq Nestguard blocks Hill Giant): exactly 13 damage (the most this board can deal).
RULES: The board of tmt-05-karai plus Krang, Utrom Warlord (mythic) in your hand, with 9 lands to cast it.
WRONG LINES: Without Krang, Utrom Warlord: at most 5. Any other order or target deals less than 13.
UNIQUENESS: Solver-checked: one plan reaches 13; 14 isn't reachable.`
    }),
    puzzle({
      id: "tmt-12-raph-mikey", title: "Raph & Mikey", set: "tmt", tier: "easy",
      opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Shredder, Unrelenting"), c("Raph & Mikey, Troublemakers")], battlefield: [c("Mutant Town Musicians"), c("Grizzly Bears"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Raph & Mikey, Troublemakers → attack with Grizzly Bears + Mutant Town Musicians + Raph & Mikey, Troublemakers.",
      notes: `
LETHAL: cast Raph & Mikey, Troublemakers → attack with Grizzly Bears + Mutant Town Musicians + Raph & Mikey, Troublemakers → (opponent: Krotiq Nestguard blocks Raph & Mikey, Troublemakers): exactly 8 damage (the most this board can deal).
RULES: The board of tmt-06-deathtouch plus Raph & Mikey, Troublemakers (rare) in your hand, with 7 lands to cast it.
WRONG LINES: Without Raph & Mikey, Troublemakers: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "tmt-13-ninja-teen", title: "Ninja Teen", set: "tmt", tier: "easy",
      opp: { life: 7, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Tenderize"), c("Ninja Teen")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Forest"), c("Forest"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Ninja Teen → activate Ninja Teen (Level 2 ({1}{B})) → attack with Gray Ogre + Hill Giant.",
      notes: `
LETHAL: cast Ninja Teen → activate Ninja Teen (Level 2 ({1}{B})) → attack with Gray Ogre + Hill Giant → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: The board of tmt-04-tenderize plus Ninja Teen (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Ninja Teen: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "tmt-14-agent-bishop", title: "Agent Bishop", set: "tmt", tier: "easy",
      opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Karai's Technique"), c("Agent Bishop, Man in Black")], battlefield: [c("Hill Giant"), c("Grizzly Bears"), c("Gray Ogre"), c("Plains"), c("Swamp"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Agent Bishop, Man in Black → Agent Bishop, Man in Black → Grizzly Bears + Gray Ogre → attack with Gray Ogre + Grizzly Bears + Hill Giant.",
      notes: `
LETHAL: cast Agent Bishop, Man in Black → Agent Bishop, Man in Black → Grizzly Bears + Gray Ogre → attack with Gray Ogre + Grizzly Bears + Hill Giant → (opponent: Krotiq Nestguard blocks Hill Giant): exactly 6 damage (the most this board can deal).
RULES: The board of tmt-05-karai plus Agent Bishop, Man in Black (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Agent Bishop, Man in Black: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "tmt-15-donatello", title: "Donatello", set: "tmt", tier: "medium",
      opp: { life: 9, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Leonardo, Leader in Blue"), c("Donatello, Gadget Master")], battlefield: [c("Hill Giant"), c("Grizzly Bears"), c("Gray Ogre"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Island"), c("Island"), c("Island")] },
      explanation: "Attack with Gray Ogre + Grizzly Bears + Hill Giant → cast Donatello, Gadget Master (sneak, returning Grizzly Bears) → cast Leonardo, Leader in Blue (sneak, returning Gray Ogre).",
      notes: `
LETHAL: attack with Gray Ogre + Grizzly Bears + Hill Giant → (opponent: Krotiq Nestguard blocks Hill Giant) → cast Donatello, Gadget Master (sneak, returning Grizzly Bears) → cast Leonardo, Leader in Blue (sneak, returning Gray Ogre): exactly 9 damage (the most this board can deal).
RULES: The board of tmt-07-leader-in-blue plus Donatello, Gadget Master (rare) in your hand, with 3 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Donatello, Gadget Master: at most 8. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "tmt-16-slash", title: "Slash", set: "tmt", tier: "medium",
      opp: { life: 11, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Leonardo, Big Brother"), c("The Last Ronin's Technique"), c("Slash, Reptile Rampager")], battlefield: [c("Hill Giant"), c("Grizzly Bears"), c("Gray Ogre"), c("Plains"), c("Plains"), c("Plains"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Slash, Reptile Rampager → attack with Gray Ogre + Grizzly Bears + Hill Giant → cast The Last Ronin's Technique (sneak, returning Grizzly Bears).",
      notes: `
LETHAL: cast Slash, Reptile Rampager → attack with Gray Ogre + Grizzly Bears + Hill Giant → (opponent: Krotiq Nestguard blocks Hill Giant) → cast The Last Ronin's Technique (sneak, returning Grizzly Bears): exactly 11 damage (the most this board can deal).
RULES: The board of tmt-08-big-brother plus Slash, Reptile Rampager (rare) in your hand, with 5 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Slash, Reptile Rampager: at most 9. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "tmt-17-turncoat-kunoichi", title: "Turncoat Kunoichi", set: "tmt", tier: "hard",
      opp: { life: 14, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("The Last Ronin's Technique"), c("Turncoat Kunoichi")], battlefield: [c("Mutant Town Musicians"), c("Raphael, Tough Turtle"), c("Grizzly Bears"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Turncoat Kunoichi → put Mutant Town Musicians's trigger on the stack first → put Raphael, Tough Turtle's trigger on the stack first → Raphael, Tough Turtle → opponent → Turncoat Kunoichi → Krotiq Nestguard → attack with Grizzly Bears + Mutant Town Musicians + Raphael, Tough Turtle → cast The Last Ronin's Technique (sneak, returning Grizzly Bears) → put Mutant Town Musicians's trigger on the stack first → put Raphael, Tough Turtle's trigger on the stack first → Raphael, Tough Turtle → opponent → put Mutant Town Musicians's trigger on the stack first → put Raphael, Tough Turtle's trigger on the stack first → Raphael, Tough Turtle → opponent → put Mutant Town Musicians's trigger on the stack first → Raphael, Tough Turtle → opponent.",
      notes: `
LETHAL: cast Turncoat Kunoichi → put Mutant Town Musicians's trigger on the stack first → put Raphael, Tough Turtle's trigger on the stack first → Raphael, Tough Turtle → opponent → Turncoat Kunoichi → Krotiq Nestguard → attack with Grizzly Bears + Mutant Town Musicians + Raphael, Tough Turtle → (opponent: no blocks) → cast The Last Ronin's Technique (sneak, returning Grizzly Bears) → put Mutant Town Musicians's trigger on the stack first → put Raphael, Tough Turtle's trigger on the stack first → Raphael, Tough Turtle → opponent → put Mutant Town Musicians's trigger on the stack first → put Raphael, Tough Turtle's trigger on the stack first → Raphael, Tough Turtle → opponent → put Mutant Town Musicians's trigger on the stack first → Raphael, Tough Turtle → opponent: exactly 14 damage (the most this board can deal).
RULES: The board of tmt-09-musicians plus Turncoat Kunoichi (rare) in your hand, with 3 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Turncoat Kunoichi: at most 8. Any other order or target deals less than 14.
UNIQUENESS: Solver-checked: one plan reaches 14; 15 isn't reachable.`
    }),
    puzzle({
      id: "tmt-18-madame-null", title: "Madame Null", set: "tmt", tier: "hard",
      opp: { life: 12, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Shredder, Unrelenting"), c("Madame Null, Power Broker")], battlefield: [c("Hill Giant"), c("Grizzly Bears"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Madame Null, Power Broker → attack with Grizzly Bears + Hill Giant → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → put Madame Null, Power Broker's trigger on the stack first → Shredder, Unrelenting → Hill Giant → Pay 6 life?: Pay 6 life.",
      notes: `
LETHAL: cast Madame Null, Power Broker → attack with Grizzly Bears + Hill Giant → (opponent: Krotiq Nestguard blocks Hill Giant) → cast Shredder, Unrelenting (sneak, returning Grizzly Bears) → put Madame Null, Power Broker's trigger on the stack first → Shredder, Unrelenting → Hill Giant → Pay 6 life?: Pay 6 life: exactly 12 damage (the most this board can deal).
RULES: The board of tmt-01-shredder plus Madame Null, Power Broker (rare) in your hand, with 3 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Madame Null, Power Broker: at most 6. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
    }),
    puzzle({
      id: "tmt-19-prehistoric-pet", title: "Prehistoric Pet", set: "tmt", tier: "hard",
      opp: { life: 15, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Leonardo, Leader in Blue"), c("Prehistoric Pet")], battlefield: [c("Raphael, Tough Turtle"), c("Mutant Town Musicians"), c("Grizzly Bears"), c("Gray Ogre"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Prehistoric Pet → put Raphael, Tough Turtle's trigger on the stack first → Raphael, Tough Turtle → opponent → attack with Gray Ogre + Grizzly Bears + Mutant Town Musicians + Raphael, Tough Turtle → cast Leonardo, Leader in Blue (sneak, returning Raphael, Tough Turtle) → put Mutant Town Musicians's trigger on the stack first.",
      notes: `
LETHAL: cast Prehistoric Pet → put Raphael, Tough Turtle's trigger on the stack first → Raphael, Tough Turtle → opponent → attack with Gray Ogre + Grizzly Bears + Mutant Town Musicians + Raphael, Tough Turtle → (opponent: Krotiq Nestguard blocks Mutant Town Musicians) → cast Leonardo, Leader in Blue (sneak, returning Raphael, Tough Turtle) → put Mutant Town Musicians's trigger on the stack first: exactly 15 damage (the most this board can deal).
RULES: The board of tmt-10-alliance plus Prehistoric Pet (rare) in your hand, with 1 land to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Prehistoric Pet: at most 13. Any other order or target deals less than 15.
UNIQUENESS: Solver-checked: one plan reaches 15; 16 isn't reachable.`
    }),
    puzzle({
      id: "tmt-20-don-raph", title: "Don & Raph", set: "tmt", tier: "hard",
      opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("The Last Ronin's Technique")], battlefield: [c("Raphael, Tough Turtle"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Don & Raph, Hard Science")] },
      explanation: "Attack with Don & Raph, Hard Science → cast The Last Ronin's Technique (sneak, returning Don & Raph, Hard Science) → Raphael, Tough Turtle → opponent → Raphael, Tough Turtle → opponent → Raphael, Tough Turtle → opponent.",
      notes: `
LETHAL: attack with Don & Raph, Hard Science → (opponent: no blocks) → cast The Last Ronin's Technique (sneak, returning Don & Raph, Hard Science) → Raphael, Tough Turtle → opponent → Raphael, Tough Turtle → opponent → Raphael, Tough Turtle → opponent: exactly 6 damage (the most this board can deal).
RULES: The board of tmt-02-tough-turtle plus Don & Raph, Hard Science (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Don & Raph, Hard Science: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    // ---- Secrets of Strixhaven (SOS) ----
    puzzle({
      id: "sos-11-antiquities-on-the-loose", title: "Antiquities on the Loose", set: "sos", tier: "easy",
      opp: { life: 4, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Shock"), c("Antiquities on the Loose")], battlefield: [c("Thunderdrum Soloist"), c("Mountain"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Shock →opponent → cast Antiquities on the Loose.",
      notes: `
LETHAL: cast Shock →opponent → cast Antiquities on the Loose: exactly 4 damage (the most this board can deal).
RULES: The board of sos-01-soloist plus Antiquities on the Loose (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Antiquities on the Loose: at most 3. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
    }),
    puzzle({
      id: "sos-12-ark-of-hunger", title: "Ark of Hunger", set: "sos", tier: "easy",
      opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Lightning Strike"), c("Ark of Hunger")], battlefield: [c("Cuboid Colony"), c("Mountain"), c("Mountain"), c("Mountain"), c("Plains"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Lightning Strike →opponent → cast Ark of Hunger → attack with Cuboid Colony.",
      notes: `
LETHAL: cast Lightning Strike →opponent → cast Ark of Hunger → attack with Cuboid Colony → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of sos-04-cuboid-colony plus Ark of Hunger (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Ark of Hunger: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "sos-13-cauldron-of-essence", title: "Cauldron of Essence", set: "sos", tier: "easy",
      opp: { life: 6, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Cauldron of Essence")], battlefield: [c("Adventurous Eater", {"prepared":true}), c("Ulna Alley Shopkeep"), c("Swamp"), c("Swamp"), c("Forest"), c("Swamp")] },
      explanation: "Cast Cauldron of Essence → cast Have a Bite →Ulna Alley Shopkeep → attack with Adventurous Eater + Ulna Alley Shopkeep.",
      notes: `
LETHAL: cast Cauldron of Essence → cast Have a Bite →Ulna Alley Shopkeep → attack with Adventurous Eater + Ulna Alley Shopkeep → (opponent: Grizzly Bears blocks Adventurous Eater): exactly 6 damage (the most this board can deal).
RULES: The board of sos-03-shopkeep plus Cauldron of Essence (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Cauldron of Essence: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "sos-14-erode", title: "Erode", set: "sos", tier: "easy",
      opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Erode")], battlefield: [c("Quill-Blade Laureate", {"prepared":true}), c("Snooping Page"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Erode →Krotiq Nestguard → cast Twofold Intent →Snooping Page → attack with Quill-Blade Laureate + Snooping Page.",
      notes: `
LETHAL: cast Erode →Krotiq Nestguard → cast Twofold Intent →Snooping Page → attack with Quill-Blade Laureate + Snooping Page → (opponent: no blocks): exactly 8 damage (the most this board can deal).
RULES: The board of sos-02-twofold-intent plus Erode (rare) in your hand, with 1 land to cast it.
WRONG LINES: Without Erode: at most 6. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "sos-15-aziza", title: "Aziza", set: "sos", tier: "medium",
      opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Lightning Strike"), c("Aziza, Mage Tower Captain")], battlefield: [c("Cuboid Colony"), c("Mountain"), c("Mountain"), c("Mountain"), c("Plains")] },
      explanation: "Cast Aziza, Mage Tower Captain → cast Lightning Strike →opponent → attack with Cuboid Colony.",
      notes: `
LETHAL: cast Aziza, Mage Tower Captain → cast Lightning Strike →opponent → attack with Cuboid Colony → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of sos-04-cuboid-colony plus Aziza, Mage Tower Captain (rare) in your hand, with 2 lands to cast it. TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Aziza, Mage Tower Captain: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "sos-16-choreographed-sparks", title: "Choreographed Sparks", set: "sos", tier: "medium",
      opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Shock"), c("Choreographed Sparks")], battlefield: [c("Thunderdrum Soloist"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Shock →opponent → cast Choreographed Sparks (Copy target instant or sorcery spell you control) →shock → Copy of Shock: Keep the same target.",
      notes: `
LETHAL: cast Shock →opponent → cast Choreographed Sparks (Copy target instant or sorcery spell you control) →shock → Copy of Shock: Keep the same target: exactly 6 damage (the most this board can deal).
RULES: The board of sos-01-soloist plus Choreographed Sparks (rare) in your hand, with 2 lands to cast it. TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Choreographed Sparks: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "sos-17-silverquill", title: "Silverquill", set: "sos", tier: "hard",
      opp: { life: 11, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Lightning Strike")], battlefield: [c("Cuboid Colony"), c("Mountain"), c("Mountain"), c("Silverquill, the Disputant")] },
      explanation: "Attack with Cuboid Colony + Silverquill, the Disputant → cast Lightning Strike →opponent → put Cuboid Colony's trigger on the stack first → Casualty 1: Sacrifice Cuboid Colony → Copy of Lightning Strike: Keep the same target.",
      notes: `
LETHAL: attack with Cuboid Colony + Silverquill, the Disputant → (opponent: no blocks) → cast Lightning Strike →opponent → put Cuboid Colony's trigger on the stack first → Casualty 1: Sacrifice Cuboid Colony → Copy of Lightning Strike: Keep the same target: exactly 11 damage (the most this board can deal).
RULES: The board of sos-04-cuboid-colony plus Silverquill, the Disputant (mythic) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Silverquill, the Disputant: at most 5. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "sos-18-comforting-counsel", title: "Comforting Counsel", set: "sos", tier: "hard",
      opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Lightning Strike"), c("Comforting Counsel")], battlefield: [c("Cuboid Colony"), c("Mountain"), c("Mountain"), c("Forest"), c("Forest")] },
      explanation: "Cast Comforting Counsel → cast Lightning Strike →opponent → attack with Cuboid Colony.",
      notes: `
LETHAL: cast Comforting Counsel → cast Lightning Strike →opponent → attack with Cuboid Colony → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of sos-04-cuboid-colony plus Comforting Counsel (rare) in your hand, with 2 lands to cast it. TIMING: lethal needs a response on the stack or a deliberate trigger order.
WRONG LINES: Without Comforting Counsel: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "sos-19-colorstorm-stallion", title: "Colorstorm Stallion", set: "sos", tier: "hard",
      opp: { life: 11, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Colorstorm Stallion")], battlefield: [c("Quill-Blade Laureate", {"tapped":true,"prepared":true}), c("Snooping Page"), c("Melancholic Poet"), c("Lecturing Scornmage"), c("Plains"), c("Plains"), c("Island"), c("Mountain"), c("Island")] },
      explanation: "Cast Colorstorm Stallion → cast Twofold Intent →Snooping Page → put Snooping Page's trigger on the stack first → put Melancholic Poet's trigger on the stack first → put Lecturing Scornmage's trigger on the stack first → attack with Colorstorm Stallion + Lecturing Scornmage + Melancholic Poet + Snooping Page.",
      notes: `
LETHAL: cast Colorstorm Stallion → cast Twofold Intent →Snooping Page → put Snooping Page's trigger on the stack first → put Melancholic Poet's trigger on the stack first → put Lecturing Scornmage's trigger on the stack first → attack with Colorstorm Stallion + Lecturing Scornmage + Melancholic Poet + Snooping Page → (opponent: Krotiq Nestguard blocks Colorstorm Stallion): exactly 11 damage (the most this board can deal).
RULES: The board of sos-10-repartee plus Colorstorm Stallion (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Colorstorm Stallion: at most 9. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "sos-20-stirring-hopesinger", title: "Stirring Hopesinger", set: "sos", tier: "hard",
      opp: { life: 12, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Stirring Hopesinger")], battlefield: [c("Quill-Blade Laureate", {"tapped":true,"prepared":true}), c("Snooping Page"), c("Melancholic Poet"), c("Lecturing Scornmage"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Stirring Hopesinger → cast Twofold Intent →Snooping Page → put Snooping Page's trigger on the stack first → put Melancholic Poet's trigger on the stack first → put Lecturing Scornmage's trigger on the stack first → attack with Lecturing Scornmage + Melancholic Poet + Snooping Page.",
      notes: `
LETHAL: cast Stirring Hopesinger → cast Twofold Intent →Snooping Page → put Snooping Page's trigger on the stack first → put Melancholic Poet's trigger on the stack first → put Lecturing Scornmage's trigger on the stack first → attack with Lecturing Scornmage + Melancholic Poet + Snooping Page → (opponent: Krotiq Nestguard blocks Melancholic Poet): exactly 12 damage (the most this board can deal).
RULES: The board of sos-10-repartee plus Stirring Hopesinger (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Stirring Hopesinger: at most 9. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
    }),
    // ---- Marvel Super Heroes (MSH) ----
    puzzle({
      id: "msh-11-super-soldier-serum", title: "Super-Soldier Serum", set: "msh", tier: "easy",
      opp: { life: 7, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Repulsor Blast"), c("Super-Soldier Serum")], battlefield: [c("Hill Giant"), c("Gray Ogre", {"sick":true}), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Plains"), c("Plains")] },
      explanation: "Cast Repulsor Blast (teamwork: tapping Gray Ogre) →Krotiq Nestguard → cast Super-Soldier Serum →Hill Giant → attack with Hill Giant.",
      notes: `
LETHAL: cast Repulsor Blast (teamwork: tapping Gray Ogre) →Krotiq Nestguard → cast Super-Soldier Serum →Hill Giant → attack with Hill Giant → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: The board of msh-04-repulsor-blast plus Super-Soldier Serum (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without Super-Soldier Serum: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "msh-12-bruce-banner", title: "Bruce Banner", set: "msh", tier: "easy",
      opp: { life: 4, battlefield: [c("Wall of Wood")] },
      you: { hand: [c("Team Tactics")], battlefield: [c("Hill Giant"), c("Grizzly Bears", {"sick":true}), c("Mountain"), c("Mountain"), c("Bruce Banner")] },
      explanation: "Cast Team Tactics (teamwork: tapping Grizzly Bears) →Hill Giant → attack with Bruce Banner + Hill Giant.",
      notes: `
LETHAL: cast Team Tactics (teamwork: tapping Grizzly Bears) →Hill Giant → attack with Bruce Banner + Hill Giant → (opponent: Wall of Wood blocks Hill Giant): exactly 4 damage (the most this board can deal).
RULES: The board of msh-03-team-tactics plus Bruce Banner (mythic) on the battlefield.
WRONG LINES: Without Bruce Banner: at most 3. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
    }),
    puzzle({
      id: "msh-13-captain-america", title: "Captain America", set: "msh", tier: "easy",
      opp: { life: 9, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Team Tactics")], battlefield: [c("Luke Cage, Power Man"), c("Agents of S.H.I.E.L.D."), c("Mountain"), c("Mountain"), c("Captain America, Wings of Freedom")] },
      explanation: "Cast Team Tactics →Captain America, Wings of Freedom → attack with Agents of S.H.I.E.L.D. + Captain America, Wings of Freedom + Luke Cage, Power Man.",
      notes: `
LETHAL: cast Team Tactics →Captain America, Wings of Freedom → attack with Agents of S.H.I.E.L.D. + Captain America, Wings of Freedom + Luke Cage, Power Man → (opponent: Krotiq Nestguard blocks Luke Cage, Power Man): exactly 9 damage (the most this board can deal).
RULES: The board of msh-09-luke-cage plus Captain America, Wings of Freedom (rare) on the battlefield.
WRONG LINES: Without Captain America, Wings of Freedom: at most 6. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "msh-14-agent-phil-coulson", title: "Agent Phil Coulson", set: "msh", tier: "easy",
      opp: { life: 7, battlefield: [] },
      you: { hand: [c("Volcanic Villain")], battlefield: [c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Agent Phil Coulson")] },
      explanation: "Cast Volcanic Villain → activate Volcanic Villain (Power-up — {5}{R}: two +1/+1 counters) → attack with Agent Phil Coulson + Volcanic Villain.",
      notes: `
LETHAL: cast Volcanic Villain → activate Volcanic Villain (Power-up — {5}{R}: two +1/+1 counters) → attack with Agent Phil Coulson + Volcanic Villain → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: The board of msh-01-volcanic-villain plus Agent Phil Coulson (rare) on the battlefield.
WRONG LINES: Without Agent Phil Coulson: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "msh-15-doom-reigns-supreme", title: "Doom Reigns Supreme", set: "msh", tier: "medium",
      opp: { life: 11, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Hercules, Prince of Power"), c("Volcanic Villain"), c("Doom Reigns Supreme")], battlefield: [c("Hulk, Gamma Goliath"), c("Forest"), c("Forest"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Hercules, Prince of Power → cast Doom Reigns Supreme → cast Volcanic Villain → activate Hercules, Prince of Power (Power-up — {4}{G}: +1/+1 counter, vigilance, indestructible, haste) → activate Volcanic Villain (Power-up — {5}{R}: two +1/+1 counters) → attack with Hercules, Prince of Power + Hulk, Gamma Goliath + Volcanic Villain.",
      notes: `
LETHAL: cast Hercules, Prince of Power → cast Doom Reigns Supreme → cast Volcanic Villain → activate Hercules, Prince of Power (Power-up — {4}{G}: +1/+1 counter, vigilance, indestructible, haste) → activate Volcanic Villain (Power-up — {5}{R}: two +1/+1 counters) → attack with Hercules, Prince of Power + Hulk, Gamma Goliath + Volcanic Villain → (opponent: Krotiq Nestguard blocks Volcanic Villain): exactly 11 damage (the most this board can deal).
RULES: The board of msh-07-gamma-goliath plus Doom Reigns Supreme (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without Doom Reigns Supreme: at most 10. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "msh-16-leader", title: "Leader", set: "msh", tier: "medium",
      opp: { life: 5, battlefield: [] },
      you: { hand: [c("Hercules, Prince of Power"), c("Leader, Super-Genius")], battlefield: [c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Island"), c("Island"), c("Island"), c("Island")] },
      explanation: "Cast Hercules, Prince of Power → cast Leader, Super-Genius → activate Hercules, Prince of Power (Power-up — {4}{G}: +1/+1 counter, vigilance, indestructible, haste) → Leader, Super-Genius → Hercules, Prince of Power → Discard which card?: Unknown card → attack with Hercules, Prince of Power.",
      notes: `
LETHAL: cast Hercules, Prince of Power → cast Leader, Super-Genius → activate Hercules, Prince of Power (Power-up — {4}{G}: +1/+1 counter, vigilance, indestructible, haste) → Leader, Super-Genius → Hercules, Prince of Power → Discard which card?: Unknown card → attack with Hercules, Prince of Power → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: The board of msh-02-hercules plus Leader, Super-Genius (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Leader, Super-Genius: at most 4. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "msh-17-baron-helmut-zemo", title: "Baron Helmut Zemo", set: "msh", tier: "hard",
      opp: { life: 15, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Hercules, Prince of Power"), c("Repulsor Blast")], battlefield: [c("Hulk, Gamma Goliath"), c("Gray Ogre", {"sick":true}), c("Forest"), c("Forest"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Baron Helmut Zemo")] },
      explanation: "Cast Hercules, Prince of Power → cast Repulsor Blast (teamwork: tapping Gray Ogre) →Krotiq Nestguard → activate Hercules, Prince of Power (Power-up — {4}{G}: +1/+1 counter, vigilance, indestructible, haste) → attack with Baron Helmut Zemo + Hercules, Prince of Power + Hulk, Gamma Goliath.",
      notes: `
LETHAL: cast Hercules, Prince of Power → cast Repulsor Blast (teamwork: tapping Gray Ogre) →Krotiq Nestguard → activate Hercules, Prince of Power (Power-up — {4}{G}: +1/+1 counter, vigilance, indestructible, haste) → attack with Baron Helmut Zemo + Hercules, Prince of Power + Hulk, Gamma Goliath → (opponent: no blocks): exactly 15 damage (the most this board can deal).
RULES: The board of msh-08-repulsor-hulk plus Baron Helmut Zemo (rare) on the battlefield.
WRONG LINES: Without Baron Helmut Zemo: at most 12. Any other order or target deals less than 15.
UNIQUENESS: Solver-checked: one plan reaches 15; 16 isn't reachable.`
    }),
    puzzle({
      id: "msh-18-avengers-assemble", title: "Avengers Assemble!", set: "msh", tier: "hard",
      opp: { life: 10, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Team Tactics"), c("Avengers Assemble!")], battlefield: [c("Luke Cage, Power Man"), c("Agents of S.H.I.E.L.D."), c("Mountain"), c("Mountain"), c("Plains"), c("Plains"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Team Tactics (teamwork: tapping Agents of S.H.I.E.L.D.) →Luke Cage, Power Man → cast Avengers Assemble! → attack with Luke Cage, Power Man → put Luke Cage, Power Man's trigger on the stack first.",
      notes: `
LETHAL: cast Team Tactics (teamwork: tapping Agents of S.H.I.E.L.D.) →Luke Cage, Power Man → cast Avengers Assemble! → attack with Luke Cage, Power Man → put Luke Cage, Power Man's trigger on the stack first → (opponent: Krotiq Nestguard blocks Luke Cage, Power Man): exactly 10 damage (the most this board can deal).
RULES: The board of msh-09-luke-cage plus Avengers Assemble! (mythic) in your hand, with 5 lands to cast it.
WRONG LINES: Without Avengers Assemble!: at most 6. Any other order or target deals less than 10.
UNIQUENESS: Solver-checked: one plan reaches 10; 11 isn't reachable.`
    }),
    puzzle({
      id: "msh-19-black-widow", title: "Black Widow", set: "msh", tier: "hard",
      opp: { life: 12, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Hercules, Prince of Power"), c("Volcanic Villain")], battlefield: [c("Hulk, Gamma Goliath"), c("Forest"), c("Forest"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain"), c("Black Widow, Super Spy")] },
      explanation: "Cast Hercules, Prince of Power → cast Volcanic Villain → activate Hercules, Prince of Power (Power-up — {4}{G}: +1/+1 counter, vigilance, indestructible, haste) → activate Volcanic Villain (Power-up — {5}{R}: two +1/+1 counters) → attack with Black Widow, Super Spy + Hercules, Prince of Power + Hulk, Gamma Goliath + Volcanic Villain.",
      notes: `
LETHAL: cast Hercules, Prince of Power → cast Volcanic Villain → activate Hercules, Prince of Power (Power-up — {4}{G}: +1/+1 counter, vigilance, indestructible, haste) → activate Volcanic Villain (Power-up — {5}{R}: two +1/+1 counters) → attack with Black Widow, Super Spy + Hercules, Prince of Power + Hulk, Gamma Goliath + Volcanic Villain → (opponent: Krotiq Nestguard blocks Volcanic Villain): exactly 12 damage (the most this board can deal).
RULES: The board of msh-07-gamma-goliath plus Black Widow, Super Spy (mythic) on the battlefield.
WRONG LINES: Without Black Widow, Super Spy: at most 10. Any other order or target deals less than 12.
UNIQUENESS: Solver-checked: one plan reaches 12; 13 isn't reachable.`
    }),
    puzzle({
      id: "msh-20-captain-america", title: "Captain America", set: "msh", tier: "hard",
      opp: { life: 15, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Hercules, Prince of Power"), c("Repulsor Blast")], battlefield: [c("Hulk, Gamma Goliath"), c("Gray Ogre", {"sick":true}), c("Forest"), c("Forest"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Captain America, Super-Soldier")] },
      explanation: "Cast Hercules, Prince of Power → cast Repulsor Blast (teamwork: tapping Gray Ogre) →Krotiq Nestguard → activate Hercules, Prince of Power (Power-up — {4}{G}: +1/+1 counter, vigilance, indestructible, haste) → attack with Captain America, Super-Soldier + Hercules, Prince of Power + Hulk, Gamma Goliath.",
      notes: `
LETHAL: cast Hercules, Prince of Power → cast Repulsor Blast (teamwork: tapping Gray Ogre) →Krotiq Nestguard → activate Hercules, Prince of Power (Power-up — {4}{G}: +1/+1 counter, vigilance, indestructible, haste) → attack with Captain America, Super-Soldier + Hercules, Prince of Power + Hulk, Gamma Goliath → (opponent: no blocks): exactly 15 damage (the most this board can deal).
RULES: The board of msh-08-repulsor-hulk plus Captain America, Super-Soldier (mythic) on the battlefield.
WRONG LINES: Without Captain America, Super-Soldier: at most 12. Any other order or target deals less than 15.
UNIQUENESS: Solver-checked: one plan reaches 15; 16 isn't reachable.`
    }),
    // ---- The Hobbit (HOB) ----
    puzzle({
      id: "hob-11-bard-s-company", title: "Bard's Company", set: "hob", tier: "easy",
      opp: { life: 4, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Bard's Company")], battlefield: [c("Nighthowl Pursuer"), c("Krotiq Nestguard"), c("Plains"), c("Island"), c("Plains"), c("Plains")] },
      explanation: "Cast Bard's Company → attack with Nighthowl Pursuer.",
      notes: `
LETHAL: cast Bard's Company → attack with Nighthowl Pursuer → (opponent: no blocks): exactly 4 damage (the most this board can deal).
RULES: The board of hob-02-nighthowl plus Bard's Company (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Bard's Company: at most 3. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
    }),
    puzzle({
      id: "hob-12-f-li-the-pathfinder", title: "Fíli the Pathfinder", set: "hob", tier: "easy",
      opp: { life: 5, battlefield: [] },
      you: { hand: [c("Dori, Bearer of Friends"), c("Fíli the Pathfinder")], battlefield: [c("Ori, Keeper of Songs"), c("Thrór's Map"), c("Mountain"), c("Mountain"), c("Mountain"), c("Plains"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Cast Fíli the Pathfinder → attack with Ori, Keeper of Songs.",
      notes: `
LETHAL: cast Fíli the Pathfinder → attack with Ori, Keeper of Songs → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: The board of hob-03-ori plus Fíli the Pathfinder (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Fíli the Pathfinder: at most 4. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "hob-13-an-unexpected-party", title: "An Unexpected Party", set: "hob", tier: "easy",
      opp: { life: 5, battlefield: [] },
      you: { hand: [c("Forest"), c("An Unexpected Party")], battlefield: [c("Attercop"), c("Plains"), c("Plains"), c("Plains"), c("Plains")] },
      explanation: "Play Forest → cast An Unexpected Party → attack with Attercop.",
      notes: `
LETHAL: play Forest → cast An Unexpected Party → attack with Attercop → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: The board of hob-01-attercop plus An Unexpected Party (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without An Unexpected Party: at most 3. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "hob-14-gandalf", title: "Gandalf", set: "hob", tier: "easy",
      opp: { life: 6, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Smaug, the Great Calamity"), c("Gandalf, Goblins' Bane")], battlefield: [c("Hill Giant"), c("Gray Ogre"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Gandalf, Goblins' Bane → cast Spew Flame →Krotiq Nestguard → attack with Gray Ogre + Hill Giant.",
      notes: `
LETHAL: cast Gandalf, Goblins' Bane → cast Spew Flame →Krotiq Nestguard → attack with Gray Ogre + Hill Giant → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of hob-04-smaug plus Gandalf, Goblins' Bane (mythic) in your hand, with 3 lands to cast it.
WRONG LINES: Without Gandalf, Goblins' Bane: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "hob-15-stone-giant-of-high-pass", title: "Stone-Giant of High Pass", set: "hob", tier: "medium",
      opp: { life: 14, battlefield: [] },
      you: { hand: [c("Dori, Bearer of Friends"), c("Óin the Brave")], battlefield: [c("Ori, Keeper of Songs"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Stone-Giant of High Pass")] },
      explanation: "Attack with Ori, Keeper of Songs + Stone-Giant of High Pass → activate Stone-Giant of High Pass ({2}{R}, Sacrifice an artifact: 4 damage to any target) → opponent.",
      notes: `
LETHAL: attack with Ori, Keeper of Songs + Stone-Giant of High Pass → activate Stone-Giant of High Pass ({2}{R}, Sacrifice an artifact: 4 damage to any target) → opponent → (opponent: no blocks): exactly 14 damage (the most this board can deal).
RULES: The board of hob-07-bearer-of-friends plus Stone-Giant of High Pass (rare) on the battlefield. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Stone-Giant of High Pass: at most 6. Any other order or target deals less than 14.
UNIQUENESS: Solver-checked: one plan reaches 14; 15 isn't reachable.`
    }),
    puzzle({
      id: "hob-16-thranduil-s-company", title: "Thranduil's Company", set: "hob", tier: "medium",
      opp: { life: 7, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Forest"), c("Thranduil's Company")], battlefield: [c("Wilderland Scrounger"), c("Nighthowl Pursuer"), c("Beorn's Hospitality"), c("Forest"), c("Island"), c("Forest"), c("Forest")] },
      explanation: "Cast Thranduil's Company → play Forest → put Beorn's Hospitality's trigger on the stack first → Beorn's Hospitality → Nighthowl Pursuer → Thranduil's Company → Nighthowl Pursuer → attack with Nighthowl Pursuer + Wilderland Scrounger → put Wilderland Scrounger's trigger on the stack first.",
      notes: `
LETHAL: cast Thranduil's Company → play Forest → put Beorn's Hospitality's trigger on the stack first → Beorn's Hospitality → Nighthowl Pursuer → Thranduil's Company → Nighthowl Pursuer → attack with Nighthowl Pursuer + Wilderland Scrounger → put Wilderland Scrounger's trigger on the stack first → (opponent: Krotiq Nestguard blocks Wilderland Scrounger): exactly 7 damage (the most this board can deal).
RULES: The board of hob-08-scrounger plus Thranduil's Company (rare) in your hand, with 4 lands to cast it.
WRONG LINES: Without Thranduil's Company: at most 4. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "hob-17-the-sackville-bagginses", title: "The Sackville-Bagginses", set: "hob", tier: "hard",
      opp: { life: 4, battlefield: [c("Grizzly Bears"), c("Grizzly Bears")] },
      you: { hand: [c("Forest"), c("The Sackville-Bagginses")], battlefield: [c("Attercop"), c("Nighthowl Pursuer"), c("Beorn's Hospitality"), c("Swamp"), c("Swamp")] },
      explanation: "Play Forest → put Attercop's trigger on the stack first → Beorn's Hospitality → Attercop → attack with Attercop + Nighthowl Pursuer → cast The Sackville-Bagginses → Sacrifice one?: Sacrifice Nighthowl Pursuer → sacrifice Treasure for mana.",
      notes: `
LETHAL: play Forest → put Attercop's trigger on the stack first → Beorn's Hospitality → Attercop → attack with Attercop + Nighthowl Pursuer → (opponent: Grizzly Bears + Grizzly Bears blocks Attercop) → cast The Sackville-Bagginses → Sacrifice one?: Sacrifice Nighthowl Pursuer → sacrifice Treasure for mana: exactly 4 damage (the most this board can deal).
RULES: The board of hob-10-mirkwood plus The Sackville-Bagginses (rare) in your hand, with 2 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without The Sackville-Bagginses: at most 3. Any other order or target deals less than 4.
UNIQUENESS: Solver-checked: one plan reaches 4; 5 isn't reachable.`
    }),
    puzzle({
      id: "hob-18-sting", title: "Sting", set: "hob", tier: "hard",
      opp: { life: 5, battlefield: [c("Grizzly Bears"), c("Grizzly Bears")] },
      you: { hand: [c("Forest"), c("Sting, Bilbo's Sword")], battlefield: [c("Attercop"), c("Nighthowl Pursuer"), c("Beorn's Hospitality"), c("Plains"), c("Plains")] },
      explanation: "Play Forest → put Attercop's trigger on the stack first → Beorn's Hospitality → Attercop → attack with Attercop + Nighthowl Pursuer → cast Sting, Bilbo's Sword → Sting, Bilbo's Sword → Nighthowl Pursuer.",
      notes: `
LETHAL: play Forest → put Attercop's trigger on the stack first → Beorn's Hospitality → Attercop → attack with Attercop + Nighthowl Pursuer → (opponent: Grizzly Bears + Grizzly Bears blocks Attercop) → cast Sting, Bilbo's Sword → Sting, Bilbo's Sword → Nighthowl Pursuer: exactly 5 damage (the most this board can deal).
RULES: The board of hob-10-mirkwood plus Sting, Bilbo's Sword (rare) in your hand, with 2 lands to cast it. TIMING: lethal needs a play outside main phase 1 (during combat after blocks, a first-strike step, or main 2).
WRONG LINES: Without Sting, Bilbo's Sword: at most 3. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "hob-19-dancing-from-dark-to-dawn", title: "Dancing from Dark to Dawn", set: "hob", tier: "hard",
      opp: { life: 11, battlefield: [] },
      you: { hand: [c("Dori, Bearer of Friends"), c("Óin the Brave"), c("Dancing from Dark to Dawn")], battlefield: [c("Ori, Keeper of Songs"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest")] },
      explanation: "Cast Dancing from Dark to Dawn → cast Dori, Bearer of Friends → Dancing from Dark to Dawn → Ori, Keeper of Songs → cast Óin the Brave → Dancing from Dark to Dawn → Ori, Keeper of Songs → attack with Ori, Keeper of Songs + Óin the Brave.",
      notes: `
LETHAL: cast Dancing from Dark to Dawn → cast Dori, Bearer of Friends → Dancing from Dark to Dawn → Ori, Keeper of Songs → cast Óin the Brave → Dancing from Dark to Dawn → Ori, Keeper of Songs → attack with Ori, Keeper of Songs + Óin the Brave → (opponent: no blocks): exactly 11 damage (the most this board can deal).
RULES: The board of hob-07-bearer-of-friends plus Dancing from Dark to Dawn (mythic) in your hand, with 5 lands to cast it.
WRONG LINES: Without Dancing from Dark to Dawn: at most 6. Any other order or target deals less than 11.
UNIQUENESS: Solver-checked: one plan reaches 11; 12 isn't reachable.`
    }),
    puzzle({
      id: "hob-20-beorn-the-fierce", title: "Beorn the Fierce", set: "hob", tier: "hard",
      opp: { life: 6, battlefield: [c("Grizzly Bears"), c("Grizzly Bears")] },
      you: { hand: [c("Forest"), c("Beorn the Fierce")], battlefield: [c("Attercop"), c("Nighthowl Pursuer"), c("Beorn's Hospitality"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest")] },
      explanation: "Play Forest → put Attercop's trigger on the stack first → Beorn's Hospitality → Attercop → cast Beorn the Fierce → Beorn the Fierce → Attercop → attack with Attercop + Nighthowl Pursuer.",
      notes: `
LETHAL: play Forest → put Attercop's trigger on the stack first → Beorn's Hospitality → Attercop → cast Beorn the Fierce → Beorn the Fierce → Attercop → attack with Attercop + Nighthowl Pursuer → (opponent: Grizzly Bears + Grizzly Bears blocks Nighthowl Pursuer): exactly 6 damage (the most this board can deal).
RULES: The board of hob-10-mirkwood plus Beorn the Fierce (mythic) in your hand, with 5 lands to cast it.
WRONG LINES: Without Beorn the Fierce: at most 3. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    // ---- Reality Fracture (FRA) ----
    puzzle({
      id: "fra-11-vindictive-triumph", title: "Vindictive Triumph", set: "fra", tier: "easy",
      opp: { life: 5, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Keeper of the Quiet Hour"), c("Vindictive Triumph")], battlefield: [c("Kiora of Salt and Sand"), c("Hill Giant"), c("Forest"), c("Forest"), c("Forest"), c("Plains"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Vindictive Triumph →Krotiq Nestguard → attack with Hill Giant + Kiora of Salt and Sand.",
      notes: `
LETHAL: cast Vindictive Triumph →Krotiq Nestguard → attack with Hill Giant + Kiora of Salt and Sand → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: The board of fra-05-kiora plus Vindictive Triumph (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Vindictive Triumph: at most 3. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "fra-12-craterclaw-colossus", title: "Craterclaw Colossus", set: "fra", tier: "easy",
      opp: { life: 8, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Craterclaw Colossus")], battlefield: [c("Theorix Metamage", {"prepared":true}), c("Island"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")], graveyard: [c("Island"), c("Island"), c("Island"), c("Island")], library: [c("Island"), c("Island"), c("Island")] },
      explanation: "Cast Omit Variables → cast Craterclaw Colossus → attack with Craterclaw Colossus + Theorix Metamage.",
      notes: `
LETHAL: cast Omit Variables → cast Craterclaw Colossus → attack with Craterclaw Colossus + Theorix Metamage → (opponent: Grizzly Bears blocks Craterclaw Colossus): exactly 8 damage (the most this board can deal).
RULES: The board of fra-04-threshold plus Craterclaw Colossus (mythic) in your hand, with 7 lands to cast it.
WRONG LINES: Without Craterclaw Colossus: at most 3. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "fra-13-darklight-phoenix", title: "Darklight Phoenix", set: "fra", tier: "easy",
      opp: { life: 7, battlefield: [] },
      you: { hand: [c("Keeper of the Quiet Hour"), c("Darklight Phoenix")], battlefield: [c("Inspired Tethermage"), c("Forest"), c("Forest"), c("Forest"), c("Swamp"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Cast Keeper of the Quiet Hour → cast Darklight Phoenix → attack with Darklight Phoenix + Inspired Tethermage.",
      notes: `
LETHAL: cast Keeper of the Quiet Hour → cast Darklight Phoenix → attack with Darklight Phoenix + Inspired Tethermage → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: The board of fra-01-empower plus Darklight Phoenix (mythic) in your hand, with 4 lands to cast it.
WRONG LINES: Without Darklight Phoenix: at most 4. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "fra-14-ingris-stingerquill", title: "Ingris Stingerquill", set: "fra", tier: "easy",
      opp: { life: 9, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Way of the Wildspeaker"), c("Ingris Stingerquill")], battlefield: [c("Gallia, the Merrymaker"), c("Inspired Tethermage"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain"), c("Swamp"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Ingris Stingerquill → activate Ingris Stingerquill ({4}: Cadet, then creatures you control gain haste) → attack with Cadet + Gallia, the Merrymaker + Ingris Stingerquill + Inspired Tethermage.",
      notes: `
LETHAL: cast Ingris Stingerquill → activate Ingris Stingerquill ({4}: Cadet, then creatures you control gain haste) → attack with Cadet + Gallia, the Merrymaker + Ingris Stingerquill + Inspired Tethermage → (opponent: Grizzly Bears blocks Inspired Tethermage): exactly 9 damage (the most this board can deal).
RULES: The board of fra-08-wildspeaker plus Ingris Stingerquill (mythic) in your hand, with 3 lands to cast it.
WRONG LINES: Without Ingris Stingerquill: at most 5. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "fra-15-chandra", title: "Chandra", set: "fra", tier: "medium",
      opp: { life: 7, battlefield: [c("Grizzly Bears"), c("Grizzly Bears")] },
      you: { hand: [c("Mountain"), c("Whiplash Wordsmith"), c("Chandra, Torch of Defiance")], battlefield: [c("Koth, the Geomancer"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Play Mountain → cast Whiplash Wordsmith → cast Chandra, Torch of Defiance → cast Vicious Verse →opponent → activate Chandra, Torch of Defiance (+1: Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent.) → attack with Whiplash Wordsmith.",
      notes: `
LETHAL: play Mountain → cast Whiplash Wordsmith → cast Chandra, Torch of Defiance → cast Vicious Verse →opponent → activate Chandra, Torch of Defiance (+1: Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent.) → attack with Whiplash Wordsmith → (opponent: no blocks): exactly 7 damage (the most this board can deal).
RULES: The board of fra-06-koth plus Chandra, Torch of Defiance (mythic) in your hand, with 4 lands to cast it.
WRONG LINES: Without Chandra, Torch of Defiance: at most 5. Any other order or target deals less than 7.
UNIQUENESS: Solver-checked: one plan reaches 7; 8 isn't reachable.`
    }),
    puzzle({
      id: "fra-16-hungering-puppetbeast", title: "Hungering Puppetbeast", set: "fra", tier: "medium",
      opp: { life: 8, battlefield: [c("Krotiq Nestguard")] },
      you: { hand: [c("Keeper of the Quiet Hour"), c("Hungering Puppetbeast")], battlefield: [c("Kiora of Salt and Sand"), c("Hill Giant"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest")] },
      explanation: "Cast Keeper of the Quiet Hour → cast Hungering Puppetbeast → activate Jace (−1: Surveil 1) → activate Hungering Puppetbeast ({1}, Sacrifice another artifact: +1/+1 counter, trample/hexproof/haste) → Which ability?: haste → attack with Hill Giant + Hungering Puppetbeast + Kiora of Salt and Sand → Kiora of Salt and Sand → Hungering Puppetbeast.",
      notes: `
LETHAL: cast Keeper of the Quiet Hour → cast Hungering Puppetbeast → activate Jace (−1: Surveil 1) → activate Hungering Puppetbeast ({1}, Sacrifice another artifact: +1/+1 counter, trample/hexproof/haste) → Which ability?: haste → attack with Hill Giant + Hungering Puppetbeast + Kiora of Salt and Sand → Kiora of Salt and Sand → Hungering Puppetbeast → (opponent: Krotiq Nestguard blocks Hill Giant): exactly 8 damage (the most this board can deal).
RULES: The board of fra-05-kiora plus Hungering Puppetbeast (rare) in your hand, with 5 lands to cast it.
WRONG LINES: Without Hungering Puppetbeast: at most 3. Any other order or target deals less than 8.
UNIQUENESS: Solver-checked: one plan reaches 8; 9 isn't reachable.`
    }),
    puzzle({
      id: "fra-17-sanctum-lurker", title: "Sanctum Lurker", set: "fra", tier: "hard",
      opp: { life: 6, battlefield: [c("Grizzly Bears"), c("Grizzly Bears")] },
      you: { hand: [c("Mountain"), c("Whiplash Wordsmith"), c("Sanctum Lurker")], battlefield: [c("Koth, the Geomancer"), c("Mountain"), c("Mountain"), c("Mountain"), c("Swamp"), c("Swamp"), c("Swamp")] },
      explanation: "Play Mountain → cast Whiplash Wordsmith → cast Sanctum Lurker → cast Vicious Verse →opponent → activate Jace (+2: This planeswalker deals 1 damage to each opponent and you gain 1 life.) → attack with Whiplash Wordsmith.",
      notes: `
LETHAL: play Mountain → cast Whiplash Wordsmith → cast Sanctum Lurker → cast Vicious Verse →opponent → activate Jace (+2: This planeswalker deals 1 damage to each opponent and you gain 1 life.) → attack with Whiplash Wordsmith → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of fra-06-koth plus Sanctum Lurker (rare) in your hand, with 3 lands to cast it.
WRONG LINES: Without Sanctum Lurker: at most 5. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    }),
    puzzle({
      id: "fra-18-solitary-cell", title: "Solitary Cell", set: "fra", tier: "hard",
      opp: { life: 9, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Way of the Wildspeaker"), c("Solitary Cell")], battlefield: [c("Gallia, the Merrymaker"), c("Inspired Tethermage"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Plains")] },
      explanation: "Cast Way of the Wildspeaker → cast Solitary Cell → Solitary Cell → Grizzly Bears → activate Jace (−4: Create a 4/4 green Beast creature token with trample) → activate Gallia, the Merrymaker ({1}{R}, {T}: Put a +1/+1 counter on target creature that entered this turn) → Beast → attack with Beast + Inspired Tethermage.",
      notes: `
LETHAL: cast Way of the Wildspeaker → cast Solitary Cell → Solitary Cell → Grizzly Bears → activate Jace (−4: Create a 4/4 green Beast creature token with trample) → activate Gallia, the Merrymaker ({1}{R}, {T}: Put a +1/+1 counter on target creature that entered this turn) → Beast → attack with Beast + Inspired Tethermage → (opponent: no blocks): exactly 9 damage (the most this board can deal).
RULES: The board of fra-08-wildspeaker plus Solitary Cell (rare) in your hand, with 2 lands to cast it.
WRONG LINES: Without Solitary Cell: at most 5. Any other order or target deals less than 9.
UNIQUENESS: Solver-checked: one plan reaches 9; 10 isn't reachable.`
    }),
    puzzle({
      id: "fra-19-ajani-unrelenting", title: "Ajani Unrelenting", set: "fra", tier: "hard",
      opp: { life: 5, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Whiplash Wordsmith"), c("Ajani Unrelenting")], battlefield: [c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain")] },
      explanation: "Cast Whiplash Wordsmith → cast Ajani Unrelenting → cast Vicious Verse →opponent → activate Ajani Unrelenting (+1: (Cadet first) Creatures you control get +1/+0 and gain haste) → attack with Whiplash Wordsmith.",
      notes: `
LETHAL: cast Whiplash Wordsmith → cast Ajani Unrelenting → cast Vicious Verse →opponent → activate Ajani Unrelenting (+1: (Cadet first) Creatures you control get +1/+0 and gain haste) → attack with Whiplash Wordsmith → (opponent: no blocks): exactly 5 damage (the most this board can deal).
RULES: The board of fra-03-wordsmith plus Ajani Unrelenting (mythic) in your hand, with 6 lands to cast it.
WRONG LINES: Without Ajani Unrelenting: at most 4. Any other order or target deals less than 5.
UNIQUENESS: Solver-checked: one plan reaches 5; 6 isn't reachable.`
    }),
    puzzle({
      id: "fra-20-garruk", title: "Garruk", set: "fra", tier: "hard",
      opp: { life: 6, battlefield: [c("Grizzly Bears")] },
      you: { hand: [c("Whiplash Wordsmith"), c("Garruk, Curse Breaker")], battlefield: [c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Mountain"), c("Forest"), c("Forest"), c("Forest"), c("Forest"), c("Forest")] },
      explanation: "Cast Whiplash Wordsmith → cast Vicious Verse →opponent → cast Garruk, Curse Breaker → activate Garruk, Curse Breaker (−4: Until your next turn, attackers get +2/+2 and trample) → attack with Whiplash Wordsmith.",
      notes: `
LETHAL: cast Whiplash Wordsmith → cast Vicious Verse →opponent → cast Garruk, Curse Breaker → activate Garruk, Curse Breaker (−4: Until your next turn, attackers get +2/+2 and trample) → attack with Whiplash Wordsmith → (opponent: no blocks): exactly 6 damage (the most this board can deal).
RULES: The board of fra-03-wordsmith plus Garruk, Curse Breaker (mythic) in your hand, with 5 lands to cast it.
WRONG LINES: Without Garruk, Curse Breaker: at most 4. Any other order or target deals less than 6.
UNIQUENESS: Solver-checked: one plan reaches 6; 7 isn't reachable.`
    })
  );
})();
