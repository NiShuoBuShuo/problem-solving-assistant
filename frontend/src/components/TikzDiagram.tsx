type Point = { x: number; y: number }
type LabelAnchor = 'center' | 'left' | 'right' | 'above' | 'below'

type Shape =
  | { kind: 'polyline'; points: Point[]; stroke: string; strokeWidth: number; dashed: boolean; arrowEnd: boolean; arrowStart: boolean; fill?: string }
  | { kind: 'rect'; from: Point; to: Point; stroke: string; strokeWidth: number; dashed: boolean; fill?: string }
  | { kind: 'circle'; cx: number; cy: number; r: number; stroke: string; strokeWidth: number; dashed: boolean; fill?: string }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; stroke: string; strokeWidth: number; dashed: boolean; fill?: string }
  | { kind: 'arc'; cx: number; cy: number; r: number; startAngle: number; endAngle: number; stroke: string; strokeWidth: number; dashed: boolean; arrowEnd: boolean }
  | { kind: 'dot'; at: Point; r: number; fill: string }
  | { kind: 'label'; at: Point; text: string; anchor: LabelAnchor }

type LabelPlacement = 'start' | 'midway' | 'end'
type PendingNode = { options: string; text: string }

interface ParsedDiagram {
  scale: number
  shapes: Shape[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

const COLOR_MAP: Record<string, string> = {
  black: '#111827',
  gray: '#6b7280',
  blue: '#2563eb',
  red: '#dc2626',
  green: '#16a34a',
  orange: '#ea580c',
  purple: '#7c3aed',
  teal: '#0f766e',
  cyan: '#0891b2',
  sky: '#0284c7',
  lime: '#65a30d',
  amber: '#d97706',
  brown: '#92400e',
  pink: '#db2777',
  indigo: '#4338ca',
  white: '#ffffff',
}

function stripComments(input: string) {
  return input
    .split('\n')
    .map((line) => line.replace(/(^|[^\\])%.*/, '$1'))
    .join('\n')
}

function normalizeTikzLabel(input: string) {
  return input
    .replace(/^\$/, '')
    .replace(/\$$/, '')
    .replace(/\\mathrm\{([^}]*)\}/g, '$1')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\theta/g, 'θ')
    .replace(/\\phi/g, 'φ')
    .replace(/\\omega/g, 'ω')
    .replace(/\\mu/g, 'μ')
    .replace(/\\pi/g, 'π')
    .replace(/\\to/g, '→')
    .replace(/\\leftarrow/g, '←')
    .replace(/\\rightarrow/g, '→')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\sin/g, 'sin')
    .replace(/\\cos/g, 'cos')
    .replace(/\\tan/g, 'tan')
    .replace(/\\quad/g, ' ')
    .replace(/\\,/g, '')
    .replace(/\^\{?\\circ\}?/g, '°')
    .replace(/\^\{([^}]*)\}/g, '^$1')
    .replace(/_\{([^}]*)\}/g, '_$1')
    .replace(/\\/g, '')
    .trim()
}

function parseScale(input: string) {
  const match = input.match(/\\begin\{tikzpicture\}(?:\[(.*?)\])?/s)
  if (!match) return 1
  const options = match[1] ?? ''
  const scaleMatch = options.match(/scale\s*=\s*([0-9.]+)/)
  return scaleMatch ? Number(scaleMatch[1]) || 1 : 1
}

function resolveColor(raw: string | undefined): string {
  if (!raw) return COLOR_MAP.black
  const base = raw.split('!')[0].toLowerCase()
  return COLOR_MAP[base] ?? COLOR_MAP.black
}

function parseDrawColor(options: string): string {
  const drawMatch = options.match(/draw\s*=\s*([A-Za-z!0-9-]+)/)
  if (drawMatch) return resolveColor(drawMatch[1])
  // fallback: any named color keyword
  for (const key of Object.keys(COLOR_MAP)) {
    if (new RegExp(`(?:^|[^a-z])${key}(?![a-z])`).test(options.toLowerCase())) {
      return COLOR_MAP[key]
    }
  }
  return COLOR_MAP.black
}

function parseFill(options: string): string | undefined {
  const raw = options.match(/fill\s*=\s*([A-Za-z!0-9-]+)/)?.[1]
  if (!raw) return undefined
  const base = raw.split('!')[0].toLowerCase()
  return COLOR_MAP[base] ?? '#e5e7eb'
}

function parseStrokeWidth(options: string) {
  if (options.includes('very thick')) return 3
  if (options.includes('thick')) return 2.2
  return 1.4
}

function parseAnchor(options: string): LabelAnchor {
  if (options.includes('above')) return 'above'
  if (options.includes('below')) return 'below'
  if (options.includes('left')) return 'left'
  if (options.includes('right')) return 'right'
  return 'center'
}

function parsePlacement(options: string): LabelPlacement {
  if (options.includes('midway')) return 'midway'
  if (options.includes('near start')) return 'start'
  return 'end'
}

function evalCoordExpr(raw: string): number | null {
  const compact = raw.replace(/\s+/g, '')
  if (!compact || !/^[-+*/.0-9]+$/.test(compact)) return null
  const tokens = compact.match(/-?\d+(?:\.\d+)?|[+\-*/]/g)
  if (!tokens) return null
  let total = Number(tokens[0])
  if (Number.isNaN(total)) return null
  let i = 1
  while (i < tokens.length) {
    const op = tokens[i]
    const rhs = Number(tokens[i + 1])
    if (Number.isNaN(rhs)) return null
    if (op === '+') total += rhs
    else if (op === '-') total -= rhs
    else if (op === '*') total *= rhs
    else if (op === '/') total /= rhs
    i += 2
  }
  return total
}

function parseCoord(raw: string, prev?: Point): Point | null {
  const absolute = raw.match(/\(\s*([^,()]+)\s*,\s*([^,()]+)\s*\)/)
  if (absolute) {
    const x = evalCoordExpr(absolute[1])
    const y = evalCoordExpr(absolute[2])
    if (x === null || y === null) return null
    return { x, y }
  }
  const relative = raw.match(/\+\+\(\s*([^,()]+)\s*,\s*([^,()]+)\s*\)/)
  if (relative && prev) {
    const dx = evalCoordExpr(relative[1])
    const dy = evalCoordExpr(relative[2])
    if (dx === null || dy === null) return null
    return { x: prev.x + dx, y: prev.y + dy }
  }
  return null
}

function pointAlong(points: Point[], placement: LabelPlacement): Point {
  if (placement === 'start') return points[0]
  if (placement === 'end') return points[points.length - 1]
  if (points.length === 2) {
    return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
  }
  const midIndex = Math.floor((points.length - 1) / 2)
  return {
    x: (points[midIndex].x + points[midIndex + 1].x) / 2,
    y: (points[midIndex].y + points[midIndex + 1].y) / 2,
  }
}

function splitNode(body: string): { pathBody: string; pendingNode: PendingNode | null } {
  const match = body.match(/([\s\S]*?)\s+node(?:\[(.*?)\])?\s*\{([\s\S]*)\}\s*$/)
  if (!match) return { pathBody: body, pendingNode: null }
  return {
    pathBody: match[1].trim(),
    pendingNode: { options: match[2] ?? '', text: match[3] },
  }
}

function updateBounds(bounds: ParsedDiagram['bounds'], x: number, y: number) {
  bounds.minX = Math.min(bounds.minX, x)
  bounds.minY = Math.min(bounds.minY, y)
  bounds.maxX = Math.max(bounds.maxX, x)
  bounds.maxY = Math.max(bounds.maxY, y)
}

function splitStatements(input: string) {
  return input
    .replace(/\\begin\{tikzpicture\}(?:\[[^\]]*\])?/g, '')
    .replace(/\\end\{tikzpicture\}/g, '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
}

/** Convert degrees to radians */
function deg2rad(d: number) { return (d * Math.PI) / 180 }

function parseTikz(input: string): ParsedDiagram | null {
  const cleaned = stripComments(input)
  const scale = parseScale(cleaned)
  const shapes: Shape[] = []
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }

  for (const statement of splitStatements(cleaned)) {
    // ── \node ──────────────────────────────────────────────
    if (statement.startsWith('\\node')) {
      const nodeMatch = statement.match(/\\node(?:\[(.*?)\])?\s+at\s+(\([^)]+\))\s*\{([\s\S]*)\}$/)
      if (!nodeMatch) continue
      const at = parseCoord(nodeMatch[2])
      if (!at) continue
      shapes.push({ kind: 'label', at, text: normalizeTikzLabel(nodeMatch[3]), anchor: parseAnchor(nodeMatch[1] ?? '') })
      updateBounds(bounds, at.x, at.y)
      continue
    }

    // ── \filldraw or \draw ─────────────────────────────────
    const isFilldraw = statement.startsWith('\\filldraw')
    const isDraw = statement.startsWith('\\draw')
    if (!isDraw && !isFilldraw) continue

    const drawMatch = statement.match(/\\(?:filldraw|draw)(?:\[(.*?)\])?\s+([\s\S]*)$/)
    if (!drawMatch) continue

    const options = drawMatch[1] ?? ''
    const body = drawMatch[2].trim()
    const stroke = parseDrawColor(options)
    const fill = parseFill(options)
    const strokeWidth = parseStrokeWidth(options)
    const dashed = options.includes('dashed')
    const arrowEnd = options.includes('->') || options.includes('-latex') || options.includes('-stealth')
    const arrowStart = options.includes('<-') || options.includes('latex-') || options.includes('stealth-')

    // ── circle ──────────────────────────────────────────────
    // \draw (cx,cy) circle (r) or circle [radius=r]
    const circleMatch = body.match(/^(\([^)]+\))\s+circle\s*(?:\(([^)]+)\)|\[radius=([^\]]+)\])/)
    if (circleMatch) {
      const center = parseCoord(circleMatch[1])
      const rRaw = (circleMatch[2] ?? circleMatch[3] ?? '').trim()
      const r = evalCoordExpr(rRaw)
      if (center && r !== null) {
        shapes.push({ kind: 'circle', cx: center.x, cy: center.y, r, stroke, strokeWidth, dashed, fill })
        updateBounds(bounds, center.x - r, center.y - r)
        updateBounds(bounds, center.x + r, center.y + r)
        // trailing node label
        const tailNode = body.match(/node(?:\[(.*?)\])?\s*\{([\s\S]*)\}$/)
        if (tailNode) {
          shapes.push({ kind: 'label', at: { x: center.x + r, y: center.y }, text: normalizeTikzLabel(tailNode[2]), anchor: parseAnchor(tailNode[1] ?? '') })
        }
      }
      continue
    }

    // \filldraw (cx,cy) circle (r) for dots
    const dotMatch = body.match(/^(\([^)]+\))\s+circle\s*\((\d+(?:\.\d+)?(?:pt|mm|cm)?)\)$/)
    if (dotMatch && isFilldraw) {
      const at = parseCoord(dotMatch[1])
      if (at) {
        const dotFill = fill ?? stroke
        shapes.push({ kind: 'dot', at, r: 2, fill: dotFill })
        updateBounds(bounds, at.x, at.y)
      }
      continue
    }

    // ── ellipse ─────────────────────────────────────────────
    const ellipseMatch = body.match(/^(\([^)]+\))\s+ellipse\s*\(([^)]+)\s+and\s+([^)]+)\)/)
    if (ellipseMatch) {
      const center = parseCoord(ellipseMatch[1])
      const rx = evalCoordExpr(ellipseMatch[2].trim())
      const ry = evalCoordExpr(ellipseMatch[3].trim())
      if (center && rx !== null && ry !== null) {
        shapes.push({ kind: 'ellipse', cx: center.x, cy: center.y, rx, ry, stroke, strokeWidth, dashed, fill })
        updateBounds(bounds, center.x - rx, center.y - ry)
        updateBounds(bounds, center.x + rx, center.y + ry)
      }
      continue
    }

    // ── rectangle ───────────────────────────────────────────
    const rectMatch = body.match(/(\([^)]+\))\s+rectangle\s+(\([^)]+\))/)
    if (rectMatch) {
      const from = parseCoord(rectMatch[1])
      const to = parseCoord(rectMatch[2])
      if (from && to) {
        shapes.push({ kind: 'rect', from, to, stroke, strokeWidth, dashed, fill })
        updateBounds(bounds, from.x, from.y)
        updateBounds(bounds, to.x, to.y)
        const tailNode = body.match(/node(?:\[(.*?)\])?\s*\{([\s\S]*)\}$/)
        if (tailNode) {
          shapes.push({ kind: 'label', at: to, text: normalizeTikzLabel(tailNode[2]), anchor: parseAnchor(tailNode[1] ?? '') })
        }
      }
      continue
    }

    // ── arc ─────────────────────────────────────────────────
    // \draw (start) arc (startAngle:endAngle:radius)
    const arcMatch = body.match(/(\([^)]+\))\s+arc\s*\(([^:)]+):([^:)]+):([^)]+)\)/)
    if (arcMatch) {
      const startPt = parseCoord(arcMatch[1])
      const startAngle = parseFloat(arcMatch[2])
      const endAngle = parseFloat(arcMatch[3])
      const radius = evalCoordExpr(arcMatch[4].trim())
      if (startPt && !Number.isNaN(startAngle) && !Number.isNaN(endAngle) && radius !== null) {
        // Reconstruct center from startPt and startAngle
        const cx = startPt.x - radius * Math.cos(deg2rad(startAngle))
        const cy = startPt.y - radius * Math.sin(deg2rad(startAngle))
        shapes.push({ kind: 'arc', cx, cy, r: radius, startAngle, endAngle, stroke, strokeWidth, dashed, arrowEnd })
        // Approximate bounds
        const angles = [startAngle, endAngle, 0, 90, 180, 270].filter(a =>
          startAngle <= endAngle ? a >= startAngle && a <= endAngle : a >= startAngle || a <= endAngle
        )
        for (const a of angles) {
          updateBounds(bounds, cx + radius * Math.cos(deg2rad(a)), cy + radius * Math.sin(deg2rad(a)))
        }
      }
      continue
    }

    // ── polyline / path ─────────────────────────────────────
    const { pathBody, pendingNode } = splitNode(body)
    const rawPoints = pathBody.split('--').map((part) => part.trim()).filter(Boolean)
    const points: Point[] = []

    for (const rawPoint of rawPoints) {
      const point = parseCoord(rawPoint, points.length ? points[points.length - 1] : undefined)
      if (!point) continue
      points.push(point)
      updateBounds(bounds, point.x, point.y)
    }

    if (points.length >= 2) {
      shapes.push({ kind: 'polyline', points, stroke, strokeWidth, dashed, arrowEnd, arrowStart, fill })
      if (pendingNode) {
        shapes.push({
          kind: 'label',
          at: pointAlong(points, parsePlacement(pendingNode.options)),
          text: normalizeTikzLabel(pendingNode.text),
          anchor: parseAnchor(pendingNode.options),
        })
      }
    }
  }

  if (!shapes.length || !Number.isFinite(bounds.minX)) return null
  return { scale, shapes, bounds }
}

function anchorOffset(anchor: LabelAnchor) {
  switch (anchor) {
    case 'above': return { dx: 0, dy: -12, textAnchor: 'middle' as const }
    case 'below': return { dx: 0, dy: 18, textAnchor: 'middle' as const }
    case 'left': return { dx: -10, dy: 4, textAnchor: 'end' as const }
    case 'right': return { dx: 10, dy: 4, textAnchor: 'start' as const }
    default: return { dx: 0, dy: -6, textAnchor: 'middle' as const }
  }
}

/** Render a single SVG arc path (large-arc handled automatically). */
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number, flip: boolean): string {
  const sa = deg2rad(startAngle)
  const ea = deg2rad(endAngle)
  const x1 = cx + r * Math.cos(sa)
  const y1 = cy - r * Math.sin(sa)   // SVG y-axis is flipped
  const x2 = cx + r * Math.cos(ea)
  const y2 = cy - r * Math.sin(ea)
  let delta = endAngle - startAngle
  if (flip) delta = ((delta % 360) + 360) % 360
  const largeArc = delta > 180 ? 1 : 0
  const sweep = flip ? 0 : 1
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweep} ${x2} ${y2}`
}

export function TikzDiagram({ source }: { source: string }) {
  const parsed = parseTikz(source)
  if (!parsed) {
    return (
      <pre className="bg-gray-50 rounded-lg p-3 overflow-x-auto text-xs text-gray-600">
        <code>{source}</code>
      </pre>
    )
  }

  const unit = 28 * parsed.scale
  const padding = 22
  const width = Math.max(180, (parsed.bounds.maxX - parsed.bounds.minX) * unit + padding * 2)
  const height = Math.max(120, (parsed.bounds.maxY - parsed.bounds.minY) * unit + padding * 2)

  // Map TikZ coordinate to SVG coordinate
  const mx = (x: number) => padding + (x - parsed.bounds.minX) * unit
  const my = (y: number) => height - padding - (y - parsed.bounds.minY) * unit
  const mapPoint = (p: Point) => ({ x: mx(p.x), y: my(p.y) })

  return (
    <div className="flex justify-center">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="max-w-full h-auto rounded-lg border border-gray-100 bg-white"
        role="img"
        aria-label="TikZ diagram"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker id="arr-end" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#111827" />
          </marker>
          <marker id="arr-start" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill="#111827" />
          </marker>
        </defs>

        {parsed.shapes.map((shape, i) => {
          // ── dot ───────────────────────────────────────────
          if (shape.kind === 'dot') {
            const { x, y } = mapPoint(shape.at)
            return <circle key={i} cx={x} cy={y} r={shape.r} fill={shape.fill} />
          }

          // ── label ─────────────────────────────────────────
          if (shape.kind === 'label') {
            const { x, y } = mapPoint(shape.at)
            const off = anchorOffset(shape.anchor)
            return (
              <text key={i} x={x + off.dx} y={y + off.dy}
                fontSize="12" fontWeight="500" fill="#374151"
                textAnchor={off.textAnchor}
                stroke="rgba(255,255,255,0.9)" strokeWidth="3"
                paintOrder="stroke fill" strokeLinejoin="round">
                {shape.text}
              </text>
            )
          }

          // ── polyline ──────────────────────────────────────
          if (shape.kind === 'polyline') {
            const pts = shape.points.map(mapPoint)
            return (
              <polyline key={i}
                points={pts.map(p => `${p.x},${p.y}`).join(' ')}
                fill={shape.fill ?? 'none'}
                fillOpacity={shape.fill ? 0.15 : undefined}
                stroke={shape.stroke} strokeWidth={shape.strokeWidth}
                strokeDasharray={shape.dashed ? '6 4' : undefined}
                markerEnd={shape.arrowEnd ? 'url(#arr-end)' : undefined}
                markerStart={shape.arrowStart ? 'url(#arr-start)' : undefined}
                strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )
          }

          // ── rect ──────────────────────────────────────────
          if (shape.kind === 'rect') {
            const from = mapPoint(shape.from)
            const to = mapPoint(shape.to)
            return (
              <rect key={i}
                x={Math.min(from.x, to.x)} y={Math.min(from.y, to.y)}
                width={Math.abs(to.x - from.x)} height={Math.abs(to.y - from.y)}
                fill={shape.fill ?? 'none'} fillOpacity={shape.fill ? 0.12 : undefined}
                stroke={shape.stroke} strokeWidth={shape.strokeWidth}
                strokeDasharray={shape.dashed ? '6 4' : undefined}
                vectorEffect="non-scaling-stroke"
              />
            )
          }

          // ── circle ────────────────────────────────────────
          if (shape.kind === 'circle') {
            const cx = mx(shape.cx)
            const cy = my(shape.cy)
            const r = shape.r * unit
            return (
              <circle key={i} cx={cx} cy={cy} r={r}
                fill={shape.fill ?? 'none'} fillOpacity={shape.fill ? 0.12 : undefined}
                stroke={shape.stroke} strokeWidth={shape.strokeWidth}
                strokeDasharray={shape.dashed ? '6 4' : undefined}
                vectorEffect="non-scaling-stroke"
              />
            )
          }

          // ── ellipse ───────────────────────────────────────
          if (shape.kind === 'ellipse') {
            const cx = mx(shape.cx)
            const cy = my(shape.cy)
            const rx = shape.rx * unit
            const ry = shape.ry * unit
            return (
              <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry}
                fill={shape.fill ?? 'none'} fillOpacity={shape.fill ? 0.12 : undefined}
                stroke={shape.stroke} strokeWidth={shape.strokeWidth}
                strokeDasharray={shape.dashed ? '6 4' : undefined}
                vectorEffect="non-scaling-stroke"
              />
            )
          }

          // ── arc ───────────────────────────────────────────
          if (shape.kind === 'arc') {
            const cxSvg = mx(shape.cx)
            const cySvg = my(shape.cy)
            const rSvg = shape.r * unit
            const d = arcPath(cxSvg, cySvg, rSvg, shape.startAngle, shape.endAngle, false)
            return (
              <path key={i} d={d} fill="none"
                stroke={shape.stroke} strokeWidth={shape.strokeWidth}
                strokeDasharray={shape.dashed ? '6 4' : undefined}
                markerEnd={shape.arrowEnd ? 'url(#arr-end)' : undefined}
                strokeLinecap="round" vectorEffect="non-scaling-stroke"
              />
            )
          }

          return null
        })}
      </svg>
    </div>
  )
}
