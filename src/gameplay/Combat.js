import { WEAPONS, WEAPON_ORDER } from '../data/weapons.js'
import { angleDiff } from '../entities/Character.js'

const POW = ['BUF!', 'PAC!', 'ȚAC!', 'BANG!', 'POC!', 'ZDRANG!']
const WET = ['M-ai udat!', 'Ce faci, măi?! Am haine de la Milano!', 'Apă?! Pe bune?!', 'Ești normal?!', 'Mamă, m-o udat un nebun!']

// Melee combat: aiming, hit resolution, NPC attacks, getting run over.
export class Combat {
  constructor(game) {
    this.game = game
  }

  targets() {
    const g = this.game
    const out = []
    if (g.peds) out.push(...g.peds.list)
    if (g.ambient) out.push(...g.ambient.npcs)
    if (g.police) out.push(...g.police.officers)
    if (g.story?.npcs) out.push(...g.story.npcs.filter((n) => n.hittable && !n.riding))
    return out
  }

  // soft lock-on: the best target roughly where you're pushing (or facing), close ones and the
  // ones already fighting you first
  aimTarget(p) {
    const g = this.game
    let dir = p.char.heading
    const m = g.input.move()
    if (!p.steering && (m.x || m.y) && g.cameraRig) {
      const yaw = g.cameraRig.yaw
      dir = Math.atan2(Math.sin(yaw) * m.y - Math.cos(yaw) * m.x, Math.cos(yaw) * m.y + Math.sin(yaw) * m.x)
    }
    let best = null, bs = 1e9
    // a water pistol reaches further than fists: lock on at its range
    const maxD = Math.max(4, (WEAPONS[p.weapon]?.range || 0) + 0.5)
    for (const t of this.targets()) {
      if (t.char.ko || t.state === 'knocked' || t.ally) continue
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, d = Math.hypot(dx, dz)
      if (d > maxD || Math.abs(t.pos.y - p.pos.y) > 1.6) continue
      const da = Math.abs(angleDiff(dir, Math.atan2(dx, dz)))
      if (da > 1.3) continue
      const score = d + da * 2.4 + (t.hostile ? -2 : 0)
      if (score < bs) { bs = score; best = t }
    }
    return best
  }

  aimYaw(p) {
    const t = this.aimTarget(p)
    return t ? Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z) : p.char.heading
  }

  strike(p, w) {
    const g = this.game
    const yaw = p.aimYaw ?? p.char.heading
    const fx = Math.sin(yaw), fz = Math.cos(yaw)
    const reach = w.range + 0.45
    const halfArc = (w.arc ?? 1.2) / 2 + 0.25
    let hits = 0
    for (const t of this.targets()) {
      if (t.state === 'knocked') continue
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z, d = Math.hypot(dx, dz)
      if (d > reach || Math.abs(t.pos.y - p.pos.y) > 1.6) continue
      const a = Math.abs(angleDiff(yaw, Math.atan2(dx, dz)))
      if (a > halfArc && d > 0.9) continue
      const heavy = w.heavy
      const mul = (g.progress?.dmgMul || 1) * (heavy ? 1.5 : 1)
      const knock = w.knock * (heavy ? 1.8 : 1)
      t.takeHit(w.dmg * mul, p.pos.x, p.pos.z, knock, p, { stun: w.stun })
      if (w.water && !t.char.ko && Math.random() < 0.45) t.say?.(WET[Math.floor(Math.random() * WET.length)], 2.2)
      hits++
      if (t.state === 'knocked' && t.hp <= 0) { g.progress.stats.ko++; g.events.emit('npc:ko', t) }
      if (!t.noCrime) g.events.emit('crime', { type: t.personality === 'cop' ? 'assault_cop' : 'assault', x: t.pos.x, z: t.pos.z, severity: t.personality === 'cop' ? 3 : w.heat ? 2 : 1, victim: t })
    }
    // props in the swing
    let propHit = false
    if (g.world?.dyn) for (const it of g.world.dyn.items) {
      const tp = it.body.translation()
      const dx = tp.x - p.pos.x, dz = tp.z - p.pos.z, d = Math.hypot(dx, dz)
      if (d > reach + 0.3) continue
      if (Math.abs(angleDiff(yaw, Math.atan2(dx, dz))) > halfArc + 0.3) continue
      const imp = w.knock * 18 * (it.type === 'dumpster' ? 4 : 1)
      it.body.applyImpulse({ x: fx * imp, y: imp * 0.35, z: fz * imp }, true)
      propHit = true
      if (it.type === 'watermelon') { g.fx?.splat(tp.x, tp.y, tp.z); g.audio?.sfx('splat', { at: tp }) }
    }
    if ((hits || propHit) && !w.water) {
      const heavy = w.heavy || w.key !== 'fist'
      g.audio?.sfx(w.sfx || (w.key === 'sticla' ? 'glass' : heavy ? 'punch_heavy' : 'punch'), { at: p.pos, pitch: 0.9 + Math.random() * 0.25 })
      g.cameraRig?.shake(heavy ? 0.5 : 0.33)
      g.hitstop?.(heavy ? 70 : 45)
      if (hits && (w.pow || Math.random() < 0.55)) g.ui?.pow(p.pos.x + fx * 1.1, p.pos.y + 1.5, p.pos.z + fz * 1.1, w.pow || POW[Math.floor(Math.random() * POW.length)])
    }
    // the water pistol: a jet of water, a splash where it lands
    if (w.water) {
      for (let i = 0; i < 16; i++) {
        const s = 9 + Math.random() * 5, sp = (Math.random() - 0.5) * 0.12
        g.fx?.soft.emit(p.pos.x + fx * 0.5, p.pos.y + 1.3, p.pos.z + fz * 0.5, { vx: Math.sin(yaw + sp) * s, vy: 1.2 + Math.random(), vz: Math.cos(yaw + sp) * s, life: 0.55, size: 0.09, grow: 0.8, alpha: 0.75, color: [0.62, 0.8, 1], drag: 0.6 })
      }
      g.audio?.sfx('spray', { at: p.pos, pitch: 1.5, vol: 0.6 })
      if (hits) g.audio?.sfx('splat', { at: p.pos, vol: 0.5, pitch: 1.3 })
    }
    if (w.key === 'spray' || w.key === 'suflanta') {
      for (let i = 0; i < 18; i++) {
        const s = 3 + Math.random() * 5, sp = (Math.random() - 0.5) * 0.5
        const vx = Math.sin(yaw + sp) * s, vz = Math.cos(yaw + sp) * s
        if (w.key === 'spray') g.fx?.soft.emit(p.pos.x + fx * 0.6, p.pos.y + 1.35, p.pos.z + fz * 0.6, { vx, vy: 0.3, vz, life: 0.6, size: 0.3, grow: 1.4, alpha: 0.4, color: [1, 0.55, 0.45], drag: 2.5 })
        else g.fx?.soft.emit(p.pos.x + fx * 0.8, p.pos.y + 0.9, p.pos.z + fz * 0.8, { vx: vx * 1.6, vy: 0.4, vz: vz * 1.6, life: 0.7, size: 0.2, grow: 0.6, alpha: 0.6, color: [0.65, 0.55, 0.3], drag: 1.2, spin: 8 })
      }
      g.audio?.sfx(w.key === 'spray' ? 'spray' : 'blower', { at: p.pos })
    }
    return hits
  }

  // an NPC's punch landing (or not) on its target
  npcStrike(npc, target) {
    const g = this.game
    if (!target || npc.char.ko) return
    const dx = target.pos.x - npc.pos.x, dz = target.pos.z - npc.pos.z, d = Math.hypot(dx, dz)
    if (d > 1.6) return
    const a = Math.abs(angleDiff(npc.char.heading, Math.atan2(dx, dz)))
    if (a > 1.1) return
    const dmg = npc.dmg ?? (npc.personality === 'cop' ? 9 : npc.personality === 'babushka' ? 4 : 7)
    if (target === g.player) {
      if (target.vehicle || target.char.ko) return
      g.progress.hurt(dmg)
      target.char.anim.play('hit', { side: Math.random() < 0.5 ? 1 : -1 })
      target.hitStun = 0.18
      target.vel.x += (dx / (d || 1)) * 3; target.vel.z += (dz / (d || 1)) * 3
      g.cameraRig?.shake(0.25)
      g.ui?.damageFlash()
      g.fx?.hit(target.pos.x, target.pos.y + 1.4, target.pos.z)
      g.audio?.sfx(npc.personality === 'babushka' ? 'hit_body' : 'punch', { at: target.pos })
    } else if (target.takeHit) {
      target.takeHit(dmg, npc.pos.x, npc.pos.z, 3, npc)
      g.audio?.sfx('punch', { at: target.pos })
    }
  }

  // a car hit the player on foot
  playerRunOver(v, kx, kz, speed) {
    const g = this.game, p = g.player
    if (p.char.ko) return
    g.progress.hurt(Math.min(60, speed * 3))
    p.char.ko = true
    p.char.anim.play('knockdown')
    // back up on game time (pausing pauses it); control returns when the get-up has played
    p.bailT = 2
    p.hitStun = 2.8
    p.vel.x = kx; p.vel.z = kz; p.vy = 4
    g.cameraRig?.shake(0.6)
    g.ui?.damageFlash(0.8)
    g.audio?.sfx('hit_body', { vol: 1 })
  }

  cycleWeapon(p) {
    const g = this.game, pr = g.progress
    // your fists and what you carry; the rest waits in the chest at home
    const owned = WEAPON_ORDER.filter((k) => k === 'fist' || (pr.carry || []).includes(k))
    if (owned.length < 2) { g.ui?.notify(pr.weapons.length > 1 ? 'Armele-s acasă, în lada de sub divan.' : 'N-ai altă armă încă. Borea Țigan vinde „unelte".'); return }
    const i = owned.indexOf(pr.weapon)
    pr.weapon = owned[(i + 1) % owned.length]
    p.setWeapon(pr.weapon)
    g.ui?.notify(`${WEAPONS[pr.weapon].icon} ${WEAPONS[pr.weapon].name}`, 1.4)
    g.audio?.sfx('toggle', { bus: 'ui' })
  }
}
