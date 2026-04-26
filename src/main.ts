import './style.css';
import { Game } from './game';

async function main() {
  const game = new Game();
  await game.init();
  game.start();
}

main();
