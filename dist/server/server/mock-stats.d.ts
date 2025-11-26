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
 * Generate mock data for a single day (1440 minutes)
 */
export declare function generateDayData(date?: Date): RankingData[];
/**
 * Generate mock data for a year (365 days of daily averages)
 */
export declare function generateYearData(year?: number): DailyAverage[];
/**
 * Generate mock data for a week (rolling 7 days)
 */
export declare function generateWeekData(): DailyAverage[];
/**
 * Generate mock data for a month (days in current month)
 */
export declare function generateMonthData(): DailyAverage[];
/**
 * Generate monthly averages for year view (rolling 12 months)
 */
export declare function generateYearMonthlyData(): MonthlyAverage[];
export {};
//# sourceMappingURL=mock-stats.d.ts.map