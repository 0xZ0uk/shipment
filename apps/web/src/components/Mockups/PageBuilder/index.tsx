import { ChevronDown, ChevronLeft, CirclePlus, Ellipsis, GripVertical, Search } from 'lucide-react'
import {
  Bar,
  Button,
  Collapse,
  Field,
  Roll,
  Stage,
  Text,
  Window,
  type Act,
  type Layout,
} from '../kit'
import { thumb, type ThumbName } from '../thumbs'
import { useFontsReady } from '../fonts'
import '../look.css'
import './builder.css'

// The landing page's hero: the Payload admin editing a page. "Add Layout" opens the block
// picker, a search finds Pricing, the block lands in the layout, and publishing sends it to
// the live site, shown as a satellite over the admin's sidebar. Plays once, then holds.
//
// Real strings: the page, its blocks, the status, the publish button, the picker's title,
// search and the picked block. The sidebar, breadcrumbs and side fields are filler.

type S = {
  drawer: boolean
  focus: boolean
  query: string
  added: boolean
  published: boolean
}

const initial: S = { drawer: false, focus: false, query: '', added: false, published: false }
const POSTER: S = { ...initial, added: true, published: true }

// The phone column has room for a shorter page.
const ROWS = { wide: ['Hero', 'Logos', 'Features'], compact: ['Hero', 'Features'] }

type Tile = { name: ThumbName; label: string }
const GROUPS: { label: string; tiles: Tile[] }[] = [
  {
    label: 'Heroes',
    tiles: [
      { name: 'hero', label: 'Hero' },
      { name: 'pageHeader', label: 'Page header' },
    ],
  },
  {
    label: 'Content',
    tiles: [
      { name: 'richText', label: 'Rich text' },
      { name: 'postsArchive', label: 'Latest posts' },
      { name: 'faq', label: 'FAQ' },
    ],
  },
  {
    label: 'Conversion',
    tiles: [
      { name: 'pricing', label: 'Pricing' },
      { name: 'cta', label: 'Call to action' },
      { name: 'form', label: 'Form' },
    ],
  },
]

const matches = (tile: Tile, query: string) =>
  tile.label.toLowerCase().includes(query.toLowerCase())

async function script(a: Act<S>) {
  await a.wait(900)

  a.mark('open')
  await a.move({ at: 'add', x: 0.7, y: 0.6 })
  await a.wait(250)
  await a.click()
  await a.set({ drawer: true })
  await a.wait(800)

  a.mark('search')
  await a.move({ at: 'search', x: 0.75, y: 0.55 })
  await a.click()
  await a.set({ focus: true })
  await a.wait(200)
  await a.type('query', 'pricing', { interval: 85 })
  await a.wait(700)

  a.mark('pick')
  await a.move({ at: 'tile-pricing', x: 0.62, y: 0.42 })
  await a.wait(300)
  await a.click()
  await a.set({ drawer: false, focus: false, added: true })
  await a.wait(1300)

  a.mark('publish')
  await a.move({ at: 'publish', x: 0.78, y: 0.62 })
  await a.wait(300)
  await a.click()
  await a.set({ published: true })
  await a.move('rest')
  await a.wait(2400)
}

function Sidebar() {
  return (
    <aside className="sb-side">
      <Bar w={64} h={6} tone={2} className="sb-side__label" />
      {/* The open collection; the live site covers this column, so it carries no words */}
      <div className="sb-nav" data-on>
        <Bar w={38} h={6} tone={4} />
      </div>
      {[42, 50, 70].map((w, i) => (
        <div key={i} className="sb-nav">
          <Bar w={w} h={6} tone={3} />
        </div>
      ))}
      <Bar w={48} h={6} tone={2} className="sb-side__label" />
      {[54, 46].map((w, i) => (
        <div key={i} className="sb-nav">
          <Bar w={w} h={6} tone={3} />
        </div>
      ))}
    </aside>
  )
}

function LayoutRow({ n, name }: { n: number; name: string }) {
  return (
    <div className="sb-row">
      <GripVertical className="sb-row__grip" size={14} strokeWidth={1.75} />
      <Text className="sb-row__n">{String(n).padStart(2, '0')}</Text>
      <Text className="sb-row__name">{name}</Text>
      <span className="sb-row__end">
        <Ellipsis size={16} strokeWidth={2} className="sb-icon" />
        <ChevronDown size={16} strokeWidth={1.75} className="sb-icon" />
      </span>
    </div>
  )
}

function Drawer({ s }: { s: S }) {
  return (
    <div className="sb-drawer" data-open={s.drawer || undefined} aria-hidden>
      <div className="sb-drawer__head">
        <ChevronLeft size={16} strokeWidth={1.75} className="sb-icon" />
        <Text className="sb-drawer__title">Add Layout</Text>
      </div>
      <div className="sb-drawer__search">
        <Field
          value={s.query}
          placeholder="Search for a block"
          focused={s.focus}
          leading={<Search size={14} strokeWidth={1.75} className="sb-icon" />}
          className="sb-search"
          box={{ 'data-target': 'search', 'data-cursor': 'ibeam' }}
        />
      </div>
      <div className="sb-groups">
        {GROUPS.map((group) => {
          const open = group.tiles.some((tile) => matches(tile, s.query))
          return (
            <Collapse key={group.label} open={open}>
              <div className="sb-group">
                <Text className="sb-group__label">{group.label}</Text>
                <div className="sb-tiles">
                  {group.tiles.map((tile) => (
                    <div
                      key={tile.name}
                      className="sb-tile"
                      data-target={tile.name === 'pricing' ? 'tile-pricing' : undefined}
                      data-hidden={!matches(tile, s.query) || undefined}
                    >
                      <img
                        alt=""
                        className="sb-tile__img"
                        draggable={false}
                        src={thumb(tile.name)}
                      />
                      <Text className="sb-tile__label">{tile.label}</Text>
                    </div>
                  ))}
                </div>
              </div>
            </Collapse>
          )
        })}
      </div>
    </div>
  )
}

function Admin({ s, layout }: { s: S; layout: Layout }) {
  const compact = layout === 'compact'
  const status = s.published || !s.added ? 'Published' : 'Changed'
  const dirty = s.added && !s.published
  return (
    <div className="sb-admin" data-drawer={s.drawer || undefined}>
      {!compact && <Sidebar />}
      <div className="sb-main">
        {!compact && (
          <div className="sb-crumbs">
            <Bar w={58} h={6} tone={2} />
            <span className="sb-crumbs__sep">/</span>
            <Bar w={36} h={6} tone={2} />
            <span className="sb-crumbs__sep">/</span>
            <Text className="sb-crumbs__here">Home</Text>
          </div>
        )}
        <div className="sb-title">
          <span>Home</span>
        </div>
        <div className="sb-controls">
          <div className="sb-status">
            <Roll variant="fade" className="sb-status__word">
              {status}
            </Roll>
            {!compact && (
              <Roll className="sb-status__time">
                {s.published ? 'Updated just now' : 'Updated 2 hours ago'}
              </Roll>
            )}
          </div>
          <div className="sb-actions">
            {!compact && <Button className="sb-btn">Edit on page</Button>}
            <Button className="sb-publish" data-target="publish" data-ready={dirty || undefined}>
              Publish changes
            </Button>
          </div>
        </div>
        <div className="sb-split">
          <div className="sb-fields">
            {!compact && (
              <div className="sb-tabs">
                <Text className="sb-tab" data-on>
                  Content
                </Text>
                <span className="sb-tab">
                  <Bar w={26} h={6} tone={3} />
                </span>
                <span className="sb-tab">
                  <Bar w={40} h={6} tone={3} />
                </span>
              </div>
            )}
            <Text className="sb-label">Layout</Text>
            <div className="sb-rows">
              {ROWS[layout].map((name, i) => (
                <LayoutRow key={name} n={i + 1} name={name} />
              ))}
              <Collapse open={s.added}>
                <LayoutRow n={ROWS[layout].length + 1} name="Pricing" />
              </Collapse>
            </div>
            <div className="sb-add" data-target="add">
              <CirclePlus size={16} strokeWidth={1.6} className="sb-icon" />
              <Text className="sb-add__label">Add Layout</Text>
            </div>
          </div>
          {!compact && (
            <div className="sb-aside">
              {[52, 38, 60].map((w, i) => (
                <div key={i} className="sb-aside__field">
                  <Bar w={w} h={6} tone={3} />
                  <span className="sb-aside__input">
                    <Bar w={w + 18} h={6} tone={2} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="sb-scrim" data-show={s.drawer || undefined} />
      <Drawer s={s} />
    </div>
  )
}

/** The live site: the page's sections as the picker draws them, the new one arriving on publish. */
function LiveSite({ s }: { s: S }) {
  const bands: ThumbName[] = ['hero', 'logos', 'features']
  return (
    <Window chrome="hairline" url="localhost:3000" className="sb-live">
      <div className="sb-live__page">
        {bands.map((name) => (
          <div key={name} className="sb-band" data-name={name} data-crop>
            <img alt="" draggable={false} src={thumb(name)} />
          </div>
        ))}
        <Collapse open={s.published}>
          <div className="sb-band" data-name="pricing" data-crop>
            <img alt="" draggable={false} src={thumb('pricing')} />
          </div>
        </Collapse>
      </div>
    </Window>
  )
}

const REST = { wide: { x: 600, y: 470 }, compact: { x: 250, y: 300 } }

export default function PageBuilderMockup() {
  const fonts = useFontsReady()
  return (
    <Stage
      key={fonts ? 'inter' : 'fallback'}
      width={1024}
      height={540}
      compact={{ below: 640, width: 358, height: 340 }}
      initial={initial}
      poster={POSTER}
      play="once"
      script={script}
      cursor={{ at: REST }}
      className="sh-admin sb"
    >
      {(s, _rect, layout) => (
        <>
          <div className="sb-fade">
            <Window
              url="localhost:3000/admin"
              className="sb-window"
              body={{ className: 'sb-body' }}
            >
              <Admin s={s} layout={layout} />
            </Window>
          </div>
          {layout === 'wide' && <LiveSite s={s} />}
          <span
            data-target="rest"
            style={{ position: 'absolute', left: REST[layout].x, top: REST[layout].y }}
          />
        </>
      )}
    </Stage>
  )
}
