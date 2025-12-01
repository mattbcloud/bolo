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
  private lastRecordedRankings: TeamRankings | null = null;
  private hourlyAggregationTimer: NodeJS.Timeout | null = null;
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
   * Records actual rankings to Firebase every minute (no averaging)
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

    // Check if all scores are zero (no game activity)
    // If so, skip recording to preserve last known rankings on graph
    if (scores.every(score => score === 0)) {
      // Update lastRecordTime so we don't spam this check
      if (currentMinute > this.lastRecordTime) {
        console.log(`Skipping minute data recording - no game activity (all scores are 0)`);
        this.lastRecordTime = currentMinute;
      }
      return;
    }

    // Convert scores to rankings
    const rankings = this.scorestoRankings(scores);

    // Store the latest rankings
    this.lastRecordedRankings = rankings;

    // Record to Firebase every minute (when we cross into a new minute)
    if (currentMinute > this.lastRecordTime) {
      // Record the actual rankings at the top of the minute (no averaging)
      try {
        await firebaseService.recordMinuteData(currentMinute, rankings);
        console.log(`Recorded minute data at ${new Date(currentMinute).toISOString()}`);
        console.log(`  Scores: R=${scores[0].toFixed(1)} B=${scores[1].toFixed(1)} Y=${scores[2].toFixed(1)} G=${scores[3].toFixed(1)} O=${scores[4].toFixed(1)} P=${scores[5].toFixed(1)}`);
        console.log(`  Rankings: R=${rankings.red} B=${rankings.blue} Y=${rankings.yellow} G=${rankings.green} O=${rankings.orange} P=${rankings.purple}`);
      } catch (error) {
        console.error('Failed to record minute data:', error);
      }

      this.lastRecordTime = currentMinute;
    }
  }

  /**
   * Get the last data point from an array of rankings
   * Used for snapshot-based aggregation instead of averaging
   */
  private getLastSnapshot(data: any[]): TeamRankings | null {
    if (data.length === 0) {
      return null;
    }

    // Get the last data point
    const lastPoint = data[data.length - 1];

    // Handle both direct rankings and nested averageRanks/rankings
    if (lastPoint.rankings) {
      return lastPoint.rankings;
    } else if (lastPoint.averageRanks) {
      return lastPoint.averageRanks;
    }

    return null;
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
   * Takes a snapshot at the top of the hour instead of averaging
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

      // Take a snapshot from the last minute of the hour (no averaging)
      const snapshot = this.getLastSnapshot(minuteData);

      if (!snapshot) {
        console.log('No valid snapshot found');
        return;
      }

      // Record hourly data as a snapshot
      await firebaseService.recordHourlyData(lastHour.getTime(), snapshot);

      console.log(`Hourly aggregation complete for ${lastHour.toISOString()}`);
    } catch (error) {
      console.error('Failed to run hourly aggregation:', error);
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
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    console.log('All stats aggregation jobs stopped');
  }
}

// Export singleton instance
export const statsService = new StatsService();
