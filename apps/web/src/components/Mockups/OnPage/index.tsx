import { Check, Redo2, Undo2 } from 'lucide-react'
import { Bar, Button, Roll, Stage, Window, type Act } from '../kit'
import { useFontsReady } from '../fonts'
import '../look.css'
import './onpage.css'

// Edit on page: the live site in a browser with the on-page editor open. The heading is
// clicked, "this week" is selected and retyped as "today", the draft saves itself, and
// Publish puts it live. Plays once, then holds.
//
// Real strings: the heading, the editor's status and its Publish button. The rest of the
// page is filler; the toolbar keeps undo and redo for recognition.

const HEAD = 'Launch your site this week'
const START = HEAD.indexOf('this week')
const END = HEAD.length
const NEW = 'today'

type S = {
  hover: boolean
  editing: boolean
  sel: number
  typed: string
  saved: boolean
  published: boolean
}

const initial: S = {
  hover: false,
  editing: false,
  sel: START,
  typed: '',
  saved: false,
  published: false,
}
const POSTER: S = { ...initial, typed: NEW, saved: true, published: true }

async function script(a: Act<S>) {
  await a.wait(900)

  // 1. Click into the heading
  a.mark('edit')
  const phrase = a.rect('phrase')
  const y = phrase.y + phrase.height / 2
  await a.move({ x: phrase.x + 1, y })
  await a.set({ hover: true })
  await a.wait(250)
  await a.click()
  await a.set({ editing: true })
  await a.wait(350)

  // 2. Select "this week", left to right, under the I-beam
  a.mark('select')
  await a.drag(
    { x: phrase.x + phrase.width, y },
    (at) => a.put({ sel: Math.max(START, a.caret('heading', at)) }),
    { duration: 900 },
  )
  a.put({ sel: END })
  await a.wait(450)

  // 3. Type over it; the draft saves a beat later
  a.mark('type')
  await a.type('typed', NEW, { interval: 110 })
  await a.wait(700)
  await a.set({ saved: true })
  await a.wait(700)

  // 4. Publish
  a.mark('publish')
  await a.move({ at: 'publish', x: 0.7, y: 0.6 })
  await a.wait(250)
  await a.click()
  await a.set({ published: true, editing: false, hover: false })
  await a.move('rest')
  await a.wait(2400)
}

function Heading({ s }: { s: S }) {
  const replaced = s.typed !== ''
  return (
    <div
      className="op-heading"
      data-target="heading"
      data-cursor="ibeam"
      data-hover={s.hover || undefined}
      data-editing={s.editing || undefined}
    >
      {/* Line one stays put; the edited words always sit on line two */}
      {HEAD.slice(0, START)}
      <br />
      {replaced ? (
        <span data-typing>
          {s.typed}
          {s.editing && <span className="op-caret" />}
        </span>
      ) : (
        // A keystroke replaces the selection at once, as a browser does
        <span data-target="phrase" data-snap>
          <span className="op-sel" data-on={s.sel > START || undefined}>
            {HEAD.slice(START, s.sel)}
          </span>
          {HEAD.slice(s.sel)}
        </span>
      )}
    </div>
  )
}

function Toolbar({ s }: { s: S }) {
  const status = s.published ? 'Live' : s.saved ? 'Draft saved' : 'Editing draft'
  return (
    <div className="op-toolbar">
      <Roll variant="fade" className="op-status">
        {status}
      </Roll>
      <span className="op-divider" />
      <span className="op-tool">
        <Undo2 size={14} strokeWidth={2} />
      </span>
      <span className="op-tool">
        <Redo2 size={14} strokeWidth={2} />
      </span>
      <span className="op-divider" />
      <Button
        variant="primary"
        size="small"
        className="op-publish"
        data-target="publish"
        icon={s.published ? <Check size={12} strokeWidth={2.5} /> : undefined}
      >
        {s.published ? 'Published' : 'Publish'}
      </Button>
    </div>
  )
}

const REST = { wide: { x: 372, y: 196 }, compact: { x: 280, y: 150 } }

export default function OnPageMockup() {
  const fonts = useFontsReady()
  return (
    <Stage
      key={fonts ? 'inter' : 'fallback'}
      width={480}
      height={360}
      compact={{ below: 440, width: 358, height: 268 }}
      fill
      initial={initial}
      poster={POSTER}
      play="once"
      script={script}
      cursor={{ at: REST }}
      className="sh-site op"
    >
      {(s, _rect, layout) => (
        <>
          <Window url="localhost:3000" className="op-window" body={{ className: 'op-body' }}>
            <div className="op-page">
              <Bar
                w={layout === 'compact' ? 120 : 150}
                h={layout === 'compact' ? 14 : 18}
                r={9}
                tone={1}
                className="op-eyebrow"
              />
              <Heading s={s} />
              {layout === 'wide' && (
                <div className="op-copy">
                  <Bar w={250} h={7} tone={2} />
                  <Bar w={200} h={7} tone={2} />
                </div>
              )}
              <div className="op-buttons">
                <Bar
                  w={layout === 'compact' ? 76 : 92}
                  h={layout === 'compact' ? 24 : 28}
                  r={7}
                  tone={5}
                />
                <Bar
                  w={layout === 'compact' ? 70 : 84}
                  h={layout === 'compact' ? 24 : 28}
                  r={7}
                  tone={1}
                  className="op-outline"
                />
              </div>
            </div>
            <Toolbar s={s} />
          </Window>
          <span
            data-target="rest"
            style={{ position: 'absolute', left: REST[layout].x, top: REST[layout].y }}
          />
        </>
      )}
    </Stage>
  )
}
