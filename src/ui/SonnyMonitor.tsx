// SONNY — «монитор» врезки мини-игр (plan/39): SVG-корпус «как оригинал» — Sony Trinitron
// Multiscan/CPD-серии (бежевый корпус, тонкая чёрная маска кинескопа, эмблема апертурной
// решётки слева вверху, логотип по центру снизу, блок POWER/MENU/OK со светодиодом справа),
// только бренд — SONNY. В экране — iframe игры: вырез 686×539.
import type { ReactNode } from 'react';

/** Вырез кинескопа в координатах SVG (iframe кладётся ровно сюда). */
export const SONNY_SCREEN = { x: 86, y: 51, w: 686, h: 539 } as const;
export const SONNY_SIZE = { w: 858, h: 700 } as const;

export function SonnyMonitor({ title, children }: { title: string; children: ReactNode }) {
  const S = SONNY_SCREEN;
  return (
    <div
      aria-label={`Монитор SONNY — мини-игра «${title}»`}
      style={{
        position: 'relative', width: SONNY_SIZE.w, height: SONNY_SIZE.h,
        filter: 'drop-shadow(0 22px 30px rgba(0,0,0,.5)) drop-shadow(0 5px 10px rgba(0,0,0,.35))',
      }}
    >
      <svg
        width={SONNY_SIZE.w}
        height={SONNY_SIZE.h}
        viewBox="0 0 858 700"
        style={{ position: 'absolute', left: 0, top: 0, display: 'block' }}
      >
        <defs>
          <linearGradient id="sonny-case" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e0dacd" />
            <stop offset="0.45" stopColor="#cfc9bd" />
            <stop offset="1" stopColor="#aaa496" />
          </linearGradient>
          <linearGradient id="sonny-side" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="rgba(0,0,0,.12)" />
            <stop offset="0.045" stopColor="rgba(0,0,0,.04)" />
            <stop offset="0.10" stopColor="rgba(0,0,0,0)" />
            <stop offset="0.90" stopColor="rgba(0,0,0,0)" />
            <stop offset="0.955" stopColor="rgba(0,0,0,.04)" />
            <stop offset="1" stopColor="rgba(0,0,0,.12)" />
          </linearGradient>
        </defs>

        {/* корпус */}
        <rect x="1.5" y="1.5" width="855" height="697" rx="14" fill="url(#sonny-case)" stroke="#8b857a" strokeWidth="2" />
        {/* объём: боковые тени + блик верхней крышки */}
        <rect x="3" y="3" width="852" height="694" rx="13" fill="url(#sonny-side)" />
        <rect x="10" y="5" width="838" height="7" rx="3.5" fill="rgba(255,255,255,.3)" />
        {/* нижняя кромка — мягкая тень */}
        <rect x="10" y="688" width="838" height="7" rx="3.5" fill="rgba(0,0,0,.08)" />

        {/* кинескоп: чёрная маска вокруг стекла (стекло = iframe) */}
        <rect x={S.x - 7} y={S.y - 7} width={S.w + 14} height={S.h + 14} rx="16" fill="#0d0d10" />
        <rect x={S.x - 7} y={S.y - 7} width={S.w + 14} height={S.h + 14} rx="16" fill="none" stroke="#736d62" strokeWidth="1" />
        {/* светлая фаска вокруг маски */}
        <rect x={S.x - 11} y={S.y - 11} width={S.w + 22} height={S.h + 22} rx="19" fill="none" stroke="rgba(255,255,255,.32)" strokeWidth="1.5" />

        {/* эмблема апертурной решётки (в оригинале — Trinitron), по левому краю кинескопа */}
        <g transform="translate(79, 13)">
          <rect x="0" y="0" width="34" height="20" rx="4.5" fill="#19191c" stroke="#43434a" strokeWidth="1" />
          <g transform="skewX(-16)">
            <rect x="6.5" y="3" width="5.5" height="14" rx="1.5" fill="#e05b46" />
            <rect x="14.5" y="3" width="5.5" height="14" rx="1.5" fill="#5cc272" />
            <rect x="22.5" y="3" width="5.5" height="14" rx="1.5" fill="#4d84dd" />
          </g>
        </g>

        {/* логотип по центру нижней панели */}
        <text x="429" y="662" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fontSize="31" letterSpacing="4" fill="#3b3833">SONNY</text>

        {/* блок управления справа (POWER · светодиод · MENU/OK) */}
        <text x="772" y="614" textAnchor="middle" fontFamily="'Segoe UI', Arial, sans-serif" fontSize="7.5" letterSpacing="1" fill="#6f6a61">POWER</text>
        <rect x="752" y="620" width="40" height="27" rx="5" fill="#c3bdb0" stroke="#8b857a" strokeWidth="1" />
        <rect x="753.5" y="621.5" width="37" height="10" rx="4" fill="rgba(255,255,255,.25)" />
        <rect x="752" y="647.5" width="40" height="2" rx="1" fill="rgba(0,0,0,.10)" />
        <circle cx="772" cy="633.5" r="6.8" fill="none" stroke="#2f7d3a" strokeWidth="2" />
        <line x1="772" y1="625.5" x2="772" y2="632" stroke="#2f7d3a" strokeWidth="2" strokeLinecap="round" />
        <circle cx="806" cy="633" r="9.5" fill="rgba(120,220,120,.32)" />
        <circle cx="806" cy="633" r="4" fill="#7ee06a" stroke="#3f6b34" strokeWidth="0.8" />
        <circle cx="804.6" cy="631.6" r="1.3" fill="rgba(255,255,255,.55)" />
        <rect x="752" y="656" width="22" height="14" rx="7" fill="#c3bdb0" stroke="#8b857a" strokeWidth="1" />
        <rect x="753.5" y="657.5" width="19" height="5" rx="2.5" fill="rgba(255,255,255,.3)" />
        <rect x="778" y="656" width="22" height="14" rx="7" fill="#c3bdb0" stroke="#8b857a" strokeWidth="1" />
        <rect x="779.5" y="657.5" width="19" height="5" rx="2.5" fill="rgba(255,255,255,.3)" />
        <rect x="752" y="670.5" width="48" height="2" rx="1" fill="rgba(0,0,0,.10)" />
        <text x="763" y="683" textAnchor="middle" fontFamily="'Segoe UI', Arial, sans-serif" fontSize="7" fill="#6b665c">MENU</text>
        <text x="789" y="683" textAnchor="middle" fontFamily="'Segoe UI', Arial, sans-serif" fontSize="7" fill="#6b665c">OK</text>

        {/* модель — слева внизу, как шильдик */}
        <text x="34" y="682" fontFamily="'Segoe UI', Arial, sans-serif" fontSize="8" letterSpacing="1" fill="#6f6a61">MODEL CPD-1401</text>
      </svg>

      {/* экран: сама игра + блик и виньетка стекла */}
      <div style={{ position: 'absolute', left: S.x, top: S.y, width: S.w, height: S.h }}>
        {children}
        <div
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 10,
            boxShadow: 'inset 0 0 2px rgba(255,255,255,.18), inset 0 0 32px rgba(0,0,0,.45)',
            background:
              'linear-gradient(132deg, rgba(255,255,255,.07) 0%, rgba(255,255,255,.02) 16%, rgba(255,255,255,0) 32%),'
              + ' linear-gradient(312deg, rgba(0,0,0,.10) 0%, rgba(0,0,0,0) 22%),'
              + ' linear-gradient(90deg, rgba(0,0,0,.16) 0%, rgba(0,0,0,0) 3.5%, rgba(0,0,0,0) 96.5%, rgba(0,0,0,.16) 100%)',
          }}
        />
      </div>
    </div>
  );
}
