import { hasNotes, sortItems, filterItems, formatDate, PAGE_SIZE } from './utils.js';

class SeenApp {
    constructor() {
        this.categories = [];
        this.category = null;
        this.items = [];
        this.sortColumn = 'date';
        this.sortDir = 'desc';
        this.renderedCount = PAGE_SIZE;
        this.showNotes = false;
        this.filters = {};
        this.loading = false;

        this.tabsEl = document.getElementById('tabs');
        this.loadingEl = document.getElementById('loading');
        this.errorEl = document.getElementById('error');
        this.tableArea = document.getElementById('table-area');
        this.tableHead = document.getElementById('table-head');
        this.tableBody = document.getElementById('table-body');
        this.addBtn = document.getElementById('add-btn');

        this.addBtn.addEventListener('click', () => this.addRow());
        this.setupInfiniteScroll();

        this.init();
    }

    setupInfiniteScroll() {
        const sentinel = document.getElementById('scroll-sentinel');
        this.observer = new IntersectionObserver(entries => {
            if (!entries[0].isIntersecting) return;
            if (this.loading) return;
            const filtered = filterItems(this.items, this.filters);
            const sorted = sortItems(filtered, this.sortColumn, this.sortDir);
            if (this.renderedCount >= sorted.length) return;
            this.renderedCount += PAGE_SIZE;
            this.renderBody(sorted.slice(0, this.renderedCount));
        }, { rootMargin: '200px' });
        this.observer.observe(sentinel);
    }

    async init() {
        try {
            const r = await fetch('/api/categories');
            if (!r.ok) throw new Error(`Failed to load categories: ${r.status}`);
            const { categories } = await r.json();
            this.categories = categories;
        } catch (err) {
            this.showError(err.message);
            return;
        }

        this.category = this.categories.length > 0 ? this.categories[0].name : null;
        this.renderTabs();

        if (this.category) {
            await this.load();
        } else {
            this.loadingEl.style.display = 'none';
        }
    }

    renderTabs() {
        this.tabsEl.innerHTML = '';

        this.categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'tab' + (cat.name === this.category ? ' active' : '');
            btn.dataset.category = cat.name;

            const labelSpan = document.createElement('span');
            labelSpan.className = 'tab-label';
            labelSpan.textContent = cat.label;

            const delSpan = document.createElement('span');
            delSpan.className = 'tab-delete';
            delSpan.textContent = '×';
            delSpan.title = 'Delete category';
            delSpan.addEventListener('click', e => {
                e.stopPropagation();
                this.deleteCategory(cat.id, cat.name, cat.label);
            });

            btn.appendChild(labelSpan);
            btn.appendChild(delSpan);
            btn.addEventListener('click', () => this.switchCategory(cat.name));
            this.tabsEl.appendChild(btn);
        });

        const addBtn = document.createElement('button');
        addBtn.className = 'tab-add-btn';
        addBtn.textContent = '+';
        addBtn.title = 'Add category';
        addBtn.addEventListener('click', () => this.addCategory());
        this.tabsEl.appendChild(addBtn);
    }

    async switchCategory(category) {
        if (category === this.category) return;
        this.category = category;
        this.sortColumn = 'date';
        this.sortDir = 'desc';
        this.renderedCount = PAGE_SIZE;
        this.showNotes = false;
        this.filters = {};
        this.renderTabs();
        await this.load();
    }

    async addCategory() {
        const label = prompt('New category name:');
        if (!label || !label.trim()) return;
        const id = crypto.randomUUID();
        try {
            const r = await fetch('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, label: label.trim() }),
            });
            if (!r.ok) {
                let msg = `Create failed: ${r.status}`;
                try { msg = (await r.json()).error || msg; } catch {}
                throw new Error(msg);
            }
            const { category } = await r.json();
            this.categories.push(category);
            this.category = category.name;
            this.items = [];
            this.renderedCount = PAGE_SIZE;
            this.showNotes = false;
            this.filters = {};
            this.renderTabs();
            this.render();
        } catch (err) {
            this.showError(err.message);
        }
    }

    async deleteCategory(catId, catName, catLabel) {
        if (!confirm(`Delete category "${catLabel}"?\n\nThis will fail if any items exist in it.`)) return;
        try {
            const r = await fetch(`/api/categories/${catId}`, { method: 'DELETE' });
            if (!r.ok) {
                let msg = `Delete failed: ${r.status}`;
                try { msg = (await r.json()).error || msg; } catch {}
                throw new Error(msg);
            }
            this.categories = this.categories.filter(c => c.id !== catId);
            if (this.category === catName) {
                this.category = this.categories[0]?.name ?? null;
            }
            this.items = [];
            this.renderedCount = PAGE_SIZE;
            this.showNotes = false;
            this.filters = {};
            this.renderTabs();
            if (this.category) {
                await this.load();
            } else {
                this.loadingEl.style.display = 'none';
                this.tableArea.style.display = 'none';
            }
        } catch (err) {
            this.showError(err.message);
        }
    }

    async load() {
        this.loading = true;
        this.showLoading();
        try {
            const r = await fetch(`/api/items?category=${this.category}`);
            if (!r.ok) throw new Error(`Server error ${r.status}`);
            const { items } = await r.json();
            this.items = items;
            this.showNotes = hasNotes(items);
            this.render();
        } catch (err) {
            this.showError(err.message);
        } finally {
            this.loading = false;
        }
    }

    hasActiveFilter() {
        return Object.values(this.filters).some(v => v && v.length > 0);
    }

    onFilterChange(field, value) {
        this.filters[field] = value;
        this.renderedCount = PAGE_SIZE;
        // Re-render body only; rebuilding the head would blur the focused filter input mid-typing.
        const filtered = filterItems(this.items, this.filters);
        const sorted = sortItems(filtered, this.sortColumn, this.sortDir);
        this.renderBody(sorted.slice(0, this.renderedCount));
    }

    render() {
        const filtered = filterItems(this.items, this.filters);
        const sorted = sortItems(filtered, this.sortColumn, this.sortDir);
        const visible = sorted.slice(0, this.renderedCount);

        this.renderHead();
        this.renderBody(visible);
        this.tableArea.style.display = '';
        this.loadingEl.style.display = 'none';
        this.errorEl.style.display = 'none';
    }

    buildSortTh(label, key) {
        const th = document.createElement('th');
        th.className = 'sortable';
        const indicator = document.createElement('span');
        indicator.className = 'sort-indicator';
        if (this.sortColumn === key) {
            th.classList.add(this.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
            indicator.textContent = this.sortDir === 'asc' ? '↑' : '↓';
        } else {
            indicator.textContent = '↕';
        }
        th.textContent = label;
        th.appendChild(indicator);
        th.addEventListener('click', () => this.toggleSort(key));
        return th;
    }

    renderHead() {
        const cols = this.columns();
        this.tableHead.innerHTML = '';

        const sortRow = document.createElement('tr');
        cols.forEach(col => {
            let th;
            if (col.type === 'sort') {
                th = this.buildSortTh(col.label, col.key);
            } else if (col.type === 'notes') {
                if (this.showNotes) {
                    th = this.buildSortTh('Notes', 'notes');
                    th.id = 'notes-header';
                } else {
                    th = document.createElement('th');
                    th.id = 'notes-header';
                    const btn = document.createElement('button');
                    btn.className = 'show-notes-btn';
                    btn.textContent = '+ Notes';
                    btn.addEventListener('click', () => {
                        this.showNotes = true;
                        this.render();
                    });
                    th.appendChild(btn);
                }
            } else {
                th = document.createElement('th');
            }
            sortRow.appendChild(th);
        });
        this.tableHead.appendChild(sortRow);

        const filterRow = document.createElement('tr');
        filterRow.className = 'filter-row';
        cols.forEach(col => {
            const th = document.createElement('th');
            const isFilterable = col.type === 'sort' || (col.type === 'notes' && this.showNotes);
            if (isFilterable) {
                const filterKey = col.type === 'notes' ? 'notes' : col.key;
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'filter-input';
                input.placeholder = 'Filter…';
                input.value = this.filters[filterKey] || '';
                input.addEventListener('input', e => this.onFilterChange(filterKey, e.target.value));
                th.appendChild(input);
            }
            filterRow.appendChild(th);
        });
        this.tableHead.appendChild(filterRow);
    }

    renderBody(items) {
        this.tableBody.innerHTML = '';
        if (items.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = this.columns().length;
            td.className = 'empty-state';
            td.textContent = this.hasActiveFilter()
                ? 'No matches for current filter.'
                : 'No entries yet — click + Add to get started.';
            tr.appendChild(td);
            this.tableBody.appendChild(tr);
            return;
        }
        items.forEach(item => this.tableBody.appendChild(this.renderRow(item)));
    }

    renderRow(item) {
        const tr = document.createElement('tr');
        tr.dataset.id = item.id;

        const descTd = this.editableCell(item, 'description', item.description, 'input');
        const dateTd = this.editableCell(item, 'date', item.date, 'date');
        tr.appendChild(descTd);
        tr.appendChild(dateTd);

        if (this.showNotes) {
            const notesTd = this.editableCell(item, 'notes', item.notes, 'textarea');
            tr.appendChild(notesTd);
        }

        const actionTd = document.createElement('td');
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.textContent = '×';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', () => this.deleteRow(item.id));
        actionTd.appendChild(delBtn);
        tr.appendChild(actionTd);

        return tr;
    }

    editableCell(item, field, value, inputType) {
        const td = document.createElement('td');
        td.className = 'editable';
        td.dataset.field = field;

        const display = document.createElement('span');
        if (field === 'date') {
            display.textContent = value ? formatDate(value) : '';
        } else {
            display.textContent = value || '';
        }
        if (!value) display.classList.add('cell-placeholder');
        if (!value && field === 'notes') display.textContent = '—';

        td.appendChild(display);
        td.addEventListener('click', () => this.startEdit(td, item, field, value, inputType));
        return td;
    }

    startEdit(td, item, field, currentValue, inputType) {
        if (td.querySelector('input, textarea')) return;

        const display = td.querySelector('span');
        display.style.display = 'none';

        let input;
        if (inputType === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 2;
        } else {
            input = document.createElement('input');
            input.type = inputType === 'date' ? 'date' : 'text';
        }
        input.className = 'cell-input';
        input.value = currentValue || '';
        td.appendChild(input);
        input.focus();

        const save = async () => {
            const newValue = input.value.trim() || null;
            if (field !== 'notes' && !newValue) {
                input.remove();
                display.style.display = '';
                return;
            }
            await this.saveField(item.id, field, newValue);
        };

        const cancel = () => {
            input.remove();
            display.style.display = '';
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && inputType !== 'textarea') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.removeEventListener('blur', save); cancel(); }
        });
    }

    async saveField(id, field, value) {
        try {
            const r = await fetch(`/api/items/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value }),
            });
            if (!r.ok) throw new Error(`Save failed: ${r.status}`);
            const { item } = await r.json();
            this.items = this.items.map(i => i.id === id ? item : i);
            this.showNotes = hasNotes(this.items);
            this.render();
        } catch (err) {
            this.showError(err.message);
        }
    }

    async addRow() {
        const id = crypto.randomUUID();
        const today = new Date().toISOString().slice(0, 10);
        try {
            const r = await fetch('/api/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, category: this.category, description: 'New entry', date: today }),
            });
            if (!r.ok) throw new Error(`Create failed: ${r.status}`);
            const { item } = await r.json();
            this.items = [item, ...this.items];
            this.renderedCount = PAGE_SIZE;
            this.render();
        } catch (err) {
            this.showError(err.message);
        }
    }

    async deleteRow(id) {
        if (!confirm('Delete this entry?')) return;
        try {
            const r = await fetch(`/api/items/${id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error(`Delete failed: ${r.status}`);
            this.items = this.items.filter(i => i.id !== id);
            this.showNotes = hasNotes(this.items);
            this.render();
        } catch (err) {
            this.showError(err.message);
        }
    }

    toggleSort(column) {
        if (this.sortColumn === column) {
            this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDir = 'asc';
        }
        this.renderedCount = PAGE_SIZE;
        this.render();
    }

    columns() {
        return [
            { type: 'sort', key: 'description', label: 'Description' },
            { type: 'sort', key: 'date', label: 'Date' },
            { type: 'notes' },
            { type: 'action' },
        ];
    }

    showLoading() {
        this.loadingEl.style.display = '';
        this.tableArea.style.display = 'none';
        this.errorEl.style.display = 'none';
    }

    showError(message) {
        this.errorEl.textContent = message;
        this.errorEl.style.display = '';
        this.loadingEl.style.display = 'none';
        this.tableArea.style.display = 'none';
    }
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => new SeenApp());
}
