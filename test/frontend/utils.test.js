import { describe, it, expect } from 'vitest';
import { hasNotes, sortItems, filterItems, formatDate } from '../../public/utils.js';

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
// filterItems
// ---------------------------------------------------------------------------

describe('filterItems', () => {
    it('returns all items when filters is empty', () => {
        expect(filterItems(ITEMS, {})).toHaveLength(3);
    });

    it('returns all items when filters is null/undefined', () => {
        expect(filterItems(ITEMS, null)).toHaveLength(3);
        expect(filterItems(ITEMS, undefined)).toHaveLength(3);
    });

    it('matches description case-insensitively', () => {
        const out = filterItems(ITEMS, { description: 'ALI' });
        expect(out.map(i => i.description)).toEqual(['Alice']);
    });

    it('matches notes case-insensitively, treating null as no match', () => {
        const out = filterItems(ITEMS, { notes: 'nic' });
        expect(out.map(i => i.description)).toEqual(['Alice']);
    });

    it('matches date by locale-formatted string', () => {
        const out = filterItems(ITEMS, { date: 'jan' });
        expect(out.map(i => i.description)).toEqual(['Alice']);
    });

    it('matches date by ISO substring', () => {
        const out = filterItems(ITEMS, { date: '2026-01' });
        expect(out.map(i => i.description)).toEqual(['Alice']);
    });

    it('combines multiple filters with AND semantics', () => {
        const out = filterItems(ITEMS, { description: 'a', date: '2026' });
        expect(out.map(i => i.description)).toEqual(['Charlie', 'Alice']);
    });

    it('returns empty array when nothing matches', () => {
        expect(filterItems(ITEMS, { description: 'zzz' })).toEqual([]);
    });

    it('handles items with missing description/notes', () => {
        const items = [{ id: '1', description: null, date: '2026-01-01', notes: null }];
        expect(filterItems(items, { description: 'x' })).toEqual([]);
        expect(filterItems(items, { notes: 'x' })).toEqual([]);
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
