// ============================================
// MAIN ENTRY – app.js (FIXED - PATH SECTION)
// ============================================

import { db } from './firebase.js';
import { state, currentUser, setUser, DOM, initDOM, showToast } from './modules/core.js';

// ⭐ IMPORT SEMUA SECTION (PAKAI './section/' BUKAN './sections/')
import { initAdminPanel } from './section/admin.js';
import { 
    initCharts, 
    exportData, 
    exportPDF, 
    loadChartHistory, 
    loadDailyHistory 
} from './section/analytics.js';
import { 
    initDashboard, 
    initDashChart, 
    loadDashHistory, 
    cleanupDashboard 
} from './section/dashboard.js';
import { 
    initMonitoring, 
    initGauge, 
    cleanupMonitoring 
} from './section/monitoring.js';
import { 
    initControl, 
    cleanupControl 
} from './section/control.js';

console.log('🚀 app.js loaded');

// ============================================
// SESSION CHECK
// ============================================
const sessionData = localStorage.getItem('iot_user');
if (!sessionData) {
    window.location.href = 'login.html';
} else {
    try {
        const user = JSON.parse(sessionData);
        setUser(user);
        console.log('👤 Login:', user.nama);
        const loginTime = user.loginTime || 0;
        if (Date.now() - loginTime > 8 * 60 * 60 * 1000) {
            localStorage.removeItem('iot_user');
            window.location.href = 'login.html';
        }
    } catch (e) {
        localStorage.removeItem('iot_user');
        window.location.href = 'login.html';
    }
}

// ============================================
// EXPOSE GLOBAL
// ============================================
window.exportData = exportData;
window.exportPDF = exportPDF;

window.logout = function() {
    if (confirm('Yakin mau logout?')) {
        localStorage.removeItem('iot_user');
        window.location.href = 'login.html';
    }
};

// ============================================
// SECTIONS TRACKER
// ============================================
const activeSections = {
    dashboard: false,
    monitoring: false,
    analytics: false,
    control: false,
    admin: false
};

// ============================================
// SWITCH SECTION
// ============================================
function switchSection(sectionName) {
    console.log('🔄 Switch to:', sectionName);

    // CLEANUP SEMUA
    if (activeSections.dashboard) { cleanupDashboard(); activeSections.dashboard = false; }
    if (activeSections.monitoring) { cleanupMonitoring(); activeSections.monitoring = false; }
    if (activeSections.control) { cleanupControl(); activeSections.control = false; }

    // INIT SECTION
    switch(sectionName) {
        case 'dashboard':
            activeSections.dashboard = true;
            console.log('🏠 Starting Dashboard...');
            initDashChart();
            setTimeout(() => { loadDashHistory(); }, 500);
            initDashboard();
            break;

        case 'monitoring':
            activeSections.monitoring = true;
            console.log('🌡 Starting Monitoring...');
            setTimeout(() => { initGauge(); }, 500);
            initMonitoring();
            break;

        case 'analytics':
            activeSections.analytics = true;
            console.log('📊 Starting Analytics...');
            initCharts();
            setTimeout(() => { loadChartHistory(); loadDailyHistory(); }, 500);
            break;

        case 'control':
            activeSections.control = true;
            console.log('🎛 Starting Control...');
            initControl();
            break;

        case 'admin':
            activeSections.admin = true;
            console.log('👑 Starting Admin...');
            initAdminPanel();
            break;

        default:
            console.warn('⚠️ Unknown section:', sectionName);
    }
}

// ============================================
// NAVIGATION
// ============================================
function setupNavigation() {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
            this.classList.add('active');

            const target = this.dataset.target;
            document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
            const section = document.getElementById(target);
            if (section) section.classList.remove('hidden');

            switchSection(target);

            if (window.innerWidth <= 768) closeMenu();
        });
    });
}

// ============================================
// SIDEBAR
// ============================================
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('mobileOverlay');

function closeMenu() {
    sidebar?.classList.remove('active');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
}

if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
    });
}
if (overlay) {
    overlay.addEventListener('click', closeMenu);
}
window.addEventListener('resize', () => { if (window.innerWidth > 768) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

// ============================================
// CLOCK
// ============================================
function updateClock() {
    const now = new Date();
    const dateEl = document.getElementById('dateText');
    const clockEl = document.getElementById('clockText');
    if (dateEl) {
        dateEl.innerText = now.toLocaleDateString('id-ID', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }
    if (clockEl) {
        clockEl.innerText = now.toLocaleTimeString('id-ID');
    }
}

// ============================================
// EXPAND CHART
// ============================================
window.toggleExpand = function(wrapperId) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    wrapper.classList.toggle('expanded');
    const canvas = wrapper.querySelector('canvas');
    if (canvas) {
        const chart = Chart.getChart(canvas);
        if (chart) chart.resize();
    }
};

// ============================================
// 🚀 APP START
// ============================================
document.addEventListener("DOMContentLoaded", () => {
    console.log('📄 DOMContentLoaded');
    try {
        initDOM();

        if (currentUser?.role === 'admin') {
            const adminMenu = document.getElementById('adminMenu');
            if (adminMenu) adminMenu.style.display = 'block';
        }

        setupNavigation();

        const defaultSection = document.getElementById('dashboard');
        if (defaultSection) {
            document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
            defaultSection.classList.remove('hidden');
        }
        switchSection('dashboard');

        updateClock();
        setInterval(updateClock, 1000);

        if (DOM.userName) {
            DOM.userName.textContent = `👋 ${currentUser?.nama || 'User'}`;
        }

        const connStatus = document.getElementById('connStatus');
        if (connStatus) {
            connStatus.innerText = '✅ Connected';
            connStatus.style.color = '#22c55e';
        }

        console.log("🚀 APP READY!");
    } catch (e) {
        console.error('❌ ERROR:', e);
    }
});

console.log('✅ app.js loaded');
