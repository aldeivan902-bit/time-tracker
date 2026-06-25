// ============================================
// SUPABASE SETUP - YOUR CREDENTIALS
// ============================================

const MY_SUPABASE_URL = 'https://pniudqwrxkdvcutxfsyp.supabase.co';
const MY_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuaXVkcXdyeGtkdmN1dHhmc3lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MzM5NTMsImV4cCI6MjA5NzEwOTk1M30.5qck9_Lj3FGUNrcPn-Uv9PBDreE9yqedvfcNAZRm3mI';

// Create Supabase client
const supabaseClient = window.supabase.createClient(MY_SUPABASE_URL, MY_SUPABASE_ANON_KEY);

// Global variables
let currentUser = localStorage.getItem('timeTracker_user') || '';
let reminderInterval = null;

// Timer variables - MINIMAL CLEAN APPROACH
let timerInterval = null;
let clockInTime = null;           // When clock in started (epoch) - NEVER CHANGES
let breakStartTime = null;        // When current break started (epoch)
let breakInterval = null;
let isOnBreak = false;
let totalBreakSeconds = 0;        // Total BREAK seconds (accumulated, NEVER RESETS)

// ============================================
// PAGE VISIBILITY
// ============================================

document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (breakInterval) {
            clearInterval(breakInterval);
            breakInterval = null;
        }
        saveTimerState();
    } else {
        if (clockInTime && currentUser) {
            getTodayEntry(currentUser, getToday()).then(entry => {
                if (entry && entry.clock_in && !entry.clock_out) {
                    if (entry.break_start && !entry.break_end) {
                        isOnBreak = true;
                        breakStartTime = parseTime(entry.break_start);
                        updateTimerDisplay();
                        if (breakInterval) clearInterval(breakInterval);
                        breakInterval = setInterval(updateBreakTimer, 1000);
                        updateBreakTimer();
                        const timerDisplay = document.getElementById('timerDisplay');
                        if (timerDisplay) timerDisplay.className = 'timer-display paused';
                        const statusText = document.getElementById('timerStatusText');
                        const statusDot = document.getElementById('timerDot');
                        if (statusText) statusText.textContent = 'On Break';
                        if (statusDot) statusDot.className = 'status-dot break';
                        const breakDisplay = document.getElementById('breakTimerDisplay');
                        if (breakDisplay) breakDisplay.style.display = 'block';
                    } else {
                        isOnBreak = false;
                        breakStartTime = null;
                        if (timerInterval) clearInterval(timerInterval);
                        timerInterval = setInterval(updateTimer, 1000);
                        updateTimer();
                    }
                }
            });
        }
    }
});

// ============================================
// TIMER STATE MANAGEMENT
// ============================================

function saveTimerState() {
    if (!clockInTime) {
        console.log('⏭️ Skipping save - no clockInTime');
        return;
    }
    const state = {
        clockInTime: clockInTime,
        totalBreakSeconds: totalBreakSeconds,
        breakStartTime: breakStartTime,
        isOnBreak: isOnBreak
    };
    localStorage.setItem('timerState', JSON.stringify(state));
    console.log('💾 Timer state SAVED:', state);
}

function loadTimerState() {
    try {
        const saved = localStorage.getItem('timerState');
        if (!saved) {
            console.log('📭 No saved timer state found');
            return false;
        }
        const state = JSON.parse(saved);
        console.log('📂 Timer state LOADED:', state);
        clockInTime = state.clockInTime;
        totalBreakSeconds = state.totalBreakSeconds || 0;
        breakStartTime = state.breakStartTime || null;
        isOnBreak = state.isOnBreak || false;
        console.log('📂 totalBreakSeconds after load:', totalBreakSeconds);
        if (!clockInTime) return false;
        const timerDiv = document.getElementById('liveTimer');
        if (timerDiv) timerDiv.style.display = 'block';
        if (timerInterval) clearInterval(timerInterval);
        if (breakInterval) clearInterval(breakInterval);
        timerInterval = null;
        breakInterval = null;
        if (isOnBreak && breakStartTime) {
            updateTimerDisplay();
            breakInterval = setInterval(updateBreakTimer, 1000);
            updateBreakTimer();
            const timerDisplay = document.getElementById('timerDisplay');
            if (timerDisplay) timerDisplay.className = 'timer-display paused';
            const breakDisplay = document.getElementById('breakTimerDisplay');
            if (breakDisplay) breakDisplay.style.display = 'block';
        } else {
            isOnBreak = false;
            timerInterval = setInterval(updateTimer, 1000);
            updateTimer();
        }
        return true;
    } catch (e) {
        console.error('Load error:', e);
        return false;
    }
}

function clearTimerState() {
    localStorage.removeItem('timerState');
}

// ============================================
// HELPER - FORMAT TIME
// ============================================

function formatTimeFromSeconds(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// ============================================
// CORE CALCULATION - WORK SECONDS
// ============================================

function calculateWorkSeconds() {
    if (!clockInTime) return 0;
    const now = new Date().getTime();
    const totalElapsed = Math.floor((now - clockInTime) / 1000);
    return Math.max(0, totalElapsed - totalBreakSeconds);
}

// ============================================
// UPDATE DISPLAY
// ============================================

function updateTimerDisplay() {
    const workSeconds = calculateWorkSeconds();
    const formatted = formatTimeFromSeconds(workSeconds);
    const timerDisplay = document.getElementById('timerDisplay');
    
    // Check if 8 hours (28800 seconds) is reached
    const isComplete = workSeconds >= 28800; // 8 hours in seconds
    const progressBar = document.getElementById('progressBar');
    const timerCard = document.querySelector('.timer-card');
    
    if (timerDisplay) {
        if (isOnBreak) {
            timerDisplay.textContent = formatted + ' ⏸️';
            timerDisplay.className = 'timer-display paused';
        } else {
            timerDisplay.textContent = formatted;
            timerDisplay.className = 'timer-display';
        }
    }
    
    const progress = Math.min((workSeconds / (8 * 3600)) * 100, 100);
    if (progressBar) {
        progressBar.style.width = progress + '%';
        if (isOnBreak) {
            progressBar.className = 'timer-progress-bar paused';
        } else if (progress >= 100) {
            progressBar.className = 'timer-progress-bar completed';
            // ✅ Trigger celebration when progress hits 100%
            triggerCompletionCelebration();
        } else {
            progressBar.className = 'timer-progress-bar';
        }
    }
}

// ============================================
// 8-HOUR COMPLETION CELEBRATION
// ============================================

let completionNotified = false;
let celebrationInterval = null;

function triggerCompletionCelebration() {
    // Only trigger once per session
    if (completionNotified) return;
    if (isOnBreak) return;
    
    const progressBar = document.getElementById('progressBar');
    if (!progressBar || progressBar.style.width !== '100%') return;
    
    completionNotified = true;
    console.log('🎉 8 HOURS COMPLETED! Great job!');
    
    // ============================================
    // 🎵 VICTORY FANFARE SOUND
    // ============================================
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Play a short victory melody
        const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
        const durations = [0.15, 0.15, 0.15, 0.3];
        let time = audioCtx.currentTime;
        
        notes.forEach((freq, i) => {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.frequency.value = freq;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, time);
            gainNode.gain.exponentialRampToValueAtTime(0.01, time + durations[i]);
            
            oscillator.start(time);
            oscillator.stop(time + durations[i]);
            time += durations[i] + 0.05;
        });
        
    } catch (e) {
        console.log('Audio not supported');
    }
    
    // ============================================
    // 📢 TOAST NOTIFICATION
    // ============================================
    showToast('🎉 8 HOURS COMPLETED! Great job!', 'success', '🎉 Achievement Unlocked!');
    
    // ============================================
    // ✨ VISUAL EFFECTS
    // ============================================
    progressBar.style.background = 'linear-gradient(90deg, #FFD700, #FF6B6B, #FFD700)';
    progressBar.style.backgroundSize = '200% 100%';
    progressBar.style.animation = 'shimmer 1.5s ease-in-out infinite';
    
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
        timerDisplay.style.color = '#FFD700';
        timerDisplay.style.textShadow = '0 0 20px rgba(255, 215, 0, 0.5)';
    }
    
    const timerCard = document.querySelector('.timer-card');
    if (timerCard) {
        timerCard.style.border = '3px solid #FFD700';
        timerCard.style.boxShadow = '0 0 40px rgba(255, 215, 0, 0.3)';
    }
    
    setTimeout(() => {
        completionNotified = false;
    }, 30000);
}
// ============================================
// RESET COMPLETION STATE (called when clocking out)
// ============================================

function resetCompletionState() {
    completionNotified = false;
    if (celebrationInterval) {
        clearInterval(celebrationInterval);
        celebrationInterval = null;
    }
    // Reset visual effects
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        progressBar.style.background = '';
        progressBar.style.backgroundSize = '';
        progressBar.style.animation = '';
    }
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
        timerDisplay.style.color = '';
        timerDisplay.style.textShadow = '';
    }
    const timerCard = document.querySelector('.timer-card');
    if (timerCard) {
        timerCard.style.border = '';
        timerCard.style.boxShadow = '';
    }
}

// ============================================
// TIMER FUNCTIONS
// ============================================

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    if (breakInterval) clearInterval(breakInterval);
    timerInterval = null;
    breakInterval = null;
    
    getTodayEntry(currentUser, getToday()).then(entry => {
        if (entry && entry.clock_in) {
            const clockInTimeParsed = parseTime(entry.clock_in);
            if (clockInTimeParsed === 0) return;
            clockInTime = clockInTimeParsed;
            
            // ✅ FIX: Only reset totalBreakSeconds if NOT on break and NOT already set
            // Load from localStorage first
            const saved = localStorage.getItem('timerState');
            if (saved) {
                try {
                    const state = JSON.parse(saved);
                    if (state.totalBreakSeconds > 0) {
                        totalBreakSeconds = state.totalBreakSeconds;
                        console.log('📂 Loaded totalBreakSeconds from localStorage:', totalBreakSeconds);
                    }
                } catch (e) {}
            }
            
            // If still 0 and not on break, it's a fresh start
            if (totalBreakSeconds === 0 && !entry.break_start) {
                totalBreakSeconds = 0;
            }
            
            console.log('🟢 Timer started - totalBreakSeconds:', totalBreakSeconds);
            
            const timerDiv = document.getElementById('liveTimer');
            if (timerDiv) {
                timerDiv.style.display = 'block';
                document.getElementById('sessionStartTime').textContent = entry.clock_in;
            }
            
            if (entry.break_start && !entry.break_end) {
                isOnBreak = true;
                breakStartTime = parseTime(entry.break_start);
                updateTimerDisplay();
                const timerDisplay = document.getElementById('timerDisplay');
                if (timerDisplay) timerDisplay.className = 'timer-display paused';
                breakInterval = setInterval(updateBreakTimer, 1000);
                updateBreakTimer();
                const statusText = document.getElementById('timerStatusText');
                const statusDot = document.getElementById('timerDot');
                if (statusText) statusText.textContent = 'On Break';
                if (statusDot) statusDot.className = 'status-dot break';
                const breakDisplay = document.getElementById('breakTimerDisplay');
                if (breakDisplay) breakDisplay.style.display = 'block';
            } else {
                isOnBreak = false;
                breakStartTime = null;
                timerInterval = setInterval(updateTimer, 1000);
                updateTimer();
                const timerDisplay = document.getElementById('timerDisplay');
                if (timerDisplay) timerDisplay.className = 'timer-display';
                const statusText = document.getElementById('timerStatusText');
                const statusDot = document.getElementById('timerDot');
                if (statusText) statusText.textContent = 'Working';
                if (statusDot) statusDot.className = 'status-dot working';
            }
            saveTimerState();
        }
    });
}

function updateTimer() {
    if (!clockInTime) return;
    updateTimerDisplay();
}

function startBreakTimer(breakStartTimeStr) {
    if (breakInterval) clearInterval(breakInterval);
    const breakTime = parseTime(breakStartTimeStr);
    if (breakTime === 0) return;
    
    isOnBreak = true;
    breakStartTime = breakTime;
    
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    updateTimerDisplay();
    
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
        timerDisplay.className = 'timer-display paused';
    }
    const statusText = document.getElementById('timerStatusText');
    const statusDot = document.getElementById('timerDot');
    if (statusText) statusText.textContent = 'On Break';
    if (statusDot) statusDot.className = 'status-dot break';
    
    breakInterval = setInterval(updateBreakTimer, 1000);
    updateBreakTimer();
    
    const breakDisplay = document.getElementById('breakTimerDisplay');
    if (breakDisplay) breakDisplay.style.display = 'block';
    
    saveTimerState();
}

function updateBreakTimer() {
    if (!breakStartTime || !isOnBreak) {
        const breakDisplay = document.getElementById('breakTimerDisplay');
        if (breakDisplay) breakDisplay.style.display = 'none';
        return;
    }
    const now = new Date().getTime();
    const currentBreakSeconds = Math.floor((now - breakStartTime) / 1000);
    const currentBreakMinutes = Math.floor(currentBreakSeconds / 60);
    const currentBreakSecs = currentBreakSeconds % 60;
    
    const totalBreakSecs = totalBreakSeconds + currentBreakSeconds;
    const totalBreakMins = Math.floor(totalBreakSecs / 60);
    const totalBreakSecsDisplay = totalBreakSecs % 60;
    
    const breakDisplay = document.getElementById('breakTimerDisplay');
    if (breakDisplay) {
        breakDisplay.textContent = `🍽️ Current: ${String(currentBreakMinutes).padStart(2, '0')}:${String(currentBreakSecs).padStart(2, '0')} | Total: ${String(totalBreakMins).padStart(2, '0')}:${String(totalBreakSecsDisplay).padStart(2, '0')}`;
        breakDisplay.style.display = 'block';
    }
    saveTimerState();
}

function stopBreakTimer() {
    if (breakInterval) {
        clearInterval(breakInterval);
        breakInterval = null;
    }
    resumeTimer();
    saveTimerState();
}

function resumeTimer() {
    console.log('🔴 resumeTimer called - isOnBreak:', isOnBreak);
    console.log('🔴 breakStartTime:', breakStartTime);
    
    if (!isOnBreak) {
        console.log('⚠️ resumeTimer called but not on break');
        return;
    }
    
    const now = new Date().getTime();
    const thisBreakDuration = Math.floor((now - breakStartTime) / 1000);
    console.log('📊 This break duration:', thisBreakDuration, 'seconds');
    console.log('📊 totalBreakSeconds BEFORE adding:', totalBreakSeconds);
    
    // Add this break to total break time
    totalBreakSeconds += thisBreakDuration;
    console.log('📊 totalBreakSeconds AFTER adding:', totalBreakSeconds);
    
    isOnBreak = false;
    breakStartTime = null;
    
    // ✅ SAVE immediately after updating totalBreakSeconds
    saveTimerState();
    
    const breakDisplay = document.getElementById('breakTimerDisplay');
    if (breakDisplay) {
        breakDisplay.textContent = '🍽️ Break: 00:00';
        breakDisplay.style.display = 'none';
    }
    
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
    
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) timerDisplay.className = 'timer-display';
    const statusText = document.getElementById('timerStatusText');
    const statusDot = document.getElementById('timerDot');
    if (statusText) statusText.textContent = 'Working';
    if (statusDot) statusDot.className = 'status-dot working';
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    if (breakInterval) {
        clearInterval(breakInterval);
        breakInterval = null;
    }
    isOnBreak = false;
    breakStartTime = null;
    totalBreakSeconds = 0;
    
    // ✅ Reset celebration state
    resetCompletionState();
    
    const timerDiv = document.getElementById('liveTimer');
    if (timerDiv) timerDiv.style.display = 'none';
    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.style.width = '0%';
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
        timerDisplay.textContent = '00:00:00';
        timerDisplay.className = 'timer-display';
    }
    const breakDisplay = document.getElementById('breakTimerDisplay');
    if (breakDisplay) breakDisplay.textContent = '🍽️ Break: 00:00';
    clearTimerState();
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function showToast(message, type = 'info', title = '') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const titles = { success: 'Success', error: 'Error', warning: 'Warning', info: 'Info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
        <div class="toast-content">
            <div class="toast-title">${title || titles[type] || 'Info'}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

// ============================================
// INITIALIZATION
// ============================================

window.onload = function() {
    console.log('App loaded, current user:', currentUser);
    if (currentUser) {
        const nameInput = document.getElementById('userName');
        if (nameInput) nameInput.value = currentUser;
        updateAll();
        setupRealtime();
        setupReminder();
        loadSettings();
        const restored = loadTimerState();
        if (!restored) {
            checkAndRestoreTimer();
        }
    }
    setInterval(() => {
        if (currentUser) {
            updateTodayStats();
            updateTeamStatus();
        }
    }, 10000);
};

async function checkAndRestoreTimer() {
    const today = getToday();
    const entry = await getTodayEntry(currentUser, today);
    if (entry && entry.clock_in && !entry.clock_out) {
        clockInTime = parseTime(entry.clock_in);
        if (clockInTime && clockInTime > 0) {
            if (entry.break_start && !entry.break_end) {
                isOnBreak = true;
                breakStartTime = parseTime(entry.break_start);
                updateTimerDisplay();
                if (breakInterval) clearInterval(breakInterval);
                breakInterval = setInterval(updateBreakTimer, 1000);
                updateBreakTimer();
                const timerDisplay = document.getElementById('timerDisplay');
                if (timerDisplay) timerDisplay.className = 'timer-display paused';
                const statusText = document.getElementById('timerStatusText');
                const statusDot = document.getElementById('timerDot');
                if (statusText) statusText.textContent = 'On Break';
                if (statusDot) statusDot.className = 'status-dot break';
                const breakDisplay = document.getElementById('breakTimerDisplay');
                if (breakDisplay) breakDisplay.style.display = 'block';
            } else {
                isOnBreak = false;
                breakStartTime = null;
                if (timerInterval) clearInterval(timerInterval);
                timerInterval = setInterval(updateTimer, 1000);
                updateTimer();
                const timerDisplay = document.getElementById('timerDisplay');
                if (timerDisplay) timerDisplay.className = 'timer-display';
                const statusText = document.getElementById('timerStatusText');
                const statusDot = document.getElementById('timerDot');
                if (statusText) statusText.textContent = 'Working';
                if (statusDot) statusDot.className = 'status-dot working';
            }
            const timerDiv = document.getElementById('liveTimer');
            if (timerDiv) timerDiv.style.display = 'block';
            document.getElementById('sessionStartTime').textContent = entry.clock_in;
            saveTimerState();
        }
    }
}

// ============================================
// USER FUNCTIONS
// ============================================

function setUser() {
    const nameInput = document.getElementById('userName');
    currentUser = nameInput.value.trim();
    if (currentUser) {
        localStorage.setItem('timeTracker_user', currentUser);
        updateAll();
        setupRealtime();
        setupReminder();
        setTimeout(checkAndRestoreTimer, 500);
    } else {
        showToast('Please enter your name', 'warning');
    }
}

async function updateAll() {
    await updateStatus();
    await updateTodayStats();
    await updateMonthlyStats();
    await updateTeamStatus();
    saveTimerState();
}

// ============================================
// UPDATE STATUS
// ============================================

async function updateStatus() {
    const today = getToday();
    const entry = await getTodayEntry(currentUser, today);
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    const timerStatusText = document.getElementById('timerStatusText');
    const timerDot = document.getElementById('timerDot');
    if (!entry || !entry.clock_in) {
        if (statusText) statusText.textContent = 'Not clocked in';
        if (statusDot) statusDot.className = 'status-dot off';
        if (timerStatusText) timerStatusText.textContent = 'Not clocked in';
        if (timerDot) timerDot.className = 'status-dot off';
        stopTimer();
        updateButtons(null);
        return;
    }
    if (entry.clock_in && !entry.clock_out) {
        if (entry.break_start && !entry.break_end) {
            if (statusText) statusText.textContent = 'On Break';
            if (statusDot) statusDot.className = 'status-dot break';
            if (timerStatusText) timerStatusText.textContent = 'On Break';
            if (timerDot) timerDot.className = 'status-dot break';
        } else {
            if (statusText) statusText.textContent = 'Working';
            if (statusDot) statusDot.className = 'status-dot working';
            if (timerStatusText) timerStatusText.textContent = 'Working';
            if (timerDot) timerDot.className = 'status-dot working';
        }
        startTimer();
    } else if (entry.clock_in && entry.clock_out) {
        if (statusText) statusText.textContent = 'Completed';
        if (statusDot) statusDot.className = 'status-dot completed';
        if (timerStatusText) timerStatusText.textContent = 'Completed';
        if (timerDot) timerDot.className = 'status-dot completed';
        stopTimer();
    }
    updateButtons(entry);
}

function updateButtons(entry) {
    const btnClockIn = document.getElementById('btnClockIn');
    const btnBreakStart = document.getElementById('btnBreakStart');
    const btnBreakEnd = document.getElementById('btnBreakEnd');
    const btnClockOut = document.getElementById('btnClockOut');
    if (!entry || !entry.clock_in) {
        if (btnClockIn) btnClockIn.style.display = 'flex';
        if (btnBreakStart) btnBreakStart.style.display = 'none';
        if (btnBreakEnd) btnBreakEnd.style.display = 'none';
        if (btnClockOut) btnClockOut.style.display = 'none';
        return;
    }
    if (entry.clock_in && !entry.clock_out) {
        if (btnClockIn) btnClockIn.style.display = 'none';
        if (btnClockOut) btnClockOut.style.display = 'flex';
        if (entry.break_start && !entry.break_end) {
            if (btnBreakStart) btnBreakStart.style.display = 'none';
            if (btnBreakEnd) btnBreakEnd.style.display = 'flex';
        } else {
            if (btnBreakStart) btnBreakStart.style.display = 'flex';
            if (btnBreakEnd) btnBreakEnd.style.display = 'none';
        }
        return;
    }
    if (entry.clock_in && entry.clock_out) {
        if (btnClockIn) btnClockIn.style.display = 'none';
        if (btnBreakStart) btnBreakStart.style.display = 'none';
        if (btnBreakEnd) btnBreakEnd.style.display = 'none';
        if (btnClockOut) btnClockOut.style.display = 'none';
    }
}

// ============================================
// MAIN ACTIONS
// ============================================

async function clockIn() {
    console.log('clockIn called');
    if (!currentUser) {
        showToast('Please set your name first', 'warning');
        return;
    }
    const today = getToday();
    const existing = await getTodayEntry(currentUser, today);
    if (existing && existing.clock_in) {
        showToast('You already clocked in today!', 'warning');
        return;
    }
    const now = new Date();
    const timeStr = formatTimeWithSeconds(now);
    const entry = {
        user_name: currentUser,
        date: today,
        clock_in: timeStr,
        status: 'active',
        last_modified: new Date().toISOString()
    };
    const { error } = await supabaseClient.from('time_entries').insert(entry);
    if (error) {
        showToast('Error: ' + error.message, 'error');
    } else {
        showToast(`✅ ${currentUser} clocked IN at ${timeStr}`, 'success');
        await updateAll();
        startTimer();
    }
}

async function breakStart() {
    console.log('breakStart called');
    if (!currentUser) {
        showToast('Please set your name first', 'warning');
        return;
    }
    const today = getToday();
    const entry = await getTodayEntry(currentUser, today);
    if (!entry || !entry.clock_in) {
        showToast('You must clock in first!', 'warning');
        return;
    }
    if (entry.clock_out) {
        showToast('You already clocked out today!', 'warning');
        return;
    }
    if (entry.break_start && !entry.break_end) {
        showToast('You are already on break! End your break first.', 'warning');
        return;
    }
    const now = new Date();
    const timeStr = formatTimeWithSeconds(now);
    const { error } = await supabaseClient
        .from('time_entries')
        .update({ 
            break_start: timeStr, 
            break_end: null,
            last_modified: new Date().toISOString() 
        })
        .eq('user_name', currentUser)
        .eq('date', today);
    if (error) {
        showToast('Error: ' + error.message, 'error');
    } else {
        showToast(`🍽️ Break started at ${timeStr}`, 'success');
        startBreakTimer(timeStr);
        await updateAll();
    }
}

async function breakEnd() {
    console.log('breakEnd called');
    if (!currentUser) {
        showToast('Please set your name first', 'warning');
        return;
    }
    const today = getToday();
    const entry = await getTodayEntry(currentUser, today);
    if (!entry || !entry.break_start) {
        showToast('You haven\'t started a break!', 'warning');
        return;
    }
    if (entry.break_end) {
        showToast('Break already ended!', 'warning');
        return;
    }
    const now = new Date();
    const timeStr = formatTimeWithSeconds(now);
    const { error } = await supabaseClient
        .from('time_entries')
        .update({ 
            break_end: timeStr, 
            last_modified: new Date().toISOString() 
        })
        .eq('user_name', currentUser)
        .eq('date', today);
    if (error) {
        showToast('Error: ' + error.message, 'error');
    } else {
        showToast(`▶️ Break ended at ${timeStr}`, 'success');
        stopBreakTimer();
        await updateCalculations(currentUser, today);
        await updateAll();
    }
}

async function clockOut() {
    console.log('clockOut called');
    if (!currentUser) {
        showToast('Please set your name first', 'warning');
        return;
    }
    const today = getToday();
    const entry = await getTodayEntry(currentUser, today);
    if (!entry || !entry.clock_in) {
        showToast('You must clock in first!', 'warning');
        return;
    }
    if (entry.clock_out) {
        showToast('You already clocked out today!', 'warning');
        return;
    }
    const now = new Date();
    const timeStr = formatTimeWithSeconds(now);
    const { error } = await supabaseClient
        .from('time_entries')
        .update({ clock_out: timeStr, last_modified: new Date().toISOString() })
        .eq('user_name', currentUser)
        .eq('date', today);
    if (error) {
        showToast('Error: ' + error.message, 'error');
    } else {
        showToast(`✅ Clocked OUT at ${timeStr}`, 'success');
        await updateCalculations(currentUser, today);
        await showClockOutSummary(currentUser, today);
        await updateAll();
        stopTimer();
    }
}

// ============================================
// CALCULATIONS
// ============================================

async function updateCalculations(user, date) {
    console.log('🔄 Running calculations for:', user, date);
    console.log('📊 totalBreakSeconds in updateCalculations:', totalBreakSeconds);
    
    try {
        const entry = await getTodayEntry(user, date);
        if (!entry || !entry.clock_in || !entry.clock_out) {
            console.log('⏰ Missing clock_in or clock_out');
            return;
        }
        const clockIn = parseTime(entry.clock_in);
        const clockOut = parseTime(entry.clock_out);
        if (clockIn === 0 || clockOut === 0) {
            console.warn('⚠️ Could not parse times:', entry.clock_in, entry.clock_out);
            return;
        }
        let shiftMinutes = (clockOut - clockIn) / (1000 * 60);
        if (shiftMinutes < 0) shiftMinutes += 1440;
        
        // Use totalBreakSeconds from timer
        const breakMinutes = totalBreakSeconds / 60;
        console.log('📊 breakMinutes calculated:', breakMinutes);
        
        const workedMinutes = shiftMinutes - breakMinutes;
        const overtimeMinutes = Math.max(0, workedMinutes - 480);
        const overbreakMinutes = Math.max(0, breakMinutes - 60);
        
        console.log('📊 Calculated:', { 
            shiftMinutes, 
            breakMinutes, 
            workedMinutes, 
            overtimeMinutes, 
            overbreakMinutes 
        });
        
        const { error } = await supabaseClient
            .from('time_entries')
            .update({
                break_minutes: Math.round(breakMinutes),
                worked_minutes: Math.round(workedMinutes),
                overtime_minutes: Math.round(overtimeMinutes),
                overbreak_minutes: Math.round(overbreakMinutes),
                status: 'completed'
            })
            .eq('user_name', user)
            .eq('date', date);
        if (error) {
            console.error('❌ Error updating calculations:', error);
        } else {
            console.log('✅ Calculations updated successfully!');
        }
    } catch (err) {
        console.error('❌ Error in updateCalculations:', err);
    }
}

async function showClockOutSummary(user, date) {
    const entry = await getTodayEntry(user, date);
    if (!entry) return;
    const shiftMinutes = (entry.worked_minutes || 0) + (entry.break_minutes || 0);
    const monthly = await getMonthlyStats(user);
    const summaryHtml = `
        <h2>✅ CLOCK OUT SUMMARY - ${user}</h2>
        <p><strong>Date:</strong> ${formatDate(date)}</p>
        <hr>
        <h3>⏰ TIME BREAKDOWN</h3>
        <p>Clock In: ${entry.clock_in || '—'}</p>
        <p>Break Start: ${entry.break_start || '—'}</p>
        <p>Break End: ${entry.break_end || '—'}</p>
        <p>Clock Out: ${entry.clock_out || '—'}</p>
        <hr>
        <h3>📊 CALCULATIONS</h3>
        <p>Total shift length: ${formatMinutes(shiftMinutes)}</p>
        <p>Total break taken: ${formatMinutes(entry.break_minutes || 0)}</p>
        <p><strong>✅ ACTUAL WORKED: ${formatMinutes(entry.worked_minutes || 0)}</strong></p>
        <p>Normal hours: 8 hours</p>
        <p>🟡 OVERTIME: ${formatMinutes(entry.overtime_minutes || 0)}</p>
        <hr>
        <h3>⚠️ BREAK WARNING</h3>
        <p>${(entry.overbreak_minutes || 0) > 0 ? `⚠️ You took ${formatMinutes(entry.overbreak_minutes)} longer than standard 1 hour break.` : '✅ Break time was within standard 1 hour. No overbreak.'}</p>
        <hr>
        <h3>📈 MONTH-TO-DATE (${getCurrentMonth()})</h3>
        <p>Total days worked: ${monthly.daysWorked}</p>
        <p>Total hours: ${formatMinutes(Math.round(monthly.totalHours * 60))}</p>
        <p>Total overtime: ${formatMinutes(Math.round(monthly.totalOvertime * 60))}</p>
        <p>Days with overbreak: ${monthly.overbreakDays}</p>
    `;
    const summaryContent = document.getElementById('summaryContent');
    const summaryModal = document.getElementById('summaryModal');
    if (summaryContent && summaryModal) {
        summaryContent.innerHTML = summaryHtml;
        summaryModal.style.display = 'flex';
    }
}

function closeSummary() {
    const modal = document.getElementById('summaryModal');
    if (modal) modal.style.display = 'none';
}

// ============================================
// DISPLAY UPDATES
// ============================================

async function updateTodayStats() {
    const today = getToday();
    const entry = await getTodayEntry(currentUser, today);
    const statusEl = document.getElementById('todayStatus');
    const hoursEl = document.getElementById('todayHours');
    const breakEl = document.getElementById('todayBreak');
    const overtimeEl = document.getElementById('todayOvertime');
    const warningDiv = document.getElementById('overbreakWarning');
    
    if (!entry || !entry.clock_in) {
        if (statusEl) statusEl.innerText = 'Not started';
        if (hoursEl) {
            stopCalculatingAnimation(hoursEl);
            hoursEl.innerText = '0h';
        }
        if (breakEl) breakEl.innerText = '0h';
        if (overtimeEl) overtimeEl.innerText = '0h';
        if (warningDiv) warningDiv.style.display = 'none';
        return;
    }
    
    let status = 'Working';
    if (entry.clock_out) status = 'Completed';
    else if (entry.break_start && !entry.break_end) status = 'On Break';
    if (statusEl) statusEl.innerText = status;
    
    if (hoursEl) {
        if (entry.worked_minutes !== null && entry.worked_minutes !== undefined) {
            stopCalculatingAnimation(hoursEl);
            hoursEl.innerText = formatMinutes(entry.worked_minutes);
        } else if (entry.clock_out) {
            // Try to recalculate
            await updateCalculations(currentUser, today);
            const updated = await getTodayEntry(currentUser, today);
            if (updated && updated.worked_minutes !== null) {
                stopCalculatingAnimation(hoursEl);
                hoursEl.innerText = formatMinutes(updated.worked_minutes);
            } else {
                animateCalculating(hoursEl);
            }
        } else {
            animateCalculating(hoursEl);
        }
    }
    
    if (breakEl) {
        if (entry.break_minutes !== null && entry.break_minutes !== undefined) {
            breakEl.innerText = formatMinutes(entry.break_minutes);
        } else {
            breakEl.innerText = '0h';
        }
    }
    
    if (overtimeEl) {
        if (entry.overtime_minutes !== null && entry.overtime_minutes !== undefined) {
            overtimeEl.innerText = formatMinutes(entry.overtime_minutes);
        } else {
            overtimeEl.innerText = '0h';
        }
    }
    
    if (warningDiv) {
        if (entry.overbreak_minutes && entry.overbreak_minutes > 0) {
            warningDiv.style.display = 'block';
            warningDiv.innerHTML = `⚠️ Warning: You took ${formatMinutes(entry.overbreak_minutes)} extra break today`;
        } else {
            warningDiv.style.display = 'none';
        }
    }
}

async function updateMonthlyStats() {
    if (!currentUser) return;
    try {
        const stats = await getMonthlyStats(currentUser);
        const daysEl = document.getElementById('monthDays');
        const hoursEl = document.getElementById('monthHours');
        const overtimeEl = document.getElementById('monthOvertime');
        const overbreakEl = document.getElementById('monthOverbreak');
        if (daysEl) daysEl.innerText = stats.daysWorked || 0;
        if (hoursEl) hoursEl.innerText = stats.totalHours ? formatMinutes(Math.round(stats.totalHours * 60)) : '0h';
        if (overtimeEl) overtimeEl.innerText = stats.totalOvertime ? formatMinutes(Math.round(stats.totalOvertime * 60)) : '0h';
        if (overbreakEl) overbreakEl.innerText = stats.overbreakDays || 0;
    } catch (err) {
        console.error('Error updating monthly stats:', err);
    }
}

async function getMonthlyStats(user) {
    if (!user) return { daysWorked: 0, totalHours: 0, totalOvertime: 0, overbreakDays: 0 };
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const currentMonth = `${year}-${month}`;
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
    const startDate = `${currentMonth}-01`;
    const endDate = `${currentMonth}-${String(lastDay).padStart(2, '0')}`;
    try {
        const { data, error } = await supabaseClient
            .from('time_entries')
            .select('*')
            .eq('user_name', user)
            .gte('date', startDate)
            .lte('date', endDate);
        if (error || !data || data.length === 0) {
            return { daysWorked: 0, totalHours: 0, totalOvertime: 0, overbreakDays: 0 };
        }
        let daysWorked = 0, totalHours = 0, totalOvertime = 0, overbreakDays = 0;
        for (const entry of data) {
            if (entry.clock_in && entry.clock_out) {
                daysWorked++;
                if (entry.worked_minutes !== null && entry.worked_minutes !== undefined && entry.worked_minutes > 0) {
                    totalHours += entry.worked_minutes / 60;
                    totalOvertime += (entry.overtime_minutes || 0) / 60;
                    if (entry.overbreak_minutes > 0) overbreakDays++;
                }
            }
        }
        return { daysWorked, totalHours, totalOvertime, overbreakDays };
    } catch (err) {
        return { daysWorked: 0, totalHours: 0, totalOvertime: 0, overbreakDays: 0 };
    }
}

// ============================================
// TEAM STATUS
// ============================================

async function updateTeamStatus() {
    const { data, error } = await supabaseClient
        .from('time_entries')
        .select('*')
        .eq('date', getToday())
        .order('user_name');
    const teamDiv = document.getElementById('teamStatus');
    if (!teamDiv) return;
    if (error || !data || data.length === 0) {
        teamDiv.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">No one has clocked in today</div>';
        return;
    }
    let html = '';
    for (const member of data) {
        let status = '⚪ Not clocked in';
        let statusClass = 'off';
        let timeDisplay = '';
        if (member.clock_in && !member.clock_out) {
            const clockInTime = parseTime(member.clock_in);
            if (clockInTime === 0) {
                timeDisplay = ' (calculating...)';
            } else {
                const now = new Date().getTime();
                let elapsed = now - clockInTime;
                if (member.break_start && !member.break_end) {
                    const breakTime = parseTime(member.break_start);
                    if (breakTime !== 0) {
                        const breakElapsed = now - breakTime;
                        elapsed -= breakElapsed;
                    }
                }
                if (elapsed > 0 && elapsed < 86400000) {
                    if (member.break_start && !member.break_end) {
                        status = `🟡 ON BREAK`;
                        statusClass = 'break';
                        const breakTime = parseTime(member.break_start);
                        if (breakTime !== 0) {
                            const breakElapsed = now - breakTime;
                            if (breakElapsed > 0 && breakElapsed < 86400000) {
                                const breakMinutes = Math.floor(breakElapsed / (1000 * 60));
                                timeDisplay = ` (break: ${breakMinutes}m)`;
                            }
                        }
                    } else {
                        status = `🟢 WORKING`;
                        statusClass = 'working';
                        const hours = Math.floor(elapsed / (1000 * 60 * 60));
                        const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
                        timeDisplay = ` (${hours}h ${minutes}m)`;
                    }
                } else {
                    status = `🟢 WORKING since ${member.clock_in}`;
                    statusClass = 'working';
                }
            }
        } else if (member.clock_in && member.clock_out) {
            status = `🔴 Clocked out at ${member.clock_out}`;
            statusClass = 'completed';
            if (member.worked_minutes !== null && member.worked_minutes !== undefined) {
                timeDisplay = ` (${formatMinutes(member.worked_minutes)})`;
            }
        }
        const avatar = member.user_name.charAt(0).toUpperCase();
        html += `
            <div class="team-member">
                <div class="team-member-left">
                    <div class="team-avatar">${avatar}</div>
                    <div>
                        <div class="team-name">${member.user_name}</div>
                        <div class="team-time">${timeDisplay}</div>
                    </div>
                </div>
                <span class="team-badge ${statusClass}">${status}</span>
            </div>
        `;
    }
    teamDiv.innerHTML = html;
}

// ============================================
// DATABASE QUERIES
// ============================================

async function getTodayEntry(user, date) {
    const { data, error } = await supabaseClient
        .from('time_entries')
        .select('*')
        .eq('user_name', user)
        .eq('date', date)
        .maybeSingle();
    if (error || !data) return null;
    return data;
}

// ============================================
// REAL-TIME & REMINDERS
// ============================================

function setupRealtime() {
    if (window.realtimeChannel) {
        supabaseClient.removeChannel(window.realtimeChannel);
    }
    window.realtimeChannel = supabaseClient
        .channel('time-tracker-live')
        .on('postgres_changes', 
            { event: '*', schema: 'public', table: 'time_entries' },
            () => {
                if (currentUser) {
                    updateTeamStatus();
                    updateTodayStats();
                    updateMonthlyStats();
                }
            }
        )
        .subscribe();
}

function setupReminder() {
    if (reminderInterval) clearInterval(reminderInterval);
    reminderInterval = setInterval(() => {
        const now = new Date();
        if (now.getHours() === 17 && now.getMinutes() === 0) {
            checkAndRemind();
        }
    }, 60000);
}

async function checkAndRemind() {
    const enabled = localStorage.getItem('enableReminder') === 'true';
    if (!enabled) return;
    const today = getToday();
    const entry = await getTodayEntry(currentUser, today);
    if (entry && entry.clock_in && !entry.clock_out) {
        if (Notification.permission === 'granted') {
            new Notification('⏰ Time Tracker Reminder', {
                body: `You've been working since ${entry.clock_in}. Don't forget to clock out!`
            });
        }
    }
}

// ============================================
// SETTINGS & EXPORT
// ============================================

function toggleSettings() {
    const panel = document.getElementById('settingsPanel');
    if (panel) panel.classList.toggle('open');
}

function toggleReminder() {
    const toggle = document.getElementById('reminderToggle');
    const enabled = toggle.classList.toggle('active');
    localStorage.setItem('enableReminder', enabled);
    if (enabled && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

function toggleDarkMode() {
    const toggle = document.getElementById('darkModeToggle');
    const isDark = toggle.classList.toggle('active');
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('darkMode', isDark);
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) themeToggle.textContent = isDark ? '☀️' : '🌙';
}

function loadSettings() {
    const enableReminder = localStorage.getItem('enableReminder') === 'true';
    const darkMode = localStorage.getItem('darkMode') === 'true';
    const reminderToggle = document.getElementById('reminderToggle');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const themeToggle = document.getElementById('themeToggle');
    if (reminderToggle && enableReminder) reminderToggle.classList.add('active');
    if (darkModeToggle && darkMode) darkModeToggle.classList.add('active');
    if (darkMode) {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeToggle) themeToggle.textContent = '☀️';
    }
}

async function exportToCSV() {
    if (!currentUser) {
        showToast('Please set your name first', 'warning');
        return;
    }
    const { data, error } = await supabaseClient
        .from('time_entries')
        .select('*')
        .eq('user_name', currentUser)
        .order('date', { ascending: false });
    if (error || !data || data.length === 0) {
        showToast('No data to export', 'warning');
        return;
    }
    let csv = 'Date,Clock In,Break Start,Break End,Clock Out,Worked Hours,Overtime Hours,Break Minutes,Overbreak Warning\n';
    for (const entry of data) {
        csv += `${entry.date},`;
        csv += `${entry.clock_in || ''},`;
        csv += `${entry.break_start || ''},`;
        csv += `${entry.break_end || ''},`;
        csv += `${entry.clock_out || ''},`;
        csv += `${entry.worked_minutes !== null && entry.worked_minutes !== undefined ? (entry.worked_minutes / 60).toFixed(2) : ''},`;
        csv += `${entry.overtime_minutes !== null && entry.overtime_minutes !== undefined ? (entry.overtime_minutes / 60).toFixed(2) : ''},`;
        csv += `${entry.break_minutes || ''},`;
        csv += `${(entry.overbreak_minutes || 0) > 0 ? 'Yes' : 'No'}\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentUser}_timesheet_${getCurrentMonth()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ Export complete!', 'success');
}

async function deleteAllData() {
    if (!confirm('⚠️ WARNING: This will delete ALL your time entries. Are you ABSOLUTELY sure?')) return;
    if (!confirm('Last chance! This cannot be undone. Delete everything?')) return;
    const { error } = await supabaseClient
        .from('time_entries')
        .delete()
        .eq('user_name', currentUser);
    if (error) {
        showToast('Error deleting: ' + error.message, 'error');
    } else {
        showToast('✅ All data deleted', 'success');
        updateAll();
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================
// Animated "Calculating..." with moving dots
let calculatingInterval = null;

function animateCalculating(element) {
    if (calculatingInterval) {
        clearInterval(calculatingInterval);
        calculatingInterval = null;
    }
    
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;
    
    calculatingInterval = setInterval(() => {
        element.innerText = 'Calculating ' + frames[frameIndex];
        frameIndex = (frameIndex + 1) % frames.length;
    }, 100);
}

function stopCalculatingAnimation(element) {
    if (calculatingInterval) {
        clearInterval(calculatingInterval);
        calculatingInterval = null;
    }
    if (element) {
        element.innerText = 'Calculating...';
        element.style.transform = 'scale(1)';
        element.style.opacity = '1';
    }
}

function stopCalculatingAnimation(element) {
    if (calculatingInterval) {
        clearInterval(calculatingInterval);
        calculatingInterval = null;
    }
    if (element) {
        element.innerText = 'Calculating...';
    }
}

function getToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getCurrentMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function formatDate(dateStr) {
    const parts = dateStr.split('-');
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

function formatTimeWithSeconds(date) {
    return date.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatMinutes(totalMinutes) {
    if (totalMinutes === null || totalMinutes === undefined || isNaN(totalMinutes)) {
        return '0h';
    }
    const hours = Math.floor(Math.abs(totalMinutes) / 60);
    const minutes = Math.abs(totalMinutes) % 60;
    if (hours === 0 && minutes === 0) return '0h';
    if (minutes === 0) return `${hours}h`;
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${minutes}m`;
}

function parseTime(timeStr) {
    if (!timeStr) return 0;
    let match = timeStr.match(/(\d+):(\d+):(\d+)\s+(AM|PM)/i);
    if (match) {
        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = parseInt(match[3]);
        const meridian = match[4].toUpperCase();
        if (meridian === 'PM' && hours !== 12) hours += 12;
        if (meridian === 'AM' && hours === 12) hours = 0;
        const date = new Date();
        date.setHours(hours, minutes, seconds, 0);
        return date.getTime();
    }
    match = timeStr.match(/(\d+):(\d+):(\d+)/);
    if (match) {
        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const seconds = parseInt(match[3]);
        const date = new Date();
        date.setHours(hours, minutes, seconds, 0);
        return date.getTime();
    }
    match = timeStr.match(/(\d+):(\d+)/);
    if (match) {
        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        return date.getTime();
    }
    return 0;
}

function calculateBreakDuration(startTime, endTime) {
    const start = parseTime(startTime);
    const end = endTime ? parseTime(endTime) : new Date().getTime();
    if (start === 0 || end === 0) return '0h';
    const minutes = (end - start) / (1000 * 60);
    if (minutes < 0) return '0h';
    return formatMinutes(minutes);
}

// ============================================
// TEST 8-HOUR COMPLETION (FOR TESTING ONLY)
// ============================================

function testCompletion() {
    console.log('🧪 Testing 8-hour completion...');
    
    // Temporarily set work seconds to 8 hours
    const originalWorkSeconds = calculateWorkSeconds();
    
    // Force trigger completion
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        progressBar.style.width = '100%';
        progressBar.className = 'timer-progress-bar completed';
        // Trigger the celebration
        triggerCompletionCelebration();
    }
    
    // Update timer display to show 8:00:00
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay && !isOnBreak) {
        timerDisplay.textContent = '08:00:00';
        timerDisplay.className = 'timer-display';
        timerDisplay.style.color = '#FFD700';
        timerDisplay.style.textShadow = '0 0 20px rgba(255, 215, 0, 0.5)';
    }
    
    showToast('🧪 TEST: 8-hour celebration triggered!', 'success', '🎯 Test Mode');
}

// ============================================
// RESET TEST VISUALS (ADD TO resetCompletionState)
// ============================================

function resetCompletionState() {
    completionNotified = false;
    if (celebrationInterval) {
        clearInterval(celebrationInterval);
        celebrationInterval = null;
    }
    // Reset visual effects
    const progressBar = document.getElementById('progressBar');
    if (progressBar) {
        progressBar.style.background = '';
        progressBar.style.backgroundSize = '';
        progressBar.style.animation = '';
        // Don't reset width here - let the real timer update it
    }
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
        timerDisplay.style.color = '';
        timerDisplay.style.textShadow = '';
    }
    const timerCard = document.querySelector('.timer-card');
    if (timerCard) {
        timerCard.style.border = '';
        timerCard.style.boxShadow = '';
    }
    
    // Reset completion flag so it can trigger again
    completionNotified = false;
}