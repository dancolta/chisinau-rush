import { sosire, paine, jiguli, taxi, eban } from './missions/cap1.js'
import { cursa, borea, profetul, sergentul } from './missions/cap2.js'
import { beciul, rapirea } from './missions/cap3.js'
import { mitingul, cortegiul, alegeri } from './missions/cap4.js'
import { TAXI_SHIFT, STREET_RACE, PIZZA } from './activities.js'

// The whole story, in order. Activities are repeatable side jobs run through the same mission runner
// (the random street events are in src/side/events).
export const MISSIONS = [
  sosire, paine, jiguli, taxi, eban,
  cursa, borea, profetul, sergentul,
  beciul, rapirea,
  mitingul, cortegiul, alegeri,
  TAXI_SHIFT, STREET_RACE, PIZZA,
]
