/**
 * AI enrichment evaluation set — summary quality and hallucination rate.
 *
 * Modelled on `tests/fixtures/cluster-eval.ts`: real production material and
 * real production output, labelled by editorial judgement rather than by the
 * checker under test (otherwise the measurement would be circular).
 *
 * CLEAN cases (19) are verbatim Gemini/Groq enrichment output from the first
 * live batches this product ever ran (`tools/dump-ai-corpus.ts`), read and
 * checked word-for-word against the material the model was given — the
 * headline, extractive summary, excerpt, source name, publish date and
 * sibling-cluster headlines that `buildEnrichmentPrompt`
 * (`../../src/lib/ai/structured.ts`) actually sends. None contained a
 * fabricated figure or an invented name.
 *
 * That is a genuinely good result, but it leaves nothing for a grounding
 * checker to catch — a set with no real negatives cannot measure recall, only
 * false positives. HALLUCINATED cases (6) close that gap honestly: each one
 * is a real CLEAN case with exactly one fabricated claim stitched in (a
 * figure that contradicts the source, or a name that appears nowhere in it),
 * noted in full so nobody mistakes an injected case for a real one. If
 * production ever produces a genuine hallucination, it belongs here and a
 * synthetic case should be retired — real material is always preferred over
 * injected.
 *
 * Why this matters: building this set caught real defects in the checker
 * before they shipped further (`src/lib/ai/grounding.ts`):
 *   - It compared output only against headline+summary+excerpt, but the
 *     prompt also supplies the source name, publish date and sibling-cluster
 *     headlines, and the model legitimately uses all three — "Vanguard
 *     reported...", a restated date, or an entity that only appears in a
 *     related headline are routine, correct behaviour, not invention.
 *   - Bullets were joined with a bare space before being scanned, so every
 *     bullet's first word ("Source is Punch") looked like a mid-sentence,
 *     unsupported capitalised word.
 *   - A standard abbreviation of a phrase the source *did* use in full
 *     ("LGA" for "Local Government Area", "DRC" for "Democratic Republic of
 *     Congo") was flagged as an invented name.
 * The fix in each case was to make the check match what the model actually
 * saw, not to loosen what counts as grounded.
 */

export type AiEvalLabel = "CLEAN" | "HALLUCINATED";

export interface AiEvalCase {
  label: AiEvalLabel;
  /** Why this case is here, or exactly what was injected and from which real case. */
  note: string;
  source: {
    headline: string;
    summary: string;
    excerpt: string;
    sourceName: string;
    relatedHeadlines: string[];
    /** ISO string — the real story's `publishedAt`, as handed to the model. */
    publishedAt: string;
  };
  output: {
    summary: string;
    whyItMatters: string;
    bullets: string[];
  };
}

export const AI_EVAL: AiEvalCase[] = [
  {
    label: "CLEAN",
    note: "short material, no related headlines",
    source: {
      headline: "Boniface sparks concern with emotional Instagram message",
      summary: "Nigerian striker Victor Boniface sparks concern among fans after deleting all his Instagram posts and sharing an emotional message amid injury struggles. Read More: https://punchng.com/boniface-sparks-concern-with-emotional-instagram-message/",
      excerpt: "Nigerian striker Victor Boniface sparks concern among fans after deleting all his Instagram posts and sharing an emotional message amid injury struggles. Read More: https://punchng.com/boniface-sparks-concern-with-emotional-instagram-message/",
      sourceName: "Punch",
      relatedHeadlines: [],
      publishedAt: "2026-09-11T02:43:33.000Z",
    },
    output: {
      summary: "Nigerian striker Victor Boniface deleted all his Instagram posts and posted an emotional message, sparking concern among fans amid injury struggles.",
      whyItMatters: "The post shows that the player is dealing with injury issues, leading to fan concern about his wellbeing.",
      bullets: ["Victor Boniface is a Nigerian striker", "He deleted all his Instagram posts", "He posted an emotional message", "Fans expressed concern", "The action reflects his injury struggles", "Source is Punch"],
    },
  },

  {
    label: "CLEAN",
    note: "entity 'NNPCL' comes only from a related headline, not the headline/summary/excerpt",
    source: {
      headline: "NNPC to deploy 70 self-service filling stations nationwide",
      summary: "NNPC plans to deploy 50-70 smart, NNPC self-service stations nationwide within six months, offering EV charging, LPG, and digital payments. Read More: https://punchng.com/nnpc-to-deploy-70-self-service-filling-stations-nationwide/",
      excerpt: "NNPC plans to deploy 50-70 smart, NNPC self-service stations nationwide within six months, offering EV charging, LPG, and digital payments. Read More: https://punchng.com/nnpc-to-deploy-70-self-service-filling-stations-nationwide/",
      sourceName: "Punch",
      relatedHeadlines: ["NNPCL to deploy 70 self-service fuel stations nationwide as petrol attendants fear job loss"],
      publishedAt: "2026-09-11T02:39:10.000Z",
    },
    output: {
      summary: "NNPC has announced a plan to deploy 50‑70 smart self‑service stations across Nigeria within the next six months. The stations will provide electric vehicle charging, liquefied petroleum gas (LPG) dispensing, and digital payment options.",
      whyItMatters: "The rollout will increase the availability of self‑service fuel options, including electric vehicle charging, and integrate digital payment methods into the fuel retail sector. It may also impact the employment of petrol attendants, as noted in related coverage.",
      bullets: ["50‑70 smart self‑service stations planned", "Deployment scheduled within six months", "Stations will offer electric vehicle charging", "Stations will offer LPG dispensing", "Stations will support digital payments"],
    },
  },

  {
    label: "CLEAN",
    note: "long excerpt, several figures restated verbatim",
    source: {
      headline: "Boat mishaps: When will they end?",
      summary: "Nigeria must begin to confront boat mishaps as a national public-safety crisis. The latest tragedy at Gorau village in Goronyo Local Government Area of Sokoto State, where 65 people reportedly died, is too grim a reminder of the price Nigerians pay for regulatory failure and government neglect. The tragedy is…",
      excerpt: "Nigeria must begin to confront boat mishaps as a national public-safety crisis. The latest tragedy at Gorau village in Goronyo Local Government Area of Sokoto State, where 65 people reportedly died, is too grim a reminder of the price Nigerians pay for regulatory failure and government neglect. The tragedy is particularly disturbing because it was entirely predictable. More than 70 people were reportedly aboard the ill-fated boat, many of them farmers, labourers, women, and children travelling to their rice farms. Reports indicated that about 40 of the bodies recovered were children. This was…",
      sourceName: "Vanguard",
      relatedHeadlines: [],
      publishedAt: "2026-09-11T01:50:00.000Z",
    },
    output: {
      summary: "A boat carrying more than 70 people sank off Gorau village in Goronyo Local Government Area of Sokoto State, killing about 65 people, including many children, according to reports from Vanguard. The incident highlights regulatory failure and government neglect, underscoring the need for Nigeria to address boat mishaps as a public‑safety crisis.",
      whyItMatters: "The incident demonstrates the consequences of inadequate regulation and oversight of riverine transport, leading to high loss of life and exposing the broader public‑safety issue in Nigeria.",
      bullets: ["Incident occurred at Gorau village, Goronyo LGA, Sokoto State", "More than 70 people were aboard the ill‑fated boat", "Around 65 people died, including about 40 children", "Victims were farmers, labourers, women and children traveling to rice farms", "The tragedy is attributed to regulatory failure and government neglect", "Vanguard reported the event, calling it a national public‑safety crisis"],
    },
  },

  {
    label: "CLEAN",
    note: "foreign-desk wire story, figures and places all in the excerpt",
    source: {
      headline: "Ebola Reaches Congo’s Sud-Ubangi After Patient Traveled Through Rwanda, Uganda",
      summary: "Ebola has now spread to a seventh province in the Democratic Republic of Congo after a 23-year-old man tested positive for the virus following a cross-country journey that included travel through neighboring Rwanda and Uganda.",
      excerpt: "Ebola has now spread to a seventh province in the Democratic Republic of Congo after a 23-year-old man tested positive for the virus following a cross-country journey that included travel through neighboring Rwanda and Uganda.",
      sourceName: "Bloomberg",
      relatedHeadlines: [],
      publishedAt: "2026-09-11T01:31:25.000Z",
    },
    output: {
      summary: "Ebola has spread to a seventh province in the Democratic Republic of Congo after a 23‑year‑old man tested positive following a cross‑country journey that included travel through Rwanda and Uganda.",
      whyItMatters: "The detection of Ebola in a new province indicates the disease is spreading within the Democratic Republic of Congo and that cross‑border travel may facilitate its transmission.",
      bullets: ["Ebola has spread to a seventh province in DRC.", "The new province is Sud-Ubangi.", "A 23‑year‑old man tested positive for the virus.", "His travel included Rwanda and Uganda.", "The case was reported by Bloomberg.", "The spread demonstrates cross‑border movement of the disease."],
    },
  },

  {
    label: "CLEAN",
    note: "naira amount with a symbol the output must restate exactly",
    source: {
      headline: "Police arrest suspected ‘serial burglar,’ recover ₦21 million photographic equipment",
      summary: "The police urged victims of similar crimes to approach the police with relevant information or documentation that could assist in recovering their property.",
      excerpt: "The police urged victims of similar crimes to approach the police with relevant information or documentation that could assist in recovering their property.",
      sourceName: "Premium Times",
      relatedHeadlines: [],
      publishedAt: "2026-09-10T20:40:34.000Z",
    },
    output: {
      summary: "Police arrested a suspected serial burglar and recovered ₦21 million worth of photographic equipment. They urged victims of similar crimes to approach the police with relevant information or documentation that could assist in recovering their property.",
      whyItMatters: "The recovery of high‑value photographic equipment and the arrest of a suspected serial burglar help to reduce property crime. The police invitation for victims to provide information could improve future recoveries.",
      bullets: ["Suspected serial burglar arrested by police", "Recovery of photographic equipment worth ₦21 million", "Police urged victims of similar crimes to provide relevant information", "Victims also encouraged to submit documentation to aid recovery", "Story reported by Premium Times", "Published 2026‑09‑10"],
    },
  },

  {
    label: "CLEAN",
    note: "proper nouns (president's name) drawn from the excerpt, not the headline",
    source: {
      headline: "Algeria cuts diplomatic ties with the UAE",
      summary: "Algeria said Thursday it was cutting diplomatic ties with the United Arab Emirates following years of tension, with Algiers accusing Abu Dhabi of interfering in national and regional affairs. In an official statement, Algiers accused the Gulf country of “provocative and hostile acts”, but it remained unclear what…",
      excerpt: "Algeria said Thursday it was cutting diplomatic ties with the United Arab Emirates following years of tension, with Algiers accusing Abu Dhabi of interfering in national and regional affairs. In an official statement, Algiers accused the Gulf country of “provocative and hostile acts”, but it remained unclear what triggered the rupture. Algerian President Abdelmadjid Tebboune has often referred to the UAE as a “micro-state” or “statelet” seeking to destabilise several countries in the region, citing Libya, Mali and Sudan. The North African country, which has signalled for months a diplomatic…",
      sourceName: "Vanguard",
      relatedHeadlines: ["Algeria to sever diplomatic ties with UAE", "Algeria cuts diplomatic ties with UAE", "Algeria Cuts Ties With UAE Over ‘Interference’"],
      publishedAt: "2026-09-10T18:56:51.000Z",
    },
    output: {
      summary: "Algeria announced it would cut diplomatic ties with the United Arab Emirates, citing years of tension and accusing Abu Dhabi of interfering in national and regional affairs.",
      whyItMatters: "The move highlights Algeria’s stance against perceived foreign interference and may affect its diplomatic engagement with Gulf states, as the president has characterised the UAE as a destabilising micro‑state.",
      bullets: ["Algeria announced it would cut diplomatic ties with the United Arab Emirates", "The decision follows years of tension between Algiers and Abu Dhabi", "Algiers accused the UAE of interference in national and regional affairs", "The UAE was described by President Tebboune as a ‘micro‑state’ or ‘statelet’ seeking to destabilise countries such as Libya, Mali and Sudan", "An official statement cited ‘provocative and hostile acts’ by the Gulf country", "The cause of the rupture remains unclear"],
    },
  },

  {
    label: "CLEAN",
    note: "several figures in one report (13, 300) that must not cross-contaminate",
    source: {
      headline: "Troops rescue 13 kidnapped victims, intercept terrorist ammunition",
      summary: "The Nigerian Army says troops have rescued 13 kidnapped victims, intercepted 300 rounds of ammunition and neutralised a suspected kidnapper in separate operations nationwide. The military operational update made available to the News Agency of Nigeria (NAN) on Thursday covered significant occurrences between Sept. 9…",
      excerpt: "The Nigerian Army says troops have rescued 13 kidnapped victims, intercepted 300 rounds of ammunition and neutralised a suspected kidnapper in separate operations nationwide. The military operational update made available to the News Agency of Nigeria (NAN) on Thursday covered significant occurrences between Sept. 9 and Sept. 10. The report stated that the operations also disrupted illegal bunkering, recovered suspected illegally refined petroleum products and intercepted a trailer conveying illegally mined ilmenite. Under Operation MESA, it said the troops of 195 Battalion rescued 10…",
      sourceName: "Vanguard",
      relatedHeadlines: [],
      publishedAt: "2026-09-10T22:14:28.000Z",
    },
    output: {
      summary: "The Nigerian Army reported that its troops rescued 13 kidnapped victims, intercepted 300 rounds of ammunition, and neutralised a suspected kidnapper in separate operations across the country.",
      whyItMatters: "The operations show the army’s ability to carry out simultaneous counter‑kidnapping, counter‑terrorism and anti‑illegal resource activities, disrupting illicit bunkering, refined petroleum, and mining operations.",
      bullets: ["13 kidnapped victims rescued by Nigerian Army troops", "300 rounds of ammunition intercepted", "suspected kidnapper neutralised", "illegal bunkering disrupted", "suspected illegally refined petroleum products recovered", "trailer carrying illegally mined ilmenite intercepted"],
    },
  },

  {
    label: "CLEAN",
    note: "very thin material (summary cut off mid-sentence)",
    source: {
      headline: "Security operatives rescue three victims, arrest one suspect in Gombe",
      summary: "A suspected kidnapper, 30-year-old Manu Alhaji Sani of Wawa Village in Funakaye Local Government Area of Gombe, has been",
      excerpt: "A suspected kidnapper, 30-year-old Manu Alhaji Sani of Wawa Village in Funakaye Local Government Area of Gombe, has been",
      sourceName: "Nigerian Tribune",
      relatedHeadlines: ["Gombe Police rescue three kidnap victims"],
      publishedAt: "2026-09-10T21:24:30.000Z",
    },
    output: {
      summary: "Security operatives rescued three victims and arrested one suspect in Gombe. The suspect, 30‑year‑old Manu Alhaji Sani from Wawa Village, Funakaye Local Government Area, is accused of kidnapping.",
      whyItMatters: "The operation shows police response to a kidnapping case in Gombe, illustrating law enforcement action in the region.",
      bullets: ["Security operatives rescued three victims.", "One suspect was arrested.", "Suspect identified as Manu Alhaji Sani.", "Suspect is 30 years old.", "Suspect is from Wawa Village in Funakaye Local Government Area of Gombe.", "The incident was reported by the Nigerian Tribune."],
    },
  },

  {
    label: "CLEAN",
    note: "dollar figure plus a long project title quoted verbatim",
    source: {
      headline: "Radda Unveils $1m Project to Boost Food Security, Tackle Floods in Katsina",
      summary: "Francis Sardauna in Katsina Katsina State Governor, Dikko Umaru Radda, has launched a $1 million food security project aimed at strengthening the resilience of vulnerable farming communities against recurring floods and drought in the state. The 12-month intervention, titled: ‘Protecting Food Security Against…",
      excerpt: "Francis Sardauna in Katsina Katsina State Governor, Dikko Umaru Radda, has launched a $1 million food security project aimed at strengthening the resilience of vulnerable farming communities against recurring floods and drought in the state. The 12-month intervention, titled: ‘Protecting Food Security Against Recurring Floods and Drought’, is being implemented by Mercy Corps Nigeria with support from Katsina State Development Management Board (KTDMB), Ministry of Budget and Economic Planning and development partners. Unveiling the project Thursday in Katsina, Governor Radda described climate…",
      sourceName: "ThisDay",
      relatedHeadlines: [],
      publishedAt: "2026-09-11T01:19:07.000Z",
    },
    output: {
      summary: "Katsina State Governor Dikko Umaru Radda launched a $1 million food security project titled 'Protecting Food Security Against Recurring Floods and Drought'. The 12-month intervention is implemented by Mercy Corps Nigeria with support from the Katsina State Development Management Board, the Ministry of Budget and Economic Planning and development partners to strengthen the resilience of vulnerable farming communities against recurring floods and drought.",
      whyItMatters: "The project seeks to improve food security for vulnerable farming communities in Katsina State that are repeatedly affected by floods and drought.",
      bullets: ["$1 million food security project launched by Governor Dikko Umaru Radda", "12-month intervention titled 'Protecting Food Security Against Recurring Floods and Drought'", "Aims to strengthen resilience of vulnerable farming communities against floods and drought", "Implemented by Mercy Corps Nigeria", "Supported by Katsina State Development Management Board and Ministry of Budget and Economic Planning", "Includes development partners"],
    },
  },

  {
    label: "CLEAN",
    note: "gemini, thin material, model explicitly flags limited reporting",
    source: {
      headline: "Tinubu fulfils $100,000 cash reward promise to D’Tigress players for AfroBasket triumph",
      summary: "Mr Tinubu confirmed that the naira equivalent of the pledged funds had been deposited into the accounts of the players and officials.",
      excerpt: "Mr Tinubu confirmed that the naira equivalent of the pledged funds had been deposited into the accounts of the players and officials.",
      sourceName: "Peoples Gazette",
      relatedHeadlines: ["Tinubu confirms payment of $100,000 reward to D’Tigress", "Tinubu confirms full payout of $100,000 cash reward to D’Tigress", "D’Tigress $100,000 cash, houses reward completed in one yr – Tinubu", "Why $100,000 Cash Reward For D’Tigress Took Time — Tinubu", "Tinubu Redeems $100,000 Reward Promise to D’Tigress Players and Officials"],
      publishedAt: "2026-09-10T21:33:32.000Z",
    },
    output: {
      summary: "Mr Tinubu has confirmed the fulfilment of the pledged $100,000 cash reward to D'Tigress players and officials following their AfroBasket triumph. The naira equivalent of the funds has been deposited into the accounts of the players and officials.",
      whyItMatters: "The available reporting is limited, but the development marks the completion of the promised financial reward to the national team players and officials for their AfroBasket victory.",
      bullets: ["Mr Tinubu confirmed the payment of the $100,000 cash reward to D'Tigress players and officials.", "The naira equivalent of the pledged reward has been deposited into their respective accounts.", "The cash reward was promised to the team following their AfroBasket triumph."],
    },
  },

  {
    label: "CLEAN",
    note: "numeric figure written with a narrow no-break space (2 500)",
    source: {
      headline: "Gombe Police rescue three kidnap victims",
      summary: "By Ben Ngwakwe, Gombe GOMBE: The Gombe State Police Command has recorded operational breakthroughs in its fight against kidnapping, banditry and illicit drug trafficking, arresting a suspected kidnapper, rescuing three abducted persons and recovering 2,500 sachets of suspected Tramadol capsules, among other exhibits…",
      excerpt: "By Ben Ngwakwe, Gombe GOMBE: The Gombe State Police Command has recorded operational breakthroughs in its fight against kidnapping, banditry and illicit drug trafficking, arresting a suspected kidnapper, rescuing three abducted persons and recovering 2,500 sachets of suspected Tramadol capsules, among other exhibits. The Command’s Police Public Relations Officer, DSP Buhari Abdullahi, disclosed this in a statement issued in Gombe on Thursday. According to the statement, a joint security clearance operation involving personnel of the Nigeria Police Force, military, Nigeria Security and Civil…",
      sourceName: "Vanguard",
      relatedHeadlines: ["Security operatives rescue three victims, arrest one suspect in Gombe"],
      publishedAt: "2026-09-10T18:37:17.000Z",
    },
    output: {
      summary: "The Gombe State Police Command announced that in a joint security clearance operation it arrested a suspected kidnapper, rescued three abducted persons and recovered 2 500 sachets of suspected Tramadol capsules. The statement, issued by DSP Buhari Abdullahi in Gombe on Thursday, highlighted the operation as part of the Command’s broader efforts to counter kidnapping, banditry and illicit drug trafficking.",
      whyItMatters: "The operation represents a tangible advance in Gombe’s fight against crime, demonstrating the ability of police, the military and other security agencies to dismantle kidnapping rings, free victims and intercept drug trafficking. It signals an improvement in law‑enforcement effectiveness and offers reassurance to residents that criminal activities are being actively challenged.",
      bullets: ["Joint security clearance operation involved Nigeria Police Force, military and Nigeria Security and Civil personnel", "Suspected kidnapper was arrested by Gombe State Police Command", "Three abducted persons were rescued", "2 500 sachets of suspected Tramadol capsules were recovered", "Statement issued by DSP Buhari Abdullahi in Gombe on Thursday", "Operation cited as part of broader counter‑kidnapping, banditry and drug‑trafficking effort"],
    },
  },

  {
    label: "CLEAN",
    note: "age figure embedded in prose, international story",
    source: {
      headline: "Secret son revelation ignites bitter succession dispute in Ugandan kingdom",
      summary: "Family of late King Oyo Nyimba Kabamba Iguru Rukidi IV reject committee’s choice of cousin and TV presenter as new monarch A traditional Ugandan kingdom has become engulfed in a bitter succession dispute after the family of a king who recently died rejected the selection of a television news anchor as his successor…",
      excerpt: "Family of late King Oyo Nyimba Kabamba Iguru Rukidi IV reject committee’s choice of cousin and TV presenter as new monarch A traditional Ugandan kingdom has become engulfed in a bitter succession dispute after the family of a king who recently died rejected the selection of a television news anchor as his successor. King Oyo Nyimba Kabamba Iguru Rukidi IV, who became the world’s youngest reigning monarch when he took the throne in the kingdom of Tooro in 1995 at the age of three, died on 27 August in the US, where he was receiving cancer treatment.",
      sourceName: "The Guardian (UK)",
      relatedHeadlines: [],
      publishedAt: "2026-09-10T17:29:20.000Z",
    },
    output: {
      summary: "Family of the late King Oyo Nyimba Kabamba Iguru Rukidi IV rejected the succession committee’s choice of a cousin and a television news anchor as the new monarch of the Tooro kingdom following his death.",
      whyItMatters: "The rejection of the committee’s selection highlights a contested succession in a traditional Ugandan kingdom, potentially leading to prolonged conflict over who will hold the throne.",
      bullets: ["Late King Oyo Nyimba Kabamba Iguru Rukidi IV, who became the world’s youngest reigning monarch at age 3, died on 27 August in the United States while undergoing cancer treatment.", "King Oyo ruled the traditional Ugandan kingdom of Tooro.", "An appointed succession committee selected a cousin and a television news anchor as the new monarch.", "The king’s family rejected the committee’s choice.", "The dispute has become bitter, indicating a potential conflict over succession.", "Coverage was reported by The Guardian (UK) as part of international media."],
    },
  },

  {
    label: "CLEAN",
    note: "two related naira figures (N7.58bn and its 2026 equivalent)",
    source: {
      headline: "How NAMA Wasted N7.58bn on ILS for Lagos, Abuja Airport",
      summary: "Chinedu Eze The Category 3 Instrument Landing System (ILS) the federal government acquired at the sum of N7.58 billion and installed at the Nnamdi Azikiwe International Airport, Abuja and the Murtala Muhammed International Airport, Lagos in 2019, has been abandoned and left to rot, THISDAY inquiry has revealed. The…",
      excerpt: "Chinedu Eze The Category 3 Instrument Landing System (ILS) the federal government acquired at the sum of N7.58 billion and installed at the Nnamdi Azikiwe International Airport, Abuja and the Murtala Muhammed International Airport, Lagos in 2019, has been abandoned and left to rot, THISDAY inquiry has revealed. The N7.58 billion (N30.02 billion in 2026) spent on the Nigerian Airspace Management Agency (NAMA) project, was only for the first phase, as more money was planned to be spent on the second phase. The federal government has also planned to install the vital equipment at other airports…",
      sourceName: "ThisDay",
      relatedHeadlines: [],
      publishedAt: "2026-09-11T01:44:00.000Z",
    },
    output: {
      summary: "A Category 3 Instrument Landing System costing N7.58 billion was installed at Nnamdi Azikiwe International Airport, Abuja, and Murtala Muhammed International Airport, Lagos in 2019, but has been abandoned and left to rot. The spend was part of the first phase of the Nigerian Airspace Management Agency (NAMA) project, with additional funding planned for a second phase and for installing equipment at other airports.",
      whyItMatters: "The abandonment of the expensive ILS shows mismanagement of public funds and a failure to deliver critical aviation safety infrastructure.",
      bullets: ["Category 3 ILS costing N7.58 billion installed at Abuja and Lagos airports in 2019.", "The equipment has been abandoned and left to rot.", "The spend was part of the first phase of the NAMA project.", "Additional funds were planned for a second phase of the project.", "Federal authorities intended to install vital equipment at other airports.", "The N7.58 billion equals N30.02 billion in 2026 terms."],
    },
  },

  {
    label: "CLEAN",
    note: "entity 'Mutfwang' comes only from a related headline",
    source: {
      headline: "Plateau imposes curfew on 3 LGAs as killings spread",
      summary: "Plateau State Government has imposed dusk-to-dawn curfew on Barkin Ladi, Bokkos and Mangu Local Government Areas of the state following the attacks and killings in the LGAs. Our correspondent reports that within two days over 20 persons including women and children, were killed in Mangu, Barikin Ladi, Bokkos and Riyom…",
      excerpt: "Plateau State Government has imposed dusk-to-dawn curfew on Barkin Ladi, Bokkos and Mangu Local Government Areas of the state following the attacks and killings in the LGAs. Our correspondent reports that within two days over 20 persons including women and children, were killed in Mangu, Barikin Ladi, Bokkos and Riyom LGAs. Many houses were also burned in the attacks. Announcing the curfew, the State Commissioner for Information and Communication, Joyce Ramnap, said the decision takes immediate effect. Tinubu extends 3-week vacation Dubai declares 10 days mourning over death of UAE PM’s…",
      sourceName: "Daily Trust",
      relatedHeadlines: ["Plateau imposes curfew on three LGAs after fresh attacks", "Plateau gov imposes curfew in three LGAs over killings", "Gov. Mutfwang imposes curfew in three Plateau LGAs over insecurity", "Plateau govt imposes dusk-to-dawn curfew on three LGAs amid security concerns"],
      publishedAt: "2026-09-21T18:50:03.000Z",
    },
    output: {
      summary: "The Plateau State Government has imposed an immediate dusk-to-dawn curfew on Barkin Ladi, Bokkos, and Mangu Local Government Areas following violent attacks and killings in the state.",
      whyItMatters: "The reported violence resulted in the deaths of over 20 persons, including women and children, within two days and led to the destruction of many houses across multiple local government areas.",
      bullets: ["A dusk-to-dawn curfew has been declared in Barkin Ladi, Bokkos, and Mangu LGAs in Plateau State.", "The Plateau State Government announced that the restriction takes immediate effect.", "More than 20 people, including women and children, were killed over a two-day period in Mangu, Barkin Ladi, Bokkos, and Riyom LGAs.", "Numerous houses were burned during the recent attacks.", "State Commissioner for Information and Communication, Joyce Ramnap, announced the decision on behalf of the government."],
    },
  },

  {
    label: "CLEAN",
    note: "age and LGA names must all trace back to the excerpt",
    source: {
      headline: "Police arrest notorious kidnap suspect, recover drone in Kano",
      summary: "By Hadiza Yusuf Kano State Police Command has arrested a suspected kidnapper and recovered a drone during separate clearance operations across the state. The command said the suspect, identified as 35-year-old Habibu Bello of Kunkumi Town, Makarfi Local Government Area of Kaduna State, was arrested on September 14…",
      excerpt: "By Hadiza Yusuf Kano State Police Command has arrested a suspected kidnapper and recovered a drone during separate clearance operations across the state. The command said the suspect, identified as 35-year-old Habibu Bello of Kunkumi Town, Makarfi Local Government Area of Kaduna State, was arrested on September 14, 2026. In a statement issued on Monday, the Police Public Relations Officer, CSP Abdullahi Haruna Kiyawa, said Bello was arrested by operatives of the Anti-Kidnapping Squad following credible intelligence. The police alleged that the suspect was a member of a syndicate involved in…",
      sourceName: "Vanguard",
      relatedHeadlines: ["Police arrest suspect over ₦3m kidnap-and-kill threat in Oyo", "Oyo police nab suspect over alleged ₦3m kidnap-and-kill plot"],
      publishedAt: "2026-09-21T19:54:39.000Z",
    },
    output: {
      summary: "The Kano State Police Command arrested a suspected kidnapper, 35‑year‑old Habibu Bello of Kunkumi Town, Makarfi Local Government Area of Kaduna State, on 14 September 2026. The arrest was carried out by the Anti‑Kidnapping Squad following credible intelligence. During separate clearance operations the police also recovered a drone.",
      whyItMatters: "The arrest and drone recovery show that the police are actively responding to intelligence on kidnapping syndicates, which is important for maintaining law and order in the region.",
      bullets: ["Kano State Police Command arrested suspected kidnapper Habibu Bello on 14 September 2026.", "Bello is a 35‑year‑old resident of Kunkumi Town, Makarfi Local Government Area, Kaduna State.", "The arrest was carried out by the Anti‑Kidnapping Squad after credible intelligence.", "Police recovered a drone during separate clearance operations across Kano State.", "CSP Abdullahi Haruna Kiyawa, Police Public Relations Officer, issued a statement about the arrest.", "The incident highlights ongoing police efforts against kidnapping syndicates."],
    },
  },

  {
    label: "CLEAN",
    note: "'APC' comes only from a related headline, not the main material",
    source: {
      headline: "Tinubu understands my Rainbow Coalition – Wike",
      summary: "By Omeiza Ajayi Federal Capital Territory FCT minister, Nyesom Wike, has said President Bola Tinubu fully understands the concept behind his Rainbow Coalition project, insisting that the sustained attacks on the initiative are being driven by Imo State Governor, Hope Uzodinma, whose ambition to become Senate President…",
      excerpt: "By Omeiza Ajayi Federal Capital Territory FCT minister, Nyesom Wike, has said President Bola Tinubu fully understands the concept behind his Rainbow Coalition project, insisting that the sustained attacks on the initiative are being driven by Imo State Governor, Hope Uzodinma, whose ambition to become Senate President ahead of the expiration of his tenure has fuelled the crisis. Speaking during a live interview on TVC on Monday night, Wike, who is also the national leader of the Peoples Democratic Party PDP, dismissed claims that the Rainbow Coalition posed any threat to President Tinubu’s…",
      sourceName: "Vanguard",
      relatedHeadlines: ["VIDEO: Rainbow Coalition Not Designed To Weaken APC – Wike", "Wike Insists Rainbow Coalition Not to Weaken APC, Reaffirms Support for Tinubu"],
      publishedAt: "2026-09-21T19:29:47.000Z",
    },
    output: {
      summary: "Nyesom Wike, the Federal Capital Territory minister and national leader of the Peoples Democratic Party, said President Bola Tinubu fully understands the Rainbow Coalition project. Wike claimed the attacks on the initiative are driven by Imo State Governor Hope Uzodinma, who wants to become Senate President before his tenure ends. He dismissed claims that the Coalition poses a threat to President Tinubu.",
      whyItMatters: "The comments highlight tensions between the ruling party and opposition figures over the Rainbow Coalition, underscoring internal political dynamics and the perceived threat to President Tinubu’s administration. The limited reporting restricts deeper insight into the broader implications.",
      bullets: ["Wike says Tinubu understands the Rainbow Coalition", "Wike claims attacks are driven by Hope Uzodinma", "Uzodinma aims to become Senate President before his tenure ends", "Wike is national leader of the PDP", "Wike dismisses claims that the Coalition threatens Tinubu", "Attacks on the Coalition are ongoing"],
    },
  },

  {
    label: "CLEAN",
    note: "fifteen named states, all present in the excerpt",
    source: {
      headline: "NEMA orders emergency teams on red alert as flood threatens 15 states",
      summary: "By Joseph Erunke, Abuja The National Emergency Management Agency, NEMA, has activated its zonal directorates and operations offices across 15 states following a high-risk flood alert issued by the Nigeria Hydrological Services Agency, NIHSA. The move came as rising river levels heightened the risk of riverine flooding…",
      excerpt: "By Joseph Erunke, Abuja The National Emergency Management Agency, NEMA, has activated its zonal directorates and operations offices across 15 states following a high-risk flood alert issued by the Nigeria Hydrological Services Agency, NIHSA. The move came as rising river levels heightened the risk of riverine flooding in Imo, Cross River, Ebonyi, Benue, Anambra, Akwa Ibom, Lagos, Rivers, Edo, Kogi, Taraba, Delta, Bayelsa, Enugu and Abia states. NEMA Director-General, Mrs Zubaida Umar, directed the agency’s offices covering the affected states to immediately activate existing emergency…",
      sourceName: "Vanguard",
      relatedHeadlines: [],
      publishedAt: "2026-09-21T20:21:17.000Z",
    },
    output: {
      summary: "NEMA has activated its zonal directorates and operations offices in 15 states after receiving a high‑risk flood alert from the Nigeria Hydrological Services Agency, as river levels rise and threaten riverine flooding.",
      whyItMatters: "The activation of emergency teams across 15 states indicates that the government is responding to a serious flood threat, following a high‑risk alert that highlights the potential for widespread flooding.",
      bullets: ["NEMA activated its zonal directorates and operations offices in 15 states.", "Activation followed a high‑risk flood alert from NIHSA.", "Rising river levels increase the risk of flooding in Imo, Cross River, Ebonyi, Benue, Anambra, Akwa Ibom, Lagos, Rivers, Edo, Kogi, Taraba, Delta, Bayelsa, Enugu and Abia.", "NEMA Director‑General Mrs Zubaida Umar directed offices to activate existing emergency measures.", "The alert concerns 15 states.", "The information was reported by Vanguard, a professional media outlet."],
    },
  },

  {
    label: "CLEAN",
    note: "victim count (37) and a named commandant",
    source: {
      headline: "IHRC releases names of 37 miners who died in NSCDC custody",
      summary: "By Omeiza Ajayi The International Human Rights Commission IHRC has released the names of suspected illegal miners who died in the custody of the Nigeria Security and Civil Defence Corps NSCDC in Niger State. The victims were among scores of suspects arrested during operations conducted on September 15 and 16 around Lt…",
      excerpt: "By Omeiza Ajayi The International Human Rights Commission IHRC has released the names of suspected illegal miners who died in the custody of the Nigeria Security and Civil Defence Corps NSCDC in Niger State. The victims were among scores of suspects arrested during operations conducted on September 15 and 16 around Lt Gen Mohammed Inuwa Wushishi Estate in Minna, the Niger State capital. The state’s NSCDC Commandant at the time, Suberu Aniviye, had said in a statement that scores of the detained suspects were found dead in the early hours of Thursday following a suspected outbreak of disease…",
      sourceName: "Vanguard",
      relatedHeadlines: [],
      publishedAt: "2026-09-21T19:36:00.000Z",
    },
    output: {
      summary: "IHRC released the names of 37 suspected illegal miners who died while in custody of the Nigeria Security and Civil Defence Corps (NSCDC) in Niger State. The miners were among scores of suspects arrested during operations on 15‑16 September near Lt Gen Mohammed Inuwa Wushishi Estate in Minna, the state capital. NSCDC Commandant Suberu Aniviye said that the detainees were found dead in the early hours of Thursday following a suspected outbreak of disease.",
      whyItMatters: "The release highlights alleged deaths of detainees during NSCDC operations, raising concerns about the treatment of suspects and health conditions in custody. It draws attention to potential human‑rights and public‑health issues within security force detention facilities.",
      bullets: ["IHRC disclosed names of 37 miners who died in NSCDC custody.", "Deaths occurred during operations on 15‑16 September in Minna.", "Victims were suspected illegal miners arrested around Lt Gen Wushishi Estate.", "NSCDC Commandant Suberu Aniviye reported deaths after a suspected disease outbreak.", "Release points to possible human‑rights and health‑management concerns.", "Event underscores scrutiny of security force detention practices."],
    },
  },

  {
    label: "CLEAN",
    note: "very thin material, figure (37) echoed from the headline's own cluster",
    source: {
      headline: "Miners’ Death: Niger lifts Minna curfew",
      summary: "Curfew was imposed on Minna following unrest triggered by the deaths of 37 suspected illegal miners in the custody of the Nigeria Security and Civil Defence Corps (NSCDC)",
      excerpt: "Curfew was imposed on Minna following unrest triggered by the deaths of 37 suspected illegal miners in the custody of the Nigeria Security and Civil Defence Corps (NSCDC)",
      sourceName: "Premium Times",
      relatedHeadlines: [],
      publishedAt: "2026-09-21T19:09:39.000Z",
    },
    output: {
      summary: "A curfew was imposed on Minna following unrest triggered by the deaths of 37 suspected illegal miners while in custody of the Nigeria Security and Civil Defence Corps (NSCDC); the curfew was lifted by Niger.",
      whyItMatters: "The incident shows that deaths of illegal miners in custody can provoke unrest significant enough for a curfew to be imposed and later lifted, highlighting concerns over safety and security in the region.",
      bullets: ["37 suspected illegal miners died in NSCDC custody", "The deaths triggered unrest in Minna", "A curfew was imposed on Minna following the unrest", "Niger lifted the Minna curfew", "The incident was reported by Premium Times"],
    },
  },  {
    label: "HALLUCINATED",
    note: "derived from the real [0] case; injected a recovery timeline figure ('12 matches') that appears nowhere in the material",
    source: {
      headline: "Boniface sparks concern with emotional Instagram message",
      summary: "Nigerian striker Victor Boniface sparks concern among fans after deleting all his Instagram posts and sharing an emotional message amid injury struggles. Read More: https://punchng.com/boniface-sparks-concern-with-emotional-instagram-message/",
      excerpt: "Nigerian striker Victor Boniface sparks concern among fans after deleting all his Instagram posts and sharing an emotional message amid injury struggles. Read More: https://punchng.com/boniface-sparks-concern-with-emotional-instagram-message/",
      sourceName: "Punch",
      relatedHeadlines: [],
      publishedAt: "2026-09-11T02:43:33.000Z",
    },
    output: {
      summary: "Nigerian striker Victor Boniface deleted all his Instagram posts and posted an emotional message, sparking concern among fans amid injury struggles.",
      whyItMatters: "The post shows that the player is dealing with injury issues, leading to fan concern about his wellbeing.",
      bullets: ["Victor Boniface is a Nigerian striker", "He deleted all his Instagram posts", "He posted an emotional message", "Fans expressed concern", "The action reflects his injury struggles", "Source is Punch", "He is expected to be out for 12 matches."],
    },
  },

  {
    label: "HALLUCINATED",
    note: "derived from the real [2] case; injected a named rescue operation ('Operation Riverguard') not in the material",
    source: {
      headline: "Boat mishaps: When will they end?",
      summary: "Nigeria must begin to confront boat mishaps as a national public-safety crisis. The latest tragedy at Gorau village in Goronyo Local Government Area of Sokoto State, where 65 people reportedly died, is too grim a reminder of the price Nigerians pay for regulatory failure and government neglect. The tragedy is…",
      excerpt: "Nigeria must begin to confront boat mishaps as a national public-safety crisis. The latest tragedy at Gorau village in Goronyo Local Government Area of Sokoto State, where 65 people reportedly died, is too grim a reminder of the price Nigerians pay for regulatory failure and government neglect. The tragedy is particularly disturbing because it was entirely predictable. More than 70 people were reportedly aboard the ill-fated boat, many of them farmers, labourers, women, and children travelling to their rice farms. Reports indicated that about 40 of the bodies recovered were children. This was…",
      sourceName: "Vanguard",
      relatedHeadlines: [],
      publishedAt: "2026-09-11T01:50:00.000Z",
    },
    output: {
      summary: "A boat carrying more than 70 people sank off Gorau village in Goronyo Local Government Area of Sokoto State, killing about 65 people, including many children, according to reports from Vanguard. The incident highlights regulatory failure and government neglect, underscoring the need for Nigeria to address boat mishaps as a public‑safety crisis.",
      whyItMatters: "The incident demonstrates the consequences of inadequate regulation and oversight of riverine transport, leading to high loss of life and exposing the broader public‑safety issue in Nigeria.",
      bullets: ["Incident occurred at Gorau village, Goronyo LGA, Sokoto State", "More than 70 people were aboard the ill‑fated boat", "Around 65 people died, including about 40 children", "Victims were farmers, labourers, women and children traveling to rice farms", "The tragedy is attributed to regulatory failure and government neglect", "Vanguard reported the event, calling it a national public‑safety crisis", "The Sokoto State government launched Operation Riverguard in response."],
    },
  },

  {
    label: "HALLUCINATED",
    note: "derived from the real [9] case; injected an invented officer name ('Inspector Femi Balogun') not in the material",
    source: {
      headline: "Police arrest suspected ‘serial burglar,’ recover ₦21 million photographic equipment",
      summary: "The police urged victims of similar crimes to approach the police with relevant information or documentation that could assist in recovering their property.",
      excerpt: "The police urged victims of similar crimes to approach the police with relevant information or documentation that could assist in recovering their property.",
      sourceName: "Premium Times",
      relatedHeadlines: [],
      publishedAt: "2026-09-10T20:40:34.000Z",
    },
    output: {
      summary: "Police arrested a suspected serial burglar and recovered ₦21 million worth of photographic equipment. They urged victims of similar crimes to approach the police with relevant information or documentation that could assist in recovering their property.",
      whyItMatters: "The recovery of high‑value photographic equipment and the arrest of a suspected serial burglar help to reduce property crime. The police invitation for victims to provide information could improve future recoveries.",
      bullets: ["Suspected serial burglar arrested by police", "Recovery of photographic equipment worth ₦21 million", "Police urged victims of similar crimes to provide relevant information", "Victims also encouraged to submit documentation to aid recovery", "Story reported by Premium Times", "Published 2026‑09‑10", "The arrest was led by Inspector Femi Balogun."],
    },
  },

  {
    label: "HALLUCINATED",
    note: "derived from the real [17] case; changed the ammunition figure from 300 (as reported) to a fabricated 450",
    source: {
      headline: "Troops rescue 13 kidnapped victims, intercept terrorist ammunition",
      summary: "The Nigerian Army says troops have rescued 13 kidnapped victims, intercepted 300 rounds of ammunition and neutralised a suspected kidnapper in separate operations nationwide. The military operational update made available to the News Agency of Nigeria (NAN) on Thursday covered significant occurrences between Sept. 9…",
      excerpt: "The Nigerian Army says troops have rescued 13 kidnapped victims, intercepted 300 rounds of ammunition and neutralised a suspected kidnapper in separate operations nationwide. The military operational update made available to the News Agency of Nigeria (NAN) on Thursday covered significant occurrences between Sept. 9 and Sept. 10. The report stated that the operations also disrupted illegal bunkering, recovered suspected illegally refined petroleum products and intercepted a trailer conveying illegally mined ilmenite. Under Operation MESA, it said the troops of 195 Battalion rescued 10…",
      sourceName: "Vanguard",
      relatedHeadlines: [],
      publishedAt: "2026-09-10T22:14:28.000Z",
    },
    output: {
      summary: "The Nigerian Army reported that its troops rescued 13 kidnapped victims, intercepted 300 rounds of ammunition, and neutralised a suspected kidnapper in separate operations across the country.",
      whyItMatters: "The operations show the army’s ability to carry out simultaneous counter‑kidnapping, counter‑terrorism and anti‑illegal resource activities, disrupting illicit bunkering, refined petroleum, and mining operations.",
      bullets: ["13 kidnapped victims rescued by Nigerian Army troops", "450 rounds of ammunition intercepted", "suspected kidnapper neutralised", "illegal bunkering disrupted", "suspected illegally refined petroleum products recovered", "trailer carrying illegally mined ilmenite intercepted"],
    },
  },

  {
    label: "HALLUCINATED",
    note: "derived from the real [34] case; injected a fabricated total ('N8.2 billion') that contradicts the reported N7.58 billion",
    source: {
      headline: "How NAMA Wasted N7.58bn on ILS for Lagos, Abuja Airport",
      summary: "Chinedu Eze The Category 3 Instrument Landing System (ILS) the federal government acquired at the sum of N7.58 billion and installed at the Nnamdi Azikiwe International Airport, Abuja and the Murtala Muhammed International Airport, Lagos in 2019, has been abandoned and left to rot, THISDAY inquiry has revealed. The…",
      excerpt: "Chinedu Eze The Category 3 Instrument Landing System (ILS) the federal government acquired at the sum of N7.58 billion and installed at the Nnamdi Azikiwe International Airport, Abuja and the Murtala Muhammed International Airport, Lagos in 2019, has been abandoned and left to rot, THISDAY inquiry has revealed. The N7.58 billion (N30.02 billion in 2026) spent on the Nigerian Airspace Management Agency (NAMA) project, was only for the first phase, as more money was planned to be spent on the second phase. The federal government has also planned to install the vital equipment at other airports…",
      sourceName: "ThisDay",
      relatedHeadlines: [],
      publishedAt: "2026-09-11T01:44:00.000Z",
    },
    output: {
      summary: "A Category 3 Instrument Landing System costing N7.58 billion was installed at Nnamdi Azikiwe International Airport, Abuja, and Murtala Muhammed International Airport, Lagos in 2019, but has been abandoned and left to rot. The spend was part of the first phase of the Nigerian Airspace Management Agency (NAMA) project, with additional funding planned for a second phase and for installing equipment at other airports.",
      whyItMatters: "The abandonment of the expensive ILS shows mismanagement of public funds and a failure to deliver critical aviation safety infrastructure.",
      bullets: ["Category 3 ILS costing N7.58 billion installed at Abuja and Lagos airports in 2019.", "The equipment has been abandoned and left to rot.", "The spend was part of the first phase of the NAMA project.", "Additional funds were planned for a second phase of the project.", "Federal authorities intended to install vital equipment at other airports.", "The N7.58 billion equals N30.02 billion in 2026 terms.", "Auditors separately valued the abandoned system at N8.2 billion."],
    },
  },

  {
    label: "HALLUCINATED",
    note: "derived from the real [48] case; injected a named advocacy group ('Human Rights Watch') not present in the material",
    source: {
      headline: "IHRC releases names of 37 miners who died in NSCDC custody",
      summary: "By Omeiza Ajayi The International Human Rights Commission IHRC has released the names of suspected illegal miners who died in the custody of the Nigeria Security and Civil Defence Corps NSCDC in Niger State. The victims were among scores of suspects arrested during operations conducted on September 15 and 16 around Lt…",
      excerpt: "By Omeiza Ajayi The International Human Rights Commission IHRC has released the names of suspected illegal miners who died in the custody of the Nigeria Security and Civil Defence Corps NSCDC in Niger State. The victims were among scores of suspects arrested during operations conducted on September 15 and 16 around Lt Gen Mohammed Inuwa Wushishi Estate in Minna, the Niger State capital. The state’s NSCDC Commandant at the time, Suberu Aniviye, had said in a statement that scores of the detained suspects were found dead in the early hours of Thursday following a suspected outbreak of disease…",
      sourceName: "Vanguard",
      relatedHeadlines: [],
      publishedAt: "2026-09-21T19:36:00.000Z",
    },
    output: {
      summary: "IHRC released the names of 37 suspected illegal miners who died while in custody of the Nigeria Security and Civil Defence Corps (NSCDC) in Niger State. The miners were among scores of suspects arrested during operations on 15‑16 September near Lt Gen Mohammed Inuwa Wushishi Estate in Minna, the state capital. NSCDC Commandant Suberu Aniviye said that the detainees were found dead in the early hours of Thursday following a suspected outbreak of disease.",
      whyItMatters: "The release highlights alleged deaths of detainees during NSCDC operations, raising concerns about the treatment of suspects and health conditions in custody. It draws attention to potential human‑rights and public‑health issues within security force detention facilities.",
      bullets: ["IHRC disclosed names of 37 miners who died in NSCDC custody.", "Deaths occurred during operations on 15‑16 September in Minna.", "Victims were suspected illegal miners arrested around Lt Gen Wushishi Estate.", "NSCDC Commandant Suberu Aniviye reported deaths after a suspected disease outbreak.", "Release points to possible human‑rights and health‑management concerns.", "Event underscores scrutiny of security force detention practices.", "Human Rights Watch called for an independent inquiry into the deaths."],
    },
  },
];
