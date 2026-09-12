// PLAN-25: сервер перезапущен с новой сборкой — клиент устарел, нужен перезапуск страницы.
// Без этой плашки вкладка молча работала старым кодом, и исправления «не работали».
import { reloadForUpdate, useUpdateReady } from './store';

export function UpdateNotice() {
  const ready = useUpdateReady();
  if (!ready) return null;
  return (
    <div className="w95-update" role="status" title="Перезагрузить страницу" onClick={reloadForUpdate}>
      <b>🔄 Вышло обновление игры</b>
      <span>Нажмите, чтобы перезагрузить страницу</span>
    </div>
  );
}
