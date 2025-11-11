import { useGameStore } from "../src/store/game";

// Because Zustand store is a React hook factory, we can import the store creation function directly
// but in this project useGameStore is the store itself (created by create()). We can call methods
// by grabbing the current store state via getState.

const store = useGameStore;

function snapshot(msg: string) {
  const state = store.getState();
  console.log(`\n--- ${msg} ---`);
  console.log("players:", state.players.map(p => ({ id: p.id, name: p.name, pos: p.position, funds: p.funds, inJail: p.inJail, jailTurns: p.jailTurns })));
  console.log("currentTurnIndex:", state.currentTurnIndex);
  console.log("lastRoll:", state.lastRoll);
  console.log("lastMovementPath:", state.lastMovementPath);
  console.log("logs:", state.logs);
}

async function wait(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function run() {
  // Setup two players quickly
  store.setState({
    players: [
      { id: 'p1', name: 'Alice', color: '#f00', funds: 1500, position: 0, tokenId: 'tesla-coil', inJail: false, jailTurns: 0, hasGetOutOfJail: false },
      { id: 'p2', name: 'Bob', color: '#0f0', funds: 1500, position: 0, tokenId: 'rocket', inJail: false, jailTurns: 0, hasGetOutOfJail: false },
    ],
    phase: 'rolling',
    currentTurnIndex: 0,
    propertyState: store.getState().propertyState,
    logs: [],
    lastMovementPath: [],
  });

  snapshot('Initial');

  // Simulate several rolls in sequence, capturing the state after each
  for (let i = 0; i < 8; i++) {
    console.log(`\n>>> Rolling ${i + 1}`);
    store.getState().rollDiceAndResolve();
    // small wait to allow any synchronous state changes to settle
    await wait(50);
    snapshot(`After roll ${i + 1}`);
  }

  // Force send a player to jail for testing
  const s = store.getState();
  s.players[0].position = s.players[0].position; // no-op
  s.players[0].inJail = true;
  s.players[0].jailTurns = 0;
  s.players[0].hasGetOutOfJail = false;
  store.setState({ players: s.players });

  snapshot('After forcing p1 to jail');

  // Simulate rolls while in jail
  for (let t = 0; t < 3; t++) {
    console.log(`\n>>> Jail roll ${t + 1}`);
    store.getState().rollDiceAndResolve();
    await wait(50);
    snapshot(`After jail roll ${t + 1}`);
  }

  // Attempt pay to leave
  console.log('\n>>> Attempt leave by payment');
  const p1 = store.getState().players[0];
  store.getState().leaveJailByPayment(p1.id);
  await wait(20);
  snapshot('After leaveJailByPayment');
}

run().then(() => console.log('\nTest finished')).catch((err) => console.error(err));
