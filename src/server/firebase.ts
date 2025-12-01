/**
 * Firebase service for Team Stats
 * Implements hostname-based dev/prod database separation
 */

import admin from 'firebase-admin';
import { getDatabase, Database, Reference } from 'firebase-admin/database';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

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

class FirebaseService {
  private app: admin.app.App | null = null;
  private database: Database | null = null;
  private dbPrefix: string = '';
  private initialized: boolean = false;

  /**
   * Determine database prefix based on hostname
   * localhost/127.0.0.1/192.168.x.x → /dev/stats
   * production domain → /prod/stats
   */
  private determineEnvironment(hostname: string): 'dev' | 'prod' {
    const isDev =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.');

    return isDev ? 'dev' : 'prod';
  }

  /**
   * Initialize Firebase Admin SDK
   * @param hostname - The server hostname (e.g., 'localhost', 'orona.example.com')
   * @param serviceAccountPath - Optional path to Firebase service account JSON
   */
  async initialize(hostname: string, serviceAccountPath?: string): Promise<void> {
    if (this.initialized) {
      console.log('Firebase already initialized');
      return;
    }

    try {
      const env = this.determineEnvironment(hostname);
      this.dbPrefix = `/${env}/stats`;

      console.log(`Initializing Firebase for ${env} environment (hostname: ${hostname})`);
      console.log(`Database prefix: ${this.dbPrefix}`);

      // Initialize Firebase Admin
      // Try multiple credential methods in order of preference:
      // 1. Service account from environment variable (FIREBASE_SERVICE_ACCOUNT_JSON)
      // 2. Service account from file path (if provided and exists)
      // 3. Application default credentials

      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        // Use credentials from environment variable (Railway, etc.)
        console.log('Using Firebase credentials from FIREBASE_SERVICE_ACCOUNT_JSON environment variable');
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        this.app = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://your-project.firebaseio.com'
        });
      } else if (serviceAccountPath && existsSync(resolve(process.cwd(), serviceAccountPath))) {
        // Use service account file if it exists
        console.log(`Using Firebase credentials from file: ${serviceAccountPath}`);
        const absolutePath = resolve(process.cwd(), serviceAccountPath);
        const serviceAccountJSON = readFileSync(absolutePath, 'utf8');
        const serviceAccount = JSON.parse(serviceAccountJSON);
        this.app = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://your-project.firebaseio.com'
        });
      } else {
        // Fall back to application default credentials
        console.log('Using Firebase application default credentials');
        this.app = admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://your-project.firebaseio.com'
        });
      }

      this.database = getDatabase(this.app);
      this.initialized = true;

      console.log('Firebase initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Firebase:', error);
      throw error;
    }
  }

  /**
   * Check if Firebase is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get database reference with environment prefix
   */
  private getRef(path: string): Reference {
    if (!this.database) {
      throw new Error('Firebase not initialized. Call initialize() first.');
    }
    return this.database.ref(`${this.dbPrefix}${path}`);
  }

  /**
   * Record minute-level team ranking data
   * Path: /{env}/stats/minute/{year}/{month}/{day}/{timestamp}
   */
  async recordMinuteData(timestamp: number, rankings: TeamRanking['rankings']): Promise<void> {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const path = `/minute/${year}/${month}/${day}/${timestamp}`;
    const ref = this.getRef(path);

    await ref.set({
      timestamp,
      rankings
    });
  }

  /**
   * Get minute-level data for a specific day
   */
  async getMinuteData(date: Date): Promise<TeamRanking[]> {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const path = `/minute/${year}/${month}/${day}`;
    const ref = this.getRef(path);
    const snapshot = await ref.once('value');

    if (!snapshot.exists()) {
      return [];
    }

    const data = snapshot.val();
    const dataArray: TeamRanking[] = Object.values(data);

    // Sort by timestamp to ensure chronological order
    return dataArray.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Record hourly aggregated data
   * Path: /{env}/stats/hourly/{year}/{month}/{day}/{hour}
   */
  async recordHourlyData(timestamp: number, averageRanks: DailyAverage['averageRanks']): Promise<void> {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');

    const path = `/hourly/${year}/${month}/${day}/${hour}`;
    const ref = this.getRef(path);

    await ref.set({
      timestamp,
      averageRanks
    });
  }

  /**
   * Get hourly data for a specific day
   */
  async getHourlyData(date: Date): Promise<TeamRanking[]> {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const path = `/hourly/${year}/${month}/${day}`;
    const ref = this.getRef(path);
    const snapshot = await ref.once('value');

    if (!snapshot.exists()) {
      return [];
    }

    const data = snapshot.val();
    const dataArray: TeamRanking[] = Object.values(data);

    // Sort by timestamp to ensure chronological order
    return dataArray.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Record daily aggregated data
   * Path: /{env}/stats/daily/{year}/{month}/{day}
   */
  async recordDailyData(date: string, averageRanks: DailyAverage['averageRanks']): Promise<void> {
    const [year, month, day] = date.split('-');
    const path = `/daily/${year}/${month}/${day}`;
    const ref = this.getRef(path);

    await ref.set({
      date,
      averageRanks
    });
  }

  /**
   * Get daily data for a date range
   */
  async getDailyData(startDate: Date, endDate: Date): Promise<DailyAverage[]> {
    const results: DailyAverage[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');

      const path = `/daily/${year}/${month}/${day}`;
      const ref = this.getRef(path);
      const snapshot = await ref.once('value');

      if (snapshot.exists()) {
        results.push(snapshot.val());
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return results;
  }

  /**
   * Record monthly aggregated data
   * Path: /{env}/stats/monthly/{year}/{month}
   */
  async recordMonthlyData(month: string, averageRanks: MonthlyAverage['averageRanks']): Promise<void> {
    const [year, monthNum] = month.split('-');
    const path = `/monthly/${year}/${monthNum}`;
    const ref = this.getRef(path);

    await ref.set({
      month,
      averageRanks
    });
  }

  /**
   * Get monthly data for a date range
   */
  async getMonthlyData(startMonth: string, endMonth: string): Promise<MonthlyAverage[]> {
    const results: MonthlyAverage[] = [];
    const [startYear, startMonthNum] = startMonth.split('-').map(Number);
    const [endYear, endMonthNum] = endMonth.split('-').map(Number);

    let currentYear = startYear;
    let currentMonth = startMonthNum;

    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonthNum)) {
      const monthStr = String(currentMonth).padStart(2, '0');
      const path = `/monthly/${currentYear}/${monthStr}`;
      const ref = this.getRef(path);
      const snapshot = await ref.once('value');

      if (snapshot.exists()) {
        results.push(snapshot.val());
      }

      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }

    return results;
  }

  /**
   * Clean up old minute-level data (older than 7 days)
   * This should be run periodically to save storage space
   */
  async cleanupOldMinuteData(): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const year = sevenDaysAgo.getFullYear();
    const month = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');

    const path = `/minute/${year}/${month}`;
    const ref = this.getRef(path);
    const snapshot = await ref.once('value');

    if (!snapshot.exists()) {
      return;
    }

    const data = snapshot.val();
    const cutoffTimestamp = sevenDaysAgo.getTime();

    // Delete days older than cutoff
    for (const day in data) {
      const dayData = data[day];
      const timestamps = Object.keys(dayData);

      if (timestamps.length > 0 && Number(timestamps[0]) < cutoffTimestamp) {
        await this.getRef(`/minute/${year}/${month}/${day}`).remove();
        console.log(`Cleaned up minute data for ${year}-${month}-${day}`);
      }
    }
  }

  /**
   * Get stats data formatted for API responses
   * Fetches data from appropriate aggregation level based on period
   */
  async getStatsForPeriod(period: 'hour' | 'day' | 'week' | 'month' | 'year'): Promise<any[]> {
    const now = new Date();

    switch (period) {
      case 'hour': {
        // Get last hour of minute-level data, sampled every 5 minutes
        // Need to fetch from both today and yesterday in case we cross midnight
        const oneHourAgo = now.getTime() - (60 * 60 * 1000);
        const oneHourAgoDate = new Date(oneHourAgo);

        let allData: TeamRanking[] = [];

        // If the hour spans two different days, fetch from both
        if (oneHourAgoDate.getDate() !== now.getDate() ||
            oneHourAgoDate.getMonth() !== now.getMonth() ||
            oneHourAgoDate.getFullYear() !== now.getFullYear()) {
          const yesterdayData = await this.getMinuteData(oneHourAgoDate);
          const todayData = await this.getMinuteData(now);
          allData = [...yesterdayData, ...todayData];
        } else {
          allData = await this.getMinuteData(now);
        }

        // Filter to only last 60 minutes and sample every 5 minutes
        const lastHourData = allData.filter(d => d.timestamp >= oneHourAgo);
        // Sample every 5 minutes (every 5th data point)
        return lastHourData
          .filter((_: any, i: number) => i % 5 === 0)
          .map(d => ({
            timestamp: d.timestamp,
            rankings: d.rankings
          }));
      }

      case 'day': {
        // Get last 24 hours of minute-level data
        const twentyFourHoursAgo = now.getTime() - (24 * 60 * 60 * 1000);
        const twentyFourHoursAgoDate = new Date(twentyFourHoursAgo);

        let allData: TeamRanking[] = [];

        // If the 24 hours spans two different days, fetch from both
        if (twentyFourHoursAgoDate.getDate() !== now.getDate() ||
            twentyFourHoursAgoDate.getMonth() !== now.getMonth() ||
            twentyFourHoursAgoDate.getFullYear() !== now.getFullYear()) {
          const yesterdayData = await this.getMinuteData(twentyFourHoursAgoDate);
          const todayData = await this.getMinuteData(now);
          allData = [...yesterdayData, ...todayData];
        } else {
          allData = await this.getMinuteData(now);
        }

        // Filter to only last 24 hours
        const last24Hours = allData.filter(d => d.timestamp >= twentyFourHoursAgo);
        return last24Hours.map(d => ({
          timestamp: d.timestamp,
          rankings: d.rankings
        }));
      }

      case 'week': {
        // Get last 7 days of hourly data (168 hours)
        // Using hourly data instead of daily because daily aggregation
        // only runs once per day at midnight, so early servers won't have enough data
        const results: any[] = [];
        const currentDate = new Date(now);

        // Go back 7 days
        for (let daysAgo = 6; daysAgo >= 0; daysAgo--) {
          const date = new Date(now);
          date.setDate(date.getDate() - daysAgo);

          const hourlyData = await this.getHourlyData(date);
          hourlyData.forEach((d: any) => {
            results.push({
              timestamp: d.timestamp,
              rankings: d.averageRanks || d.rankings  // Handle both field names
            });
          });
        }

        return results;
      }

      case 'month': {
        // Get last 30 days of daily data
        const endDate = new Date(now);
        const startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 29);

        const data = await this.getDailyData(startDate, endDate);
        return data.map(d => ({
          timestamp: new Date(d.date).getTime(),
          rankings: d.averageRanks
        }));
      }

      case 'year': {
        // Get last 12 months of monthly data
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        let startYear = currentYear;
        let startMonth = currentMonth - 11;
        if (startMonth <= 0) {
          startMonth += 12;
          startYear -= 1;
        }

        const startMonthStr = `${startYear}-${String(startMonth).padStart(2, '0')}`;
        const endMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

        const data = await this.getMonthlyData(startMonthStr, endMonthStr);
        return data.map(d => ({
          timestamp: new Date(d.month + '-01').getTime(),
          rankings: d.averageRanks
        }));
      }

      default:
        return [];
    }
  }
}

// Export singleton instance
export const firebaseService = new FirebaseService();
