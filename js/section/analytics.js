// ============================================
// ANALYTICS SECTION
// ============================================

import { db } from '../firebase.js';
import { ref, get, query, orderByKey, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

console.log('📊 analytics.js loaded');

export let tempChart = null, lightChart = null, lampStatusChart = null;

export function initCharts() {
    console.log('📊 initCharts');
    if (typeof Chart === 'undefined') { setTimeout(() => initCharts(), 500); return; }
    const opts = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { labels: { color: '#cbd5e1', font: { size: 10 } } }, tooltip: { bodyFont: { size: 10 }, titleFont: { size: 10 } } },
        scales: {
            x: { ticks: { color: '#94a3b8', maxTicksLimit: 8, font: { size: 8 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#94a3b8', font: { size: 8 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
    };

    const tEl = document.getElementById('tempChart');
    if (tEl) {
        const existing = Chart.getChart(tEl);
        if (existing) existing.destroy();
        tempChart = new Chart(tEl, {
            type: 'line',
            data: { labels: ['Belum Ada Data'], datasets: [{ label: 'Suhu (°C)', data: [0], borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.2)', borderWidth: 2, fill: true, tension: 0.4 }] },
            options: opts
        });
    }

    const lEl = document.getElementById('lightChart');
    if (lEl) {
        const existing = Chart.getChart(lEl);
        if (existing) existing.destroy();
        lightChart = new Chart(lEl, {
            type: 'line',
            data: { labels: ['Belum Ada Data'], datasets: [{ label: 'Cahaya (lux)', data: [0], borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.2)', borderWidth: 2, fill: true, tension: 0.4 }] },
            options: opts
        });
    }

    const lsEl = document.getElementById('lampStatusChart');
    if (lsEl) {
        const existing = Chart.getChart(lsEl);
        if (existing) existing.destroy();
        lampStatusChart = new Chart(lsEl, {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Status', data: [], backgroundColor: (ctx) => ctx.dataset.data[ctx.dataIndex] === 1 ? '#22c55e' : '#ef4444' }] },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ctx.parsed.y === 1 ? 'ON' : 'OFF' } } },
                scales: {
                    x: { ticks: { color: '#94a3b8', maxTicksLimit: 8, font: { size: 8 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#94a3b8', stepSize: 1, callback: (v) => v === 1 ? 'ON' : 'OFF', font: { size: 8 } }, min: -0.5, max: 1.5, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    }
}

function parseKey(key) {
    try {
        const clean = key.replace(/-000Z$/, '');
        const [datePart, timePart] = clean.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hour, minute, second] = timePart.split('-').map(Number);
        return new Date(year, month - 1, day, hour, minute, second).getTime();
    } catch (e) { return 0; }
}

export async function loadChartHistory() {
    console.log('📊 loadChartHistory');
    try {
        const snapshot = await get(query(ref(db, 'sensor_history/suhu'), orderByKey(), limitToLast(48)));
        const data = snapshot.val();
        if (!data) return;
        const keys = Object.keys(data).sort();
        const labels = [], temps = [];
        keys.forEach(key => {
            const entry = data[key];
            const suhu = entry?.value ?? entry ?? 0;
            if (suhu > 0) {
                const date = new Date(parseKey(key));
                labels.push(String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0'));
                temps.push(suhu);
            }
        });
        if (tempChart && labels.length > 0) {
            tempChart.data.labels = labels;
            tempChart.data.datasets[0].data = temps;
            tempChart.update();
        }
    } catch (e) { console.error('❌ loadChartHistory:', e); }
}

export async function loadDailyHistory() {
    console.log('📊 loadDailyHistory');
    try {
        const snapshot = await get(ref(db, 'daily_history'));
        const data = snapshot.val();
        const tbody = document.getElementById('dailyHistoryBody');
        if (!tbody) return;
        if (!data) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:16px;">Belum ada data</td></tr>';
            return;
        }
        const dates = Object.keys(data).sort().reverse();
        let html = '';
        dates.forEach(date => {
            const d = data[date];
            const growlight = d.growlight || 0;
            const target = d.target || 12;
            const status = d.status || (growlight >= target ? '✅ Cukup' : '🔴 Kurang');
            const color = d.statusColor || (growlight >= target ? '#22c55e' : '#ef4444');
            html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:6px 8px;color:var(--text-muted);">${date}</td>
                <td style="padding:6px 8px;color:#22c55e;font-weight:600;">${growlight.toFixed(1)} jam</td>
                <td style="padding:6px 8px;color:#f59e0b;font-weight:600;">${target.toFixed(1)} jam</td>
                <td style="padding:6px 8px;color:${color};font-weight:600;">${status}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (e) { console.error('❌ loadDailyHistory:', e); }
}

export function exportData(period) { alert('Export CSV: ' + period); }
export function exportPDF() { alert('Export PDF'); }
