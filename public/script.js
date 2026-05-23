import { hasNotes, sortItems, getPage, pageCount, formatDate, PAGE_SIZE } from './utils.js';

class SeenApp {
    constructor() {
        this.category = 'friends';
        this.items = [];
        this.sortColumn = 'date';
        this.sortDir = 'desc';
        this.page = 1;
        this.showNotes = false;

        this.tabEls = document.querySelectorAll('.tab');
        this.loadingEl = document.getElementById('loading');
        this.errorEl = document.getElementById('error');
        this.tableArea = document.getElementById('table-area');
        this.tableHead = document.getElementById('table-head');
        this.tableBody = document.getElementById('table-body');
        this.paginationEl = document.getElementById('pagination');
        this.addBtn = document.getElementById('add-btn');

        this.tabEls.forEach(tab => tab.addEventListener('click', () => this.switchCategory(tab.dataset.category)));
        this.addBtn.addEventListener('click', () => this.addRow());

        this.load();
    }

    async switchCategory(category) {
        if (category === this.category) return;
        this.category = category;
        this.sortColumn = 'date';
        this.sortDir = 'desc';
        this.page = 1;
        this.showNotes = false;
        this.tabEls.forEach(t => t.classList.toggle('active', t.dataset.category === category));
        await this.load();
    }

    async load() {
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
        }
    }

    render() {
        const sorted = sortItems(this.items, this.sortColumn, this.sortDir);
        const totalPages = pageCount(sorted.length);
        if (this.page > totalPages) this.page = totalPages;
        const pageItems = getPage(sorted, this.page);

        this.renderHead();
        this.renderBody(pageItems);
        this.renderPagination(sorted.length, totalPages);
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
        const tr = document.createElement('tr');
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
            tr.appendChild(th);
        });
        this.tableHead.appendChild(tr);
    }

    renderBody(pageItems) {
        this.tableBody.innerHTML = '';
        if (pageItems.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = this.columns().length;
            td.className = 'empty-state';
            td.textContent = 'No entries yet — click + Add to get started.';
            tr.appendChild(td);
            this.tableBody.appendChild(tr);
            return;
        }
        pageItems.forEach(item => this.tableBody.appendChild(this.renderRow(item)));
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
            this.page = 1;
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
        this.render();
    }

    renderPagination(total, totalPages) {
        this.paginationEl.innerHTML = '';
        if (totalPages <= 1) return;

        const info = document.createElement('span');
        info.className = 'page-info';
        const start = (this.page - 1) * PAGE_SIZE + 1;
        const end = Math.min(this.page * PAGE_SIZE, total);
        info.textContent = `${start}–${end} of ${total}`;
        this.paginationEl.appendChild(info);

        const prev = document.createElement('button');
        prev.className = 'page-btn';
        prev.textContent = '‹';
        prev.disabled = this.page === 1;
        prev.addEventListener('click', () => { this.page--; this.render(); });
        this.paginationEl.appendChild(prev);

        const pageSet = new Set(
            [1, totalPages, this.page - 1, this.page, this.page + 1]
                .filter(p => p >= 1 && p <= totalPages)
        );
        let lastRendered = null;
        for (const p of [...pageSet].sort((a, b) => a - b)) {
            if (lastRendered !== null && p > lastRendered + 1) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'page-ellipsis';
                ellipsis.textContent = '…';
                this.paginationEl.appendChild(ellipsis);
            }
            const btn = document.createElement('button');
            btn.className = `page-btn${p === this.page ? ' active' : ''}`;
            btn.textContent = p;
            btn.addEventListener('click', () => { this.page = p; this.render(); });
            this.paginationEl.appendChild(btn);
            lastRendered = p;
        }

        const next = document.createElement('button');
        next.className = 'page-btn';
        next.textContent = '›';
        next.disabled = this.page === totalPages;
        next.addEventListener('click', () => { this.page++; this.render(); });
        this.paginationEl.appendChild(next);
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
