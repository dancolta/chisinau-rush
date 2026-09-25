// Everything people say on the street when you walk up and talk to them, plus the barks of the
// crowd around you. [[a|b]] is picked by the hero's gender (a: him, b: her); {place}, {country}
// and {name} are filled in when the line is said.

export const NAMES = {
  gopnik: ['Jora', 'Serioga', 'Dimon', 'Colea', 'Tolik', 'Slavic', 'Vadik', 'Maxim', 'Andriușa', 'Stas', 'Genea', 'Edik', 'Sanea', 'Vova Mic', 'Igoriok', 'Rusik'],
  babushka: ['Tanti Maria', 'Baba Nina', 'Tanti Vera', 'Tanti Lida', 'Baba Frosea', 'Tanti Galea', 'Tanti Raia', 'Baba Anica'],
  man: ['Ion', 'Vasile', 'Petru', 'Andrei', 'Sergiu', 'Mihai', 'Dorin', 'Valeriu', 'Nicolae', 'Grigore'],
  woman: ['Ana', 'Maria', 'Elena', 'Natalia', 'Olga', 'Tatiana', 'Doina', 'Svetlana', 'Lenuța', 'Aurica'],
  cop: ['Sergentul Moraru', 'Plutonierul Cebotari', 'Sergentul Rusu', 'Locotenentul Ciobanu', 'Sergentul Lupu'],
  vendor: ['Tanti Ludmila', 'Doamna Valentina', 'Tanti Zoia', 'Tanti Dusea'],
  oldman: ['Moș Vasile', 'Nea Toma', 'Moș Ilie', 'Nea Fiodor'],
}

export const ROLES = {
  gopnik: 'Gopnic de cartier',
  babushka: 'Pensionară. Știe tot.',
  civilian: 'Trecător',
  cop: 'Poliția Chișinău, patrula',
  vendor: 'Piața Centrală',
  cards: 'Campion la „Durak" din 1982',
  wedding: 'La nuntă',
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
  // the shakedown when they don't know you
  shake: ['[[Bratan|Tanti]], stai o secundă. Împrumută-ne zece lei până joi. Care joi, vedem.', 'Stai, stai. Ai trecut prin curtea noastră. Trecerea costă zece lei. Taxă de drum.'],
  shakePaid: ['Normalno. Vezi că nu-i greu? Mergi sănătos.', 'Om cu înțelegere. Poți trece. Azi.'],
  shakeTalked: ['Bine, bine. Data viitoare. Ai noroc că-s bine dispus.', 'N-ai? Nici noi. Hai, mergi.'],
  shakeFight: ['N-ai? Acuș\' găsim, pacani!', 'Asta nu-i răspuns, [[bratan|tanti]].'],
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

// ---- patrol cops --------------------------------------------------------------------------------------------
export const COP = {
  greet: ['Circulați, cetățene. Sau vorbiți. Da\' repede.', 'Documentele… Glumesc. Ce vrei?', 'Radarul nostru e din 2003. Prinde doar troleibuze, și alea stau.'],
  chat: ['Totul e sub control. Controlul e în mașină, că afară plouă.', 'Liniștit. Ultima infracțiune gravă: cineva o parcat pe trotuar. Era a primarului, deci n-o fost.',
    'Radarul nostru e din 2003. Prinde doar troleibuze, și alea stau.'],
  coffee: 'Cafea? În timpul serviciului nu. Da\' serviciul se termină chiar acu\'.',
  coffeeAgain: 'Am băut deja o cafea de la tine. A doua-i mită. Prima era prietenie.',
  snitch: ['Gopnicii? Îi știm. Și ei ne știu. Trăim în bună înțelegere.', 'Mulțumim pentru informație. O punem în sertar. Sertarul e plin, da\' o punem.'],
  insult: 'Cum m-ai făcut?! Documentele! Și nu-s „gabor", îs sergent major!',
  bump: ['Atenție, cetățene!', 'Mai încet, că te trec în raport.'],
}

// ---- market vendors -------------------------------------------------------------------------------------------
export const VEND = {
  greet: ['Roșii de Moldova, nu din Turcia!', 'Castraveții-s din grădina mea. Grădina-i la Ialoveni, da\' tot a mea-i.',
    'Ce doriți, [[drăguțule|drăguță]]? Totul proaspăt, de azi-dimineață. Sau de ieri. Proaspăt.'],
  buy: 'Poftim, [[băiete|drăguță]]. Cântarul e cinstit, zău.',
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
