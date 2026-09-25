// SONNY — «монитор» врезки мини-игр (plan/39, v0.59): SVG-корпус, в экране — iframe игры.
// Экран вырезан ровно под embed-контент песочницы: 686×539 (670×523 + padding 8).
// Внутри экрана — только игра: всё управление (закрытие, итог) рисует сама врезка.
import type { ReactNode } from 'react';

/** Дыра кинескопа в координатах SVG (iframe кладётся ровно сюда). */
export const SONNY_SCREEN = { x: 32, y: 30, w: 686, h: 539 } as const;
export const SONNY_SIZE = { w: 750, h: 640 } as const;

export function SonnyMonitor({ title, children }: { title: string; children: ReactNode }) {
  const S = SONNY_SCREEN;
  return (
    <div
      aria-label={`Монитор SONNY — мини-игра «${title}»`}
      style={{
        position: 'relative', width: SONNY_SIZE.w, height: SONNY_SIZE.h,
        filter: 'drop-shadow(0 20px 30px rgba(0,0,0,.55)) drop-shadow(0 4px 8px rgba(0,0,0,.35))',
      }}
    >
      <svg
        width={SONNY_SIZE.w}
        height={SONNY_SIZE.h}
        viewBox="0 0 750 640"
        style={{ position: 'absolute', left: 0, top: 0, display: 'block' }}
      >
        <defs>
          <linearGradient id="sonny-case" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#dcd8cf" />
            <stop offset="0.6" stopColor="#c6c2b8" />
            <stop offset="1" stopColor="#aeaaa0" />
          </linearGradient>
          <linearGradient id="sonny-bezel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#807c76" />
            <stop offset="1" stopColor="#97938b" />
          </linearGradient>
        </defs>
        {/* корпус */}
        <rect x="1" y="1" width="748" height="638" rx="20" fill="url(#sonny-case)" stroke="#7b776e" strokeWidth="2" />
        <rect x="8" y="6" width="734" height="10" rx="5" fill="rgba(255,255,255,.22)" />
        {/* вентиляция сверху */}
        {Array.from({ length: 7 }, (_, i) => (
          <rect key={i} x={206 + i * 50} y="8" width="38" height="4" rx="2" fill="#aea99f" stroke="#918d83" strokeWidth="0.6" />
        ))}
        {/* бевел кинескопа */}
        <rect x="22" y="20" width="706" height="559" rx="12" fill="url(#sonny-bezel)" stroke="#6c6860" strokeWidth="1.5" />
        {/* дыра кинескопа (сюда ложится iframe) */}
        <rect x={S.x} y={S.y} width={S.w} height={S.h} rx="9" fill="#04060a" />
        {/* нижняя панель: бренд, наклейка игры, LED, модель */}
        <text x="30" y="593" fontFamily="'Segoe UI', Arial, sans-serif" fontSize="10" letterSpacing="2.5" fill="#6e6a62">TRINITONE</text>
        <text x="29" y="631" fontFamily="'Arial Black', Arial, sans-serif" fontStyle="italic" fontWeight="900" fontSize="31" letterSpacing="1" fill="#3b3833">SONNY</text>
        <text x="718" y="633" textAnchor="end" fontFamily="'Segoe UI', Arial, sans-serif" fontSize="9" letterSpacing="1" fill="#6e6a62">MODEL CPD-1401</text>
        <circle cx="706" cy="598" r="10" fill="rgba(134,224,111,.34)" />
        <circle cx="706" cy="598" r="5" fill="#8aef72" stroke="#3f6b34" strokeWidth="0.9" />
        <text x="706" y="617" textAnchor="middle" fontFamily="'Segoe UI', Arial, sans-serif" fontSize="8" fill="#6e6a62">POWER</text>
        <g transform="rotate(-1 395 608)">
          <rect x="300" y="592" width="190" height="31" rx="3" fill="#ece8dd" stroke="#b5b1a7" strokeWidth="1" />
          <rect x="301" y="621" width="188" height="2" fill="rgba(0,0,0,.13)" />
          <text x="395" y="612" textAnchor="middle" fontFamily="'Segoe UI', Arial, sans-serif" fontSize="11" fill="#4a4a46">{`«${title}»`}</text>
        </g>
      </svg>
      {/* экран: сама игра + виньетка кинескопа поверх краёв */}
      <div style={{ position: 'absolute', left: S.x, top: S.y, width: S.w, height: S.h }}>
        {children}
        <div
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', borderRadius: 9,
            boxShadow: 'inset 0 0 26px rgba(0,0,0,.5)',
          }}
        />
      </div>
    </div>
  );
}
