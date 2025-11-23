/**
 * Team Stats Recording and Aggregation Service
 * Records team rankings from existing team scores and aggregates data for historical viewing
 */

import { firebaseService } from './firebase.js';

interface TeamRankings {
  red: number;
  blue: number;
  yellow: number;
  green: number;
  orange: number;
  purple: number;
}

class StatsService {
  private lastRecordTime: number = 0;
  private minuteDataBuffer: Array<{ timestamp: number; rankings: TeamRankings }> = [];
  private hourlyAggregationTimer: NodeJS.Timeout | null = null;
  private dailyAggregationTimer: NodeJS.Timeout | null = null;
  private monthlyAggregationTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  /**
   * Convert team scores to rankings (1-6, where 1 is best)
   * @param scores - Array of 6 team scores [red, blue, yellow, green, orange, purple]
   * @returns Rankings object
   */
  private scorestoRankings(scores: number[]): TeamRankings {
    // Create array of {team: index, score} and sort by score (higher is better)
    const indexed = scores.map((score, index) => ({ index, score }));
    indexed.sort((a, b) => b.score - a.score); // Descending order (higher score = better rank)

    // Assign ranks (1-6)
    const ranks = new Array(6);
    indexed.forEach((item, rank) => {
      ranks[item.index] = rank + 1;
    });

    return {
      red: ranks[0],
      blue: ranks[1],
      yellow: ranks[2],
      green: ranks[3],
      orange: ranks[4],
      purple: ranks[5],
    };
  }

  /**
   * Record team rankings from team scores
   * Called every second when team scores are calculated
   * Records to Firebase every minute
   *
   * @param scores - Array of 6 team scores [red, blue, yellow, green, orange, purple]
   */
  async recordTeamScores(scores: number[]): Promise<void> {
    if (!firebaseService.isInitialized()) {
      // Firebase not initialized, skip recording
      return;
    }

    const now = Date.now();
    const currentMinute = Math.floor(now / 60000) * 60000; // Round down to minute

    // Convert scores to rankings
    const rankings = this.scorestoRankings(scores);

    // Add to buffer for averaging
    this.minuteDataBuffer.push({ timestamp: now, rankings });

    // Record to Firebase every minute (when we cross into a new minute)
    if (currentMinute > this.lastRecordTime) {
      if (this.minuteDataBuffer.length > 0) {
        // Calculate average rankings for the minute
        const avgRankings = this.averageRankings(this.minuteDataBuffer.map(d => d.rankings));

        try {
          await firebaseService.recordMinuteData(currentMinute, avgRankings);
          console.log(`Recorded minute data at ${new Date(currentMinute).toISOString()}`);
        } catch (error) {
          console.error('Failed to record minute data:', error);
        }

        // Clear buffer
        this.minuteDataBuffer = [];
      }

      this.lastRecordTime = currentMinute;
    }
  }

  /**
   * Calculate average rankings from multiple data points
   */
  private averageRankings(rankings: TeamRankings[]): TeamRankings {
    if (rankings.length === 0) {
      return { red: 0, blue: 0, yellow: 0, green: 0, orange: 0, purple: 0 };
    }

    const totals = {
      red: 0,
      blue: 0,
      yellow: 0,
      green: 0,
      orange: 0,
      purple: 0,
    };

    rankings.forEach(r => {
      totals.red += r.red;
      totals.blue += r.blue;
      totals.yellow += r.yellow;
      totals.green += r.green;
      totals.orange += r.orange;
      totals.purple += r.purple;
    });

    const count = rankings.length;

    return {
      red: Math.round(totals.red / count),
      blue: Math.round(totals.blue / count),
      yellow: Math.round(totals.yellow / count),
      green: Math.round(totals.green / count),
      orange: Math.round(totals.orange / count),
      purple: Math.round(totals.purple / count),
    };
  }

  /**
   * Start hourly aggregation job
   * Runs every hour to aggregate the previous hour's minute data
   */
  startHourlyAggregation(): void {
    // Run at the top of every hour
    const now = new Date();
    const msUntilNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000;

    setTimeout(() => {
      this.runHourlyAggregation();

      // Then run every hour
      this.hourlyAggregationTimer = setInterval(() => {
        this.runHourlyAggregation();
      }, 60 * 60 * 1000); // Every hour
    }, msUntilNextHour);

    console.log(`Hourly aggregation will start in ${Math.round(msUntilNextHour / 1000 / 60)} minutes`);
  }

  /**
   * Run hourly aggregation
   */
  private async runHourlyAggregation(): Promise<void> {
    if (!firebaseService.isInitialized()) {
      return;
    }

    try {
      const now = new Date();
      const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

      console.log(`Running hourly aggregation for ${lastHour.toISOString()}`);

      // Get minute data for the last hour
      const minuteData = await firebaseService.getMinuteData(lastHour);

      if (minuteData.length === 0) {
        console.log('No minute data to aggregate');
        return;
      }

      // Calculate average rankings
      const avgRankings = this.averageRankings(minuteData.map(d => d.rankings));

      // Record hourly data
      await firebaseService.recordHourlyData(lastHour.getTime(), avgRankings);

      console.log(`Hourly aggregation complete for ${lastHour.toISOString()}`);
    } catch (error) {
      console.error('Failed to run hourly aggregation:', error);
    }
  }

  /**
   * Start daily aggregation job
   * Runs once per day at midnight to aggregate the previous day's hourly data
   */
  startDailyAggregation(): void {
    // Run at midnight
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();

    setTimeout(() => {
      this.runDailyAggregation();

      // Then run every day
      this.dailyAggregationTimer = setInterval(() => {
        this.runDailyAggregation();
      }, 24 * 60 * 60 * 1000); // Every 24 hours
    }, msUntilMidnight);

    console.log(`Daily aggregation will start in ${Math.round(msUntilMidnight / 1000 / 60 / 60)} hours`);
  }

  /**
   * Run daily aggregation
   */
  private async runDailyAggregation(): Promise<void> {
    if (!firebaseService.isInitialized()) {
      return;
    }

    try {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      console.log(`Running daily aggregation for ${yesterday.toISOString().split('T')[0]}`);

      // Get hourly data for yesterday
      const hourlyData = await firebaseService.getHourlyData(yesterday);

      if (hourlyData.length === 0) {
        console.log('No hourly data to aggregate');
        return;
      }

      // Calculate average rankings
      const avgRankings = this.averageRankings(hourlyData.map(d => d.rankings));

      // Record daily data
      const dateStr = yesterday.toISOString().split('T')[0];
      await firebaseService.recordDailyData(dateStr, avgRankings);

      console.log(`Daily aggregation complete for ${dateStr}`);
    } catch (error) {
      console.error('Failed to run daily aggregation:', error);
    }
  }

  /**
   * Start monthly aggregation job
   * Runs on the 1st of each month to aggregate the previous month's daily data
   */
  startMonthlyAggregation(): void {
    // Run on the 1st of next month
    const now = new Date();
    const firstOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const msUntilFirstOfMonth = firstOfNextMonth.getTime() - now.getTime();

    setTimeout(() => {
      this.runMonthlyAggregation();

      // Then run every month (check daily if it's the 1st)
      this.monthlyAggregationTimer = setInterval(() => {
        const today = new Date();
        if (today.getDate() === 1) {
          this.runMonthlyAggregation();
        }
      }, 24 * 60 * 60 * 1000); // Check daily
    }, msUntilFirstOfMonth);

    console.log(
      `Monthly aggregation will start in ${Math.round(msUntilFirstOfMonth / 1000 / 60 / 60 / 24)} days`
    );
  }

  /**
   * Run monthly aggregation
   */
  private async runMonthlyAggregation(): Promise<void> {
    if (!firebaseService.isInitialized()) {
      return;
    }

    try {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

      const monthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;

      console.log(`Running monthly aggregation for ${monthStr}`);

      // Get daily data for last month
      const dailyData = await firebaseService.getDailyData(lastMonth, lastDayOfLastMonth);

      if (dailyData.length === 0) {
        console.log('No daily data to aggregate');
        return;
      }

      // Calculate average rankings
      const avgRankings = this.averageRankings(dailyData.map(d => d.averageRanks));

      // Record monthly data
      await firebaseService.recordMonthlyData(monthStr, avgRankings);

      console.log(`Monthly aggregation complete for ${monthStr}`);
    } catch (error) {
      console.error('Failed to run monthly aggregation:', error);
    }
  }

  /**
   * Start cleanup job to remove old minute-level data
   * Runs daily to clean up data older than 7 days
   */
  startCleanupJob(): void {
    // Run daily at 3am
    const now = new Date();
    const next3am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 3, 0, 0);
    if (next3am <= now) {
      next3am.setDate(next3am.getDate() + 1);
    }
    const msUntil3am = next3am.getTime() - now.getTime();

    setTimeout(() => {
      this.runCleanup();

      // Then run every day
      this.cleanupTimer = setInterval(() => {
        this.runCleanup();
      }, 24 * 60 * 60 * 1000); // Every 24 hours
    }, msUntil3am);

    console.log(`Cleanup job will start in ${Math.round(msUntil3am / 1000 / 60 / 60)} hours`);
  }

  /**
   * Run cleanup
   */
  private async runCleanup(): Promise<void> {
    if (!firebaseService.isInitialized()) {
      return;
    }

    try {
      console.log('Running data cleanup...');
      await firebaseService.cleanupOldMinuteData();
      console.log('Cleanup complete');
    } catch (error) {
      console.error('Failed to run cleanup:', error);
    }
  }

  /**
   * Start all aggregation and cleanup jobs
   */
  startAllJobs(): void {
    this.startHourlyAggregation();
    this.startDailyAggregation();
    this.startMonthlyAggregation();
    this.startCleanupJob();
    console.log('All stats aggregation jobs started');
  }

  /**
   * Stop all jobs
   */
  stopAllJobs(): void {
    if (this.hourlyAggregationTimer) {
      clearInterval(this.hourlyAggregationTimer);
      this.hourlyAggregationTimer = null;
    }
    if (this.dailyAggregationTimer) {
      clearInterval(this.dailyAggregationTimer);
      this.dailyAggregationTimer = null;
    }
    if (this.monthlyAggregationTimer) {
      clearInterval(this.monthlyAggregationTimer);
      this.monthlyAggregationTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    console.log('All stats aggregation jobs stopped');
  }
}

// Export singleton instance
export const statsService = new StatsService();
