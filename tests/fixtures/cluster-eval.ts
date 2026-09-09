/**
 * Clustering evaluation set — hand-labelled from the real 793-story corpus.
 *
 * Every pair below is a genuine cross-source pair that actually appeared in
 * production data. Labels are editorial judgements made by reading the
 * headlines, NOT produced by the algorithm under test — otherwise the
 * measurement would be circular.
 *
 * SAME = independent sources reporting the SAME underlying event. Must cluster.
 * DIFF = different events. Must NOT cluster, however many words they share.
 *
 * Genuinely ambiguous pairs (where an editor would need the article body to
 * decide) are deliberately EXCLUDED rather than guessed at — a poisoned eval
 * set is worse than a small one.
 */

export interface EvalPair {
  a: string;
  b: string;
  label: "SAME" | "DIFF";
  /** Why this pair is interesting — kept so future tuning cannot silently undo it. */
  note?: string;
}

export const CLUSTER_EVAL: EvalPair[] = [
  // -----------------------------------------------------------------------
  // SAME EVENT — must cluster.
  // -----------------------------------------------------------------------
  {
    a: "FG moves to operationalise 112 national emergency number",
    b: "FG Moves To Operationalise 112 National Emergency Number",
    label: "SAME",
    note: "identical headline, different casing",
  },
  {
    a: "FG moves to operationalise 112 national emergency number",
    b: "FG Sets Roadmap For Nationwide Rollout Of 112 Emergency Number",
    label: "SAME",
    note: "same policy launch, fully reworded",
  },
  {
    a: "Olympic qualifiers: NFF names Eguavoen Falcons interim coach",
    b: "2028 Olympic Qualifiers: NFF Names Eguavoen Interim Super Falcons Coach",
    label: "SAME",
  },
  {
    a: "Eguavoen named interim Super Falcons coach ahead of Olympic qualifiers",
    b: "Eguavoen Named Interim Super Falcons Head Coach",
    label: "SAME",
  },
  {
    a: "Augustine Eguavoen named Super Falcons interim coach for 2028 Olympics qualifying matches",
    b: "Exclusive - Eguavoen Named As Interim Coach Of Super Falcons",
    label: "SAME",
  },
  {
    a: "Eguavoen to lead Super Falcons for 2028 Olympic qualifiers",
    b: "LA 2028 Olympics Race: Eguavoen to lead Super Falcons in interim capacity",
    label: "SAME",
  },
  {
    a: "Olympic qualifiers: NFF names Eguavoen Falcons interim coach",
    b: "Ex-Super Eagles coach to lead Super Falcons for October Olympic qualifiers - Report",
    label: "SAME",
    note: "one side never names him",
  },
  {
    a: "NOUN appoints acting bursar",
    b: "NOUN appoints Ramatu Ibrahim as acting bursar",
    label: "SAME",
    note: "short headline fully contained in the long one",
  },
  {
    a: "NOUN bursar shot dead in Zamfara",
    b: "NOUN bursar Nasiru Marafa shot dead in Zamfara",
    label: "SAME",
  },
  {
    a: "NOUN bursar shot dead in Zamfara",
    b: "BREAKING: National Open University Bursar Nasiru Marafa Shot Dead In Zamfara",
    label: "SAME",
    note: "acronym vs expanded institution name",
  },
  {
    a: "Super Eagles to face Russia in October friendly",
    b: "Friendly: Super Eagles To Face Russia In Nizhny Novgorod October 6",
    label: "SAME",
  },
  {
    a: "International Friendly: Nigeria to face Russia in Nizhny Novgorod on October 6",
    b: "Friendly: Super Eagles To Face Russia In Nizhny Novgorod October 6",
    label: "SAME",
    note: "Nigeria vs Super Eagles for the same team",
  },
  {
    a: "Nigeria set for Russia rematch in October",
    b: "International Friendly: Nigeria to face Russia in Nizhny Novgorod on October 6",
    label: "SAME",
  },
  {
    a: "Northern Senators Mourn Bello Mandiya",
    b: "Northern Senators mourn Senator Bello Mandiya",
    label: "SAME",
  },
  {
    a: "FG condemns fresh Houthi attacks on Saudi Arabia",
    b: "Nigeria Condemns Fresh Houthi Attacks On Saudi Arabia",
    label: "SAME",
    note: "FG vs Nigeria for the same actor",
  },
  {
    a: "Houthis attack Saudi Arabia, 73 wounded as energy facilities hit",
    b: "Saudi Arabia vows to respond after Houthis attack cities and energy facilities",
    label: "SAME",
  },
  {
    a: "CBN elevates terrorism financing supervision",
    b: "CBN Elevates Terrorism Financing Supervision As Current Priority",
    label: "SAME",
  },
  {
    a: "CBN Steps Up Surveillance Of Banks Over Terrorism Financing Risk",
    b: "CBN intensifies terrorism financing surveillance on banks",
    label: "SAME",
  },
  {
    a: "CBN Steps Up Surveillance Of Banks Over Terrorism Financing Risk",
    b: "CBN Heightens Oversight on Terrorism Financing Risk",
    label: "SAME",
  },
  {
    a: "Appeal court upholds 10-year jail term for ex-NEXIM Bank MD Orya",
    b: "BREAKING: Appeal Court Upholds 490-Year Jail Term For Ex-NEXIM Bank MD Orya",
    label: "SAME",
    note: "numbers disagree (10 vs 490) but it is one ruling — a numeric mismatch must not veto",
  },
  {
    a: "Appeal Court Affirms 490-Year Jail Term for Ex-NEXIM Bank MD Orya",
    b: "A'Court upholds 490-year jail term for ex-NEXIM Bank MD",
    label: "SAME",
  },
  {
    a: "Argentina to file criminal case against oil company operating in Falklands",
    b: "Argentina to file criminal case against oil company operating in Falklands",
    label: "SAME",
  },
  {
    a: "Nigeria Automates Academic Certificate Verification Process",
    b: "FG automates academic certificate verification, authentication process",
    label: "SAME",
  },
  {
    a: "Nigerian Scientist Wins $100,000 NLNG Prize for AI-powered MRI Tech",
    b: "Nigerian scientist wins $100,000 NLNG prize for AI MRI breakthrough",
    label: "SAME",
  },
  {
    a: "TCN declares force Majeure as Tower collapses on Kainji-Birnin Kebbi Line",
    b: "TCN Declares Force majeure Birnin-Kebbi Transmission Line After Storm Toppled Tower",
    label: "SAME",
  },
  {
    a: "LIV files for bankruptcy protection with over $45m owed to players",
    b: "LIV Golf Files for Bankruptcy Protection",
    label: "SAME",
  },
  {
    a: "LIV Golf files for bankruptcy with at least $500mn in liabilities",
    b: "LIV Golf Files for Bankruptcy Protection",
    label: "SAME",
  },
  {
    a: "Plateau govt closes schools over diphtheria spread",
    b: "Plateau closes schools over diphtheria outbreak",
    label: "SAME",
  },
  {
    a: "Gov Radda presents N826.64bn 2027 budget to Katsina Assembly",
    b: "Radda presents N828.6bn 2027 budget to Katsina Assembly",
    label: "SAME",
    note: "figures differ slightly, same budget presentation",
  },
  {
    a: "IGP Disu, NBA President move to end police-lawyers frictions",
    b: "IGP, NBA president move to end police-lawyer clashes",
    label: "SAME",
  },
  {
    a: "Hundreds of flights delayed, cancelled after UK air traffic control glitch",
    b: "Nearly 1,100 Flights Cancelled After UK Air Traffic Control Glitch",
    label: "SAME",
  },
  {
    a: "UK air traffic control problem strands hundreds of thousands of passengers",
    b: "Hundreds of UK flights disrupted by air traffic control glitch",
    label: "SAME",
  },
  {
    a: "UK announces sanctions on West Bank settlements prompting furious Israeli response",
    b: "UK announces trade sanctions on Israeli settlements in occupied West Bank",
    label: "SAME",
  },
  {
    a: "Israel's Netanyahu denies UAE warned him of October 7 attack",
    b: "Netanyahu under fire over report UAE warned of October 7 attack",
    label: "SAME",
  },
  {
    a: "Artworks stolen from Renoir Museum on French Riviera in latest heist",
    b: "Renoir paintings worth millions stolen in French museum heist",
    label: "SAME",
  },
  {
    a: "French police hunt Renoir thieves after lightning museum heist",
    b: "Renoir paintings worth millions stolen in French museum heist",
    label: "SAME",
  },
  {
    a: "Renoir paintings worth millions stolen in French museum heist",
    b: "Renoir Museum robbery: 2 paintings missing",
    label: "SAME",
  },
  {
    a: "Hungary expels 10 Russian diplomats as relations worsen",
    b: "Hungary orders 10 Russian diplomats to leave",
    label: "SAME",
  },
  {
    a: "Sabotage suspect held in Germany after spate of attacks on power grid",
    b: "German police arrest suspect in power grid sabotage case",
    label: "SAME",
  },
  {
    a: "Mamdani releases records on toxic air in New York after 9/11 attacks",
    b: "New Yorkers were 'lied' to about toxic air after 9/11 attacks, says Mamdani",
    label: "SAME",
  },
  {
    a: "US attacks 5 Iranian oil tankers, Iran retaliates with strikes on Jordan",
    b: "US strikes oil tankers off coast of Iran",
    label: "SAME",
  },
  {
    a: "US bombs five Iranian oil tankers after its navy is attacked",
    b: "Middle East live: US destroys five Iranian oil tankers as Iran threatens Kuwait and Bahrain",
    label: "DIFF",
    note:
      "Corrected from SAME on review. A rolling regional liveblog is an omnibus: it covers the " +
      "tanker strikes AND Iran's threats to Kuwait and Bahrain. A story holds one clusterId, so " +
      "letting an omnibus join a cluster forces a wrong choice and can bridge unrelated events. " +
      "Same structural rule as the Champions League roundup below.",
  },
  {
    a: "Fourteen on trial over deadliest English Channel crossing on record",
    b: "Fourteen go on trial over deadliest Channel small boats disaster",
    label: "SAME",
  },
  {
    a: "Suspected smugglers on trial over deadliest migrant tragedy in France",
    b: "14 suspected migrant smugglers go on trial over deadly English Channel disaster",
    label: "SAME",
  },
  {
    a: "Canada PM stands his ground as Ottawa's retaliatory tariffs on US goods take effect",
    b: "Canada's retaliatory US tariffs take effect as trade dispute grows",
    label: "SAME",
  },
  {
    a: "Kenya cracks down on foreign traders",
    b: "Kenya: Crackdown on foreign traders prompts xenophobia fears",
    label: "SAME",
  },
  {
    a: "Dangote Refinery IPO targets 10m subscribers",
    b: "Dangote Targets 10 Million Shareholders Across Africa With Refinery IPO",
    label: "SAME",
  },
  {
    a: "Dangote Refinery to sell shares at N5,250 for minimum 10 shares",
    b: "Dangote Refinery Signs Historic Digital IPO, Ownership Starting From Just N5,250",
    label: "SAME",
  },
  {
    a: "Onitsha Kingdom celebrates 500-year monarchy, unveils Ofala 2026 logo",
    b: "Onitsha marks 500yrs unbroken monarchy with special logo for Ofala 2026",
    label: "SAME",
  },
  {
    a: "Ciara Expecting Fifth Child, Announces Pregnancy With Russell Wilson",
    b: "Baby Cinco Is Officially on the Way! Ciara & Russell Wilson Are Expecting Baby Number Five",
    label: "SAME",
  },
  {
    a: "Amrabat quits Morocco under Ouahbi, insists he's not retired",
    b: "Amrabat Quits Morocco Ahead Of AFCON 2027 Qualifiers",
    label: "SAME",
  },
  {
    a: "FIFA, CAF reportedly Suspend NFF elections",
    b: "FIFA, CAF kick off NFF investigation, suspend presidential election",
    label: "SAME",
  },
  {
    a: "Spain Beat Nigeria 2-0 as Falconets suffer defeat at U-20 Women's World Cup",
    b: "FIFA U20 Women's World Cup: Former champions Spain defeat Nigeria 2-0",
    label: "SAME",
  },
  {
    a: "Champions League: Haaland Double Powers Man City To victory Over Porto",
    b: "Haaland to the double as Manchester City beat Porto in Champions League",
    label: "SAME",
  },
  {
    a: "UCL: Mourinho's Real Madrid make winning start against Inter Milan",
    b: "Mourinho's Real Madrid Make Winning Champions League Start Against Inter Milan",
    label: "SAME",
  },
  {
    a: "Mourinho's Real Madrid edge Inter Milan in Champions League opener",
    b: "Real Madrid beat Inter Milan as Mbappe goal sets Mourinho's men on way",
    label: "SAME",
  },
  {
    a: "Troops foil attacks, rescue kidnap victims in Zamfara",
    b: "Troops rescue 23 kidnap victims in Zamfara",
    label: "SAME",
  },
  {
    a: "Troops Rescue 12 People, Foil Abduction Attempt In Zamfara",
    b: "Troops rescue 12 civilians from terrorists in Zamfara",
    label: "SAME",
    note: "both report 12",
  },
  {
    a: "Police confirm attack on Obi's convoy in Benue",
    b: "BREAKING: Thugs Block Peter Obi's Convoy in Benue, Halt Visit to Yelwata",
    label: "SAME",
  },
  {
    a: "Police confirm attack on Obi's convoy in Benue",
    b: "NDC Condemns Obstruction Of Obi's Convoy In Benue",
    label: "SAME",
  },
  {
    a: "Benue: Tambuwal urges probe into Peter Obi's convoy blockade",
    b: "Govt denies role in convoy blockade as thugs thwart Obi's visit to Benue",
    label: "SAME",
  },
  {
    a: "Obi Confirms Thugs Disrupted Benue Visit",
    b: "BREAKING: Thugs Block Peter Obi's Convoy in Benue, Halt Visit to Yelwata",
    label: "SAME",
  },
  {
    a: "Peter Obi Ignored Protocol - Benue Commissioner",
    b: "Peter Obi accused of breaching protocol as Benue govt reacts to road blockage",
    label: "SAME",
  },
  {
    a: "Oyetola Elated as APM Terminals Signs MoU to Develop Badagry Deep-seaport",
    b: "FG begins talks with APM Terminals on Badagry deep seaport development",
    label: "SAME",
  },
  {
    a: "ASUU strike hits UNIZIK, NANS seeks intervention in Nasarawa varsity",
    b: "Nasarawa varsity seeks assembly intervention to end ASUU strike",
    label: "SAME",
  },
  {
    a: "Super Falcons' Abiodun Ruled Out For Rest Of Season With Injury",
    b: "Super Falcons star suffers season-ending injury after World Cup heartbreak",
    label: "SAME",
  },
  {
    a: "Chelle Replaces Injured Osimhen In Super Eagles Squad For AFCON Qualifiers",
    b: "Confirmed: Osimhen ruled out of Super Eagles' September AFCON qualifiers",
    label: "SAME",
  },
  {
    a: "Breaking: Tears, grief as popular Kano district head dies",
    b: "Kano loses district head",
    label: "SAME",
  },
  {
    a: "Dembele, Mbappe, Kane and Yamal top Ballon d'Or shortlist",
    b: "Favourite Kane makes Ballon d'Or shortlist",
    label: "SAME",
  },
  {
    a: "Messi, Mbappe and Kane headline Ballon d'Or shortlist, Vozinha named for Yashin award",
    b: "Ronaldo Snubbed Again As Messi, Yamal, Rice, Mbappe, Haaland Make 2026 Men's Ballon d'Or Award Shortlist",
    label: "SAME",
  },

  // -----------------------------------------------------------------------
  // DIFFERENT EVENTS — must NOT cluster. These are the false-merge traps.
  // -----------------------------------------------------------------------
  {
    a: "Back-to-school wahala",
    b: "5 Back-to-School Essentials Every Student Needs for the New Term",
    label: "DIFF",
    note: "shared topic label only: opinion column vs shopping list",
  },
  {
    a: "D'Tigress eliminated from FIBA Women's World Cup",
    b: "Africa Celebrates as Mali Stun Spain 82-73 at FIBA Women's Basketball World Cup",
    label: "DIFF",
    note: "same tournament, different matches",
  },
  {
    a: "Dembele, Mbappe, Kane and Yamal top Ballon d'Or shortlist",
    b: "Arsenal To Battle PSG, Bayern For 2026 Ballon d'Or Men's Club Of The Year Award",
    label: "DIFF",
    note: "same award ceremony, different category",
  },
  {
    a: "Ballon d'Or 2026: Who are the nominees for coach of the year?",
    b: "Arsenal To Battle PSG, Bayern For 2026 Ballon d'Or Men's Club Of The Year Award",
    label: "DIFF",
  },
  {
    a: "Ronaldo Snubbed Again As Messi, Yamal, Rice, Mbappe, Haaland Make 2026 Men's Ballon d'Or Award Shortlist",
    b: "Mbappe speaks on his chances of winning the 2026 Ballon d'Or",
    label: "DIFF",
    note: "the announcement vs a player interview about it",
  },
  {
    a: "Champions League Roundup: Real Madrid beat Inter Milan, Man City win at Porto",
    b: "Mourinho's Real Madrid edge Inter Milan in Champions League opener",
    label: "DIFF",
    note: "a roundup covers several events; merging it drags unrelated matches into one cluster",
  },
  {
    a: "Champions League Roundup: Real Madrid beat Inter Milan, Man City win at Porto",
    b: "Champions League: Haaland Double Powers Man City To victory Over Porto",
    label: "DIFF",
    note: "same roundup trap, other match",
  },
  {
    a: "Mourinho's Real Madrid edge Inter Milan in Champions League opener",
    b: "UEFA Champions League: Madrid Host Inter Milan In Heavyweight Tie",
    label: "DIFF",
    note: "pre-match preview vs post-match result",
  },
  {
    a: "Police arrest 25-year-old for murder in Bauchi",
    b: "Police Arrest 4 Suspects Over Murder Of Niger Village Head",
    label: "DIFF",
    note: "same sentence shape, different states and victims",
  },
  {
    a: "Vigilante killed as bandits attack Kano village",
    b: "10 people killed, many injured, as bandits attack, abduct Sokoto residents",
    label: "DIFF",
    note: "different states, different attacks",
  },
  {
    a: "Anti-AfD protesters rally in Cologne after far-right election win",
    b: "Germany's Far-Right AfD Says Democracy Demands Parties Work With It After State Election Win",
    label: "DIFF",
  },
  {
    a: "Osun Governorship Election: APC Legal Team Denies Authorising Petition Against Adeleke",
    b: "APC, PDP challenge Adeleke's re-election in Osun",
    label: "DIFF",
    note: "successive developments in one saga, not one event",
  },
  {
    a: "NOUN appoints Ramatu Ibrahim as acting bursar",
    b: "NOUN bursar Nasiru Marafa shot dead in Zamfara",
    label: "DIFF",
    note: "causally linked, same institution and role — but plainly two events",
  },
  {
    a: "FG condemns fresh Houthi attacks on Saudi Arabia",
    b: "Houthis attack Saudi Arabia, 73 wounded as energy facilities hit",
    label: "DIFF",
    note: "the attack itself vs Nigeria's reaction to it",
  },
  {
    a: "Troops rescue 23 kidnap victims in Zamfara",
    b: "Troops Rescue 12 People, Foil Abduction Attempt In Zamfara",
    label: "DIFF",
    note: "different victim counts, different operations",
  },
  {
    a: "Super Eagles to face Russia in October friendly",
    b: "Amrabat Quits Morocco Ahead Of AFCON 2027 Qualifiers",
    label: "DIFF",
    note: "control: unrelated football news",
  },
  {
    a: "CBN elevates terrorism financing supervision",
    b: "Dangote Refinery IPO targets 10m subscribers",
    label: "DIFF",
    note: "control: unrelated business news",
  },
  {
    a: "Plateau govt closes schools over diphtheria spread",
    b: "ASUU strike hits UNIZIK, NANS seeks intervention in Nasarawa varsity",
    label: "DIFF",
    note: "control: both about schools closing, unrelated causes",
  },
];
