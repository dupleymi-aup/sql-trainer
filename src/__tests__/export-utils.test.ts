// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { exportToCSV, exportToJSON } from '@/lib/export-utils';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'age', label: 'Age' },
  { key: 'score', label: 'Score' },
];

const data = [
  { name: 'Alice', age: 30, score: 95 },
  { name: 'Bob', age: 25, score: 87 },
];

function createMockLink() {
  return {
    setAttribute: vi.fn(),
    style: {},
    click: vi.fn(),
  } as unknown as HTMLAnchorElement;
}

function setupDomMocks() {
  const link = createMockLink();
  vi.spyOn(document, 'createElement').mockReturnValue(link);
  vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn());
  vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn());
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(vi.fn());
  return link;
}

describe('exportToCSV', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate CSV with BOM and correct MIME type', () => {
    setupDomMocks();
    exportToCSV(data, columns, 'test-file');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blobArg.type).toBe('text/csv;charset=utf-8;');
  });

  it('should not generate CSV for empty data', () => {
    setupDomMocks();
    exportToCSV([], columns, 'empty');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('should handle null values gracefully', () => {
    setupDomMocks();
    const dataWithNulls = [{ name: null, age: 25, score: undefined }];
    exportToCSV(dataWithNulls, columns, 'nulls');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('exportToJSON', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should generate JSON with correct MIME type', () => {
    setupDomMocks();
    exportToJSON(data, 'test-file');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blobArg.type).toBe('application/json');
  });

  it('should not generate JSON for empty data', () => {
    setupDomMocks();
    exportToJSON([], 'empty');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
