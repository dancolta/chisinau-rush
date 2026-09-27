// Static audit of every piece of text the player reads (no browser): scans the string literals of
// src/**/*.js and the text of index.html, and checks each one on its own.
//   · markup: {y}…{/y} (b, r, g, w) pairs, [KEY] caps fmt() can't draw, markup sent where it
//     isn't drawn (NPC bubbles, banners, the overlay card: plain text)
//   · [[his|hers]] alternations and {place}-style placeholders: well formed, and never sent to the
//     screen without fill() (src/story/hero.js) or without the variable they need (NPC bubbles and
//     subtitles resolve [[…]] themselves; dialogue choices don't, even in a story say())
//   · cedilla ş ţ (Romanian takes the comma: ș ț), quotes („…" as the game writes them, «…» only
//     inside them, no “…” or English "…"), spacing, "..." for "…"
//   · English leftovers, missing diacritics where the bare word doesn't exist, â/î spelling,
//     doubled words, "undefined"/"NaN" in text or ${a?.b} with no fallback
//   · the female hero: lines said to the hero with a masculine-only address ("fraere", "Uite-l")
// Every hit is printed as file:line; exits 1 when there is any (intentional exceptions: ALLOW).
// usage: node tools/texts.mjs [--dump]   (--dump: print every text string it checked)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = new URL('..', import.meta.url).pathname
const DUMP = process.argv.includes('--dump')
// run as a script: report and exit code; imported (tools/textfit.mjs): just the corpus
const MAIN = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

// ---- intentional exceptions: [rule, file, substring of the string] ------------------------------------
const ALLOW = [
  ['gender', 'src/data/streettalk.js', 'Eban? L-am văzut la televizor'],          // about the mayor
  ['gender', 'src/data/streettalk.js', 'Hoțule! Ți-ar fi rușine!'],               // caught pickpocketing: only Marcel (male) can
  ['gender', 'src/data/streettalk.js', 'Mâna! Mâna din buzunarul meu, fraere!'],  // Marcel's lift, same
  ['gender', 'src/gameplay/StreetTalk.js', 'Mâna din buzunar, fraere!'],          // same
  ['gender', 'src/data/streettalk.js', 'Ai greșit omul, fraere!'],                // your crew, to the man they fight
  ['gender', 'src/gameplay/StreetTalk.js', 'Ce te uiți, fraere?'],                // the hero's own line, to a gopnik
  ['gender', 'src/side/events/hot.js', 'Prindeți-l!'],                            // the purse thief
  ['gender', 'src/side/events/porumbel.js', 'Hoțule! Cu pene!'],                  // the pigeon
  ['gender', 'src/story/missions/cap4.js', 'Domnule primar! Am niște întrebări'], // the hero, to Eban
  ['english', 'src/data/wardrobe.js', 'The North Fake'],                          // a parody brand
  ['typo', 'src/data/shops.js', 'Ospătar la La Plăcinte'],                        // the restaurant is called „La Plăcinte"
  ['spelling', 'src/ui/Minimap.js', 'Bîc'],                                       // the river's name, spelled so in Moldova
  ['spelling', 'src/world/Edge.js', 'Bîcul'],                                     // same
]

// ---- the JS lexer: string literals with their line and the calls they sit in ----------------------------
const KEYWORDS_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await'])
function lex(src) {
  const strings = []   // { line, text, tpl, exprs, calls, prev, next }
  const idents = []    // { name (a.b.c chain), line, calls }
  const stack = []     // open brackets: { ch, callee, start }
  const parenEnd = new Map()
  let i = 0, line = 1, last = null // last significant token { t: 'id'|'num'|'str'|'p', v }
  let chain = ''                    // identifier chain right before the current position (a.b.c)
  let assign = null                 // what the last = assigns to (x.textContent = '…')
  let key = null                    // the object key right before a value ({ sub: '…' })
  const calls = () => stack.filter((s) => s.ch === '(' && s.callee).map((s) => ({ callee: s.callee, start: s.start }))
  const nl = (s) => { for (const c of s) if (c === '\n') line++ }
  while (i < src.length) {
    const c = src[i]
    if (c === '\n') { line++; i++; continue }
    if (/\s/.test(c)) { i++; continue }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); nl(src.slice(i, e)); i = e + 2; continue }
    // strings
    if (c === "'" || c === '"') {
      const l0 = line
      let j = i + 1, out = ''
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') { const n = src[j + 1]; out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'u' ? String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16)) : n; j += n === 'u' ? 6 : 2; continue }
        out += src[j++]
      }
      const s = { line: l0, text: out, tpl: false, exprs: [], calls: calls(), inKeys: stack.map((b) => b.key).filter(Boolean), prev: last, at: i, assign: last && last.t === 'p' && ['=', '+='].includes(last.v) ? assign : null, key: last && last.t === 'p' && last.v === ':' ? key : null }
      strings.push(s)
      if (last?.str) last.str.next = { t: 'str' }
      i = j + 1; last = { t: 'str', v: out, str: s }; chain = ''
      continue
    }
    if (c === '`') {
      const l0 = line
      let j = i + 1, out = ''
      const exprs = []
      while (j < src.length && src[j] !== '`') {
        if (src[j] === '\\') { out += src[j + 1]; j += 2; continue }
        if (src[j] === '$' && src[j + 1] === '{') {
          // the embedded expression: skip to the matching brace (strings inside it are lexed on their own)
          let d = 1, k = j + 2
          while (k < src.length && d) {
            const ch = src[k]
            if (ch === '{') d++
            else if (ch === '}') d--
            else if (ch === "'" || ch === '"' || ch === '`') { const q = ch; k++; while (k < src.length && src[k] !== q) { if (src[k] === '\\') k++; k++ } }
            k++
          }
          const ex = src.slice(j + 2, k - 1)
          exprs.push(ex)
          // lex the expression for the strings in it (a ternary picking one of two lines…)
          const sub = lex(ex)
          for (const s of sub.strings) { s.line += line - 1; s.calls = [...calls(), ...s.calls]; strings.push(s) }
          out += '${…}'
          nl(src.slice(j, k)); j = k; continue
        }
        if (src[j] === '\n') line++
        out += src[j++]
      }
      const s = { line: l0, text: out, tpl: true, exprs, calls: calls(), inKeys: stack.map((b) => b.key).filter(Boolean), prev: last, at: i, assign: last && last.t === 'p' && ['=', '+='].includes(last.v) ? assign : null, key: last && last.t === 'p' && last.v === ':' ? key : null }
      strings.push(s)
      i = j + 1; last = { t: 'str', v: out, str: s }; chain = ''
      continue
    }
    // regex literal
    if (c === '/') {
      const regexOk = !last || (last.t === 'p' && !')]}'.includes(last.v)) || (last.t === 'id' && KEYWORDS_BEFORE_REGEX.has(last.v))
      if (regexOk) {
        let j = i + 1, cls = false
        while (j < src.length) { const ch = src[j]; if (ch === '\\') { j += 2; continue } if (ch === '[') cls = true; else if (ch === ']') cls = false; else if (ch === '/' && !cls) break; else if (ch === '\n') break; j++ }
        j++; while (/[a-z]/.test(src[j] || '')) j++
        i = j; last = { t: 're' }; chain = ''
        continue
      }
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i; while (j < src.length && /[\w$]/.test(src[j])) j++
      const w = src.slice(i, j)
      chain = last && last.t === 'p' && last.v === '.' && chain ? chain + '.' + w : w
      if (last && last.t === 'p' && last.v === '?.' && chain) chain = chain + '.' + w
      idents.push({ name: chain, line, calls: calls(), at: i })
      if (last?.str) last.str.next = { t: 'id', v: w }
      i = j; last = { t: 'id', v: w }
      continue
    }
    if (/[0-9]/.test(c)) { let j = i; while (j < src.length && /[\w.]/.test(src[j])) j++; i = j; last = { t: 'num' }; chain = ''; continue }
    // punctuation
    const p3 = src.slice(i, i + 3), p2 = src.slice(i, i + 2)
    const p = ['===', '!==', '...', '**=', '??=', '&&=', '||='].includes(p3) ? p3 : ['=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '**'].includes(p2) ? p2 : c
    if (last?.str) last.str.next = { t: 'p', v: p }
    if (p === '=' || p === '+=') assign = chain
    const keyBefore = key
    key = p === ':' && last && last.t === 'id' ? last.v : null
    if (p === '(' || p === '[' || p === '{') stack.push({ ch: p, callee: p === '(' && last && last.t === 'id' ? chain : null, start: i, key: last && last.t === 'p' && last.v === ':' ? keyBefore : null })
    else if (p === ')' || p === ']' || p === '}') { const o = stack.pop(); if (o && o.ch === '(') parenEnd.set(o.start, i) }
    if (p !== '.' && p !== '?.') chain = p === '(' || p === ')' ? chain : ''
    if (p === '.' || p === '?.') { /* keep the chain */ }
    i += p.length; last = { t: 'p', v: p }
  }
  return { strings, idents, parenEnd }
}

// ---- what reaches the screen how ---------------------------------------------------------------------
// calls that resolve [[his|hers]] and {vars}: fill() and the wrappers round it; in the story (and the
// street events, which run as story missions) say/talk/choose go through fill() too
const STORYISH = (f) => /^src\/(story|side\/events)\//.test(f)
function isFiller(callee, file) {
  if (/(^|\.)(fill|line)$/.test(callee)) return true
  if (STORYISH(file) && /^(m|ctx|this|s|story)\.(say|talk|choose)$/.test(callee)) return true
  if (file === 'src/story/Story.js' && /^this\.(say|talk|choose)$/.test(callee)) return true
  return false
}
// calls that put text on screen
// UI.bubble (anyone's say()) and UI.subtitle resolve [[his|hers]] on their own, not {vars}
const altFiller = (callee, file) => /(^|\.)(bubble|subtitle)$/.test(callee) || (/\.say$/.test(callee) && !(STORYISH(file) && /^(m|ctx|this|s|story)\.say$/.test(callee)) && !(file === 'src/story/Story.js' && callee === 'this.say'))
const SINK = /(^|\.)(say|talk|choose|notify|tip|objective|setObjective|subtitle|prompt|bubble|dialogue|bigMessage|missionBanner|chapter|evidence|viber|feed|overlay|help|confirm|credits|setMarker|districtBanner|pow|banner)$/
// sinks that draw plain text (textContent, or HTML without fmt): markup would show as it is
function plainSink(callee, file) {
  if (/(^|\.)(bubble|missionBanner|overlay|districtBanner|pow|setMarker)$/.test(callee)) return true
  if (/\.talk$/.test(callee)) return true // Story.talk: a subtitle, and the same text in the speaker's bubble
  if (/\.say$/.test(callee)) return !(STORYISH(file) && /^(m|ctx|this|s|story)\.say$/.test(callee)) && !(file === 'src/story/Story.js' && callee === 'this.say')
  return false
}

// ---- the files ------------------------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.js')) out.push(p)
  }
  return out
}
// (src/audio: note names and error messages, nothing the player reads)
// (src/core/Debug.js: the developer console)
const files = walk(join(ROOT, 'src')).map((p) => relative(ROOT, p)).filter((f) => !f.startsWith('src/audio/') && f !== 'src/core/Debug.js').sort()
const lexed = new Map()
for (const f of files) lexed.set(f, { src: readFileSync(join(ROOT, f), 'utf8'), ...lex(readFileSync(join(ROOT, f), 'utf8')) })

// ---- which strings are text a person reads -------------------------------------------------------------
const RO = /[ăâîșțĂÂÎȘȚşţŞŢ]/
const INLINE = 'b|i|u|s|em|strong|small|span|a|kbd|code|sup|sub|mark'
const stripTags = (s) => s.replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ').replace(new RegExp(`</?(${INLINE})(\\s[^>]*)?>`, 'gi'), '').replace(/<[^>]*>/g, '\n')
const CODE_CALLEE = /(^|\.)(Error|TypeError|querySelector|querySelectorAll|getElementById|createElement|addEventListener|removeEventListener|getItem|setItem|removeItem|add|remove|toggle|contains|sfx|play|set|sting|music|ambience|anim|getAttribute|setAttribute|setProperty|fetch|log|warn|error|import|require|match|replace|test|split|join|startsWith|endsWith|includes|indexOf|padStart|toLocaleString|Option|el|has|get|delete|emit|on|off|once|voiceStart|getContext|toDataURL|measureText)$/
function textOf(s) {
  // the visible text (tags out, ${…} in)
  const t = s.text.includes('<') && /<\/?[a-z][^>]*>/i.test(s.text) ? stripTags(s.text) : s.text
  return t
}
function isText(s, file) {
  const t = textOf(s)
  if (!/[A-Za-zĂÂÎȘȚăâîșț]{2,}/.test(t)) return false
  if (/^(https?:|\.?\/|data:|#[0-9a-f]{3,8}$)/i.test(t.trim())) return false
  if (/\.(js|css|png|jpe?g|webp|glb|gltf|mp4|webm|mp3|ogg|wav|json|svg|woff2?)\b/.test(t)) return false
  if (/^[\w$.-]+$/.test(t.trim()) && !RO.test(t)) return false          // an identifier, a class, a key
  if (/^[.#][\w-]+([\s,>.:#\[]|$)/.test(t.trim()) && !RO.test(t) && !/[!?]$/.test(t.trim())) return false // a selector
  if (s.assign && /(^|\.)(className|id|type|src|href|cssText|style\.[\w]+|dataset\.\w+|font|fillStyle|strokeStyle|textAlign|textBaseline|lineJoin|lineCap|globalCompositeOperation|preload|crossOrigin)$/.test(s.assign)) return false
  if (/\b(uniform|attribute|varying|gl_\w+|void main|precision (lowp|mediump|highp))\b/.test(t)) return false // GLSL
  const inner = s.calls.length ? s.calls[s.calls.length - 1].callee : ''
  if (CODE_CALLEE.test(inner) && !SINK.test(inner)) return false
  if (/^[a-z0-9 _:.#>*,()=\[\]"'-]+$/.test(t.trim()) && !/[.!?…]$/.test(t.trim()) && !RO.test(t) && t.trim().split(/\s+/).length <= 4) return false // css classes / selectors
  if (/[\w-]+\s*:\s*[^;{}]+;|\{\s*[\w-]+\s*:|:\s*-?\d+(\.\d+)?(px|%|vh|vw|em|s|ms|deg)\b|rgba?\(|var\(--/.test(t) && !RO.test(t)) return false // css
  return true
}

// ---- the checks --------------------------------------------------------------------------------------------
const hits = []
const hit = (rule, file, line, text, why) => {
  if (ALLOW.some(([r, f, sub]) => r === rule && f === file && text.includes(sub))) return
  hits.push({ rule, file, line, text, why })
}
const clip = (s, n = 110) => (s.length > n ? s.slice(0, n - 1) + '…' : s).replace(/\n/g, '⏎')

const KEY_RE = /^[A-Za-zĂÎȘȚÂ0-9⇧␣←→↑↓/ ]{1,9}$/ // what fmt() turns into a key cap (src/ui/UI.js)
const MARK = 'ybrgw'
function checkMarkup(t, file, line) {
  const stack = []
  const re = /\{(\/?)([a-z]+)\}/g
  let m
  while ((m = re.exec(t))) {
    const [, close, tag] = m
    if (tag.length === 1 && !MARK.includes(tag)) { if (close) hit('markup', file, line, t, `unknown tag {/${tag}}`); continue } // {n}: a placeholder
    if (tag.length !== 1) continue // {place}-style: the placeholder check
    if (!close) { if (stack.includes(tag)) hit('markup', file, line, t, `{${tag}} opened twice`); stack.push(tag) }
    else if (stack[stack.length - 1] !== tag) hit('markup', file, line, t, `{/${tag}} closes ${stack.length ? '{' + stack[stack.length - 1] + '}' : 'nothing'}`)
    else stack.pop()
  }
  if (stack.length) hit('markup', file, line, t, `{${stack.join('},{')}} never closed`)
  // [KEY] caps: a bracket fmt() won't draw as a key shows as it is
  for (const k of t.replace(/\[\[[^\]]*\]\]/g, '').matchAll(/\[([^\[\]]{1,14})\]/g)) {
    if (/\$\{/.test(k[1])) continue
    if (!KEY_RE.test(k[1])) hit('markup', file, line, t, `[${k[1]}] is not a key cap fmt() can draw`)
  }
}
function checkAlternation(t, file, line) {
  const opens = (t.match(/\[\[/g) || []).length, closes = (t.match(/\]\]/g) || []).length
  if (opens !== closes) hit('alternation', file, line, t, `[[ ×${opens} vs ]] ×${closes}`)
  for (const m of t.matchAll(/\[\[([^\]]*)\]\]/g)) {
    const parts = m[1].split('|')
    if (parts.length !== 2) hit('alternation', file, line, t, `[[${m[1]}]] needs exactly one |`)
    else if (!parts[0].trim() && !parts[1].trim()) hit('alternation', file, line, t, 'empty alternation')
  }
}
// words that don't exist without their diacritics (so a bare one is a typo, not dialect)
const NO_DIACRITIC = ['asa', 'dupa', 'inca', 'acasa', 'fara', 'cand', 'baiat', 'baiatul', 'mancare', 'esti', 'iti', 'isi', 'tau', 'politia', 'primaria', 'piata', 'sanatate', 'multumesc',
  'atat', 'maine', 'astazi', 'ramai', 'iesi', 'masina', 'masini', 'sofer', 'soferul', 'fiindca', 'niste', 'catre', 'intai', 'insa', 'totusi', 'intotdeauna', 'niciodata', 'stiu', 'stii', 'stie', 'si']
const NO_DIA_RE = new RegExp(`(^|[^\\p{L}])(${NO_DIACRITIC.join('|')})(?![\\p{L}])`, 'iu')
// English that slipped in (the game is in Romanian; brands and loanwords are fine: ALLOW)
const ENGLISH = ['the', 'and', 'you', 'your', 'with', 'press', 'loading', 'error', 'mission', 'failed', 'completed', 'level', 'todo', 'fixme', 'lorem', 'ipsum', 'click here', 'next', 'settings', 'paused', 'quit', 'save', 'saved', 'health', 'money', 'wanted', 'unlocked', 'achievement', 'reward', 'rewards', 'daily', 'streak', 'player', 'enemy', 'weapon', 'vehicle', 'speed', 'hold', 'drive', 'exit', 'talk to', 'go to', 'find', 'kill', 'this', 'that', 'is', 'not', 'for', 'from']
// (are, of, start, bonus, complete, back, enter, continue… are Romanian words or key names)
const EN_RE = new RegExp(`(^|[^\\p{L}'])(${ENGLISH.join('|')})(?![\\p{L}'])`, 'iu')
// Romanian: â inside a word, î at its start/end (and after a prefix: reîntors, neîncetat…)
const I_PREFIX = /^(re|ne|pre|dez|des|sub|supra|bine|rău|răs|răz|într|atot|auto|pro|anti|contra|semi|tele|după|arhi|ultra|extra|non)î/i
function checkWords(t, file, line) {
  const words = t.replace(/\$\{…\}/g, ' ').match(/[\p{L}'’-]+/gu) || []
  for (const w0 of words) {
    const w = w0.replace(/^['’-]+|['’-]+$/g, '')
    for (const part of w.split('-')) {
      if (!part) continue
      const inner = part.slice(1, -1)
      if (/î/i.test(inner) && !I_PREFIX.test(part) && !/^(mî|sî|cî)$/i.test(part)) hit('spelling', file, line, t, `"${part}": î inside a word is written â`)
      if (/^â/i.test(part)) hit('spelling', file, line, t, `"${part}": â at the start of a word is written î`)
    }
  }
  const nd = t.match(NO_DIA_RE)
  if (nd) hit('diacritics', file, line, t, `"${nd[2]}" lacks its diacritics`)
  const en = t.replace(/\$\{…\}/g, ' ').match(EN_RE)
  if (en) hit('english', file, line, t, `English "${en[2]}"`)
  const dbl = t.match(/(^|[^\p{L}])(\p{L}{2,})[ \t]+\2(?![\p{L}])/iu)
  if (dbl && !/^(ha|ho|hai|da|nu|bine|gata|fugi|stai|mergi|vai|of|oi|mai|pa|na|hop|hopa|uiii|uite|davai|alo|stop|ura|bravo|vin|joi|tic|tac|dă|iar|încet|mamă|repede)$/i.test(dbl[2])) hit('typo', file, line, t, `doubled word "${dbl[2]}"`)
}
const DATAISH = (f) => /^src\/(data|story\/missions|side\/events)\/|^src\/story\/(cast|hooks|activities)\.js$/.test(f)
function checkSpacing(s, t, file, line) {
  // HTML: each text node on its own (the gaps between blocks and the indentation aren't text)
  if (t !== s.text) { for (const node of t.split(/\s*\n\s*/)) if (node.trim()) checkSpacing({ ...s, text: node.trim(), prev: null, next: null, tpl: true }, node.trim(), file, line); return }
  const v = t.replace(/\$\{…\}/g, 'X')
  if (/\S {2,}\S/.test(v) && !/ {2,}[◆·]| [◆·] {2,}/.test(v) && !/[▶＋☁👤🎬⚙✕]  /u.test(v)) hit('spacing', file, line, t, 'double space')
  const sp = v.match(/[\p{L}\d)"”»] +([,;!?]|[.:…](?=[\s"”)]|$))/u)
  if (sp && !(sp[1] === '…' || (sp[1] === ':' && /\d :/.test(v)))) hit('spacing', file, line, t, `space before "${sp[1]}"`)
  const ms = v.match(/(?<!\d)[,;](?=\p{L})/u)
  if (ms) hit('spacing', file, line, t, `no space after "${ms[0].slice(-1)}"`)
  if (/\.\.\./.test(v)) hit('punctuation', file, line, t, '"..." is written "…"')
  const vv = v.replace(/…|\.\.\./g, '')
  if (/[,;:]\s*[,;:.!?]|\.{2}|[!?]\.(?!\.)/.test(vv)) {
    const m = vv.match(/[,;:]\s*[,;:.!?]|\.{2}|[!?]\.(?!\.)/)
    if (m && !/^[!?]\.$/.test(m[0]) && !/:\s*\?/.test(m[0])) hit('punctuation', file, line, t, `"${m[0]}"`)
  }
  // a whole line (not a piece glued to others with +) with a space at its start or end
  const glued = (s.prev && s.prev.t === 'p' && ['+', '?', ':', '='].includes(s.prev.v) && !(s.prev.v === ':' && DATAISH(file))) || (s.next && s.next.t === 'p' && s.next.v === '+')
  if (!glued && !s.tpl && /^\s|\s$/.test(t) && !/^\s*$/.test(t) && !/<[a-z]/i.test(s.text) && !/^ [·•◆●]|[·•◆●] $/.test(t)) hit('spacing', file, line, t, 'space at the start or end')
}
function checkQuotes(t, file, line) {
  const v = t.replace(/<[^>]*>/g, '')
  if (/“/.test(v) || (/[«»]/.test(v) && !/„[^”"]*«[^»]*»[^”"]*[”"]/.test(v))) hit('quotes', file, line, t, 'quotes: the game writes „…" («…» only inside them)')
  const open = (v.match(/„/g) || []).length, closeCurly = (v.match(/”/g) || []).length, straight = (v.match(/"/g) || []).length
  if (open !== closeCurly + straight || (open && straight && closeCurly)) hit('quotes', file, line, t, `„ ×${open}, ” ×${closeCurly}, " ×${straight}`)
  else if (!open && straight) hit('quotes', file, line, t, 'English-style "…" quotes: the game writes „…"')
}
// lines said to the hero with a masculine-only address: fine for him, wrong for her (use [[m|f]])
const MASC = new RegExp('(^|[^\\p{L}])(' + [
  // calling the hero by a masculine word
  'fraere', 'fraierule', 'cetățene', 'nebunule', 'obraznicule', 'huligane', 'hoțule', 'omule', 'domnule', 'tinere', 'băiete', 'nene', 'cumătre',
  // him, not her
  'Uite-l', 'Prindeți-l', 'L-am văzut', 'L-am pierdut', 'că-l prindem', 'Lasă-l în pace', 'Uite la el', 'la el, ',
  'ești ăla', 'erai ăla', 'Ăsta-i beat', 'Ăsta-i cu', 'Ăsta-i omul', 'Ăsta nu plătește', 'ăsta-i om', 'pe ăla care',
  'ești de-al nostru', 'de-al nostru ești', 'pe-al nostru', 'Ce bun ești', 'Ești normal', 'nu ești străin', 'Zgârcit\\.', 'Sportiv,', 'Grăbit,',
  'Nebunul!', 'un nebun', 'unul bate', 'Campionul!', 'Șeful cartierului', 'începătorul', 'cetățeanul a căzut', 'Primul care', 'Vine șefu', 'El e șefu', 'al cui ești',
].join('|') + ')(?![\\p{L}])', 'iu')
// the files whose lines are said to the hero
const GENDERED = (f) => /^src\/data\/streettalk\.js$|^src\/gameplay\/(Police|Crowd|StreetLife|Hood|Crew|StreetTalk|Director)\.js$|^src\/side\/events\/|^src\/story\//.test(f)
function checkGender(t, file, line) {
  const bare = t.replace(/\[\[[^\]]*\]\]/g, '[[]]')
  const m = bare.match(MASC)
  if (m) hit('gender', file, line, t, `"${m[2]}" said to the hero: add the female form with [[…|…]]`)
}

// ---- run the content checks on every text string -------------------------------------------------------
let checked = 0
const dump = []
// every text string with where it goes (the calls it sits in, what it's assigned to)
export const corpus = []
for (const [file, L] of lexed) {
  for (const s of L.strings) {
    if (!isText(s, file)) continue
    const t = textOf(s)
    checked++
    corpus.push({ file, line: s.line, text: t, tpl: s.tpl, html: t !== s.text, sinks: s.calls.map((c) => c.callee), assign: s.assign, key: s.key })
    if (DUMP) dump.push(`${file}:${s.line}  ${clip(t, 400)}`)
    if (/[şţŞŢ]/.test(t)) hit('cedilla', file, s.line, t, 'ş/ţ with a cedilla: Romanian takes ș/ț')
    if (/[\u0300-\u036f]/.test(t)) hit('encoding', file, s.line, t, 'combining accent (a letter built from two characters)')
    if (/[\u200b\u200c\u200d\ufeff]/.test(t)) hit('encoding', file, s.line, t, 'zero-width character')
    if (!s.tpl && /\$\{/.test(t)) hit('placeholder', file, s.line, t, '${…} in a plain string: never filled')
    if (/\b(undefined|NaN|null)\b|\[object Object\]/.test(t)) hit('undefined', file, s.line, t, 'undefined/NaN/null in the text')
    checkMarkup(t, file, s.line)
    checkAlternation(t, file, s.line)
    checkWords(t, file, s.line)
    checkSpacing(s, t, file, s.line)
    checkQuotes(t, file, s.line)
    if (GENDERED(file) && !/(^|\.)gen$/.test(s.calls.at(-1)?.callee || '')) checkGender(t, file, s.line) // gen(g, him, her) picks already
    // where it goes: fill() for [[…]] / {vars}; plain-text sinks can't draw markup
    const cs = s.calls.map((c) => c.callee)
    const explicit = cs.some((c) => /(^|\.)(fill|line)$/.test(c))
    const filled = s.inKeys?.includes('choices') ? explicit : cs.some((c) => isFiller(c, file))
    const sink = [...cs].reverse().find((c) => SINK.test(c))
    const vars = [...new Set([...t.matchAll(/\{([a-z]\w*)\}/gi)].map((m) => m[1]))].filter((v) => !(v.length === 1 && MARK.includes(v)))
    if (sink && !filled && !cs.some((c) => altFiller(c, file)) && /\[\[/.test(t)) hit('unfilled', file, s.line, t, `[[…|…]] sent to ${sink}() without fill()`)
    if (sink && !filled && vars.length) hit('unfilled', file, s.line, t, `{${vars.join('}, {')}} sent to ${sink}() without fill()`)
    const innermostSink = [...cs].reverse().find((c) => SINK.test(c) || isFiller(c, file)) || (s.assign && /\.textContent$/.test(s.assign) ? s.assign : null)
    if (innermostSink && (plainSink(innermostSink, file) || /\.textContent$/.test(innermostSink)) && /\{\/?[ybrgw]\}|\[[A-ZĂÎȘȚÂ][^\]]{0,8}\]/.test(t.replace(/\[\[[^\]]*\]\]/g, ''))) hit('markup', file, s.line, t, `markup in ${innermostSink}(), which draws plain text`)
    // ${a?.b} with nothing to fall back on can print "undefined"
    if (s.tpl && sink) for (const ex of s.exprs) if (/\?\.[\w$]+\s*$/.test(ex.trim()) && !/\?\?|\|\||\?[^.]/.test(ex)) hit('undefined', file, s.line, t, `\${${ex}} can print "undefined"`)
  }
}

// ---- data read elsewhere: [[…]] / {vars} lines must reach the screen through fill(), with the vars ------
// (the data modules are walked by their exported path, then every place in the code that reads that
// path is checked: under fill() with the variable, or not straight into a sink)
const DATA = ['src/data/streettalk.js']
for (const f of DATA) {
  const mod = await import(join(ROOT, f))
  const L = lexed.get(f)
  const found = []
  const visit = (v, path) => {
    if (typeof v === 'string') { if (/\[\[|\{[a-z]\w+\}/i.test(v)) found.push({ path, v }) }
    else if (Array.isArray(v)) v.forEach((x) => visit(x, path))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, path + '.' + k)
  }
  for (const [k, v] of Object.entries(mod)) visit(v, k)
  const byPath = new Map()
  for (const x of found) { if (!byPath.has(x.path)) byPath.set(x.path, []); byPath.get(x.path).push(x.v) }
  for (const [path, vals] of byPath) {
    const need = [...new Set(vals.flatMap((v) => [...v.matchAll(/\{([a-z]\w*)\}/gi)].map((m) => m[1])))].filter((n) => n !== 'country' && !(n.length === 1 && MARK.includes(n)))
    const alt = vals.some((v) => /\[\[/.test(v))
    const line = L.strings.find((s) => vals.includes(s.text))?.line || 0
    // every read of this path (or of the object holding it, one level up: F = HOOD.favor[kind])
    for (const [file, X] of lexed) {
      for (const id of X.idents) {
        if (id.name !== path) continue
        const cs = id.calls.map((c) => c.callee)
        const fi = [...id.calls].reverse().find((c) => isFiller(c.callee, file))
        const sink = [...cs].reverse().find((c) => SINK.test(c))
        if (!fi) { if (sink && (need.length || (alt && !cs.some((c) => altFiller(c, file))))) hit('unfilled', f, line, vals[0], `${path} (${alt ? '[[…]]' : ''}${need.length ? ' {' + need.join('}, {') + '}' : ''}) reaches ${sink}() without fill() at ${file}:${id.line}`); continue }
        const end = X.parenEnd.get(fi.start) ?? fi.start + 400
        const args = X.src.slice(fi.start, end + 1)
        for (const n of need) if (!new RegExp(`\\b${n}\\s*:|[{,]\\s*${n}\\s*[,}]|'\\{${n}\\}'`).test(args)) hit('unfilled', f, line, vals[0], `${path} needs {${n}}: not passed at ${file}:${id.line}`)
      }
    }
  }
}

// ---- index.html: the page's own text ---------------------------------------------------------------------
{
  const f = 'index.html'
  const src = readFileSync(join(ROOT, f), 'utf8')
  src.split('\n').forEach((ln, i) => {
    const bits = [...stripTags(ln).split(/\s{2,}/), ...[...ln.matchAll(/(?:content|title|alt|placeholder)="([^"]*)"/g)].map((m) => m[1])]
    for (const b of bits) {
      const t = b.trim()
      if (!/[A-Za-zĂÂÎȘȚăâîșț]{2,}/.test(t) || /^(https?:|data:|#|width|\d)/.test(t)) continue
      checked++
      if (/[şţŞŢ]/.test(t)) hit('cedilla', f, i + 1, t, 'ş/ţ with a cedilla')
      checkWords(t, f, i + 1)
      if (/\.\.\./.test(t)) hit('punctuation', f, i + 1, t, '"..." is written "…"')
    }
  })
}

// ---- report ---------------------------------------------------------------------------------------------------
if (MAIN) {
if (DUMP) console.log(dump.join('\n'))
const byRule = {}
for (const h of hits) (byRule[h.rule] ||= []).push(h)
for (const [rule, list] of Object.entries(byRule)) {
  console.log(`\n== ${rule} (${list.length})`)
  for (const h of list) console.log(`${h.file}:${h.line}  ${h.why}\n    ${clip(h.text)}`)
}
console.log(`\ntexts.mjs: ${checked} texts checked in ${files.length + 1} files · ${hits.length} hit${hits.length === 1 ? '' : 's'}${hits.length ? ' · ' + Object.entries(byRule).map(([r, l]) => `${r} ${l.length}`).join(', ') : ''}`)
process.exitCode = hits.length ? 1 : 0 // (not process.exit: that cuts a long report short in a pipe)
}
