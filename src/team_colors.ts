/**
 * This module contains just a list of team colours and descriptive names.
 */

export interface TeamColor {
  r: number;
  g: number;
  b: number;
  name: string;
}

const TEAM_COLORS: TeamColor[] = [
  // Primaries:
  { r: 255, g: 0, b: 0, name: 'red' },
  { r: 0, g: 0, b: 255, name: 'blue' },
  { r: 0, g: 255, b: 0, name: 'green' },

  // Secondaries:
  { r: 0, g: 255, b: 255, name: 'cyan' },
  { r: 255, g: 255, b: 0, name: 'yellow' },
  { r: 255, g: 0, b: 255, name: 'magenta' },

  // FIXME: Need some more here, probably at least 16 total.
];

export default TEAM_COLORS;
