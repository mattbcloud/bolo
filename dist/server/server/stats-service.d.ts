/**
 * Team Stats Recording and Aggregation Service
 * Records team rankings from existing team scores and aggregates data for historical viewing
 */
declare class StatsService {
    private lastRecordTime;
    private minuteDataBuffer;
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
     * Records to Firebase every minute
     *
     * @param scores - Array of 6 team scores [red, blue, yellow, green, orange, purple]
     */
    recordTeamScores(scores: number[]): Promise<void>;
    /**
     * Calculate average rankings from multiple data points
     */
    private averageRankings;
    /**
     * Start hourly aggregation job
     * Runs every hour to aggregate the previous hour's minute data
     */
    startHourlyAggregation(): void;
    /**
     * Run hourly aggregation
     */
    private runHourlyAggregation;
    /**
     * Start daily aggregation job
     * Runs once per day at midnight to aggregate the previous day's hourly data
     */
    startDailyAggregation(): void;
    /**
     * Run daily aggregation
     */
    private runDailyAggregation;
    /**
     * Start monthly aggregation job
     * Runs on the 1st of each month to aggregate the previous month's daily data
     */
    startMonthlyAggregation(): void;
    /**
     * Run monthly aggregation
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