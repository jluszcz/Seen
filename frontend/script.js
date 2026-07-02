import { h, render } from 'preact';
import { useState, useEffect, useMemo, useRef, useCallback } from 'preact/hooks';
import htm from 'htm';
import {
    hasNotes,
    sortItems,
    filterItems,
    formatDate,
    computeSelectAllState,
    toggleAllVisible,
    buildBatchUpdates,
    PAGE_SIZE,
} from './utils.js';

const html = htm.bind(h);

async function api(path, options = {}) {
    const r = await fetch(path, options);
    if (!r.ok) {
        let msg = `${options.method || 'GET'} ${path} failed: ${r.status}`;
        try { msg = (await r.json()).error || msg; } catch {}
        throw new Error(msg);
    }
    return r.json();
}

function useTheme() {
    const [theme, setTheme] = useState(() => {
        const stored = localStorage.getItem('theme');
        if (stored === 'light' || stored === 'dark') return stored;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = e => {
            // Manual override in localStorage takes priority; only follow OS if none set.
            const stored = localStorage.getItem('theme');
            if (stored === 'light' || stored === 'dark') return;
            setTheme(e.matches ? 'dark' : 'light');
        };
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // Persist only on explicit toggle: a stored theme means "user chose this",
    // which is what disables OS-preference following above.
    const toggle = useCallback(() => {
        const next = theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('theme', next);
        setTheme(next);
    }, [theme]);

    return { theme, toggle };
}

// Lucide icons (MIT) — currentColor inherits button color from CSS
const SunIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
    </svg>
`;

const MoonIcon = () => html`
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
    </svg>
`;

function Tabs({ categories, current, onSwitch, onAdd, onDelete, theme, onToggleTheme }) {
    const title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    return html`
        <nav class="tabs">
            ${categories.map(cat => html`
                <div key=${cat.id} class=${'tab-wrap' + (cat.name === current ? ' active' : '')}>
                    <button class="tab" onClick=${() => onSwitch(cat.name)}>
                        ${cat.label}
                    </button>
                    <button
                        class="tab-delete"
                        title="Delete category"
                        aria-label=${`Delete category ${cat.label}`}
                        onClick=${() => onDelete(cat)}
                    >×</button>
                </div>
            `)}
            <button class="tab-add-btn" title="Add category" onClick=${onAdd}>+</button>
            <button class="theme-btn" title=${title} onClick=${onToggleTheme}>
                ${theme === 'dark' ? html`<${SunIcon}/>` : html`<${MoonIcon}/>`}
            </button>
        </nav>
    `;
}

function SortTh({ label, sortKey, sortColumn, sortDir, onToggle, id }) {
    const active = sortColumn === sortKey;
    const cls = 'sortable' + (active ? (sortDir === 'asc' ? ' sort-asc' : ' sort-desc') : '');
    const indicator = active ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
    const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined;
    return html`
        <th id=${id} class=${cls} aria-sort=${ariaSort}>
            <button class="th-sort-btn" onClick=${() => onToggle(sortKey)}>
                ${label}<span class="sort-indicator">${indicator}</span>
            </button>
        </th>
    `;
}

function FilterTh({ filterKey, filters, onChange }) {
    if (!filterKey) return html`<th></th>`;
    return html`
        <th>
            <input
                type="text"
                class="filter-input"
                placeholder="Filter…"
                value=${filters[filterKey] || ''}
                onInput=${e => onChange(filterKey, e.target.value)}
            />
        </th>
    `;
}

function SelectAllCheckbox({ state, onChange }) {
    const ref = useRef(null);
    useEffect(() => {
        if (!ref.current) return;
        ref.current.checked = state === 'all';
        ref.current.indeterminate = state === 'some';
    }, [state]);
    return html`<input type="checkbox" ref=${ref} onChange=${onChange} />`;
}

function BatchPanel({ selectedCount, batchDate, batchNotes, batchClearNotes, applying,
                      onDateChange, onNotesChange, onClearNotesChange, onApply, onCancel }) {
    const canApply = !applying && selectedCount > 0 && (batchDate || batchNotes || batchClearNotes);
    // Use explicit htmlFor/id pairs (not wrapping <label>) so the label-input
    // association survives iOS Safari swallowing label clicks on date inputs.
    return html`
        <div class="batch-panel">
            <span class="batch-count">${selectedCount} selected</span>
            <div class="batch-field">
                <label for="batch-date" class="batch-label">Date</label>
                <input
                    id="batch-date"
                    type="date"
                    class="batch-input"
                    value=${batchDate}
                    onInput=${e => onDateChange(e.target.value)}
                />
            </div>
            <div class="batch-field">
                <label for="batch-notes" class="batch-label">Notes</label>
                <input
                    id="batch-notes"
                    type="text"
                    class="batch-input batch-notes-input"
                    placeholder=${batchClearNotes ? '(will be cleared)' : 'Notes…'}
                    value=${batchClearNotes ? '' : batchNotes}
                    disabled=${batchClearNotes}
                    onInput=${e => onNotesChange(e.target.value)}
                />
            </div>
            <label class="batch-clear" for="batch-clear-notes">
                <input
                    id="batch-clear-notes"
                    type="checkbox"
                    checked=${batchClearNotes}
                    onChange=${e => onClearNotesChange(e.target.checked)}
                />
                <span>Clear notes</span>
            </label>
            <div class="batch-actions">
                <button class="batch-apply-btn" disabled=${!canApply} onClick=${onApply}>
                    ${applying ? 'Applying…' : 'Apply'}
                </button>
                <button class="batch-cancel-btn" disabled=${applying} onClick=${onCancel}>Cancel</button>
            </div>
        </div>
    `;
}

function EditableCell({ item, field, value, inputType, autoEdit, onAutoEditConsumed, onSave, batchMode }) {
    const [editing, setEditing] = useState(!!autoEdit);
    const inputRef = useRef(null);
    const cancelledRef = useRef(false);
    const valueRef = useRef(value);
    valueRef.current = value;

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            if (typeof inputRef.current.select === 'function') inputRef.current.select();
        }
    }, [editing]);

    useEffect(() => {
        if (autoEdit) onAutoEditConsumed?.();
    }, [autoEdit, onAutoEditConsumed]);

    const commit = useCallback(async () => {
        if (cancelledRef.current) {
            cancelledRef.current = false;
            setEditing(false);
            return;
        }
        const raw = (inputRef.current?.value ?? '').trim();
        const newValue = raw || null;
        if (field !== 'notes' && !newValue) {
            setEditing(false);
            return;
        }
        if (newValue !== (valueRef.current ?? null)) await onSave(item.id, field, newValue);
        setEditing(false);
    }, [field, item.id, onSave]);

    if (editing) {
        const onKey = e => {
            if (e.key === 'Enter' && inputType !== 'textarea') { e.preventDefault(); e.target.blur(); }
            if (e.key === 'Escape') { cancelledRef.current = true; setEditing(false); }
        };
        const common = {
            ref: inputRef,
            class: 'cell-input',
            defaultValue: value || '',
            onBlur: commit,
            onKeyDown: onKey,
        };
        return html`
            <td class="editable" data-field=${field}>
                ${inputType === 'textarea'
                    ? html`<textarea ...${common} rows="2"></textarea>`
                    : html`<input ...${common} type=${inputType === 'date' ? 'date' : 'text'} />`}
            </td>
        `;
    }

    const display = field === 'date' ? (value ? formatDate(value) : '')
        : value || (field === 'notes' ? '—' : '');
    const cls = !value ? 'cell-placeholder' : '';
    // In batch mode the row's click target is the selection checkbox; clicking
    // a cell must not enter inline edit, which would race with batch apply.
    const onCellClick = batchMode ? undefined : () => setEditing(true);
    return html`
        <td class=${'editable' + (batchMode ? ' batch-locked' : '')} data-field=${field} onClick=${onCellClick}>
            <span class=${cls}>${display}</span>
        </td>
    `;
}

function Row({ item, showNotes, autoEdit, onAutoEditConsumed, onSave, onDelete,
               batchMode, selected, onToggleSelect }) {
    return html`
        <tr>
            ${batchMode ? html`
                <td class="batch-check">
                    <input type="checkbox" checked=${selected} onChange=${() => onToggleSelect(item.id)} />
                </td>
            ` : null}
            <${EditableCell}
                item=${item} field="description" value=${item.description} inputType="input"
                autoEdit=${autoEdit} onAutoEditConsumed=${onAutoEditConsumed} onSave=${onSave}
                batchMode=${batchMode}
            />
            <${EditableCell}
                item=${item} field="date" value=${item.date} inputType="date" onSave=${onSave}
                batchMode=${batchMode}
            />
            ${showNotes
                ? html`<${EditableCell}
                    item=${item} field="notes" value=${item.notes} inputType="textarea" onSave=${onSave}
                    batchMode=${batchMode}
                />`
                : html`<td></td>`}
            <td>
                <button class="delete-btn" title="Delete" onClick=${() => onDelete(item.id)}>×</button>
            </td>
        </tr>
    `;
}

// Description, Date, Notes, delete-button — fixed across all rows.
const STATIC_COL_COUNT = 4;

function ItemsTable({ items, sortColumn, sortDir, filters, showNotes, hasActiveFilter, autoEditId,
                     onToggleSort, onFilterChange, onShowNotes, onAutoEditConsumed, onSave, onDelete,
                     batchMode, selectedIds, onToggleSelect, onToggleSelectAll, selectAllState }) {
    const colCount = STATIC_COL_COUNT + (batchMode ? 1 : 0);
    return html`
        <table id="items-table">
            <thead>
                <tr>
                    ${batchMode ? html`
                        <th class="batch-check">
                            <${SelectAllCheckbox} state=${selectAllState} onChange=${onToggleSelectAll} />
                        </th>
                    ` : null}
                    <${SortTh} label="Description" sortKey="description" sortColumn=${sortColumn} sortDir=${sortDir} onToggle=${onToggleSort} />
                    <${SortTh} label="Date" sortKey="date" sortColumn=${sortColumn} sortDir=${sortDir} onToggle=${onToggleSort} />
                    ${showNotes
                        ? html`<${SortTh} id="notes-header" label="Notes" sortKey="notes" sortColumn=${sortColumn} sortDir=${sortDir} onToggle=${onToggleSort} />`
                        : html`<th id="notes-header"><button class="show-notes-btn" onClick=${onShowNotes}>+ Notes</button></th>`}
                    <th></th>
                </tr>
                <tr class="filter-row">
                    ${batchMode ? html`<th class="batch-check"></th>` : null}
                    <${FilterTh} filterKey="description" filters=${filters} onChange=${onFilterChange} />
                    <${FilterTh} filterKey="date" filters=${filters} onChange=${onFilterChange} />
                    <${FilterTh} filterKey=${showNotes ? 'notes' : null} filters=${filters} onChange=${onFilterChange} />
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${items.length === 0
                    ? html`
                        <tr><td colspan=${colCount} class="empty-state">
                            ${hasActiveFilter ? 'No matches for current filter.' : 'No entries yet — click + Add to get started.'}
                        </td></tr>`
                    : items.map(item => html`<${Row}
                        key=${item.id} item=${item} showNotes=${showNotes}
                        autoEdit=${autoEditId === item.id}
                        onAutoEditConsumed=${onAutoEditConsumed}
                        onSave=${onSave} onDelete=${onDelete}
                        batchMode=${batchMode}
                        selected=${selectedIds.has(item.id)}
                        onToggleSelect=${onToggleSelect}
                    />`)}
            </tbody>
        </table>
    `;
}

function App() {
    const [categories, setCategories] = useState([]);
    const [category, setCategory] = useState(null);
    const [items, setItems] = useState([]);
    const [sortColumn, setSortColumn] = useState('date');
    const [sortDir, setSortDir] = useState('desc');
    const [renderedCount, setRenderedCount] = useState(PAGE_SIZE);
    const [notesForced, setNotesForced] = useState(false);
    const [filters, setFilters] = useState({});
    const [autoEditId, setAutoEditId] = useState(null);
    const [loadingCategories, setLoadingCategories] = useState(true);
    const [loadingItems, setLoadingItems] = useState(true);
    const [error, setError] = useState(null);
    const [batchMode, setBatchMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [batchDate, setBatchDate] = useState('');
    const [batchNotes, setBatchNotes] = useState('');
    const [batchClearNotes, setBatchClearNotes] = useState(false);
    const [applyingBatch, setApplyingBatch] = useState(false);
    const clearAutoEditId = useCallback(() => setAutoEditId(null), []);
    const { theme, toggle: toggleTheme } = useTheme();

    const loading = loadingCategories || loadingItems;
    const sentinelRef = useRef(null);

    useEffect(() => {
        (async () => {
            try {
                const { categories } = await api('/api/categories');
                setCategories(categories);
                setCategory(categories[0]?.name ?? null);
                if (!categories[0]) setLoadingItems(false);
            } catch (err) {
                setError(err.message);
                setLoadingItems(false);
            } finally {
                setLoadingCategories(false);
            }
        })();
    }, []);

    useEffect(() => {
        if (!category) return;
        // Ignore responses that land after the user has switched away, so a
        // slow fetch can't overwrite the current category's items.
        let stale = false;
        setLoadingItems(true);
        (async () => {
            try {
                const { items } = await api(`/api/items?category=${encodeURIComponent(category)}`);
                if (stale) return;
                setItems(items);
                setError(null);
            } catch (err) {
                if (!stale) setError(err.message);
            } finally {
                if (!stale) setLoadingItems(false);
            }
        })();
        return () => { stale = true; };
    }, [category]);

    // Derived: the column shows whenever any item has notes, or the user
    // forced it open via "+ Notes" (reset on category switch).
    const showNotes = notesForced || hasNotes(items);

    const filtered = useMemo(() => filterItems(items, filters), [items, filters]);
    const sorted = useMemo(() => sortItems(filtered, sortColumn, sortDir), [filtered, sortColumn, sortDir]);
    const visible = useMemo(() => sorted.slice(0, renderedCount), [sorted, renderedCount]);
    const hasActiveFilter = Object.values(filters).some(v => v && v.length > 0);

    // Select-all reflects the post-filter set, not the currently-rendered page.
    // Selections of items outside `sorted` (e.g., filtered out after being
    // selected) are preserved internally but ignored by this state.
    const sortedIds = useMemo(() => sorted.map(i => i.id), [sorted]);
    const selectAllState = useMemo(
        () => computeSelectAllState(selectedIds, sortedIds),
        [selectedIds, sortedIds],
    );

    // renderedCount is a dependency so the observer is recreated after each
    // page renders; observe() then re-fires the callback if the sentinel is
    // still visible (tall viewports), instead of waiting for a scroll event.
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(entries => {
            if (!entries[0].isIntersecting) return;
            setRenderedCount(c => c < sorted.length ? c + PAGE_SIZE : c);
        }, { rootMargin: '200px' });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [sorted.length, renderedCount]);

    const enterBatchMode = useCallback(() => setBatchMode(true), []);
    const exitBatchMode = useCallback(() => {
        setBatchMode(false);
        setSelectedIds(new Set());
        setBatchDate('');
        setBatchNotes('');
        setBatchClearNotes(false);
    }, []);

    const switchCategory = name => {
        if (name === category) return;
        exitBatchMode();
        setCategory(name);
        setSortColumn('date');
        setSortDir('desc');
        setRenderedCount(PAGE_SIZE);
        setNotesForced(false);
        setFilters({});
    };

    const addCategory = async () => {
        const label = prompt('New category name:');
        if (!label || !label.trim()) return;
        try {
            const { category: created } = await api('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: crypto.randomUUID(), label: label.trim() }),
            });
            setCategories(cs => [...cs, created]);
            setCategory(created.name);
            setItems([]);
            setRenderedCount(PAGE_SIZE);
            setNotesForced(false);
            setFilters({});
        } catch (err) {
            setError(err.message);
        }
    };

    const deleteCategory = async (cat) => {
        if (!confirm(`Delete category "${cat.label}"?\n\nThis will fail if any items exist in it.`)) return;
        try {
            await api(`/api/categories/${cat.id}`, { method: 'DELETE' });
            const remaining = categories.filter(c => c.id !== cat.id);
            setCategories(remaining);
            if (category === cat.name) setCategory(remaining[0]?.name ?? null);
            setItems([]);
            setRenderedCount(PAGE_SIZE);
            setNotesForced(false);
            setFilters({});
        } catch (err) {
            setError(err.message);
        }
    };

    const addRow = async () => {
        try {
            const today = new Date().toISOString().slice(0, 10);
            const { item } = await api('/api/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: crypto.randomUUID(), category, description: 'New entry', date: today }),
            });
            setItems(cur => [item, ...cur]);
            setRenderedCount(PAGE_SIZE);
            setAutoEditId(item.id);
        } catch (err) {
            setError(err.message);
        }
    };

    const saveField = async (id, field, value) => {
        try {
            const { item } = await api(`/api/items/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value }),
            });
            setItems(cur => cur.map(i => i.id === id ? item : i));
        } catch (err) {
            setError(err.message);
        }
    };

    const deleteRow = async (id) => {
        if (!confirm('Delete this entry?')) return;
        try {
            await api(`/api/items/${id}`, { method: 'DELETE' });
            setItems(cur => cur.filter(i => i.id !== id));
        } catch (err) {
            setError(err.message);
        }
    };

    const toggleSort = column => {
        if (sortColumn === column) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDir('asc');
        }
        setRenderedCount(PAGE_SIZE);
    };

    const onFilterChange = (field, value) => {
        setFilters(f => ({ ...f, [field]: value }));
        setRenderedCount(PAGE_SIZE);
    };

    const toggleSelectItem = useCallback((id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        setSelectedIds(prev => toggleAllVisible(prev, sortedIds));
    }, [sortedIds]);

    const applyBatch = useCallback(async () => {
        if (applyingBatch) return;
        if (batchDate && !/^\d{4}-\d{2}-\d{2}$/.test(batchDate)) {
            setError('Date must be YYYY-MM-DD');
            return;
        }
        const updates = buildBatchUpdates({
            date: batchDate,
            notes: batchNotes,
            clearNotes: batchClearNotes,
        });
        if (!Object.keys(updates).length || selectedIds.size === 0) return;

        const ids = [...selectedIds];
        setApplyingBatch(true);
        let settled;
        try {
            settled = await Promise.allSettled(
                ids.map(id => api(`/api/items/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates),
                }).then(r => r.item))
            );
        } finally {
            setApplyingBatch(false);
        }

        const succeeded = [];
        const failedIds = [];
        settled.forEach((r, i) => {
            if (r.status === 'fulfilled') succeeded.push(r.value);
            else failedIds.push(ids[i]);
        });

        if (succeeded.length > 0) {
            const map = Object.fromEntries(succeeded.map(i => [i.id, i]));
            setItems(cur => cur.map(i => map[i.id] ?? i));
        }

        if (failedIds.length === 0) {
            setError(null);
            exitBatchMode();
        } else {
            // Keep only the failed IDs selected so the user can retry or inspect.
            setSelectedIds(new Set(failedIds));
            setError(`Updated ${succeeded.length} of ${ids.length}; ${failedIds.length} failed.`);
        }
    }, [applyingBatch, batchDate, batchNotes, batchClearNotes, selectedIds, exitBatchMode]);

    return html`
        <div class="container">
            <${Tabs}
                categories=${categories}
                current=${category}
                onSwitch=${switchCategory}
                onAdd=${addCategory}
                onDelete=${deleteCategory}
                theme=${theme}
                onToggleTheme=${toggleTheme}
            />
            <main class="app">
                ${error && html`<div class="error">${error}</div>`}
                ${loading && html`<div class="loading">Loading...</div>`}
                ${!loading && !error && category && html`
                    <div id="table-area">
                        <div class="table-toolbar">
                            <button class="add-btn" onClick=${addRow}>+ Add</button>
                            <button
                                class=${'batch-toggle-btn' + (batchMode ? ' active' : '')}
                                onClick=${batchMode ? exitBatchMode : enterBatchMode}
                            >Batch Edit</button>
                        </div>
                        ${batchMode ? html`
                            <${BatchPanel}
                                selectedCount=${selectedIds.size}
                                batchDate=${batchDate}
                                batchNotes=${batchNotes}
                                batchClearNotes=${batchClearNotes}
                                applying=${applyingBatch}
                                onDateChange=${setBatchDate}
                                onNotesChange=${setBatchNotes}
                                onClearNotesChange=${setBatchClearNotes}
                                onApply=${applyBatch}
                                onCancel=${exitBatchMode}
                            />
                        ` : null}
                        <div class="table-wrapper">
                            <${ItemsTable}
                                items=${visible}
                                sortColumn=${sortColumn}
                                sortDir=${sortDir}
                                filters=${filters}
                                showNotes=${showNotes}
                                hasActiveFilter=${hasActiveFilter}
                                autoEditId=${autoEditId}
                                onToggleSort=${toggleSort}
                                onFilterChange=${onFilterChange}
                                onShowNotes=${() => setNotesForced(true)}
                                onAutoEditConsumed=${clearAutoEditId}
                                onSave=${saveField}
                                onDelete=${deleteRow}
                                batchMode=${batchMode}
                                selectedIds=${selectedIds}
                                onToggleSelect=${toggleSelectItem}
                                onToggleSelectAll=${toggleSelectAll}
                                selectAllState=${selectAllState}
                            />
                        </div>
                        <div ref=${sentinelRef} class="scroll-sentinel"></div>
                    </div>
                `}
            </main>
        </div>
    `;
}

render(html`<${App} />`, document.getElementById('root'));
