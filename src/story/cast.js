import { CAST } from '../data/outfits.js'

// Who talks in the story (dialogue name plates + portraits + voice blips)
const sp = (id, name, role, spec, voice) => ({ id, name, role, spec: CAST[spec], voice })
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
}

const at = (place, dx = 0, dz = 0, ry = 0) => (P) => ({ x: P[place].x + dx, z: P[place].z + dz, ry })

// Persistent story characters: where they hang out and when they're around.
// after: mission id that must be done; until: gone once this mission is done.
export const HOMES = {
  zina: {
    spec: 'zina', pos: at('banca_zina', 0, -0.35, Math.PI), anim: 'sit', talk: true, blip: 'Tanti Zina',
    chat: (g, s) => s.isDone('mitingul') ? ['Primarul nostru! Io știam, maică. De mic erai cu capu\' pe umeri.', 'Amu vezi să nu vorbești și tu la telefon în rusă, că te pârăsc.']
      : s.isDone('rapirea') ? ['Maică, ce frică am tras în circul ăla. Da\' tu ai venit. Ca un erou din filmele cu Van Damme.']
        : s.isDone('eban') ? ['Ai văzut, maică? Iar vorbea în rusă. Io-s bătrână, da\' nu surdă.', 'Gopnicii din colț văd tot ce intră și iese din curte. Vorbește cu Vitea.']
          : ['Pâinea de la Linella e mai bună ca aia din Italia, să știi.', 'Uite-o pe asta de la etajul trei, iar și-a cumpărat blană. Din pensie, zice. Ha.'],
  },
  vitea: {
    spec: 'gopnik1', pos: at('gopnici_curte', 0, 0, -0.6), anim: 'squat', talk: true, blip: 'Vitea',
    chat: (g, s) => s.isDone('cursa') ? ['Jostko, bratan. Dacă vrei încă o cursă, zi. Pentru bani, normalno.'] : ['Șo te zgâiești, bratan? Ai o siga?', 'Noi stăm aici. Vedem tot. Da\' nu zicem nimic la nimeni. Ca la bancă.'],
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
    chat: () => ['Și aiurești wai, șii cu tine?! Ai să mă arăți la televizor?', 'Folia de pe cap nu-i modă. E protecție. De la 5G și de la soacră.'],
  },
  caldare: {
    spec: 'caldare', pos: at('arc', -40, -10, Math.PI), talk: true, blip: 'Sergent Căldare', after: 'jiguli',
    chat: (g, s) => s.isDone('sergentul') ? ['Io n-am văzut nimic. Da\' dacă vezi ceva, zi-mi. Între noi.'] : ['Circulați, circulați. Nu-i nimic de văzut. Niciodată nu-i nimic de văzut.'],
  },
  lilia: {
    spec: 'jurnalista', pos: at('pman', 14, 10, -0.4), anim: 'phone', talk: true, blip: 'Lilia (jurnalista)', after: 'eban',
    chat: () => ['Fiecare dovadă contează. Nu-ți fie frică, presa-i cu tine. Până ne închid.'],
  },
  nelu: {
    spec: 'gunoier', pos: (P) => ({ x: -68.2, z: -64, ry: Math.PI / 2 }), talk: true, blip: 'Nelu Gunoierul', after: 'sergentul',
    chat: () => ['Eu mătur. Ei murdăresc. Așa-i contractul.'],
  },
}
