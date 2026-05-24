import { describe, it, expect } from 'vitest';
import {
    hasNotes,
    sortItems,
    filterItems,
    formatDate,
    computeSelectAllState,
    toggleAllVisible,
    buildBatchUpdates,
} from '../../frontend/utils.js';

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

// ---------------------------------------------------------------------------
// computeSelectAllState
// ---------------------------------------------------------------------------

describe('computeSelectAllState', () => {
    it('returns "none" when no items are visible', () => {
        expect(computeSelectAllState(new Set(['a', 'b']), [])).toBe('none');
    });

    it('returns "none" when no visible items are selected', () => {
        expect(computeSelectAllState(new Set(), ['a', 'b'])).toBe('none');
    });

    it('returns "all" when every visible item is selected', () => {
        expect(computeSelectAllState(new Set(['a', 'b']), ['a', 'b'])).toBe('all');
    });

    it('returns "some" when only part of the visible set is selected', () => {
        expect(computeSelectAllState(new Set(['a']), ['a', 'b'])).toBe('some');
    });

    it('ignores selected IDs that are not in the visible set', () => {
        // Hidden selections must not push the state to "all".
        expect(computeSelectAllState(new Set(['a', 'hidden']), ['a', 'b'])).toBe('some');
        // Or to "none" by inflating the count past zero erroneously.
        expect(computeSelectAllState(new Set(['hidden']), ['a', 'b'])).toBe('none');
        // Or report "all" when only hidden IDs are selected.
        expect(computeSelectAllState(new Set(['x', 'y']), ['a', 'b'])).toBe('none');
    });
});

// ---------------------------------------------------------------------------
// toggleAllVisible
// ---------------------------------------------------------------------------

describe('toggleAllVisible', () => {
    it('adds every visible ID when none are selected', () => {
        const next = toggleAllVisible(new Set(), ['a', 'b', 'c']);
        expect([...next].sort()).toEqual(['a', 'b', 'c']);
    });

    it('adds missing visible IDs when only some are selected', () => {
        const next = toggleAllVisible(new Set(['a']), ['a', 'b', 'c']);
        expect([...next].sort()).toEqual(['a', 'b', 'c']);
    });

    it('removes all visible IDs when all are selected', () => {
        const next = toggleAllVisible(new Set(['a', 'b']), ['a', 'b']);
        expect([...next]).toEqual([]);
    });

    it('preserves hidden selections when removing all visible', () => {
        const next = toggleAllVisible(new Set(['a', 'b', 'hidden']), ['a', 'b']);
        expect([...next]).toEqual(['hidden']);
    });

    it('preserves hidden selections when adding all visible', () => {
        const next = toggleAllVisible(new Set(['hidden']), ['a', 'b']);
        expect([...next].sort()).toEqual(['a', 'b', 'hidden']);
    });

    it('returns a new Set (does not mutate input)', () => {
        const original = new Set(['a']);
        const next = toggleAllVisible(original, ['a', 'b']);
        expect(next).not.toBe(original);
        expect([...original]).toEqual(['a']);
    });

    it('returns a copy of the input when there are no visible IDs', () => {
        const next = toggleAllVisible(new Set(['a']), []);
        expect([...next]).toEqual(['a']);
    });
});

// ---------------------------------------------------------------------------
// buildBatchUpdates
// ---------------------------------------------------------------------------

describe('buildBatchUpdates', () => {
    it('returns an empty object when nothing is set', () => {
        expect(buildBatchUpdates({ date: '', notes: '', clearNotes: false })).toEqual({});
    });

    it('includes date when set', () => {
        expect(buildBatchUpdates({ date: '2026-05-24', notes: '', clearNotes: false }))
            .toEqual({ date: '2026-05-24' });
    });

    it('includes notes when set', () => {
        expect(buildBatchUpdates({ date: '', notes: 'hi', clearNotes: false }))
            .toEqual({ notes: 'hi' });
    });

    it('includes both date and notes when set', () => {
        expect(buildBatchUpdates({ date: '2026-05-24', notes: 'hi', clearNotes: false }))
            .toEqual({ date: '2026-05-24', notes: 'hi' });
    });

    it('sends notes: null when clearNotes is true', () => {
        expect(buildBatchUpdates({ date: '', notes: '', clearNotes: true }))
            .toEqual({ notes: null });
    });

    it('clearNotes overrides a notes value', () => {
        // If the user typed something then toggled clear, the clear wins.
        expect(buildBatchUpdates({ date: '', notes: 'ignored', clearNotes: true }))
            .toEqual({ notes: null });
    });

    it('combines clearNotes with a date update', () => {
        expect(buildBatchUpdates({ date: '2026-05-24', notes: '', clearNotes: true }))
            .toEqual({ date: '2026-05-24', notes: null });
    });

    it('omits whitespace-only notes', () => {
        expect(buildBatchUpdates({ date: '', notes: '   ', clearNotes: false })).toEqual({});
    });

    it('trims surrounding whitespace from notes', () => {
        expect(buildBatchUpdates({ date: '', notes: '  hello  ', clearNotes: false }))
            .toEqual({ notes: 'hello' });
    });
});
