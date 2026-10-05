// PLAN-49 (Э1): тело попапа главы саги — абзацы текста, авто-вставки (по условиям),
// ручные вставки-чипы (по клику раскрываются абзацем) и приглашение к выбору.
// Состояние чипов — локальное: на логику не влияет (как на стенде quest-test).
import { useState } from 'react';
import type { GameState } from '../core/types';
import type { SagaNode } from '../shared/saga-data';
import { sagaCondOk, sagaResolveText } from '../shared/saga-text';

export function SagaChapterBody({ game, node }: { game: GameState; node: SagaNode }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const sub = (t: string) => sagaResolveText(t, node, game);
  const autos: string[] = [];
  const manuals: { i: number; label: string; text: string }[] = [];
  (node.inserts ?? []).forEach((ins, i) => {
    if (ins.mode === 'auto') {
      if (sagaCondOk(game, ins.when)) autos.push(ins.text);
    } else {
      manuals.push({ i, label: ins.label, text: ins.text });
    }
  });
  return (
    <div>
      <div className="w95-saga-text">
        {node.text.map((t, i) => <p key={i}>{sub(t)}</p>)}
        {autos.map((t, i) => <p key={`a${i}`} className="w95-saga-ins-auto">{sub(t)}</p>)}
        {manuals.filter((m) => open[m.i]).map((m) => (
          <p key={`m${m.i}`} className="w95-saga-ins-auto">{sub(m.text)}</p>
        ))}
      </div>
      {manuals.length > 0 && (
        <div className="w95-saga-inserts">
          <span>Вставки:</span>
          {manuals.map((m) => (
            <label key={m.i} className="w95-saga-ins-chip">
              <input
                type="checkbox"
                checked={!!open[m.i]}
                onChange={(e) => setOpen((p) => ({ ...p, [m.i]: e.target.checked }))}
              />
              {sub(m.label)}
            </label>
          ))}
        </div>
      )}
      {node.prompt && <div className="w95-saga-prompt">{sub(node.prompt)}</div>}
    </div>
  );
}
