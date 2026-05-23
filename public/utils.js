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

export function getPage(items, page, perPage = PAGE_SIZE) {
    const start = (page - 1) * perPage;
    return items.slice(start, start + perPage);
}

export function pageCount(totalItems, perPage = PAGE_SIZE) {
    return Math.max(1, Math.ceil(totalItems / perPage));
}

export function formatDate(isoDate) {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}
