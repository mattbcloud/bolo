/**
 * Mock stats data generator for testing the team rankings graph
 * Generates realistic ranking data for day/week/month/year views
 */

interface RankingData {
  timestamp: number;
  rankings: {
    red: number | null;
    blue: number | null;
    yellow: number | null;
    green: number | null;
    orange: number | null;
    purple: number | null;
  };
}

interface DailyAverage {
  date: string;
  averageRanks: {
    red: number;
    blue: number;
    yellow: number;
    green: number;
    orange: number;
    purple: number;
  };
}

interface MonthlyAverage {
  month: string;
  averageRanks: {
    red: number;
    blue: number;
    yellow: number;
    green: number;
    orange: number;
    purple: number;
  };
}

/**
 * Generate a base rank pattern for a team color with randomized personality
 */
function generateTeamPattern(day: number, teamIndex: number, randomOffset: number): number {
  const patterns = [
    // Red: Strong early year, fades mid-year, recovers
    (d: number) => {
      if (d < 100) return 1.5 + Math.sin(d / 20) * 0.5 + randomOffset * 0.8;
      if (d < 250) return 3.5 + Math.sin(d / 15) * 1 + randomOffset * 0.6;
      return 2 + Math.sin(d / 25) * 0.8 + randomOffset * 0.7;
    },
    // Blue: Consistent mid-tier performer
    (d: number) => 3 + Math.sin(d / 30) * 0.5 + randomOffset * 0.9,
    // Yellow: Weak start, improves over time
    (d: number) => 5.5 - (d / 365) * 2 + Math.sin(d / 20) * 0.5 + randomOffset * 0.7,
    // Green: Dominant mid-year
    (d: number) => {
      if (d < 120 || d > 280) return 4 + Math.sin(d / 15) * 0.8 + randomOffset * 0.8;
      return 1.5 + Math.sin(d / 10) * 0.3 + randomOffset * 0.6;
    },
    // Orange: Sporadic performance
    (d: number) => 4 + Math.sin(d / 8) * 1.5 + randomOffset * 1.0,
    // Purple: Generally lower ranks
    (d: number) => 5 + Math.sin(d / 40) * 0.7 + randomOffset * 0.8,
  ];

  return patterns[teamIndex](day);
}

/**
 * Convert raw scores to actual rankings (1-6)
 */
function scorestoRankings(scores: number[]): number[] {
  // Create array of {index, score} and sort by score (lower is better)
  const indexed = scores.map((score, index) => ({ index, score }));
  indexed.sort((a, b) => a.score - b.score);

  // Assign ranks
  const ranks = new Array(6);
  indexed.forEach((item, rank) => {
    ranks[item.index] = rank + 1;
  });

  return ranks;
}

/**
 * Generate mock data for a single day (1440 minutes)
 */
export function generateDayData(date: Date = new Date()): RankingData[] {
  const data: RankingData[] = [];
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  // Check if we're viewing today - if so, mark where current time is
  const now = new Date();
  const isToday = startOfDay.toDateString() === now.toDateString();
  const currentMinute = isToday
    ? now.getHours() * 60 + now.getMinutes()
    : 1439; // Full day if viewing past date

  // Generate random offsets for each team to vary their performance each time
  const teamOffsets = [
    (Math.random() - 0.5) * 2,
    (Math.random() - 0.5) * 2,
    (Math.random() - 0.5) * 2,
    (Math.random() - 0.5) * 2,
    (Math.random() - 0.5) * 2,
    (Math.random() - 0.5) * 2,
  ];

  // Always generate full 24 hours
  for (let minute = 0; minute < 1440; minute++) {
    const timestamp = startOfDay.getTime() + (minute * 60 * 1000);

    // Add hourly patterns (more activity during peak hours)
    const hour = Math.floor(minute / 60);
    const activityLevel = hour >= 18 && hour <= 23 ? 1.5 : 1.0; // Peak evening hours

    // If this is in the future (for today's view), use null to stop the line
    const isFuture = isToday && minute > currentMinute;

    // Generate base scores for each team with randomness
    const scores = isFuture ? [null, null, null, null, null, null] : [
      generateTeamPattern(0, 0, teamOffsets[0]) + (Math.random() - 0.5) * activityLevel,
      generateTeamPattern(0, 1, teamOffsets[1]) + (Math.random() - 0.5) * activityLevel,
      generateTeamPattern(0, 2, teamOffsets[2]) + (Math.random() - 0.5) * activityLevel,
      generateTeamPattern(0, 3, teamOffsets[3]) + (Math.random() - 0.5) * activityLevel,
      generateTeamPattern(0, 4, teamOffsets[4]) + (Math.random() - 0.5) * activityLevel,
      generateTeamPattern(0, 5, teamOffsets[5]) + (Math.random() - 0.5) * activityLevel,
    ];

    const ranks = isFuture ? [null, null, null, null, null, null] : scorestoRankings(scores as number[]);

    data.push({
      timestamp,
      rankings: {
        red: ranks[0],
        blue: ranks[1],
        yellow: ranks[2],
        green: ranks[3],
        orange: ranks[4],
        purple: ranks[5],
      },
    });
  }

  return data;
}

/**
 * Generate mock data for a year (365 days of daily averages)
 */
export function generateYearData(year: number = new Date().getFullYear()): DailyAverage[] {
  const data: DailyAverage[] = [];

  // Generate random offsets for each team to vary their performance each time
  const teamOffsets = [
    (Math.random() - 0.5) * 2,
    (Math.random() - 0.5) * 2,
    (Math.random() - 0.5) * 2,
    (Math.random() - 0.5) * 2,
    (Math.random() - 0.5) * 2,
    (Math.random() - 0.5) * 2,
  ];

  for (let day = 0; day < 365; day++) {
    const date = new Date(year, 0, 1);
    date.setDate(date.getDate() + day);

    // Generate base scores for each team with randomness
    const scores = [
      generateTeamPattern(day, 0, teamOffsets[0]) + (Math.random() - 0.5) * 0.5,
      generateTeamPattern(day, 1, teamOffsets[1]) + (Math.random() - 0.5) * 0.5,
      generateTeamPattern(day, 2, teamOffsets[2]) + (Math.random() - 0.5) * 0.5,
      generateTeamPattern(day, 3, teamOffsets[3]) + (Math.random() - 0.5) * 0.5,
      generateTeamPattern(day, 4, teamOffsets[4]) + (Math.random() - 0.5) * 0.5,
      generateTeamPattern(day, 5, teamOffsets[5]) + (Math.random() - 0.5) * 0.5,
    ];

    const ranks = scorestoRankings(scores);

    data.push({
      date: date.toISOString().split('T')[0],
      averageRanks: {
        red: ranks[0],
        blue: ranks[1],
        yellow: ranks[2],
        green: ranks[3],
        orange: ranks[4],
        purple: ranks[5],
      },
    });
  }

  return data;
}

/**
 * Generate mock data for a week (rolling 7 days)
 */
export function generateWeekData(): DailyAverage[] {
  const data: DailyAverage[] = [];
  const now = new Date();

  // Generate data for rolling 7 days (going backwards from today)
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const year = date.getFullYear();

    // Generate year data for this year
    const yearData = generateYearData(year);

    // Get day of year
    const yearStart = new Date(year, 0, 0);
    const diff = date.getTime() - yearStart.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

    // Get the data for this specific day
    if (dayOfYear >= 0 && dayOfYear < yearData.length) {
      data.push(yearData[dayOfYear]);
    }
  }

  return data;
}

/**
 * Generate mock data for a month (days in current month)
 */
export function generateMonthData(): DailyAverage[] {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const yearData = generateYearData();

  // Get current day of year
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  // Return last N days where N = daysInMonth
  return yearData.slice(Math.max(0, dayOfYear - daysInMonth), dayOfYear);
}

/**
 * Generate monthly averages for year view (rolling 12 months)
 */
export function generateYearMonthlyData(): MonthlyAverage[] {
  const monthlyData: MonthlyAverage[] = [];
  const now = new Date();

  // Generate data for rolling 12 months (going backwards from current month)
  for (let i = 11; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();

    // Generate year data for this year if needed
    const yearData = generateYearData(year);

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    const daysInMonth = monthEnd.getDate();

    // Get day of year for start of month
    const yearStart = new Date(year, 0, 0);
    const diff = monthStart.getTime() - yearStart.getTime();
    const startDay = Math.floor(diff / (1000 * 60 * 60 * 24));

    // Average the daily ranks for this month
    const monthData = yearData.slice(startDay, startDay + daysInMonth);

    const avgRanks = {
      red: 0,
      blue: 0,
      yellow: 0,
      green: 0,
      orange: 0,
      purple: 0,
    };

    monthData.forEach(day => {
      avgRanks.red += day.averageRanks.red;
      avgRanks.blue += day.averageRanks.blue;
      avgRanks.yellow += day.averageRanks.yellow;
      avgRanks.green += day.averageRanks.green;
      avgRanks.orange += day.averageRanks.orange;
      avgRanks.purple += day.averageRanks.purple;
    });

    const count = monthData.length;

    monthlyData.push({
      month: monthStart.toISOString().slice(0, 7), // YYYY-MM format
      averageRanks: {
        red: Math.round(avgRanks.red / count),
        blue: Math.round(avgRanks.blue / count),
        yellow: Math.round(avgRanks.yellow / count),
        green: Math.round(avgRanks.green / count),
        orange: Math.round(avgRanks.orange / count),
        purple: Math.round(avgRanks.purple / count),
      },
    });
  }

  return monthlyData;
}
