// ============================================
// MAIN ENTRY – app.js (ROUTING ONLY)
// ============================================

import { db } from './firebase.js';
import { state, currentUser, setUser, DOM, initDOM, showToast } from './modules/core.js';
import { initAdminPanel } from './sections/admin.js';

// ⭐ IMPORT SECTIONS
import { 
    initCharts, 
    exportData, 
    exportPDF, 
    loadChartHistory, 
    loadChartHistoryByDate, 
    loadDailyHistory,
    loadDashChartHistory 
} from './sections/analytics.js';

import { 
    initDashboard, 
    initDashChart, 
    loadDashHistory, 
    cleanupDashboard 
} from './sections/dashboard.js';

import { 
    initMonitoring, 
    initGauge, 
    cleanupMonitoring 
} from './sections/monitoring.js';

import { 
    initControl, 
    cleanupControl 
} from './sections/control.js';

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
// EXPOSE GLOBAL (Export, PDF, Logout)
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
// NAVIGATION - SWITCH SECTION
// ============================================
function switchSection(sectionName) {
    // ─── CLEANUP ALL SECTIONS ───
    if (activeSections.dashboard) { 
        cleanupDashboard(); 
        activeSections.dashboard = false; 
    }
    if (activeSections.monitoring) { 
        cleanupMonitoring(); 
        activeSections.monitoring = false; 
    }
    if (activeSections.control) { 
        cleanupControl(); 
        activeSections.control = false; 
    }

    // ─── INIT SELECTED SECTION ───
    switch(sectionName) {
        case 'dashboard':
            activeSections.dashboard = true;
            initDashChart();
            setTimeout(() => {
                loadDashHistory();
                loadDashChartHistory();
            }, 500);
            initDashboard();
            console.log('🏠 Dashboard activated');
            break;

        case 'monitoring':
            activeSections.monitoring = true;
            setTimeout(() => {
                initGauge();
            }, 500);
            initMonitoring();
            console.log('🌡 Monitoring activated');
            break;

        case 'analytics':
            activeSections.analytics = true;
            initCharts();
            setTimeout(() => {
                loadChartHistory();
                loadDailyHistory();
                loadDashChartHistory();
            }, 500);
            console.log('📊 Analytics activated');
            break;

        case 'control':
            activeSections.control = true;
            initControl();
            console.log('🎛 Control activated');
            break;

        case 'admin':
            activeSections.admin = true;
            initAdminPanel();
            console.log('👑 Admin activated');
            break;

        default:
            break;
    }
}

// ============================================
// SETUP NAVIGATION (Menu Click)
// ============================================
function setupNavigation() {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Update active menu
            document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
            this.classList.add('active');

            // Show section
            const target = this.dataset.target;
            document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
            const section = document.getElementById(target);
            if (section) section.classList.remove('hidden');

            // Switch section logic
            switchSection(target);

            // Close mobile menu
            if (window.innerWidth <= 768) closeMenu();
        });
    });
}

// ============================================
// SIDEBAR (MOBILE)
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
window.addEventListener('resize', () => { 
    if (window.innerWidth > 768) closeMenu(); 
});
document.addEventListener('keydown', (e) => { 
    if (e.key === 'Escape') closeMenu(); 
});

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
// EXPAND CHART (global)
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
    console.log('📄 App starting...');
    try {
        // ─── INIT CORE ───
        initDOM();
        
        // ─── ADMIN MENU VISIBILITY ───
        if (currentUser?.role === 'admin') {
            const adminMenu = document.getElementById('adminMenu');
            if (adminMenu) adminMenu.style.display = 'block';
        }

        // ─── NAVIGATION ───
        setupNavigation();

        // ─── DEFAULT SECTION: DASHBOARD ───
        const defaultSection = document.getElementById('dashboard');
        if (defaultSection) {
            document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
            defaultSection.classList.remove('hidden');
        }
        switchSection('dashboard');

        // ─── CLOCK ───
        updateClock();
        setInterval(updateClock, 1000);

        // ─── USER NAME ───
        if (DOM.userName) {
            DOM.userName.textContent = `👋 ${currentUser?.nama || 'User'}`;
        }

        // ─── CONNECTION STATUS ───
        const connStatus = document.getElementById('connStatus');
        if (connStatus) {
            connStatus.innerText = 'Realtime Connected';
            connStatus.style.color = '#22c55e';
        }

        // ─── PERIODIK UPDATE ───
        setInterval(() => {
            // Update progress di dashboard (jika ada)
            const progress = Math.min(100, Math.round((state.accumulatedLight / state.totalLightNeeded) * 100));
            const display = progress > 100 ? 100 : progress;
            const dashProgress = document.getElementById('dashProgressValue');
            const gaugeProgress = document.getElementById('gaugeProgress');
            const statProgress = document.getElementById('statLightProgress');
            if (dashProgress) dashProgress.textContent = display + '%';
            if (gaugeProgress) gaugeProgress.textContent = display + '%';
            if (statProgress) statProgress.textContent = display;
        }, 10000);

        console.log("🚀 App ready!");
    } catch (e) {
        console.error('❌ Error start app:', e);
    }
});

console.log('✅ app.js loaded (routing only)');
