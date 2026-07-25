export const PAGE_SIZE = 25;

export function hasNotes(items) {
    return items.some(
        (item) => item.notes !== null && item.notes !== undefined && item.notes !== '',
    );
}

export function sortItems(items, column, direction) {
    return [...items].sort((a, b) => {
        const av = (a[column] ?? '').toLowerCase();
        const bv = (b[column] ?? '').toLowerCase();
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return direction === 'asc' ? cmp : -cmp;
    });
}

export function formatDate(isoDate) {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export function filterItems(items, filters) {
    const { description = '', date = '', notes = '' } = filters || {};
    const descQ = description.toLowerCase();
    const dateQ = date.toLowerCase();
    const notesQ = notes.toLowerCase();
    return items.filter((item) => {
        if (descQ && !(item.description ?? '').toLowerCase().includes(descQ)) return false;
        if (dateQ) {
            const iso = (item.date ?? '').toLowerCase();
            const pretty = formatDate(item.date).toLowerCase();
            if (!iso.includes(dateQ) && !pretty.includes(dateQ)) return false;
        }
        if (notesQ && !(item.notes ?? '').toLowerCase().includes(notesQ)) return false;
        return true;
    });
}

// "Visible" = the post-filter, post-sort set of IDs. Select-all operates on the
// filtered set (not the rendered page), so users can act on rows below the
// infinite-scroll fold. Selections of IDs outside `visibleItemIds` are ignored
// for the purposes of computing this state.
export function computeSelectAllState(selectedIds, visibleItemIds) {
    if (visibleItemIds.length === 0) return 'none';
    let selectedCount = 0;
    for (const id of visibleItemIds) {
        if (selectedIds.has(id)) selectedCount++;
    }
    if (selectedCount === 0) return 'none';
    if (selectedCount === visibleItemIds.length) return 'all';
    return 'some';
}

// Toggle "select all" against the visible set. Selections of hidden (filtered-out)
// items are preserved across the toggle so filtering doesn't silently destroy
// prior selections.
export function toggleAllVisible(selectedIds, visibleItemIds) {
    const next = new Set(selectedIds);
    const allSelected = visibleItemIds.length > 0 && visibleItemIds.every((id) => next.has(id));
    if (allSelected) {
        for (const id of visibleItemIds) next.delete(id);
    } else {
        for (const id of visibleItemIds) next.add(id);
    }
    return next;
}

// Quote a CSV field only when it contains a delimiter, quote, or newline,
// doubling any embedded quotes per RFC 4180.
function csvField(value) {
    const s = value == null ? '' : String(value);
    return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Serialize items to RFC 4180 CSV text (CRLF line endings). Columns mirror the
// table: Description, Date (raw ISO), Notes. A header row is always emitted.
export function toCsv(items) {
    const header = ['Description', 'Date', 'Notes'];
    const rows = items.map((item) => [item.description, item.date, item.notes]);
    return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n');
}

export function buildBatchUpdates({ date, notes, clearNotes }) {
    const updates = {};
    if (date) updates.date = date;
    if (clearNotes) {
        updates.notes = null;
    } else {
        const trimmed = (notes ?? '').trim();
        if (trimmed) updates.notes = trimmed;
    }
    return updates;
}

// What deleting a category should do to the item view.
//
// Only the category currently being displayed invalidates the view. Clearing
// items unconditionally blanks the table for a category whose rows are still
// there, because the fetch effect keys off `category` and never re-runs when
// `category` did not change.
export function categoryDeletionEffects(deletedName, currentCategory, remainingCategories) {
    const wasCurrent = deletedName === currentCategory;
    return {
        resetItemView: wasCurrent,
        nextCategory: wasCurrent ? (remainingCategories[0]?.name ?? null) : currentCategory,
    };
}
