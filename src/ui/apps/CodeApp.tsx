// Приложение «Код»: мастер нового проекта или статус разработки (UI-08: разрез на code/).
import { useGame } from '../store';
import { DevStatus } from './code/Dev';
import { ProjectWizard } from './code/Wizard';

export function CodeApp() {
  const game = useGame();
  const g = game.activeGame;

  if (g) return <DevStatus />;
  return <ProjectWizard />;
}
