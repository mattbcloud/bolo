/**
 * Team Stats Recording and Aggregation Service
 * Records team rankings from existing team scores and aggregates data for historical viewing
 */
declare class StatsService {
    private lastRecordTime;
    private lastRecordedRankings;
    private hourlyAggregationTimer;
    private dailyAggregationTimer;
    private monthlyAggregationTimer;
    private cleanupTimer;
    /**
     * Convert team scores to rankings (1-6, where 1 is best)
     * @param scores - Array of 6 team scores [red, blue, yellow, green, orange, purple]
     * @returns Rankings object
     */
    private scorestoRankings;
    /**
     * Record team rankings from team scores
     * Called every second when team scores are calculated
     * Records actual rankings to Firebase every minute (no averaging)
     *
     * @param scores - Array of 6 team scores [red, blue, yellow, green, orange, purple]
     */
    recordTeamScores(scores: number[]): Promise<void>;
    /**
     * Get the last data point from an array of rankings
     * Used for snapshot-based aggregation instead of averaging
     */
    private getLastSnapshot;
    /**
     * Start hourly aggregation job
     * Runs every hour to aggregate the previous hour's minute data
     */
    startHourlyAggregation(): void;
    /**
     * Run hourly aggregation
     * Takes a snapshot at the top of the hour instead of averaging
     */
    private runHourlyAggregation;
    /**
     * Start daily aggregation job
     * Runs once per day at midnight to aggregate the previous day's hourly data
     */
    startDailyAggregation(): void;
    /**
     * Run daily aggregation
     * Takes a snapshot at midnight instead of averaging
     */
    private runDailyAggregation;
    /**
     * Start monthly aggregation job
     * Runs on the 1st of each month to aggregate the previous month's daily data
     */
    startMonthlyAggregation(): void;
    /**
     * Run monthly aggregation
     * Takes a snapshot at the end of the month instead of averaging
     */
    private runMonthlyAggregation;
    /**
     * Start cleanup job to remove old minute-level data
     * Runs daily to clean up data older than 7 days
     */
    startCleanupJob(): void;
    /**
     * Run cleanup
     */
    private runCleanup;
    /**
     * Start all aggregation and cleanup jobs
     */
    startAllJobs(): void;
    /**
     * Stop all jobs
     */
    stopAllJobs(): void;
}
export declare const statsService: StatsService;
export {};
//# sourceMappingURL=stats-service.d.ts.map