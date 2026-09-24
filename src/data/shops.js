// What the kiosks and shops sell. food: 0..1 hunger refill, hp: health.
const loto = async (g) => {
  const r = Math.random()
  const win = r < 0.02 ? 1000 : r < 0.1 ? 100 : r < 0.3 ? 20 : 0
  if (win) { g.progress.addLei(win, win >= 1000 ? 'JACKPOT! Toată curtea află până diseară.' : 'Bilet câștigător!'); g.audio?.sting('levelup') }
  else g.ui.notify('Bilet necâștigător. „Data viitoare, sigur", zice vânzătoarea.', 3.2, 'red')
}

export const KIOSK_MENU = {
  'ȘAURMA': { seller: 'Șaurmarul', greet: 'Mare ori mică? Cu tot? Ceapă pun, nu întreb.', items: [{ name: 'Șaurma mare, cu tot', price: 45, food: 0.55, hp: 30 }, { name: 'Șaurma mică', price: 30, food: 0.35, hp: 18 }, { name: 'Hot-dog „bulgăresc"', price: 22, food: 0.25, hp: 10 }] },
  'PLĂCINTE': { seller: 'Plăcintăreasa', greet: 'Calde, maică, acu-s scoase. Cu ce vrei?', items: [{ name: 'Plăcintă cu brânză', price: 15, food: 0.3, hp: 15 }, { name: 'Plăcintă cu varză', price: 12, food: 0.25, hp: 12 }, { name: 'Plăcintă cu vișine', price: 15, food: 0.25, hp: 12, say: 'Dulce. Ca vorbele primarului.' }] },
  'COVRIGI': { seller: 'Vânzătorul de covrigi', greet: 'Covrigi calzi! Cu susan, cu mac, cu nimic.', items: [{ name: 'Covrig cu susan', price: 6, food: 0.12, hp: 5 }, { name: 'Pungă de covrigei', price: 12, food: 0.2, hp: 8 }] },
  'CVAS': { seller: 'Tanti de la butoi', greet: 'Cvas la halbă! Mare ori mică?', items: [{ name: 'Halbă de cvas', price: 5, food: 0.1, hp: 12, stamina: true }, { name: 'Halbă mare', price: 8, food: 0.15, hp: 18, stamina: true }] },
  'CAFEA': { seller: 'Barista', greet: 'Cappuccino, espresso sau „cafea la nisip"?', items: [{ name: 'Espresso (energie!)', price: 15, food: 0.05, stamina: true, hp: 5 }, { name: 'Cappuccino', price: 22, food: 0.1, stamina: true, hp: 8 }] },
  'PRESA': { seller: 'Tanti de la presă', greet: 'Ziare, reviste, cartele. Ce-ți trebuie?', items: [{ name: 'Ziarul de azi', price: 5, say: 'Pe prima pagină: „Primarul inaugurează o groapă". Nimic nou.' }, { name: 'Cartelă Orange', price: 30, say: 'Acum ai minute. Nu ai cui să suni.' }] },
  'FLORI': { seller: 'Florăreasa', greet: 'Număr impar, că-i de bucurie! Cui îi duci?', items: [{ name: 'Șapte garoafe', price: 35, say: 'Ai flori. Nu știi pentru cine, dar ai.', action: (g) => { g.progress.flags.flori = true } }] },
  'LOTO': { seller: 'Loteria Națională', greet: 'Bilete! Azi e ziua ta, sigur!', items: [{ name: 'Bilet loz în plic', price: 10, action: loto }, { name: 'Trei bilete', price: 28, action: async (g) => { await loto(g); await loto(g); await loto(g) } }] },
  'SCHIMB VALUTAR': { seller: 'Schimbătorul', greet: 'Euro, dolar, ruble? Cel mai bun curs din cartier, bratan.', items: [{ name: 'Întreabă de curs', price: 0, say: '„Cursu\' e bun, bratu. Pentru mine."' }] },
  'SEMINȚE': { seller: 'Vânzătorul de semințe', greet: 'Semechki, prăjite azi-dimineață. Paharul cinci lei.', items: [{ name: 'Pahar de semințe', price: 5, food: 0.08, hp: 3, say: 'Coji pe jos, ca tot omul. Tradiția.' }] },
}

export const SHOP_MENU = {
  LINELLA: { seller: 'Vânzătoarea de la Linella', greet: 'Pachet luați? Card ori cash? Mai iute, că-i coadă.', items: [{ name: 'Pâine + lapte + brânză', price: 25, food: 0.45, hp: 20 }, { name: 'Salam „Doctorskaia"', price: 35, food: 0.4, hp: 18 }, { name: 'Sticlă de apă', price: 8, food: 0.05, hp: 8, stamina: true }] },
  "ANDY'S PIZZA": { seller: "Ospătar la Andy's", greet: 'Bună ziua! Pizza, paste ori meniul copilăriei?', items: [{ name: 'Pizza mare', price: 65, food: 0.8, hp: 45 }, { name: 'Paste carbonara', price: 45, food: 0.5, hp: 30 }] },
  'LA PLĂCINTE': { seller: 'Ospătar la La Plăcinte', greet: 'Poftiți! Zeamă, mămăligă, plăcinte?', items: [{ name: 'Zeamă de găină', price: 35, food: 0.45, hp: 35 }, { name: 'Mămăligă cu brânză și smântână', price: 55, food: 0.75, hp: 45 }, { name: 'Plăcinte asortate', price: 30, food: 0.35, hp: 20 }] },
  'FARMACIE': { seller: 'Farmacista', greet: 'Pentru ce doriți? Rețetă aveți?', items: [{ name: 'Trusă de prim ajutor', price: 60, hp: 60 }, { name: 'Pastile „pentru nervi"', price: 25, hp: 20, say: 'Ți-ai liniștit nervii. Până la prima groapă.' }] },
  'NR. 1': { seller: 'Vânzătorul de la Nr. 1', greet: 'Non-stop, șefu. Ce-ți trebuie?', items: [{ name: 'Sandviș', price: 20, food: 0.3, hp: 12 }, { name: 'Energizant', price: 18, stamina: true, hp: 5 }] },
  FRANZELUȚA: { seller: 'Brutăreasa', greet: 'Pâine caldă! Franzelă, chiflă, cozonac?', items: [{ name: 'Franzelă caldă', price: 8, food: 0.25, hp: 10 }, { name: 'Cozonac', price: 30, food: 0.4, hp: 15 }] },
  'TUCANO COFFEE': { seller: 'Barista hipster', greet: 'Flat white? Cold brew? Ceva pe lapte de ovăz?', items: [{ name: 'Flat white', price: 35, stamina: true, hp: 8, food: 0.05 }] },
  GUSTOK: { seller: 'Barista', greet: 'Cafea și prăjituri. Ce vă dau?', items: [{ name: 'Cafea + ecler', price: 30, food: 0.2, hp: 12, stamina: true }] },
  DAVIDAN: { seller: 'Cofetăreasa', greet: 'Kürtos cald, abia scos. Cu scorțișoară?', items: [{ name: 'Kürtos cu scorțișoară', price: 28, food: 0.3, hp: 15 }] },
  'CAFENEA': { seller: 'Barmanul', greet: 'Cafea? Ceva mai tare? Nu întreb.', items: [{ name: 'Cafea turcească', price: 15, stamina: true, hp: 6 }] },
  'BERE LA HALBĂ': { seller: 'Barmanul', greet: 'Halbă? Cu raci? Fără? Ca omul.', items: [{ name: 'Halbă de bere (nu la volan!)', price: 20, hp: 10, food: 0.1, say: 'Lumea pare mai frumoasă. Nu conduce, bratu.' }] },
}
