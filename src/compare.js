// A reference beside the render, so a tree is judged against what it should look like. Each species keeps its own picture: one dropped onto the panel is
// remembered in this browser; otherwise public/refs/<species>.jpg if it's there; otherwise the studio references.
const STUDIO = ['kokurikozaka003', 'kazetachinu028', 'marnie003', 'omoide003', 'totoro001', 'majo002', 'kazetachinu050', 'marnie006'].map(n => `/critique/refs/ghibli/${n}.jpg`)   // official stills, kept local
const slug = s => s.toLowerCase().replace(/ /g, '-')
const key = s => 'compare:' + slug(s)
const recall = s => { try { return localStorage.getItem(key(s)) } catch { return null } }
const remember = (s, url) => { try { localStorage.setItem(key(s), url); return true } catch { return false } }
const forget = s => { try { localStorage.removeItem(key(s)) } catch {} }

export function makeCompare(onLayout){
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;left:0;top:0;bottom:0;width:42vw;display:none;align-items:center;justify-content:center;padding:118px 12px 84px;box-sizing:border-box;background:#141a19;color:#c9d6cf;font:13px system-ui;z-index:1'
  const img = new Image(), note = document.createElement('div')
  img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:4px'
  note.style.cssText = 'position:absolute;left:12px;right:12px;top:82px;text-align:center;opacity:.75'
  box.append(img, note); document.body.append(box)
  const hud = document.getElementById('hud'); if (hud) hud.style.zIndex = 2   // (the demo page has no hud)
  const state = { on: false, species: '', studio: 0 }
  const show = () => {
    const mine = recall(state.species), photo = `${import.meta.env.BASE_URL}refs/${slug(state.species)}.jpg`, studio = STUDIO[state.studio%STUDIO.length]
    note.textContent = mine ? `Your picture for ${state.species}` : 'Drop a photo here to keep it for this species'
    img.onerror = () => { if (img.src.endsWith(photo)){ note.textContent = 'Studio reference. Drop a photo here to keep it for this species'; img.src = studio } }
    img.src = mine || photo
  }
  box.addEventListener('dragover', e => e.preventDefault())
  box.addEventListener('drop', e => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file?.type.startsWith('image/')) return
    const shown = URL.createObjectURL(file), big = new Image()
    big.onload = () => {
      const k = Math.min(1, 1000/Math.max(big.width, big.height)), c = document.createElement('canvas')
      c.width = big.width*k; c.height = big.height*k; c.getContext('2d').drawImage(big, 0, 0, c.width, c.height)
      if (!remember(state.species, c.toDataURL('image/jpeg', .85))) { note.textContent = 'Shown, but too large to remember'; img.src = shown }
      else show()
    }
    big.src = shown
  })
  return {
    get width(){ return state.on ? box.offsetWidth : 0 },
    set(on){ state.on = on; box.style.display = on ? 'flex' : 'none'; if (on) show(); onLayout() },
    species(name){ state.species = name; if (state.on) show() },
    next(){ state.studio++; note.textContent = 'Studio reference'; img.onerror = null; img.src = STUDIO[state.studio%STUDIO.length] },
    forget(){ forget(state.species); show() },
  }
}
