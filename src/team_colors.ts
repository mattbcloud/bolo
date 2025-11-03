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
  { r: 255, g: 0, b: 0, name: 'red' },        // Team 0
  { r: 0, g: 0, b: 255, name: 'blue' },       // Team 1
  { r: 255, g: 255, b: 0, name: 'yellow' },   // Team 2
  { r: 0, g: 255, b: 0, name: 'green' },      // Team 3
  { r: 255, g: 165, b: 0, name: 'orange' },   // Team 4
  { r: 128, g: 0, b: 128, name: 'purple' },   // Team 5
];

export default TEAM_COLORS;
