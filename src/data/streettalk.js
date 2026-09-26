// Everything people say on the street when you walk up and talk to them, plus the barks of the
// crowd around you. [[a|b]] is picked by the hero's gender (a: him, b: her); {place}, {country}
// and {name} are filled in when the line is said.

export const NAMES = {
  gopnik: ['Jora', 'Serioga', 'Dimon', 'Colea', 'Tolik', 'Slavic', 'Vadik', 'Maxim', 'Andriușa', 'Stas', 'Genea', 'Edik', 'Sanea', 'Vova Mic', 'Igoriok', 'Rusik'],
  babushka: ['Tanti Maria', 'Baba Nina', 'Tanti Vera', 'Tanti Lida', 'Baba Frosea', 'Tanti Polea', 'Tanti Raia', 'Baba Anica'],
  man: ['Ion', 'Vasile', 'Petru', 'Andrei', 'Sergiu', 'Mihai', 'Dorin', 'Valeriu', 'Nicolae', 'Grigore'],
  woman: ['Ana', 'Maria', 'Elena', 'Natalia', 'Olga', 'Tatiana', 'Doina', 'Svetlana', 'Lenuța', 'Aurica'],
  cop: ['Sergentul Moraru', 'Plutonierul Cebotari', 'Sergentul Rusu', 'Locotenentul Ciobanu', 'Sergentul Lupu'],
  vendor: ['Tanti Ludmila', 'Doamna Valentina', 'Tanti Zoia', 'Tanti Dusea'],
  oldman: ['Moș Vasile', 'Nea Toma', 'Moș Ilie', 'Nea Fiodor'],
  kid: ['Ionuț', 'Vlăduț', 'Sașa', 'Mihăiță', 'Dănuț', 'Maricica', 'Nastea', 'Cristinuța'],
}

export const ROLES = {
  gopnik: 'Gopnic de cartier',
  babushka: 'Pensionară. Știe tot.',
  civilian: 'Trecător',
  cop: 'Poliția Chișinău, patrula',
  vendor: 'Piața Centrală',
  cards: 'Campion la „Durak" din 1982',
  wedding: 'La nuntă',
  kid: 'Copil de la bloc. Știe tot cartierul.',
}

// ---- gopniks -------------------------------------------------------------------------------------
export const GOP = {
  // greeting by respect tier: Străin, Cunoscut, De-al nostru, Bratan
  greet: [
    ['Șo te uiți, [[bratan|tanti]]? Ai pierdut ceva pe fața mea?', 'Ai o siga? Nu? Da\' semințe ai? Ce fel de om ești tu?', 'Tu din ce cartier ești? Zi pe bune.',
      'Ia uite, o venit [[europeanul|europeana]]. Cu ce treburi prin curtea noastră?', 'Stai. Tu nu ești de-aici. Se vede după adidași.'],
    ['A, tu ești [[ăla|aia]] din {country}. Normalno. Ce vrei?', 'Iar tu? Hai, zi repede, că stăm la treabă.', 'Salut. Ai adus semințe sau doar vorbe?'],
    ['[[Bratan|Tanti]]! Ia loc pe vine, ca omu\'.', 'Pe bune, ești de-al nostru. Mama lui Vitea te-o văzut și zice că ești [[băiat cuminte|femeie cumsecade]].', 'Pacani, uitați cine-o venit! Normalno?'],
    ['Jostko! Șeful cartierului! Pacani, sus de pe vine, respect!', '[[Bratan|Tanti]], curtea asta-i ca a ta. Zi, ce trebuie?', 'Stau pe vine de la șapte ani. Genunchii mei au văzut mai multe ca primarul. Da\' așa om ca tine n-am văzut.'],
  ],
  chat: [
    'Stau pe vine de la șapte ani. Genunchii mei au văzut mai multe ca primarul.',
    'Ieri o trecut Eban cu Gelendvagenul prin groapa de la colț. Groapa-i bine.',
    'Vitea zice că-și ia BMW din Germania. Cu volanul pe dreapta, că-i mai ieftin.',
    'Aici stăm. Vedem tot. Nu zicem nimic. Da\' pentru semințe, zicem.',
    'Frate-miu o plecat la Londra. Zice că acolo gopnicii stau pe vine la stația de autobuz. Civilizat.',
    'Am fost la sală o dată. O dată mi-o ajuns.',
    'Cică vine iarna. Da\' iarna vine în fiecare an și noi tot aici.',
    'Pe Ismail o deschis un McDonald\'s nou. Noi tot la chioșc. Principii.',
  ],
  tip: ['Ascultă. Am văzut un dosar cu ștampilă de la primărie aruncat pe lângă {place}. Ți-l pun pe hartă, da\' nu zici că de la mine.',
    'Știi ce? Pe lângă {place} o pierdut careva hârtii de la primărie. Ți-am pus pe hartă. Noi nu știm să citim așa ceva.'],
  seeds: ['Normalno! Prăjite, cu sare. Cojile le scuipăm numa\' spre primărie.', 'Semințe de la Piața Centrală? Omul se cunoaște după semințe.', 'Uite, ăsta-i om! Nu ca ăia din Porsche.'],
  seedsFull: ['Mersi, [[bratan|tanti]], da\' am burta plină de coji. Mâine.', 'Azi ne-ai servit deja. Nu ne strica, că ne obișnuim.'],
  recruit: ['Davai, merg cu tine. Da\' dacă fugim, fug eu primul, că am adidași mai buni.', 'Cu cine ne batem, [[bratan|tanti]]? Numa\' să nu fie babe. Babele-s sfinte.', 'Normalno. Da\' până la zece, că la zece mă cheamă mama.'],
  crewFull: ['Ai deja gașcă, [[bratan|tanti]]. Nu-i armată.'],
  provoke: ['Tu pe mine m-ai făcut fraer? Pacani, sus de pe vine!', 'Oi, oi, oi. Ai greșit curtea, [[bratan|tanti]].', 'Pacani! [[Ăsta|Asta]] vrea să se bată!'],
  win: ['Ai pumn greu, [[bratan|tanti]]. Respect. Da\' să știi că m-am împiedicat.', 'Bine, bine… Ești de-al nostru. Da\' nu zice la nimeni.', 'Normalno lovești. Unde ai învățat, pe șantier?'],
  fled: ['Fugi, fugi! Ține minte curtea asta!', 'Asta a fost pentru semințe!', 'Și să nu te mai văd pe-aici!'],
  bump: ['Ai călcat pe adidasul meu. E original, din Turcia.', '[[Bratan|Tanti]], șo te împingi?', 'Ușor, că-s adidași de firmă!'],
  bumpFriend: ['Ușor, [[bratan|tanti]]! Da\' ție ți se iartă.', 'Uh, [[bratan|tanti]], era să mă dărâmi. Normalno.'],
  bumpAngry: ['Acuma ai probleme, [[bratan|tanti]].', 'Adidasul! Ai călcat pe adidas! Pacani!'],
  // shouted at you as you walk past a hangout
  bark: [
    ['Ei, tu! Vino-ncoace!', 'Ai o siga, [[bratan|tanti]]?', 'Șo, [[europeanule|tanti]], ai euro?', 'Uite-l pe [[ăsta|asta]] cu geanta de la Milano.'],
    ['Salut.', 'Normalno?', 'Ia vino, stăm.'],
    ['Salut, [[bratan|tanti]]!', 'Uite-l pe-al nostru!', 'Ia vino, că avem semințe proaspete.'],
    ['[[Bratan|Tanti]]! Respect!', 'Cine-i șeful? [[El|Ea]] e șefu\'!', 'Pacani, sus! Vine [[bratanul|tanti]]!'],
  ],
}

// ---- grannies ----------------------------------------------------------------------------------------
export const BAB = {
  greet: ['Maică, ai mâncat ceva azi? Ești [[slab|slabă]] ca o scândură de gard.', 'Ia te uită! [[Băiatul|Fata]] care s-o întors din {country}. Ce-ai adus, maică?',
    'Ce vrei, maică? Io stau aici și păzesc blocul.', 'Tu al cui ești? A, o cunosc pe mama-ta. Să-i dai sănătate.'],
  gossip: ['Vecina de la patru și-o luat televizor cât peretele. Acu\' vede știrile în mărime naturală.',
    'Pe vremea mea pâinea costa 16 copeici, și primarul se vedea doar la televizor.',
    'Nepotul meu e în Italia. Zice că-i bine. Io zic că minte frumos, ca taică-său.',
    'Eban? L-am văzut la televizor. Tot vorbea. Gropile tot acolo-s.',
    'Ăla de la trei o venit cu mașină nouă. Cu numere de Ucraina. Să știi.',
    'Iar o crescut prețul la hrișcă. Hrișca-i ca bitcoinul, maică.'],
  tipPothole: 'Și să știi că-i o groapă nouă lângă {place}. Ți-o pun pe hartă, să nu cazi în ea.',
  tipDosar: 'Am văzut niște hârtii cu ștampilă zburând pe lângă {place}. Du-te, maică, că tu ești [[băiat deștept|fată deșteaptă]].',
  pension: ['Pensia o venit. O și plecat. Direct la Termoelectrica.', 'O venit, maică. Toată: o mie două sute. Am luat pastile și o pâine. Pâinea o mâncăm azi.'],
  errandAsk: 'Ce bun ești, maică! Adu-mi o pâine de la chioșc sau de la Linella. Uite zece lei. Restul e al tău.',
  errandWait: 'Unde-i pâinea, maică? Chioșcul e aproape, nu-i Italia.',
  errandDone: 'Ia, maică, o plăcintă cu varză. Și nu spune la nimeni, că vin toți la mine.',
  rude: 'Obraznicule! Acuș\' te învăț eu cu sacoșa!',
  badanta: 'Doamne, una de-a noastră! Doișpe ani la Padova? Eu am fost la Bologna, la o doamnă cu pisici. Ia o plăcintă, dragă.',
  pickOk: 'În sacoșă: o pungă cu pungi, 3 lei și o poză cu nepotul.',
  pickFail: 'Hoțule! Ți-ar fi rușine! Acuș\' chem poliția și pe nepotul meu, care-i mai rău!',
  // said as you pass by a granny who likes you
  pass: ['Bravo, maică! Mănânci bine?', 'Uite-l pe [[băiatul|fata]] nostru!', 'Sănătate, maică! Pune-ți căciula, că răcești.'],
  feed: ['Ia, maică, o plăcintă caldă! Ești [[slab|slabă]], se vede.', 'Stai! Ia o plăcintă cu brânză. Nu te-ntreb, ia.'],
}

// ---- passers-by -----------------------------------------------------------------------------------------
export const CIV = {
  greet: ['Da? Doar repede, că mă grăbesc la rutieră.', 'Dacă vindeți ceva, n-am bani.', 'Ce-i? Iar s-o scumpit ceva?',
    'Bună ziua. Sau seara. Cine mai știe, cu atâta muncă.', 'Vă ascult. Da\' dacă-i sondaj, votez cu cine dă hrișcă.'],
  chat: ['Groapa de la colț are și nume. Îi zicem „Ceon": e mare și nu face nimic.',
    'Rutiera o venit așa plină, că șoferul ținea volanul cu dinții.',
    'Am luat brânză de la piață. În rate, pe trei luni.',
    'Eban o promis asfalt nou. O pus un panou cu poza asfaltului.',
    'Căldura vine în octombrie. Care octombrie, nu s-o precizat.',
    'Am plătit întreținerea. Acum mă întrețin eu pe mine, cu apă de la robinet.',
    'Fiul meu e la Londra. Zice că acolo-i scump. Aici e scump și n-am fiu.',
    'Iar o tăiat apa caldă. Zic că-i profilaxie. Profilaxia ține din 2009.'],
  where: '{place}? E pe-acolo, după groapa mare. Ți-l pun pe hartă, că văd că nu ești de-aici.',
  lendNo: 'Zece lei? Omule, eu stau cu trei lei până la salariu. Și salariul stă la mine două zile.',
  lendYes: 'Na, cinci lei. Și nu-i cheltui pe toți odată.',
  lendAgain: 'Ți-am dat deja, [[omule|doamnă]]. Rutiera nu-i taxi.',
  give: 'Douăzeci de lei? Doamne, sănătate! Ești din Italia, se vede. Acolo oamenii-s altfel.',
  giveBadanta: 'Douăzeci de lei? De la Signor Giuseppe, Dumnezeu să-l ierte? Sănătate, doamnă!',
  provokeScared: ['Nebunul! Poliția!', 'Lasă-mă, omule, n-am nimic!', 'Ajutor! Ăsta-i beat!'],
  pickOk: 'Ai scos din buzunar {n} lei și un bilet de rutieră folosit. Nimeni n-o simțit nimic.',
  pickFail: 'Hoțul! Mâna din buzunarul meu!',
  bump: ['Ai grijă pe unde calci!', 'Șo te împingi?', 'Uită-te pe unde mergi, bre!', 'Măi, măi, măi…', 'Scuzați-mă, da\' nu.'],
}

// ---- the courtyard crews: one of them gets up and comes over --------------------------------------------
// every opener's first answer costs nothing and changes nothing (the quick way through)
export const HOOD = {
  // shouted as one of them stands up and heads your way
  call: {
    toll: ['Ei, [[bratan|tanti]]! Stai o secundă.', 'Ia stai. Vino-ncoace, că vorbim.', 'Ei, tu! Da, tu, cu adidașii ăia.', 'Stai, stai. Unde te grăbești?'],
    tollTrack: ['Ei, frate în trening! Stai o secundă, că vorbim ca oamenii.', 'Ia uite, trei dungi! De-al nostru ești? Vino.'],
    tollSuit: ['Ia uite, domnul deputat! Stai o secundă.', 'Ei, cu costum! De la primărie ești? Vino-ncoace.'],
    newbie: ['Ei, tu! Tu ești nou pe-aici?', 'Ia stai, [[bratan|tanti]]. Nu te știu. Vino un pic.'],
    beef: ['Uite-l pe fugar! Stai, că n-am terminat!', 'Ia uite cine s-o întors! Stai pe loc!'],
    smoke: ['Ei, [[bratan|tanti]]! Vino, stăm.', 'Salut! Ia vino un pic.', 'A, tu erai. Vino, vino.'],
    friend: ['[[Bratan|Tanti]]! Hai la noi!', 'Uite-l pe-al nostru! Vino încoace!'],
    boss: ['Pacani, sus de pe vine! Vine șefu\'!', 'Respect, șefu\'! Stai, că venim noi la tine!'],
    back: ['A, te-ai întors! Zi, zi!', 'Ei? Cum a mers?'],
  },
  // the classic openers of a toll
  open: [
    { line: 'Ai o siga, [[bratan|tanti]]?', a: [
      { text: 'Nu fumez.', mood: 0, re: 'Nu fumezi? Sportiv, deci. Sportivii au bani de proteine.' },
      { text: 'Na, ia una. Din duty free.', mood: 1, lei: 3, re: 'Oho, din duty free! Om cu stil. Da\' stilul costă.' },
      { text: 'N-am. Și nici n-aș da.', mood: -1, re: 'Aha. Zgârcit. Ne-am lămurit.' },
    ] },
    { line: 'De unde ești, [[bratan|tanti]]? Zi pe bune.', a: [
      { text: 'De-aici. De la Blocul 7.', mood: 0, re: 'Blocul 7? Poate. Da\' eu nu te-am văzut niciodată.' },
      { text: 'Din {country}. M-am întors acasă.', mood: -1, re: 'Din {country}! [[Europeanul|Europeana]]! Atunci ai euro.' },
      { text: 'Ce te privește?', mood: -2, re: 'Ohoho. Cu nervi. Nervii se plătesc separat.' },
    ] },
    { line: 'Ce cauți în curtea noastră? Pe cine cauți?', a: [
      { text: 'Pe nimeni. Trec doar.', mood: 0, re: 'Trec doar. Toți trec doar. Trecerea costă.' },
      { text: 'Pe Vitea. Îl știți?', mood: 1, re: 'Pe Vitea îl știe toată Botanica. Da\' tu nu ești Vitea.' },
      { text: 'Pe mama voastră.', mood: -2, re: 'Pe mama?! Acuș\' o vezi tu pe mama.' },
    ] },
  ],
  // the ask: {fee} in words
  ask: ['Hai, dă {fee} lei. Pentru semințe.', 'Taxă de drum, [[bratan|tanti]]: {fee} lei. Nu-i mult.', 'Împrumută-ne {fee} lei până joi. Care joi, vedem.'],
  askNight: ['E noapte, [[bratan|tanti]]. Noaptea-i tarif de noapte: {fee} lei.'],
  askSuit: ['Cu costumul ăsta ori ești gabor, ori deputat. Deputații dau {fee} lei.'],
  askNewbie: ['Dă un leu. Serios, un leu. Pentru principiu.', 'Hai, un leu și ești liber. Așa-i tradiția.'],
  askBeef: ['Ai fugit data trecută. Acu\' costă {fee} lei. Cu dobândă.'],
  askCaught: ['Unde fugeai, fraere? Acu\' dai {fee} lei. Și nu mai fugi.'],
  // talking your way out: what you say depends on who you are
  talkOut: {
    patan: 'Pacani, eu îs de pe raion ca voi. Ce taxă?',
    stroitor: '(Te îndrepți de spate, încet) Mai zi o dată de taxă.',
    badanta: 'Băieți, v-aș putea fi mamă. Mergeți acasă, mâncați ceva cald.',
    hot: 'Taxă? Am lucrat în Anglia la logistică. Știu toate taxele. Asta nu există.',
    any: 'Lăsați, băieți, suntem toți din același cartier.',
  },
  talkOk: ['Bine, bine. Ai vorbă bună. Treci.', 'Hm. Normalno zici. Azi e gratis.', 'Ai noroc că-s bine dispus. Mergi.'],
  talkOkType: { stroitor: 'Ăăă… glumeam, [[bratan|tanti]]. Mergi sănătos. Te rog.', badanta: 'Scuzați, tanti. Nu v-am recunoscut. Sărut-mâna.', patan: 'A, de-al nostru! Da\' de ce n-ai zis de la început?' },
  talkNo: ['Frumos vorbești. Da\' tot dai.', 'Vorbe, vorbe. Banii unde-s?'],
  // Marcel's hands, while the man talks
  lift: '(Îl asculți atent. Și-i asculți și buzunarul.)',
  liftOk: 'Bine, bine, mergi. Stai… unde mi-s banii? Mamăă!',
  liftNo: 'Mâna! Mâna din buzunarul meu, fraere! Pacani!',
  paid: ['Normalno. Vezi că nu-i greu? Mergi sănătos.', 'Om cu înțelegere. Poți trece. Azi.', 'Mersi. Dacă te supără careva, zici că ești de-al lui Jora.'],
  paidNewbie: ['Un leu! Om de onoare. Bine ai venit în cartier.', 'Vezi? Acu\' ne cunoaștem.'],
  refuse: ['N-ai? Acuș\' găsim, pacani!', 'Asta nu-i răspuns, [[bratan|tanti]].', 'Pacani, sus de pe vine! Ăsta nu plătește!'],
  refuseNewbie: ['Pfu! Nici un leu? Ce vremuri… Du-te, du-te.', 'Zgârcit. Da\' te-am ținut minte, să știi.'],
  run: ['Stai, fraere!', 'Prindeți-l, pacani!', 'Unde fugi?!'],
  runNewbie: ['Ha! Fuge ca la Olimpiadă!', 'Fugi, fugi, că nu te prindem. Ne e lene.'],
  escaped: ['Fugi, fugi! Ține minte curtea asta!', 'Te prindem noi data viitoare!', 'Ai adidași buni. Deocamdată.'],
  gaveUp: ['Bine, bine. Altă dată.', 'Pleacă, pleacă. Știm unde stai.'],
  gaveUpFriend: ['Grăbit, [[bratan|tanti]]? Altă dată!', 'Normalno, fugi. Ne vedem.'],
  inCar: ['Uite-l, fuge cu mașina!', 'Da\' coboară, că nu mușcăm!'],
  cops: ['Gaborii! Pacani, nu ne cunoaștem.', 'Ne vedem, [[bratan|tanti]]. Acuma nu.'],
  paidToday: ['Ai plătit azi. Treci.', 'Tu ești ăla care o plătit. Normalno.'],
  withCrew: ['Ăsta-i cu pacanii. Normalno.', 'A, ești cu {name}? Treci, [[bratan|tanti]].'],
  // friendlier faces
  smoke: ['Salut, [[bratan|tanti]]. Ai o siga? Glumesc. Ce se aude?', 'A, tu. Normalno. Stai, povestește ceva.', 'Ia zi, ce mai faci prin cartier?'],
  friend: ['[[Bratan|Tanti]]! Ia loc pe vine, ca omu\'.', 'Hai, stai cu noi. Semințe avem, timp avem.'],
  boss: ['Șefu\'! Zi, ce trebuie? Curtea-i a ta.', 'Pentru tine, [[bratan|tanti]], orice. Aproape orice.'],
  gossip: ['Aseară o trecut o mașină neagră fără numere. De trei ori. Noi am numărat.', 'Tanti Zina zice că primarul vorbește rusește la telefon. Tanti Zina aude tot.',
    'Vitea iar zice că-și ia BMW. Din Germania. Cu volanul pe dreapta, că-i mai ieftin.', 'Vânzătoarea de la chioșc s-o măritat. Acu\' semințele-s mai scumpe.',
    'Gaborii stau la colț de la opt la zece. După aia merg la cafea. Ca ceasul.', 'Cineva o furat banca din curtea de alături. Cu tot cu pensionare. Glumesc. Doar banca.'],
  cut: ['Am strâns de la chioșc. Cota ta, șefu\'.', 'Uite, de la pacani. Nu întreba de unde.'],
  cutAgain: 'Azi ți-am dat deja, șefu\'. Mâine. Și poimâine, dacă vrei.',
  recruitFree: ['Merg cu tine, șefu\'. Pentru tine, gratis.', 'Davai! Numa\' să nu fie babe.'],
  bye: ['Normalno. Mergi.', 'Pa, [[bratan|tanti]].', 'Ne vedem pe cartier.'],
  // squatting with the lads
  squat: ['Uite, semințe. Ia, nu te jena.', 'Stăm. Asta-i viața.', 'De aici se vede tot: chioșcul, blocul, gaborii.', 'Mâine facem ceva. Poate.',
    'Tu în {country} ai stat pe vine? Acolo te amendează, zice frate-miu.', 'Cea mai bună bancă din oraș. Are și umbră, și priveliște la groapă.',
    'Taci. Ascultă. Asta-i liniștea din cartier. Și câinii.', 'Genunchii mei au văzut mai multe ca primarul.'],
  squatBye: ['Mergi? Normalno. Banca te așteaptă.', 'Pa, [[bratan|tanti]]. Vino oricând, locul e al tău.'],
  // the lads among themselves
  banter: [
    ['Ai văzut ce mașină și-o luat Tolik?', 'Pe credit. Și creditul pe alt credit.'],
    ['Mâine merg la sală.', 'Și eu. De trei ani.'],
    ['Semințele-s mai mici anul ăsta.', 'Din cauza primarului.'],
    ['Cine-i rândul la chioșc?', 'Al celui care are bani. Deci nimeni.'],
    ['Frate-miu zice că-n Germania stai pe vine și vine poliția.', 'Barbari.'],
    ['Eu dacă eram primar, făceam bancă cu acoperiș.', 'Și chioșc lângă. Non-stop.'],
    ['Maică-mea zice să-mi găsesc lucru.', 'Și?', 'Caut. De-aici se vede tot orașul.'],
    ['Ai auzit? Iar vine iarna.', 'Iarna-i ok. Numa\' frigul îi problema.'],
    ['Câți lei ai?', 'Depinde cine întreabă.'],
    ['Uite, un porumbel.', 'Ăla-i de la blocul trei. Îl știu.'],
  ],
  banterNight: [
    ['Cine merge după bere?', 'Cine a pierdut la cărți.'],
    ['Ce liniște… Numa\' câinii și taxiurile.', 'Și noi.'],
    ['Mama o zis să vin până la zece.', 'Și cât îi acuma?', 'Nu știu, s-o descărcat telefonul. Deci zece.'],
    ['Vezi steaua aia?', 'Aia-i lampa de la blocul patru.'],
  ],
  cheer: ['Dă-i! Dă-i!', 'Oooo! Pe bune?!', 'Asta-i bătaie, nu glumă!', 'Filmați, filmați!', 'Ai văzut? Ai văzut?!'],
  car: {
    police: ['Gaborii… Pacani, ne uităm în altă parte.', 'Nu vedem. Nu știm. Nu stăm aici.'],
    taxi: ['Taxi! Ne duci la chioșc? Pe datorie.', 'Șefu\', cât costă până la colț?'],
    gwagon: ['Ooo, Gelendvagen! Ești de la primărie?', 'Cu așa mașină, și groapa-i mică.'],
    jiguli: ['Jiguli! Clasică! Respect!', 'Asta-i mașină, nu plastic ca alea noi.'],
    rutiera: ['Rutiera! Oprești la colț, șefu\'?'],
    any: ['Frumoasă mașină. A cui e?', 'Ia uite, cu mașină! Ne plimbi?', 'Ce motor are? Se aude că n-are.'],
    fast: ['Ai grijă, nebunule!', 'Mai încet, că aici stau oameni!', 'Ooo! Ai frâne?!'],
    horn: ['Ce claxonezi, [[bratan|tanti]]? Aici oamenii dorm.', 'Claxonează la primărie, nu la noi!'],
  },
  // the lads at Blocul 7 (Vitea and co.), by how far the story has got
  cast: {
    early: ['Șo, [[bratan|tanti]]? Ai o siga?', 'Ia uite, [[europeanul|europeana]] de la Blocul 7.', 'Noi stăm aici. Vedem tot.'],
    paine: ['I-ai altoit bine pe ăia din Râșcani. Respect.', 'Tanti Zina zice că ești ca taică-tu.'],
    cursa: ['Campionul! Jostko!', 'Vitea încă zice că l-ai depășit pe roșu.', 'Când mai facem o cursă, [[bratan|tanti]]?'],
    rapirea: ['Pentru Tanti Zina, orice, [[bratan|tanti]]!', 'Circul ăla n-o să mai fie ce-o fost.'],
    mitingul: ['Uite-l pe primarul nostru! Ne faci asfalt în curte?', 'Când ești primar, bancă nouă aici. Cu suport de semințe.'],
  },
  favor: {
    busy: 'Ai deja o treabă de la noi. Întâi aia, [[bratan|tanti]].',
    late: '🍺 Pacanii n-au mai așteptat. Treaba s-a anulat.',
    bere: { offer: 'Fă-ne un bine: adu o bere de la „{place}". Sau cvas, dacă-i criză. Uite banii.', accept: 'Davai, vin repede.', decline: 'Nu azi, pacani.',
      tip: 'Cumpără {y}o bere sau un cvas{/y} și du-l la bancă.', back: 'Ooo, normalno! Uite, ia și tu cinci lei, pentru picioare.' },
    pachet: { offer: 'Ai drum? Du pachetul ăsta la pacanii de lângă {place}. Nu te uita înăuntru. Sunt… semințe.', accept: 'Îl duc.', decline: 'Nu car pachete.',
      tip: 'Du {y}pachetul{/y} la banca de lângă {place}.', got: 'A, de la pacanii ceilalți. Normalno. Ia pentru drum.', cops: '📦 Cu gaborii după tine, ai aruncat pachetul. Pacanii n-o să fie fericiți.' },
    datornic: { offer: 'Vezi pe ăla de-acolo? Ne datorează o sută de lei din 2019. Du-te și zi-i că-l salutăm.', accept: 'Mă duc să-l salut.', decline: 'Nu fac pe colectorul.',
      tip: 'Du-te la {y}datornic{/y} și transmite-i salutări de la bancă.', ask: 'Pacanii de la bancă te salută. Zic că știi tu de ce.',
      pay: 'Știu, știu! Uite, dă-le treizeci. Și zi-le că restul… joi!', back: 'Normalno! Zece lei ai tu. Restul la fondul băncii.', gone: '💸 Datornicul a dispărut. Treaba s-a anulat.' },
  },
}

// ---- kids from the blocks ------------------------------------------------------------------------------------
export const KID = {
  greet: ['[[Nene|Tanti]], ești de la televizor?', 'Mama zice să nu vorbesc cu străinii. Da\' tu ai adidași, deci nu ești străin.', 'Ai fost în străinătate? Acolo-s dinozauri?'],
  joke: ['Știi de ce primarul n-are umbrelă? Că plouă numa\' pe noi. Tata zice asta.', 'Eu când cresc mă fac gopnic. Sau cosmonaut. Ce-i mai ușor.',
    'Ai văzut groapa de la colț? Acolo am pierdut o minge. Și o bicicletă.', 'Bunica zice că pe vremea ei înghețata costa nouă copeici. Da\' ce-s copeicile?'],
  icecream: 'Înghețată! Mersi, [[nene|tanti]]! O să-i zic bunicii că ești om bun.',
  secret: 'Știu un secret! Lângă {place} am găsit niște hârtii cu ștampilă. Ți-l pun pe hartă, da\' să nu zici la nimeni.',
  noSecret: 'Secretele mele-s pentru prieteni. Tu mi-ai luat înghețată, deci… mâine îți zic.',
}

// ---- the police on your trail -----------------------------------------------------------------------------------
export const COPS = {
  shout: ['Stai! Poliția!', 'Stai pe loc, bre!', 'Mâinile unde să le văd!', 'Documentele! Acum!', 'Hei, tu! Stai!'],
  witness: ['Hei! Ce faci acolo?!', 'Stai! Te-am văzut!', 'Stai! Poliția!'],
  spot: ['Uite-l! Acolo!', 'L-am văzut! După el!', 'Stai, că te-am văzut!'],
  lost: ['Unde-a dispărut?', 'L-am pierdut… Iar.', 'Ai văzut încotro o fugit?', 'Căutați pe după bloc!'],
  grab: ['Te-am prins!', 'Gata, ai terminat de fugit.', 'Mâinile la spate!'],
  baton: ['Stai cuminte!', 'Nu te opune!', 'Ți-am zis să stai!'],
  tackle: ['La pământ!', 'Hopa!', 'Stai jos!'],
  hurt: ['Au! Atac asupra polițistului!', 'Asta te costă, cetățene!'],
  arrive: ['Echipajul 12 a ajuns!', 'Unde-i? Unde-i?'],
  gaveUp: ['Lasă, că-l prindem altă dată.', 'Gata, tura mea s-o terminat.'],
  escaped: 'Ai scăpat de poliție.',
  megaphone: ['Trage pe dreapta! Acum!', 'Mașina ceea, oprește! Da, tu!', 'Știm cine ești! Adică nu știm, da\' oprește!', 'Oprește, că ne termină benzina!', 'Cetățene, reduceți viteza! Și opriți! Și ieșiți!'],
}

// ---- patrol cops --------------------------------------------------------------------------------------------
export const COP = {
  greet: ['Circulați, cetățene. Sau vorbiți. Da\' repede.', 'Documentele… Glumesc. Ce vrei?', 'Radarul nostru e din 2003. Prinde doar troleibuze, și alea stau.'],
  chat: ['Totul e sub control. Controlul e în mașină, că afară plouă.', 'Liniștit. Ultima infracțiune gravă: cineva o parcat pe trotuar. Era a primarului, deci n-o fost.',
    'Radarul nostru e din 2003. Prinde doar troleibuze, și alea stau.', 'Salariul? Vine. Ca troleibuzul 22: știm că există.',
    'Am prins ieri un hoț. L-am lăsat, că era văru-meu. Familia-i familia.'],
  coffee: 'Cafea? În timpul serviciului nu. Da\' serviciul se termină chiar acu\'.',
  coffeeAgain: 'Am băut deja o cafea de la tine. A doua-i mită. Prima era prietenie.',
  snitch: ['Gopnicii? Îi știm. Și ei ne știu. Trăim în bună înțelegere.', 'Mulțumim pentru informație. O punem în sertar. Sertarul e plin, da\' o punem.'],
  insult: 'Cum m-ai făcut?! Documentele! Și nu-s „gabor", îs sergent major!',
  bump: ['Atenție, cetățene!', 'Mai încet, că te trec în raport.'],
  // new: directions, reports, stars
  where: '{place}? Drept înainte, apoi la stânga după groapa mare. Ți-am pus pe hartă. Circulați.',
  reportAsk: 'Să raportez ceva, șefu\'. Pe bune.',
  report: { shake: 'Gopnicii ți-au cerut taxă de drum? Am notat. Formularul 27-B, în trei exemplare. Revenim în trei-cinci ani lucrători.',
    beaten: 'Te-o bătut o bancă întreagă? Scriu aici: „cetățeanul a căzut singur". Glumesc. Am notat.',
    any: 'Am notat totul. Mulțumim pentru vigilență, cetățene. Rar vine cineva la noi de bunăvoie.' },
  reportRefund: 'Știi ce? Trec eu pe la băieți. O să-ți „găsească" banii. Poftim.',
  afterChase: 'Tu nu erai ăla de adineauri? Hm. Nu, ăla era mai urât.',
  salute: ['Să trăiți, cumătre!', 'Salutare, om de încredere!'],
  // with stars: hands up
  surrender: ['Așa, mâinile sus. Încet. Ce facem, cetățene?', 'Bravo că te-ai oprit. Acum discutăm ca oamenii.'],
  surrenderHot: 'Mâinile sus! Încet! Tu știi cât te-am alergat?!',
  fine: 'Amendă: {n} lei. Chitanță nu dăm, s-o terminat hârtia. Circulați.',
  fineMore: 'Asta-i pentru o stea. Pentru restul mai discutăm. Nu fugi.',
  bribeOk: ['Hm. Cafeaua e bună azi. Eu nu te-am văzut, tu nu m-ai văzut.', 'Pentru așa respect, cetățene… Circulați. Și salutări la mama.'],
  bribeNo: 'Mită?! Mie?! Unui ofițer al Republicii Moldova?! Acum chiar te arestez!',
  giveUp: 'Bravo. Primul care se predă singur anul ăsta. Tot la secție mergi, da\' cu reducere.',
  papers: '…Totul e în regulă, domnule deputat. Scuzați deranjul. Drum bun!',
  runAway: 'Stai! STAI! Ah, genunchiul meu…',
}

// ---- ordinary people around you ---------------------------------------------------------------------------
export const CROWD = {
  glance: ['Da?', 'Ne cunoaștem?', 'Bună ziua…', 'Vă pot ajuta?'],
  stare: ['Ce te uiți? Am ceva pe față?', 'Ce te holbezi, omule?', 'Nu-i frumos să te uiți așa.', 'Vreți să cumpărați ceva? Nu vând.'],
  stareTough: ['Ai o problemă, [[bratan|tanti]]?', 'Mai uită-te o dată și vezi.'],
  stareBab: ['Ce te uiți, maică? Ți-e foame?', 'Pune-ți căciula, că răcești.', 'Al cui ești tu, maică?'],
  aside: ['Pardon.', 'Treceți, treceți.', 'Scuze.', 'Hopa.'],
  shovedAgain: ['Iar tu?! Ce ai cu mine?', 'A doua oară! Chem poliția!', 'Iar?! Ești normal?'],
  remember: ['A, tu ești ăla care m-a împins.', 'Uite-l pe ăla care dă din coate.', 'Iar tu. Te țin minte.'],
  helped: ['Tu mi-ai dat douăzeci de lei! Sănătate!', 'Omul bun de adineauri! Doamne ajută!'],
  helpedBab: ['Uite-l pe [[băiatul|fata]] cu pâinea! Sănătate, maică!', 'Ce bun ești, maică. Țin minte.'],
  call: ['Alo, poliția? Aici unul bate oameni!', 'Alo! Veniți repede, e un nebun pe stradă!', 'Poliția? Da, eu iar. Da, iar un nebun.'],
  callDone: '📞 Cineva a sunat la poliție.',
  callStop: 'Lasă telefonul, frate. Uite douăzeci de lei, și n-ai văzut nimic.',
  callStopped: 'Care telefon? N-am telefon. N-am văzut nimic. Sănătate!',
  scold: ['Ți-ar fi rușine! În plină zi!', 'Uite la el! Chem poliția, maică!', 'Pe vremea lui Brejnev nu era așa!', 'Huligane! Unde-i mama ta?'],
  scoldRun: ['Nu fugi, maică, că cazi!', 'Unde fugi așa, ca la foc?'],
  kid: ['Mama, uite ce mașină!', 'Nene, dă-mi o tură!', 'Uiii-uiii! Poliția!', 'Când cresc, îmi iau d-asta!'],
  nodGop: ['Salut, [[bratan|tanti]].', 'Respect.'],
  avoid: ['Ăsta-i cu gopnicii… treci pe partea cealaltă.', 'Nu te uita la el, Ana.'],
  queue: ['Cine-i ultimul?', 'Iar s-a terminat restul.', 'Mai repede, că-i coadă!', 'Una cu brânză, vă rog.'],
  bench: ['Of, picioarele mele…', 'Stau un pic. Numai un pic.'],
  crash: ['Ai văzut?! Ce nebun!', 'Doamne, ce bușitură!', 'Filmează, filmează!'],
}

// ---- market vendors -------------------------------------------------------------------------------------------
export const VEND = {
  greet: ['Roșii de Moldova, nu din Turcia!', 'Castraveții-s din grădina mea. Grădina-i la Ialoveni, da\' tot a mea-i.',
    'Ce doriți, [[drăguțule|drăguță]]? Totul proaspăt, de azi-dimineață. Sau de ieri. Proaspăt.'],
  buy: 'Poftim, [[băiete|drăguță]]. Cântarul e cinstit, zău.',
  babDiscount: 'Tu ești [[ăla|aia]] care le ajută pe bunici? Pentru tine, cinci lei. Și-un castravete din partea casei.',
  haggleOk: 'Pentru tine, cinci lei. Da\' să nu zici la nimeni, că mă mănâncă vecinele de tarabă.',
  haggleOkBadanta: 'Of, cu dumneata nu mă pot tocmi, se vede că ai fost în Italia. Cinci lei, și gata.',
  haggleNo: 'Mai ieftin? Mai ieftin e în Turcia. Du-te acolo.',
  gossip: ['Prețurile nu le fac eu, maică. Le face benzina, dolarul și vremea.', 'Cică vine controlul. Controlul vine în fiecare zi, ia o pungă de roșii și pleacă.',
    'Castraveții-s din grădina mea. Grădina-i la Ialoveni, da\' tot a mea-i.'],
  thief: 'Hoțul! Mi-o luat un măr! Prindeți-[[l pe ăla cu trei dungi|o pe aia cu geantă de firmă]]!',
}

// ---- old men playing cards in the park ---------------------------------------------------------------------------
export const CARDS = {
  greet: ['Șșș, că Vasile numără cărțile. Și banii mei.', 'Stai, că dăm cărțile. Joci?', 'Pe vremea lui Brejnev jucam pe mașini. Acu\' pe douăzeci de lei.'],
  win: 'Ia uite, începătorul! Norocul prostului, maică. Mai stai o tură?',
  lose: 'Mersi pentru douăzeci de lei. Mai vino. Neapărat.',
  chat: ['Asul de treflă e al meu din \'82. L-am câștigat de la un colonel.', 'Vasile trișează din \'91. Da\' îl iertăm, că-i singurul cu masă.'],
}

// ---- the wedding photo shoot at the Arc --------------------------------------------------------------------------
export const WED = {
  greet: ['Frate, azi e ziua noastră! Ai venit la nuntă?', 'Mai zâmbim o dată! A, tu nu ești fotograful.'],
  toast: 'Mersi! Ia un pahar de la nașul. Și un plic, nu te supăra. Adică dă-ne un plic. Glumesc! Poftim.',
  toastAgain: 'Mersi, mersi! Al doilea pahar e cu plic, să știi.',
  photo: 'Numa\' dacă ne-o trimiți pe Odnoklassniki! Zâmbiți!',
}

// ---- your crew -------------------------------------------------------------------------------------------------------
export const CREW = {
  greet: ['Ce-i, [[bratan|tanti]]? Pe cine batem?', 'Zi, [[bratan|tanti]]. Eu sunt aici.', 'Unde mergem? Numa\' nu la muncă.'],
  idle: ['Unde mergem, [[bratan|tanti]]?', 'Eu stau de pază.', 'Ai o siga? Glumesc.', 'Frumos cartier. Da\' al nostru-i mai frumos.'],
  fight: ['Pe cine batem?', 'Lasă-l pe mine!', 'Pacani, la treabă!', 'Ai greșit omul, fraere!'],
  won: ['Așa-i trebuie!', 'Normalno lucrat.', 'Cu noi nu te pui!'],
  ride: ['Mai tare, [[bratan|tanti]]! Da\' nu în groapă!', 'Pune ceva de-al nostru la radio.', 'Eu la volan eram mai bun. Da\' n-am permis.',
    'Uite, acolo-i fosta mea. Nu te uita!', 'Oprește la chioșc, că mi-i foame.'],
  caught: ['[[Bratan|Tanti]], alergi ca la Olimpiadă!', 'Stai, că n-am adidași de-ăștia!'],
  wait: 'Normalno. Stau aici. Nu mă mișc. Poate doar după semințe.',
  come: 'Davai, vin!',
  home: 'Normalno. Dacă mai trebuie, știi unde stăm.',
  sarmale: 'Gata, mă duc acasă. Mama o făcut sarmale și nu așteaptă pe nimeni.',
  cops: 'Gaborii! [[Bratan|Tanti]], eu nu te cunosc. Nici n-am fost aici.',
  baba: 'Pe babe nu le batem, [[bratan|tanti]]. Asta-i regula. Singura.',
  snitch: 'Ai vorbit cu gaborii despre noi?! Gata, [[bratan|tanti]]. Nu te mai cunosc.',
  mission: '[[Bratan|Tanti]], ai treabă serioasă. Te aștept în curte.',
}

// ---- everybody else on the street ----------------------------------------------------------------------------------------
// two people stop and chat on the pavement
export const PAIRS = [
  ['Ai auzit? Iar s-o scumpit gazul.', 'Lasă, că vine iarna și se ieftinește. Glumesc.'],
  ['Și-a luat Lexus la credit, da\' stă la mama.', 'Normal. Mașina-i pentru oameni, casa-i pentru mama.'],
  ['Ai fost la Piața Centrală?', 'Am fost. Am ieșit fără bani și cu trei kile de semințe.'],
  ['Fiu-miu vine de Crăciun din Italia.', 'Al meu vine de Paști. Din Anglia. Cu autobuzul, două zile.'],
  ['Cum e la serviciu?', 'Serviciul e bine. Salariul e rău.'],
  ['Ai votat?', 'Am votat. Și acum aștept să vină drumul.'],
  ['Rutiera 125 iar n-o oprit.', 'Oprește. Da\' numa\' pentru cine știe unde.'],
  ['Am văzut-o pe Lenuța cu unul nou.', 'Cu care? Cu ăla cu BMW-ul fără numere?'],
]
// people who stop to film a fight on their phone
export const FILM = ['Filmez! Asta merge pe TikTok!', 'Mamă, ce bătaie! Dați like!', 'Live pe Facebook, oameni buni!', 'Asta-i mai tare ca la televizor!']
