// MessageBox в стиле Win95.
import { useMessageBox, closeMessageBox } from './store';

export function MessageBox() {
  const mb = useMessageBox();
  if (!mb) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="w95-window focused" style={{ position: 'relative', width: 380, height: 'auto', zIndex: 20001 }}>
        <div className="w95-titlebar"><span className="w95-title">{mb.title}</span></div>
        <div className="w95-body w95-panel" style={{ padding: 14 }}>
        {mb.body ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{mb.body}</div>
        ) : (
          <div className="w95-row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>⚠️</span>
            <div style={{ flex: 1, whiteSpace: 'pre-wrap', paddingTop: 4 }}>{mb.text}</div>
          </div>
        )}
          <div className="w95-row" style={{ justifyContent: 'center', marginTop: 14, gap: 8 }}>
            {mb.buttons.map((b) => (
              <button
                key={b.label}
                className="w95-btn"
                style={{ minWidth: 90 }}
                onClick={() => { closeMessageBox(); b.onClick(); }}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
