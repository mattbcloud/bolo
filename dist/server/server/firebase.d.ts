/**
 * Firebase service for Team Stats
 * Implements hostname-based dev/prod database separation
 */
interface TeamRanking {
    timestamp: number;
    rankings: {
        red: number;
        blue: number;
        yellow: number;
        green: number;
        orange: number;
        purple: number;
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
declare class FirebaseService {
    private app;
    private database;
    private dbPrefix;
    private initialized;
    /**
     * Determine database prefix based on hostname
     * localhost/127.0.0.1/192.168.x.x → /dev/stats
     * production domain → /prod/stats
     */
    private determineEnvironment;
    /**
     * Initialize Firebase Admin SDK
     * @param hostname - The server hostname (e.g., 'localhost', 'orona.example.com')
     * @param serviceAccountPath - Optional path to Firebase service account JSON
     */
    initialize(hostname: string, serviceAccountPath?: string): Promise<void>;
    /**
     * Check if Firebase is initialized
     */
    isInitialized(): boolean;
    /**
     * Get database reference with environment prefix
     */
    private getRef;
    /**
     * Record minute-level team ranking data
     * Path: /{env}/stats/minute/{year}/{month}/{day}/{timestamp}
     */
    recordMinuteData(timestamp: number, rankings: TeamRanking['rankings']): Promise<void>;
    /**
     * Get minute-level data for a specific day
     */
    getMinuteData(date: Date): Promise<TeamRanking[]>;
    /**
     * Record hourly aggregated data
     * Path: /{env}/stats/hourly/{year}/{month}/{day}/{hour}
     */
    recordHourlyData(timestamp: number, averageRanks: DailyAverage['averageRanks']): Promise<void>;
    /**
     * Get hourly data for a specific day
     */
    getHourlyData(date: Date): Promise<TeamRanking[]>;
    /**
     * Record daily aggregated data
     * Path: /{env}/stats/daily/{year}/{month}/{day}
     */
    recordDailyData(date: string, averageRanks: DailyAverage['averageRanks']): Promise<void>;
    /**
     * Get daily data for a date range
     */
    getDailyData(startDate: Date, endDate: Date): Promise<DailyAverage[]>;
    /**
     * Record monthly aggregated data
     * Path: /{env}/stats/monthly/{year}/{month}
     */
    recordMonthlyData(month: string, averageRanks: MonthlyAverage['averageRanks']): Promise<void>;
    /**
     * Get monthly data for a date range
     */
    getMonthlyData(startMonth: string, endMonth: string): Promise<MonthlyAverage[]>;
    /**
     * Clean up old minute-level data (older than 7 days)
     * This should be run periodically to save storage space
     */
    cleanupOldMinuteData(): Promise<void>;
    /**
     * Get stats data formatted for API responses
     * Fetches data from appropriate aggregation level based on period
     */
    getStatsForPeriod(period: 'hour' | 'day' | 'week' | 'month' | 'year'): Promise<any[]>;
}
export declare const firebaseService: FirebaseService;
export {};
//# sourceMappingURL=firebase.d.ts.map