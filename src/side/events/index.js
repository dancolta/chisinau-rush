import { TROLEIBUZ } from './troleibuz.js'
import { NUNTA } from './nunta.js'
import { PORUMBEL } from './porumbel.js'
import { RUTIERA } from './rutiera.js'
import { PARCARE } from './parcare.js'
import { LADA } from './lada.js'
import { SEMINTE } from './seminte.js'
import { BUNICA } from './bunica.js'
import { HOT } from './hot.js'

// Every random street event. A happening:
//   id, title, icon (minimap + marker), who + viber (the neighbours' group chat announcing it),
//   when(g): can it happen now; where(g, force): a spot near the player (force: dev/tests, closer);
//   engage: it starts once you walk or drive this close (until then it's an offer on the map);
//   ready(g): extra condition to start (on foot…); offer(g, spot) -> cleanup, offerTick(g, spot, dt)
//   while it waits; weight (default 1);
//   script(m, spot): the event itself, an activity mission (src/story/Story.js MissionContext).
export const HAPPENINGS = [TROLEIBUZ, NUNTA, PORUMBEL, RUTIERA, PARCARE, LADA, SEMINTE, { ...BUNICA, weight: 0.7 }, { ...HOT, weight: 0.7 }]
