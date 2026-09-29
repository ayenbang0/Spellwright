/** Each attack spell alone on a big wand vs one dummy: catches spells that deal no damage at all. */
import { BUILDS, content, simulate, type Build } from './sim-builds';

void BUILDS;
const rows: string[] = [];
for (const s of content.data.spells) {
  if (s.type === 'Boost' || s.type === 'Passive') continue;
  const b: Build = { name: s.id, spells: [s.id], wiki: '', seconds: 12 };
  const r = simulate(b);
  const listed = s.damage[0] ? `${s.damage[0]}${s.dps ? '/s' : ''}` : '-';
  rows.push(`${s.id.padEnd(26)} ${s.type.padEnd(10)} tooltip ${listed.padStart(7)}  sim avg ${r.dps.toFixed(0).padStart(6)}  peak ${r.peak.toFixed(0).padStart(6)}`);
}
console.log(rows.join('\n'));
