import { Bar, Stage, Text } from '../kit'
import { thumb, type ThumbName } from '../thumbs'
import { useFontsReady } from '../fonts'
import '../look.css'
import './library.css'

// The block library, as many of one: the picker's real thumbnails in a grid that runs off
// every edge, one block in focus. A still.
//
// Real strings: the focused block and how many layouts it comes in. The other tiles carry
// their artwork and a bar for a label.

const COLS = 4
const ROWS = 4
const FOCUS = { col: 2, row: 1 }
const GRID: ThumbName[] = [
  'stats',
  'features',
  'faq',
  'logos',
  'testimonials',
  'hero',
  'pricing',
  'steps',
  'cta',
  'richText',
  'reviews',
  'featureRows',
  'gallery',
  'form',
  'pageHeader',
  'postsArchive',
]
const LABELS = [52, 40, 64, 46, 58, 36, 60, 44]

export default function BlockLibraryMockup() {
  const fonts = useFontsReady()
  return (
    <Stage
      key={fonts ? 'inter' : 'fallback'}
      width={480}
      height={360}
      compact={{ below: 440, width: 358, height: 268 }}
      fill
      className="sh-site bl"
    >
      {() => (
        <div className="bl-grid">
          {GRID.slice(0, COLS * ROWS).map((name, i) => {
            const focus = i % COLS === FOCUS.col && Math.floor(i / COLS) === FOCUS.row
            return (
              <div key={name} className="bl-tile" data-focus={focus || undefined}>
                <img alt="" className="bl-thumb" draggable={false} src={thumb(name)} />
                {focus ? (
                  <div className="bl-meta">
                    <Text className="bl-name">Pricing</Text>
                    <Text className="bl-variants">2 layouts</Text>
                  </div>
                ) : (
                  <div className="bl-meta">
                    <Bar w={LABELS[i % LABELS.length]!} h={6} tone={2} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Stage>
  )
}
