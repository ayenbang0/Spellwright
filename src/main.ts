import './ui/style.css';
import { Game } from './game/game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const loading = document.getElementById('loading') as HTMLElement;

Game.create(canvas, ui, (p) => {
  loading.textContent = `Loading… ${Math.round(p * 100)}%`;
})
  .then((game) => {
    loading.remove();
    // exposed for debugging / automated smoke tests
    (window as unknown as { game: Game }).game = game;
  })
  .catch((err) => {
    loading.textContent = `Failed to start: ${err instanceof Error ? err.message : String(err)}`;
    console.error(err);
  });
