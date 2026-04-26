import './style.css';
import { SpecGame } from './spec-game';

async function main() {
  const game = new SpecGame();
  await game.init();
  game.start();
}

main();
