import { Badge, Bar, Check, Stage, Text, Window } from '../kit'
import { useFontsReady } from '../fonts'
import '../look.css'
import './seo.css'

// Measure what works: the admin's SEO score for a page, and an A/B test on its hero as a
// satellite over the admin's sidebar. A still.
//
// Real strings: the score and its verdict, three checks, and the test's two variants with
// their conversion rates and the lift.

const CHECKS = [
  { label: 'Keyword in the title', pass: true },
  { label: 'Meta description length', pass: true },
  { label: 'Alt text on 2 images', pass: false },
]

function Ring({ value }: { value: number }) {
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <div className="se-ring">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r={r} className="se-ring__track" />
        <circle
          cx="32"
          cy="32"
          r={r}
          className="se-ring__arc"
          strokeDasharray={`${(c * value) / 100} ${c}`}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span className="se-ring__value">{value}</span>
    </div>
  )
}

export default function SeoAbMockup() {
  const fonts = useFontsReady()
  return (
    <Stage
      key={fonts ? 'inter' : 'fallback'}
      width={480}
      height={360}
      compact={{ below: 440, width: 358, height: 268 }}
      fill
      className="sh-admin se"
    >
      {(_s, _rect, layout) => (
        <>
          <Window url="localhost:3000/admin" className="se-window" body={{ className: 'se-body' }}>
            <aside className="se-side">
              {[46, 60, 38, 52, 44].map((w, i) => (
                <Bar key={i} w={w} h={6} tone={i === 1 ? 4 : 2} />
              ))}
            </aside>
            <div className="se-main">
              <div className="se-card">
                <Text className="se-card__title">SEO Score</Text>
                <div className="se-score">
                  <Ring value={91} />
                  <div className="se-score__text">
                    <Badge tone="success" className="se-badge">
                      Excellent
                    </Badge>
                    {layout === 'wide' && <Text className="se-score__sub">49 of 61 passed</Text>}
                  </div>
                </div>
              </div>
              <div className="se-checks">
                {(layout === 'compact' ? [CHECKS[0]!, CHECKS[2]!] : CHECKS).map((check) => (
                  <div key={check.label} className="se-check" data-pass={check.pass || undefined}>
                    <Check on={check.pass} size={14} />
                    <Text className="se-check__label">{check.label}</Text>
                  </div>
                ))}
              </div>
            </div>
          </Window>

          <div className="se-test">
            <Text className="se-test__title">Hero headline</Text>
            {[
              { v: 'A', rate: '3.1%', w: 62 },
              { v: 'B', rate: '3.8%', w: 76, win: true },
            ].map((row) => (
              <div key={row.v} className="se-variant" data-win={row.win || undefined}>
                <span className="se-variant__key">{row.v}</span>
                <span className="se-variant__bar">
                  <span style={{ width: `${row.w}%` }} />
                </span>
                <Text className="se-variant__rate">{row.rate}</Text>
              </div>
            ))}
            <div className="se-test__foot">
              <Bar w={58} h={6} tone={2} />
              <Badge tone="success">+22%</Badge>
            </div>
          </div>
        </>
      )}
    </Stage>
  )
}
