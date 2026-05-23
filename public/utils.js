export const CATEGORIES = ['friends', 'family', 'standup', 'concerts'];
export const PAGE_SIZE = 25;

export function hasNotes(items) {
    return items.some(item => item.notes !== null && item.notes !== undefined && item.notes !== '');
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
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

export function filterItems(items, filters) {
    const { description = '', date = '', notes = '' } = filters || {};
    const descQ = description.toLowerCase();
    const dateQ = date.toLowerCase();
    const notesQ = notes.toLowerCase();
    return items.filter(item => {
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
