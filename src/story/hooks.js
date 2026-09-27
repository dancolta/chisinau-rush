// The phone between missions. AFTER: what rings once a mission is passed, the hook that pulls
// you on to the next one (a call, a text, a twist, the neighbours' Viber group talking about
// you). OFFERS: the calls that bring the favours. Lines: a string is the caller; { who, text }
// is someone else (the hero's replies); [[his|hers]] follows the hero. Speakers are in cast.js.
// Missions that run straight into the next one (next: 'auto') need no hook.

export const AFTER = {
  paine: [
    { sms: 'vasile', text: 'Am auzit că-mi scoți Jiguliul din garaj. Pornește din a treia. Dacă nu pornește, înjură-l în rusă, e obișnuit așa. Cheia e sub preș. Preșul e sub Jiguli.' },
  ],
  taxi: [
    { call: 'necunoscut', lines: [
      'Alo. Taxiul galben de la Vova?',
      'Ai pe bancheta din spate ceva ce nu-i al tău. Un dosar albastru. Cu „strict secret" pe el.',
      { who: 'player', text: 'Ăla pe care l-a uitat omul vostru? Cine lasă „strict secret" într-un taxi?' },
      'Lasă-l în urna de lângă Arc și uităm amândoi că ai existat. …Taci? Bine. Ne vedem, [[taxistule|taxisto]].',
    ] },
    { viber: 'Doamna Tamara, scara 1', text: 'Dragilor, azi m-a dus la piață [[băiatul|fata]] Mariei, cu taxiul lui Vova. Ouăle au ajuns întregi. Aproape toate. Dați-i clienți!' },
  ],
  eban: [
    { call: 'vitea', lines: [
      'Bratan, ce faci? Zice lumea că umbli după mașini negre. Noi vedem tot din curte, jostko.',
      'G-Wagonul primarului trece pe la noi în fiecare seară. Vino, vorbim. Și adu o siga. Două.',
    ] },
  ],
  cursa: [
    { sms: 'lilia', text: 'Am văzut filmarea lui Vitea. Aur curat. Borea Țigan, din Grădina Publică, cară cutiile la Gară. Află ce-i în ele. Și nu-i zice că vii de la mine.' },
    { viber: 'Tanti Lida, scara 2', text: 'Iar au făcut gopnicii curse pe Alexandru cel Bun. A câștigat unul cu Loganul lui Gena. Nu zic cine. [[Băiatul|Fata]] Mariei.' },
  ],
  borea: [
    { call: 'borea', lines: [
      'Băi, bratan, încă ceva, că m-o ros toată noaptea.',
      'Omul din parc, ăla cu folie pe cap, vede tot ce mișcă noaptea la Arc. Nu-i nebun. Adică-i nebun, da\' vede.',
      'Du-i ceva de mâncare. Pe stomacul gol vede doar 5G.',
    ] },
  ],
  profetul: [
    { call: 'caldare', lines: [
      'Alo. Aici sergentul Căldare. Nu mă întreba de unde am numărul. Poliția are metode. Vasile.',
      'Am auzit că umbli cu o matrioșcă. Vino la Arc. Am o problemă. Și tu ai o problemă. Poate le rezolvăm pe amândouă.',
      'Și… n-am vorbit la telefon, clar? Io la ora asta sunt la „instruire".',
    ] },
  ],
  sergentul: [
    { viber: 'Vecinul de la 3', text: 'Am văzut mașina lui Căldare cu sirena pornită, condusă de [[băiatul|fata]] Mariei. Căldare alerga pe jos după ea. Fericit.' },
    { sms: 'necunoscut', text: 'Arhiva pleacă vineri. Tu nu pleci nicăieri. — Un prieten' },
    { call: 'nelu', lines: [
      'Alo, aici Nelu, gunoierul. Lilia mi-a dat numărul. Io nu sun pe nimeni, da\' acu sun.',
      'Noaptea, în beciul Primăriei, e mai multă mișcare ca la Piața Centrală. Vino pe la containere, prin spate. Te aștept cu mătura.',
    ] },
  ],
  beciul: [
    { call: 'zina', dropped: true, lines: [
      'Maică, ai ieșit [[viu|vie]] de-acolo? Nelu zice că ai fost ca Van Damme. Io stau pe bancă, că-i frumos afară…',
      'Stai, cine-s ăștia? Mașina neagră… Ce vreți, mă? Nu mă atingeți, că-s pensionară cu grupa a doua!',
      'Lăsați telefonul! LĂSAȚI…',
    ] },
  ],
  rapirea: [
    { call: 'lilia', lines: [
      'Am văzut știrile. Tanti Zina e bine? …A bătut patru bodyguarzi și tot ea întreabă dacă ai mâncat. Clasic.',
      'Sâmbătă, Eban face „miting de sprijin" în PMAN. Cu autobuze de la țară și pachete cu salam.',
      'Adu-i pe toți: Zina, Vitea, Borea, profetul. Eu vin cu camera. În fața la toată lumea, cum zicea Zina.',
    ] },
    { viber: 'Vecina de la 5', text: 'ZINA E ACASĂ!!! A bătut patru bodyguarzi la Circ! Face plăcinte la scara 3, la șase. Aduceți farfurii. Și pe [[băiatul|fata]] Mariei.' },
  ],
  alegeri: [
    { call: 'secretara', delay: 6, lines: [
      '[[Domnule primar|Doamnă primar]], bună seara. Sunteți în funcție de o oră și aveți patruzeci și șapte de apeluri nepreluate.',
      'Toate de la Tanti Zina. Zice că groapa din fața blocului e „a dumneavoastră acum".',
    ] },
  ],
  // favours end on a line too
  sm_conferinta: [
    { sms: 'lilia', text: 'Ai văzut? O sută de mii de vizualizări într-o oră. Eban zice că e „deepfake". Pe cartofi. Te iubește internetul.' },
  ],
  sm_gropi: [
    { call: 'vova', lines: [
      'Bratan! Am auzit! O sută de lei! Brigadierul a plătit cu mărunțiș, să vezi ce față avea.',
      'Jumate-i a ta. Glumesc. Toată-i a ta. Aproape toată. Treci pe la service, îți schimb uleiul gratis. Pe al meu.',
    ] },
  ],
}

// The favours' calls: who needs you, and what for.
export const OFFERS = {
  sm_borcane: ['zina', [
    'Maică, iar io. Maria de la scara 3 are patruzeci de kile de borcane de dus la Piața Centrală.',
    'Zacuscă, murături, compot… Și n-are cine s-o ducă. Tu ai mașină acum, am văzut. Stă în fața blocului, cu borcanele.',
  ]],
  sm_nunta: ['nasul', [
    '[[Finule|Fino]]! Aici nașul Grigore, de la nunta lui Ionuț. Mă știi, am jucat hora la cumetria ta. Nu mă știi? Nu contează.',
    'Șoferul mirilor s-a îmbătat de la zece dimineața. Nunta pleacă din Râșcani, de pe 31 August. Ne trebuie un om cu volan și cu nervi.',
    'Plicul e gros. Tortul, și mai gros. Vino repede!',
  ]],
  sm_conferinta: ['lilia', [
    'Eban ține conferință de presă în PMAN. Tema: „asfaltul nou". Asfaltul e vopsea, știm amândoi.',
    'Ghenadie, operatorul meu, are o idee. Una proastă. Îmi place. E în PMAN, lângă Guvern.',
  ]],
  sm_gropi: ['vova', [
    'Bratan! Echipa Primăriei „astupă" gropile din Botanica. Cu vopsea neagră. Pentru televizor.',
    'Am pariat o sută de lei cu brigadierul lor că tu astupi mai multe, cu asfalt adevărat. Nu mă face de râs. E suta mea. Brigadierul e lângă garaje.',
  ]],
  sm_troleibuz: ['tolea', [
    'Alo, bratan? Tolea, vatmanul de pe 22. Ții minte coarnele? Acu-i mai rău.',
    'Am coborât un minut după o plăcintă. Coada-i până la Gară. Troleibuzul stă la Hotel Național, cu patruzeci de oameni înăuntru.',
    'Dacă nu ajunge la Piața Centrală, dispeceratul mă trimite la pensie. Du-l tu. Cheia-i în contact. Contactul e un cui.',
  ]],
}
