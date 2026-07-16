import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordSqlPerformance, getSqlPerformanceStats } from '@/lib/sql-performance-monitor';
import { getDb } from '@/lib/db/connection';

// Mock the database
vi.mock('@/lib/db/connection', () => ({
  getDb: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('sql-performance-monitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordSqlPerformance', () => {
    it('records a successful SELECT query', () => {
      const runMock = vi.fn();
      const allMock = vi.fn().mockReturnValue([{ name: 'sql_performance' }]);
      const getMock = vi.fn().mockReturnValue({ c: 0 });

      const prepareMock = vi.fn((sql: string) => {
        if (sql.includes('sqlite_master')) {
          return { all: allMock };
        }
        if (sql.includes('COUNT')) {
          return { get: getMock };
        }
        return { run: runMock };
      });

      (getDb as ReturnType<typeof vi.fn>).mockReturnValue({ prepare: prepareMock });

      recordSqlPerformance({
        queryType: 'SELECT',
        executionTimeMs: 45,
        rowsReturned: 10,
        hasError: false,
        dbType: 'sqlite',
      });

      expect(prepareMock).toHaveBeenCalled();
      expect(runMock).toHaveBeenCalled();
    });

    it('records a failed query with error message', () => {
      const runMock = vi.fn();
      const allMock = vi.fn().mockReturnValue([{ name: 'sql_performance' }]);
      const getMock = vi.fn().mockReturnValue({ c: 0 });

      const prepareMock = vi.fn((sql: string) => {
        if (sql.includes('sqlite_master')) {
          return { all: allMock };
        }
        if (sql.includes('COUNT')) {
          return { get: getMock };
        }
        return { run: runMock };
      });

      (getDb as ReturnType<typeof vi.fn>).mockReturnValue({ prepare: prepareMock });

      recordSqlPerformance({
        queryType: 'INSERT',
        executionTimeMs: 120,
        rowsReturned: 0,
        hasError: true,
        errorMessage: 'Table does not exist',
        dbType: 'postgresql',
      });

      expect(runMock).toHaveBeenCalled();
    });

    it('handles missing table gracefully', () => {
      const runMock = vi.fn();

      const prepareMock = vi.fn((sql: string) => {
        if (sql.includes('sqlite_master')) {
          return { all: () => [] };
        }
        return { run: runMock };
      });

      (getDb as ReturnType<typeof vi.fn>).mockReturnValue({ prepare: prepareMock });

      // Should not fail even when table doesn't exist
      expect(() => {
        recordSqlPerformance({
          queryType: 'SELECT',
          executionTimeMs: 10,
          rowsReturned: 5,
          hasError: false,
          dbType: 'sqlite',
        });
      }).not.toThrow();
    });

    it('handles database errors gracefully', () => {
      const prepareMock = vi.fn(() => {
        throw new Error('Database connection failed');
      });

      (getDb as ReturnType<typeof vi.fn>).mockReturnValue({ prepare: prepareMock });

      // Should not throw
      expect(() => {
        recordSqlPerformance({
          queryType: 'SELECT',
          executionTimeMs: 10,
          rowsReturned: 5,
          hasError: false,
          dbType: 'sqlite',
        });
      }).not.toThrow();
    });
  });

  describe('getSqlPerformanceStats', () => {
    it('returns statistics for the given period', () => {
      const overallMock = {
        totalQueries: 100,
        avgExecutionTime: 50,
        worstTime: 500,
        slowQueries: 5,
        errorCount: 2,
      };

      const byTypeMock = [
        { queryType: 'SELECT', count: 80, avgTime: 40, worstTime: 300, errorCount: 1 },
        { queryType: 'INSERT', count: 20, avgTime: 80, worstTime: 500, errorCount: 1 },
      ];

      const topSlowMock = [
        {
          queryType: 'SELECT',
          executionTimeMs: 500,
          taskId: 'task-1',
          dbType: 'sqlite',
          collectedAt: Date.now(),
        },
      ];

      const allTimesMock = Array.from({ length: 100 }, (_, i) => ({
        execution_time_ms: i * 5,
      }));

      // Track how many times prepare is called and return appropriate mock
      let prepareCallCount = 0;

      const prepareMock = vi.fn(() => {
        prepareCallCount++;
        const callNum = prepareCallCount;

        // First call: overall stats
        if (callNum === 1) {
          return { all: vi.fn(() => [overallMock]) };
        }
        // Second call: byType
        if (callNum === 2) {
          return { all: vi.fn(() => byTypeMock) };
        }
        // Third call: topSlow
        if (callNum === 3) {
          return { all: vi.fn(() => topSlowMock) };
        }
        // Fourth call: allTimes for P95
        return { all: vi.fn(() => allTimesMock) };
      });

      (getDb as ReturnType<typeof vi.fn>).mockReturnValue({ prepare: prepareMock });

      const stats = getSqlPerformanceStats(7);

      expect(stats.totalQueries).toBe(100);
      expect(stats.avgExecutionTime).toBe(50);
      expect(stats.slowQueries).toBe(5);
      expect(stats.errorRate).toBeCloseTo(2, 0);
      expect(stats.byType).toHaveLength(2);
      expect(stats.topSlowQueries).toHaveLength(1);
      expect(stats.p95ExecutionTime).toBeGreaterThan(0);
    });

    it('returns zero stats when no data exists', () => {
      const prepareMock = vi.fn(() => {
        const stmt = {
          all: vi.fn(() => {
            return [{ totalQueries: 0, avgExecutionTime: null, worstTime: null, slowQueries: null, errorCount: null }];
          }),
        };
        return stmt;
      });

      (getDb as ReturnType<typeof vi.fn>).mockReturnValue({ prepare: prepareMock });

      const stats = getSqlPerformanceStats(7);

      expect(stats.totalQueries).toBe(0);
      expect(stats.avgExecutionTime).toBe(0);
      expect(stats.p95ExecutionTime).toBe(0);
      expect(stats.slowQueries).toBe(0);
      expect(stats.errorRate).toBe(0);
    });
  });
});
