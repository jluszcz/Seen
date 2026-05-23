import { h, render } from 'preact';
import { useState, useEffect, useMemo, useRef, useCallback } from 'preact/hooks';
import htm from 'htm';
import { hasNotes, sortItems, filterItems, formatDate, PAGE_SIZE } from './utils.js';

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

function Tabs({ categories, current, onSwitch, onAdd, onDelete }) {
    return html`
        <nav class="tabs">
            ${categories.map(cat => html`
                <button
                    key=${cat.id}
                    class=${'tab' + (cat.name === current ? ' active' : '')}
                    onClick=${() => onSwitch(cat.name)}
                >
                    <span class="tab-label">${cat.label}</span>
                    <span
                        class="tab-delete"
                        title="Delete category"
                        onClick=${e => { e.stopPropagation(); onDelete(cat); }}
                    >×</span>
                </button>
            `)}
            <button class="tab-add-btn" title="Add category" onClick=${onAdd}>+</button>
        </nav>
    `;
}

function SortTh({ label, sortKey, sortColumn, sortDir, onToggle, id }) {
    const active = sortColumn === sortKey;
    const cls = 'sortable' + (active ? (sortDir === 'asc' ? ' sort-asc' : ' sort-desc') : '');
    const indicator = active ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
    return html`
        <th id=${id} class=${cls} onClick=${() => onToggle(sortKey)}>
            ${label}<span class="sort-indicator">${indicator}</span>
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

function EditableCell({ item, field, value, inputType, autoEdit, onAutoEditConsumed, onSave }) {
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
    return html`
        <td class="editable" data-field=${field} onClick=${() => setEditing(true)}>
            <span class=${cls}>${display}</span>
        </td>
    `;
}

function Row({ item, showNotes, autoEdit, onAutoEditConsumed, onSave, onDelete }) {
    return html`
        <tr>
            <${EditableCell}
                item=${item} field="description" value=${item.description} inputType="input"
                autoEdit=${autoEdit} onAutoEditConsumed=${onAutoEditConsumed} onSave=${onSave}
            />
            <${EditableCell} item=${item} field="date" value=${item.date} inputType="date" onSave=${onSave} />
            ${showNotes
                ? html`<${EditableCell} item=${item} field="notes" value=${item.notes} inputType="textarea" onSave=${onSave} />`
                : html`<td></td>`}
            <td>
                <button class="delete-btn" title="Delete" onClick=${() => onDelete(item.id)}>×</button>
            </td>
        </tr>
    `;
}

const TABLE_COL_COUNT = 4;

function ItemsTable({ items, sortColumn, sortDir, filters, showNotes, hasActiveFilter, autoEditId,
                     onToggleSort, onFilterChange, onShowNotes, onAutoEditConsumed, onSave, onDelete }) {
    return html`
        <table id="items-table">
            <thead>
                <tr>
                    <${SortTh} label="Description" sortKey="description" sortColumn=${sortColumn} sortDir=${sortDir} onToggle=${onToggleSort} />
                    <${SortTh} label="Date" sortKey="date" sortColumn=${sortColumn} sortDir=${sortDir} onToggle=${onToggleSort} />
                    ${showNotes
                        ? html`<${SortTh} id="notes-header" label="Notes" sortKey="notes" sortColumn=${sortColumn} sortDir=${sortDir} onToggle=${onToggleSort} />`
                        : html`<th id="notes-header"><button class="show-notes-btn" onClick=${onShowNotes}>+ Notes</button></th>`}
                    <th></th>
                </tr>
                <tr class="filter-row">
                    <${FilterTh} filterKey="description" filters=${filters} onChange=${onFilterChange} />
                    <${FilterTh} filterKey="date" filters=${filters} onChange=${onFilterChange} />
                    <${FilterTh} filterKey=${showNotes ? 'notes' : null} filters=${filters} onChange=${onFilterChange} />
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${items.length === 0
                    ? html`
                        <tr><td colspan=${TABLE_COL_COUNT} class="empty-state">
                            ${hasActiveFilter ? 'No matches for current filter.' : 'No entries yet — click + Add to get started.'}
                        </td></tr>`
                    : items.map(item => html`<${Row}
                        key=${item.id} item=${item} showNotes=${showNotes}
                        autoEdit=${autoEditId === item.id}
                        onAutoEditConsumed=${onAutoEditConsumed}
                        onSave=${onSave} onDelete=${onDelete}
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
    const [showNotes, setShowNotes] = useState(false);
    const [filters, setFilters] = useState({});
    const [autoEditId, setAutoEditId] = useState(null);
    const [loadingCategories, setLoadingCategories] = useState(true);
    const [loadingItems, setLoadingItems] = useState(true);
    const [error, setError] = useState(null);
    const clearAutoEditId = useCallback(() => setAutoEditId(null), []);

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
        setLoadingItems(true);
        (async () => {
            try {
                const { items } = await api(`/api/items?category=${encodeURIComponent(category)}`);
                setItems(items);
                setShowNotes(hasNotes(items));
                setError(null);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoadingItems(false);
            }
        })();
    }, [category]);

    const filtered = useMemo(() => filterItems(items, filters), [items, filters]);
    const sorted = useMemo(() => sortItems(filtered, sortColumn, sortDir), [filtered, sortColumn, sortDir]);
    const visible = useMemo(() => sorted.slice(0, renderedCount), [sorted, renderedCount]);
    const hasActiveFilter = Object.values(filters).some(v => v && v.length > 0);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(entries => {
            if (!entries[0].isIntersecting) return;
            setRenderedCount(c => c < sorted.length ? c + PAGE_SIZE : c);
        }, { rootMargin: '200px' });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [sorted.length]);

    const switchCategory = name => {
        if (name === category) return;
        setCategory(name);
        setSortColumn('date');
        setSortDir('desc');
        setRenderedCount(PAGE_SIZE);
        setShowNotes(false);
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
            setShowNotes(false);
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
            setShowNotes(false);
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
            // Don't recompute showNotes: a new row has no notes, and if the user
            // forced the column open via "+ Notes" we shouldn't collapse it back.
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
            setItems(cur => {
                const next = cur.map(i => i.id === id ? item : i);
                setShowNotes(hasNotes(next));
                return next;
            });
        } catch (err) {
            setError(err.message);
        }
    };

    const deleteRow = async (id) => {
        if (!confirm('Delete this entry?')) return;
        try {
            await api(`/api/items/${id}`, { method: 'DELETE' });
            setItems(cur => {
                const next = cur.filter(i => i.id !== id);
                setShowNotes(hasNotes(next));
                return next;
            });
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

    return html`
        <div class="container">
            <${Tabs}
                categories=${categories}
                current=${category}
                onSwitch=${switchCategory}
                onAdd=${addCategory}
                onDelete=${deleteCategory}
            />
            <main class="app">
                ${error && html`<div class="error">${error}</div>`}
                ${loading && html`<div class="loading">Loading...</div>`}
                ${!loading && !error && category && html`
                    <div id="table-area">
                        <div class="table-toolbar">
                            <button class="add-btn" onClick=${addRow}>+ Add</button>
                        </div>
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
                                onShowNotes=${() => setShowNotes(true)}
                                onAutoEditConsumed=${clearAutoEditId}
                                onSave=${saveField}
                                onDelete=${deleteRow}
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
