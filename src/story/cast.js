import { CAST } from '../data/outfits.js'

// Who talks in the story (dialogue name plates + portraits + voice blips)
const sp = (id, name, role, spec, voice) => ({ id, name, role, spec: typeof spec === 'string' ? CAST[spec] : spec, voice })

// people who only ring (or ask for a favour): their looks, for the portrait on the phone
export const LOOKS = {
  mama: { ...CAST.zina, top: { style: 'coat', color: 0x7a5a3a, lapel: 0x5a3a2a }, hat: { style: 'basma', color: 0x2a4a8a, dots: 0xf2e6c8 }, hold: undefined },
  vasile: { ...CAST.taxist, top: { style: 'jacket', color: 0x3a4a3a, shirt: 0xd9c9a8 }, hat: { style: 'kepka', color: 0x3a3a3a }, mustache: 0x9a9080, hair: { style: 'short', color: 0x9a9080 }, belly: 0.8 },
  maria: { ...CAST.zina, top: { style: 'coat', color: 0x3a5a7a, lapel: 0x2a2a3a }, hat: { style: 'basma', color: 0x2a6a3a, dots: 0xf2e6c8 } },
  nasul: { ...CAST.deputat, top: { style: 'suit', color: 0x3a2a1a, shirt: 0xf2f2f2, tie: 0xb0181e }, bottom: { color: 0x3a2a1a }, glasses: false },
  mireasa: { ...CAST.vanzatoare, top: { style: 'shirt', color: 0xfbfaf4 }, bottom: { style: 'dress', color: 0xfbfaf4, long: true }, hair: { style: 'bun', color: 0x5a3a22 }, stockings: 0xf2e6da, shoes: 0xf2f2f2 },
  ecaterina: { ...CAST.zina, top: { style: 'coat', color: 0x4a5a3a, lapel: 0x3a4a2a }, hat: { style: 'basma', color: 0x6a3a8a, dots: 0xf2e6c8 } },
  ghenadie: { ...CAST.ionel, top: { style: 'jacket', color: 0x33363e, shirt: 0x9a9aa0 }, hat: { style: 'beanie', color: 0x7a1a1a }, mustache: 0x3a2a1c, glasses: true, bag: 0x2a2a2e, hold: 'phone' },
  brigadier: { ...CAST.stroitor, top: { style: 'vest', color: 0x4a4a4a, vest: 0xf06a1a, short: true }, hat: { style: 'hardhat', color: 0xf06a1a }, belly: 0.9, mustache: 0x5a4a3a },
  secretara: { ...CAST.vanzatoare, top: { style: 'shirt', color: 0xf2f2f2 }, bottom: { style: 'skirt', color: 0x1a1a2a }, glasses: true, hair: { style: 'bun', color: 0x3a2a1c } },
}

export const SPEAKERS = {
  zina: sp('zina', 'Tanti Zina', 'Pensionara de pe bancă', 'zina', { pitch: 1.3, type: 'old' }),
  grisa: sp('grisa', 'Nea Grișa', 'Taxist, 30 de ani pe Logan', 'taxist', { pitch: 0.9, type: 'male' }),
  vova: sp('vova', 'Vova', 'Auto Service „La Vova"', 'mecanic', { pitch: 0.95, type: 'gruff' }),
  caldare: sp('caldare', 'Sergent Căldare', 'Poliția Chișinău', 'caldare', { pitch: 0.8, type: 'gruff' }),
  eban: sp('eban', 'Ceon Eban', 'Primarul Chișinăului', 'eban', { pitch: 1.05, type: 'male' }),
  lilia: sp('lilia', 'Lilia', 'Jurnalistă, „Ochiul Chișinăului"', 'jurnalista', { pitch: 1.2, type: 'female' }),
  vitea: sp('vitea', 'Vitea', 'Șeful gopnicilor din curte', 'gopnik1', { pitch: 1.0, type: 'gruff' }),
  borea: sp('borea', 'Borea Țigan', 'Negustor. Trăiește jumate în groapă.', 'borea', { pitch: 0.85, type: 'gruff' }),
  profet: sp('profet', 'Omul din parc', 'Profet. Poartă folie pe cap.', 'profet', { pitch: 1.12, type: 'old' }),
  nelu: sp('nelu', 'Nelu Gunoierul', 'Salubrizare, tura de noapte', 'gunoier', { pitch: 0.95, type: 'male' }),
  mascat: sp('mascat', 'Mascatul', 'Omul fără nume', 'mascat', { pitch: 0.7, type: 'gruff' }),
  vanzatoare: sp('vanzatoare', 'Vânzătoarea', 'Linella', 'vanzatoare', { pitch: 1.2, type: 'female' }),
  functionar: sp('functionar', 'Funcționarul', 'Primăria, etajul doi', 'deputat', { pitch: 1.0, type: 'male' }),
  gopnik: sp('gopnik', 'Gopnicul', 'Din curte', 'gopnik2', { pitch: 0.95, type: 'gruff' }),
  vatman: sp('vatman', 'Vatmanul', 'Troleibuzul 22', 'vatman', { pitch: 0.9, type: 'male' }),
  multimea: { id: 'multimea', name: 'Mulțimea', role: 'PMAN' },
  // on the phone, and the favours
  mama: sp('mama', 'Mama', 'La Hâncești, cu roșiile', LOOKS.mama, { pitch: 1.2, type: 'female' }),
  vasile: sp('vasile', 'Unchiu\' Vasile', 'Proprietarul Jiguliului, din 1987', LOOKS.vasile, { pitch: 0.85, type: 'old' }),
  necunoscut: { id: 'necunoscut', name: 'Număr ascuns', role: '+7 ••• ••• •• ••', voice: { pitch: 0.7, type: 'gruff' } },
  maria: sp('maria', 'Tanti Maria', 'Scara 3 · 40 de kile de borcane', LOOKS.maria, { pitch: 1.35, type: 'old' }),
  nasul: sp('nasul', 'Nașul Grigore', 'Nunta lui Ionuț & Cristina', LOOKS.nasul, { pitch: 0.85, type: 'gruff' }),
  mireasa: sp('mireasa', 'Cristina', 'Mireasa. Azi, regină.', LOOKS.mireasa, { pitch: 1.25, type: 'female' }),
  tolea: sp('tolea', 'Nea Tolea', 'Vatman pe 22, de 31 de ani', 'vatman', { pitch: 0.9, type: 'male' }),
  ecaterina: sp('ecaterina', 'Doamna Ecaterina', 'Pasageră, abonament din 1994', LOOKS.ecaterina, { pitch: 1.3, type: 'old' }),
  ghenadie: sp('ghenadie', 'Ghenadie', 'Operator, „Ochiul Chișinăului"', LOOKS.ghenadie, { pitch: 1.05, type: 'male' }),
  brigadier: sp('brigadier', 'Brigadierul Asfaltescu', 'Echipa de „reparații" a Primăriei', LOOKS.brigadier, { pitch: 0.85, type: 'gruff' }),
  secretara: sp('secretara', 'Secretara', 'Primăria, anticamera', LOOKS.secretara, { pitch: 1.15, type: 'female' }),
  dispecer: { id: 'dispecer', name: 'Dispeceratul', role: 'Troleibuze · stație radio din 1979', voice: { pitch: 0.9, type: 'male' } },
}

const at = (place, dx = 0, dz = 0, ry = 0) => (P) => ({ x: P[place].x + dx, z: P[place].z + dz, ry })

// Persistent story characters: where they hang out and when they're around.
// after: mission id that must be done; until: gone once this mission is done;
// away(story): gone while it's true (Tanti Zina, between the phone call and the circus)
export const HOMES = {
  zina: {
    spec: 'zina', pos: at('banca_zina', 0, -0.35, Math.PI), anim: 'sit', talk: true, blip: 'Tanti Zina',
    away: (s) => s.isDone('beciul') && !s.isDone('rapirea'),
    chat: (g, s) => s.isDone('alegeri') ? ['[[Domnule primar|Doamnă primar]]! Groapa din fața blocului e a dumneavoastră acum. Io doar zic.', 'Și să nu vorbești la telefon în rusă, că te pârăsc. Pe tine te pârăsc primul.']
      : s.isDone('mitingul') ? ['[[Primarul nostru|Primărița noastră]]! Io știam, maică. [[De mic|De mică]] erai cu capu\' pe umeri.', 'Amu vezi să nu vorbești și tu la telefon în rusă, că te pârăsc.']
        : s.isDone('rapirea') ? ['Maică, ce frică am tras în circul ăla. Da\' tu ai venit. Ca [[un erou|o eroină]] din filmele cu Van Damme.', 'Mascații ăia m-au întrebat ce-am văzut. Le-am zis că văd prost. Ha! Io văd prin pereți.']
          : s.isDone('eban') ? ['Ai văzut, maică? Iar vorbea în rusă. Io-s bătrână, da\' nu surdă.', 'Gopnicii din colț văd tot ce intră și iese din curte. Vorbește cu Vitea.']
            : s.isDone('taxi') ? ['Zice lumea că umbli cu taxiul. Să-mi faci și mie o cursă la policlinică. Gratis, că-s pensionară.', 'Și ai grijă cu dosarele alea. Cine lasă „strict secret" într-un taxi? Numa\' primăria.']
              : ['Pâinea de la Linella e mai bună ca aia din Italia, să știi.', 'Uite-o pe asta de la etajul trei, iar și-a cumpărat blană. Din pensie, zice. Ha.'],
  },
  vitea: {
    spec: 'gopnik1', pos: at('gopnici_curte', 0, 0, -0.6), anim: 'squat', talk: true, blip: 'Vitea',
    chat: (g, s) => s.isDone('rapirea') ? ['Bratan, după circ toată Botanica știe de noi. Babele ne dau plăcinte. Mă simt ciudat. Bine, da\' ciudat.'] : s.isDone('cursa') ? ['Jostko, bratan. Dacă vrei încă o cursă, zi. Pentru bani, normalno.'] : ['Șo te zgâiești, bratan? Ai o siga?', 'Noi stăm aici. Vedem tot. Da\' nu zicem nimic la nimeni. Ca la bancă.'],
  },
  gop2: { spec: 'gopnik2', pos: at('gopnici_curte', 1.6, 0.9, -1.8), anim: 'squat', extra: true },
  gop3: { spec: 'gopnik3', pos: at('gopnici_curte', -1.4, 1.2, 0.9), anim: 'phone', extra: true },
  vova: {
    spec: 'mecanic', pos: at('mecanic', 0, 0, 0), talk: true, blip: 'Vova (service)', after: 'paine',
    chat: (g, s) => s.isDone('taxi') ? ['Mașina bate? Adu-o aici, ți-o repar. Pentru tine, preț de prieten: tot ăla.'] : ['Jiguliul lui Vasile! Ăsta-i tanc, nu mașină.'],
  },
  borea: {
    spec: 'borea', pos: at('borea', 0, 0, Math.PI * 0.8), anim: 'squat', talk: true, blip: 'Borea Țigan',
    chat: (g, s) => s.isDone('borea') ? null : ['Băi, tu pe mine a sculat? Stai, stai, nu ți-am luat nimic. Încă.', 'Io trăiesc în groapa asta de când a promis primarul că o astupă. Am și adresă poștală.'],
  },
  profet: {
    spec: 'profet', pos: at('parc_catedrala', -6, 3, Math.PI), talk: true, blip: 'Omul din parc', after: 'borea',
    chat: (g, s) => s.isDone('mitingul') ? ['Mă credeți acum? Toată piața m-a crezut. Io am plâns. Folia a rezistat.'] : ['Și aiurești wai, șii cu tine?! Ai să mă arăți la televizor?', 'Folia de pe cap nu-i modă. E protecție. De la 5G și de la soacră.'],
  },
  caldare: {
    spec: 'caldare', pos: at('arc', -40, -10, Math.PI), talk: true, blip: 'Sergent Căldare', after: 'jiguli',
    chat: (g, s) => s.isDone('sergentul') ? ['Io n-am văzut nimic. Da\' dacă vezi ceva, zi-mi. Între noi.', 'Mașina mea încă miroase a semințe de la gopnicii ăia. Le-am găsit și în torpedou. Le-am mâncat. Probe.'] : ['Circulați, circulați. Nu-i nimic de văzut. Niciodată nu-i nimic de văzut.'],
  },
  lilia: {
    spec: 'jurnalista', pos: at('pman', 14, 10, -0.4), anim: 'phone', talk: true, blip: 'Lilia (jurnalista)', after: 'eban',
    chat: (g, s) => s.isDone('mitingul') ? ['Știrea mea a avut două milioane de vizualizări. Site-ul a picat de trei ori. De data asta, de fericire.'] : ['Fiecare dovadă contează. Nu-ți fie frică, presa-i cu tine. Până ne închid.'],
  },
  nelu: {
    spec: 'gunoier', pos: (P) => ({ x: -68.2, z: -64, ry: Math.PI / 2 }), talk: true, blip: 'Nelu Gunoierul', after: 'sergentul',
    chat: () => ['Eu mătur. Ei murdăresc. Așa-i contractul.'],
  },
}
