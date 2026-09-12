// Версия игры в интерфейсе (plan/23_Версионирование.md): низ рабочего стола,
// экран входа и экран выбора сохранения. Источник версии — package.json (vite define).
import { versionLabel, versionTitle } from '../shared/version';

export function VersionStamp({ className }: { className?: string }) {
  return (
    <div className={'w95-version' + (className ? ' ' + className : '')} title={versionTitle()}>
      Game Dev Story {versionLabel()}
    </div>
  );
}
