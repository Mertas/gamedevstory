// Справка — большое руководство по игре: содержание слева, статья справа (v1.36.0, 28.09.2026).
// Контент — в sections-a/sections-b; правки баланса должны доходить до текстов.
import { useState } from 'react';
import { SECTIONS_A } from './sections-a';
import { SECTIONS_B } from './sections-b';
import type { HelpSection } from './types';

const ALL_SECTIONS: HelpSection[] = [...SECTIONS_A, ...SECTIONS_B];

export function HelpApp() {
  const [openId, setOpenId] = useState<string>(ALL_SECTIONS[0]!.id);
  const open = ALL_SECTIONS.find((s) => s.id === openId) ?? ALL_SECTIONS[0]!;

  return (
    <div className="w95-help" data-autopilot="help">
      <div className="w95-help-nav" data-autopilot="help-nav">
        {ALL_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`w95-btn w95-help-navbtn${s.id === openId ? ' on' : ''}`}
            data-autopilot={`help-nav-${s.id}`}
            onClick={() => setOpenId(s.id)}
          >
            <span className="w95-help-navicon">{s.icon}</span> {s.title}
          </button>
        ))}
      </div>
      <div className="w95-help-body" key={open.id} data-autopilot={`help-section-${open.id}`}>
        {open.body()}
      </div>
    </div>
  );
}
