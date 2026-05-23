import { describe, it, expect } from 'vitest';
import { hasNotes, sortItems, getPage, pageCount, formatDate } from '../../public/utils.js';

// ---------------------------------------------------------------------------
// hasNotes
// ---------------------------------------------------------------------------

describe('hasNotes', () => {
    it('returns false for empty array', () => {
        expect(hasNotes([])).toBe(false);
    });

    it('returns false when all notes are null', () => {
        expect(hasNotes([{ notes: null }, { notes: null }])).toBe(false);
    });

    it('returns false when all notes are undefined', () => {
        expect(hasNotes([{ notes: undefined }])).toBe(false);
    });

    it('returns false when all notes are empty string', () => {
        expect(hasNotes([{ notes: '' }])).toBe(false);
    });

    it('returns true when at least one item has a non-empty note', () => {
        expect(hasNotes([{ notes: null }, { notes: 'Great show' }])).toBe(true);
    });

    it('returns true when all items have notes', () => {
        expect(hasNotes([{ notes: 'a' }, { notes: 'b' }])).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// sortItems
// ---------------------------------------------------------------------------

const ITEMS = [
    { id: '1', description: 'Charlie', date: '2026-03-01', notes: null },
    { id: '2', description: 'Alice',   date: '2026-01-15', notes: 'Nice' },
    { id: '3', description: 'Bob',     date: '2026-05-10', notes: null },
];

describe('sortItems', () => {
    it('does not mutate the original array', () => {
        const original = [...ITEMS];
        sortItems(ITEMS, 'description', 'asc');
        expect(ITEMS).toEqual(original);
    });

    it('sorts by description ascending', () => {
        const sorted = sortItems(ITEMS, 'description', 'asc');
        expect(sorted.map(i => i.description)).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('sorts by description descending', () => {
        const sorted = sortItems(ITEMS, 'description', 'desc');
        expect(sorted.map(i => i.description)).toEqual(['Charlie', 'Bob', 'Alice']);
    });

    it('sorts by date ascending', () => {
        const sorted = sortItems(ITEMS, 'date', 'asc');
        expect(sorted.map(i => i.date)).toEqual(['2026-01-15', '2026-03-01', '2026-05-10']);
    });

    it('sorts by date descending', () => {
        const sorted = sortItems(ITEMS, 'date', 'desc');
        expect(sorted.map(i => i.date)).toEqual(['2026-05-10', '2026-03-01', '2026-01-15']);
    });

    it('sorts by notes, treating null as empty string (asc)', () => {
        const sorted = sortItems(ITEMS, 'notes', 'asc');
        // nulls sort before 'Nice' ascending
        const descriptions = sorted.map(i => i.description);
        const niceIndex = descriptions.indexOf('Alice');
        expect(niceIndex).toBe(descriptions.length - 1);
    });
});

// ---------------------------------------------------------------------------
// getPage
// ---------------------------------------------------------------------------

const FIFTY = Array.from({ length: 50 }, (_, i) => ({ id: String(i) }));

describe('getPage', () => {
    it('returns first 25 items on page 1', () => {
        const page = getPage(FIFTY, 1, 25);
        expect(page).toHaveLength(25);
        expect(page[0].id).toBe('0');
        expect(page[24].id).toBe('24');
    });

    it('returns second 25 items on page 2', () => {
        const page = getPage(FIFTY, 2, 25);
        expect(page).toHaveLength(25);
        expect(page[0].id).toBe('25');
    });

    it('returns fewer items on the last partial page', () => {
        const items = Array.from({ length: 30 }, (_, i) => ({ id: String(i) }));
        const page = getPage(items, 2, 25);
        expect(page).toHaveLength(5);
    });

    it('returns empty array for page beyond total', () => {
        expect(getPage(FIFTY, 10, 25)).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// pageCount
// ---------------------------------------------------------------------------

describe('pageCount', () => {
    it('returns 1 for empty list', () => {
        expect(pageCount(0)).toBe(1);
    });

    it('returns 1 when items fit on one page', () => {
        expect(pageCount(10, 25)).toBe(1);
        expect(pageCount(25, 25)).toBe(1);
    });

    it('returns 2 when items exceed one page', () => {
        expect(pageCount(26, 25)).toBe(2);
    });

    it('returns correct count for exact multiples', () => {
        expect(pageCount(50, 25)).toBe(2);
        expect(pageCount(75, 25)).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe('formatDate', () => {
    it('returns empty string for falsy input', () => {
        expect(formatDate('')).toBe('');
        expect(formatDate(null)).toBe('');
        expect(formatDate(undefined)).toBe('');
    });

    it('formats a date string correctly', () => {
        expect(formatDate('2026-01-15')).toBe('Jan 15, 2026');
        expect(formatDate('2026-12-31')).toBe('Dec 31, 2026');
    });

    it('handles single-digit month and day', () => {
        expect(formatDate('2026-03-05')).toBe('Mar 5, 2026');
    });
});
