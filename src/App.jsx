import items from './data/items.json';
import prayers from './data/prayers.json';
import potions from './data/potions.json';
import specials from './data/specials.json';

export default function App() {
  return (
    <div className="p-4 text-osrs-yellow">
      <h1 className="text-2xl mb-2">OSRS PvP Simulator</h1>
      <p className="mb-4 text-sm opacity-80">
        Phase 1 scaffold. Engine arrives in Phase 2.
      </p>
      <ul className="text-sm">
        <li>items.json: {Object.keys(items).length} entries</li>
        <li>prayers.json: {Object.keys(prayers).length} entries</li>
        <li>potions.json: {Object.keys(potions).length} entries</li>
        <li>specials.json: {Object.keys(specials).length} entries</li>
      </ul>
    </div>
  );
}
