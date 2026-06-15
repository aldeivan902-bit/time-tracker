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
    }
    
    // Auto-refresh every 10 seconds
    setInterval(() => {
        if (currentUser) {
            updateTodayStats();
            updateTeamStatus();
        }
    }, 10000);
};

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
    } else {
        alert('Please enter your name');
    }
}

async function updateAll() {
    await updateStatus();
    await updateTodayStats();
    await updateMonthlyStats();
    await updateTeamStatus();
}

async function updateStatus() {
    const today = getToday();
    const entry = await getTodayEntry(currentUser, today);
    const statusDiv = document.getElementById('statusCard');
    
    if (!statusDiv) return;
    
    if (!entry) {
        statusDiv.innerHTML = `<p>📅 No activity today. Click "Clock In" to start.</p>`;
        return;
    }
    
    let statusHtml = `<p><strong>${currentUser}</strong> - ${formatDate(today)}</p>`;
    
    if (entry.clock_in && !entry.clock_out) {
        if (entry.break_start && !entry.break_end) {
            statusHtml += `<p>🟡 ON BREAK since ${entry.break_start}</p>`;
        } else {
            statusHtml += `<p>🟢 WORKING since ${entry.clock_in}</p>`;
        }
    } else if (entry.clock_in && entry.clock_out) {
        statusHtml += `<p>🔴 COMPLETED - Worked ${entry.worked_minutes ? formatMinutes(entry.worked_minutes) : 'calculating...'}</p>`;
    } else {
        statusHtml += `<p>⚪ Not clocked in yet</p>`;
    }
    
    if (entry.break_start && !entry.break_end) {
        const breakDuration = calculateBreakDuration(entry.break_start, null);
        statusHtml += `<p>🍽️ Current break: ${breakDuration}</p>`;
    }
    
    statusDiv.innerHTML = statusHtml;
}

// ============================================
// MAIN ACTIONS
// ============================================

async function clockIn() {
    console.log('clockIn called');
    
    if (!currentUser) {
        alert('Please set your name first');
        return;
    }
    
    const today = getToday();
    const existing = await getTodayEntry(currentUser, today);
    
    if (existing && existing.clock_in) {
        alert('You already clocked in today!');
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
    
    const { error } = await supabaseClient
        .from('time_entries')
        .insert(entry);
    
    if (error) {
        alert('Error: ' + error.message);
        console.error(error);
    } else {
        alert(`✅ ${currentUser} clocked IN at ${timeStr}`);
        updateAll();
    }
}

async function breakStart() {
    console.log('breakStart called');
    
    if (!currentUser) {
        alert('Please set your name first');
        return;
    }
    
    const today = getToday();
    const entry = await getTodayEntry(currentUser, today);
    
    if (!entry || !entry.clock_in) {
        alert('You must clock in first!');
        return;
    }
    
    if (entry.clock_out) {
        alert('You already clocked out today!');
        return;
    }
    
    if (entry.break_start && !entry.break_end) {
        alert('You are already on break! End your break first.');
        return;
    }
    
    const now = new Date();
    const timeStr = formatTimeWithSeconds(now);
    
    const { error } = await supabaseClient
        .from('time_entries')
        .update({ break_start: timeStr, last_modified: new Date().toISOString() })
        .eq('user_name', currentUser)
        .eq('date', today);
    
    if (error) {
        alert('Error: ' + error.message);
    } else {
        alert(`🍽️ Break started at ${timeStr}`);
        updateAll();
    }
}

async function breakEnd() {
    console.log('breakEnd called');
    
    if (!currentUser) {
        alert('Please set your name first');
        return;
    }
    
    const today = getToday();
    const entry = await getTodayEntry(currentUser, today);
    
    if (!entry || !entry.break_start) {
        alert('You haven\'t started a break!');
        return;
    }
    
    if (entry.break_end) {
        alert('Break already ended!');
        return;
    }
    
    const now = new Date();
    const timeStr = formatTimeWithSeconds(now);
    
    const { error } = await supabaseClient
        .from('time_entries')
        .update({ break_end: timeStr, last_modified: new Date().toISOString() })
        .eq('user_name', currentUser)
        .eq('date', today);
    
    if (error) {
        alert('Error: ' + error.message);
    } else {
        alert(`▶️ Break ended at ${timeStr}`);
        await updateCalculations(currentUser, today);
        updateAll();
    }
}

async function clockOut() {
    console.log('clockOut called');
    
    if (!currentUser) {
        alert('Please set your name first');
        return;
    }
    
    const today = getToday();
    const entry = await getTodayEntry(currentUser, today);
    
    if (!entry || !entry.clock_in) {
        alert('You must clock in first!');
        return;
    }
    
    if (entry.clock_out) {
        alert('You already clocked out today!');
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
        alert('Error: ' + error.message);
    } else {
        await updateCalculations(currentUser, today);
        await showClockOutSummary(currentUser, today);
        updateAll();
    }
}

// ============================================
// CALCULATIONS
// ============================================

async function updateCalculations(user, date) {
    const entry = await getTodayEntry(user, date);
    if (!entry || !entry.clock_in || !entry.clock_out) return;
    
    const clockIn = parseTime(entry.clock_in);
    const clockOut = parseTime(entry.clock_out);
    let shiftMinutes = (clockOut - clockIn) / (1000 * 60);
    
    let breakMinutes = 0;
    if (entry.break_start && entry.break_end) {
        const breakStart = parseTime(entry.break_start);
        const breakEnd = parseTime(entry.break_end);
        breakMinutes = (breakEnd - breakStart) / (1000 * 60);
    }
    
    const workedMinutes = shiftMinutes - breakMinutes;
    const overtimeMinutes = Math.max(0, workedMinutes - 480);
    const overbreakMinutes = Math.max(0, breakMinutes - 60);
    
    await supabaseClient
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
        <p>Total hours: ${monthly.totalHours.toFixed(1)} hours</p>
        <p>Total overtime: ${monthly.totalOvertime.toFixed(1)} hours</p>
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
    
    if (!entry || !entry.clock_in) {
        const statusEl = document.getElementById('todayStatus');
        const hoursEl = document.getElementById('todayHours');
        const breakEl = document.getElementById('todayBreak');
        const overtimeEl = document.getElementById('todayOvertime');
        if (statusEl) statusEl.innerText = 'Not started';
        if (hoursEl) hoursEl.innerText = '0';
        if (breakEl) breakEl.innerText = '0';
        if (overtimeEl) overtimeEl.innerText = '0';
        return;
    }
    
    let status = 'Working';
    if (entry.clock_out) status = 'Completed';
    else if (entry.break_start && !entry.break_end) status = 'On Break';
    
    const statusEl = document.getElementById('todayStatus');
    const hoursEl = document.getElementById('todayHours');
    const breakEl = document.getElementById('todayBreak');
    const overtimeEl = document.getElementById('todayOvertime');
    const warningDiv = document.getElementById('overbreakWarning');
    
    if (statusEl) statusEl.innerText = status;
    if (hoursEl) hoursEl.innerText = entry.worked_minutes ? formatMinutes(entry.worked_minutes) : 'Calculating...';
    if (breakEl) breakEl.innerText = entry.break_minutes ? formatMinutes(entry.break_minutes) : '0';
    if (overtimeEl) overtimeEl.innerText = entry.overtime_minutes ? formatMinutes(entry.overtime_minutes) : '0';
    
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
    const stats = await getMonthlyStats(currentUser);
    
    const daysEl = document.getElementById('monthDays');
    const hoursEl = document.getElementById('monthHours');
    const overtimeEl = document.getElementById('monthOvertime');
    const overbreakEl = document.getElementById('monthOverbreak');
    
    if (daysEl) daysEl.innerText = stats.daysWorked;
    if (hoursEl) hoursEl.innerText = stats.totalHours.toFixed(1);
    if (overtimeEl) overtimeEl.innerText = stats.totalOvertime.toFixed(1);
    if (overbreakEl) overbreakEl.innerText = stats.overbreakDays;
}

async function updateTeamStatus() {
    const { data, error } = await supabaseClient
        .from('time_entries')
        .select('*')
        .eq('date', getToday())
        .order('user_name');
    
    const teamDiv = document.getElementById('teamStatus');
    if (!teamDiv) return;
    
    if (error || !data || data.length === 0) {
        teamDiv.innerHTML = '<p>No one has clocked in today</p>';
        return;
    }
    
    let html = '';
    for (const member of data) {
        let status = '⚪ Not clocked in';
        let statusClass = 'status-off';
        
        if (member.clock_in && !member.clock_out) {
            if (member.break_start && !member.break_end) {
                status = `🟡 ON BREAK since ${member.break_start}`;
                statusClass = 'status-break';
            } else {
                status = `🟢 WORKING since ${member.clock_in}`;
                statusClass = 'status-working';
            }
        } else if (member.clock_in && member.clock_out) {
            status = `🔴 Clocked out at ${member.clock_out}`;
            statusClass = 'status-off';
        }
        
        let warningHtml = '';
        if (member.overbreak_minutes > 0) {
            warningHtml = `<span style="color: #ffc107; font-size: 12px;">⚠️ +${formatMinutes(member.overbreak_minutes)} break</span>`;
        }
        
        html += `
            <div class="team-member">
                <div><strong>${member.user_name}</strong></div>
                <div><span class="status-badge ${statusClass}">${status}</span> ${warningHtml}</div>
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

async function getMonthlyStats(user) {
    const currentMonth = getCurrentMonth();
    const { data, error } = await supabaseClient
        .from('time_entries')
        .select('*')
        .eq('user_name', user)
        .like('date', `${currentMonth}%`);
    
    if (error || !data) {
        return { daysWorked: 0, totalHours: 0, totalOvertime: 0, overbreakDays: 0 };
    }
    
    let daysWorked = 0;
    let totalHours = 0;
    let totalOvertime = 0;
    let overbreakDays = 0;
    
    for (const entry of data) {
        if (entry.worked_minutes) {
            daysWorked++;
            totalHours += entry.worked_minutes / 60;
            totalOvertime += (entry.overtime_minutes || 0) / 60;
            if (entry.overbreak_minutes > 0) overbreakDays++;
        }
    }
    
    return { daysWorked, totalHours, totalOvertime, overbreakDays };
}

// ============================================
// REAL-TIME & REMINDERS
// ============================================

function setupRealtime() {
    // Remove existing channel if it exists
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
    if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
}

function saveSettings() {
    const enableReminder = document.getElementById('enableReminder');
    if (enableReminder) {
        localStorage.setItem('enableReminder', enableReminder.checked);
    }
    
    if (enableReminder && enableReminder.checked && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

function toggleDarkMode() {
    const isDark = document.getElementById('darkMode').checked;
    if (isDark) {
        document.body.classList.add('dark');
    } else {
        document.body.classList.remove('dark');
    }
    localStorage.setItem('darkMode', isDark);
}

function loadSettings() {
    const enableReminder = localStorage.getItem('enableReminder') === 'true';
    const darkMode = localStorage.getItem('darkMode') === 'true';
    
    const reminderCheckbox = document.getElementById('enableReminder');
    const darkModeCheckbox = document.getElementById('darkMode');
    
    if (reminderCheckbox) reminderCheckbox.checked = enableReminder;
    if (darkModeCheckbox) darkModeCheckbox.checked = darkMode;
    
    if (darkMode) document.body.classList.add('dark');
}

async function exportToCSV() {
    if (!currentUser) {
        alert('Please set your name first');
        return;
    }
    
    const { data, error } = await supabaseClient
        .from('time_entries')
        .select('*')
        .eq('user_name', currentUser)
        .order('date', { ascending: false });
    
    if (error || !data || data.length === 0) {
        alert('No data to export');
        return;
    }
    
    let csv = 'Date,Clock In,Break Start,Break End,Clock Out,Worked Hours,Overtime Hours,Break Minutes,Overbreak Warning\n';
    
    for (const entry of data) {
        csv += `${entry.date},`;
        csv += `${entry.clock_in || ''},`;
        csv += `${entry.break_start || ''},`;
        csv += `${entry.break_end || ''},`;
        csv += `${entry.clock_out || ''},`;
        csv += `${entry.worked_minutes ? (entry.worked_minutes / 60).toFixed(2) : ''},`;
        csv += `${entry.overtime_minutes ? (entry.overtime_minutes / 60).toFixed(2) : ''},`;
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
    alert('✅ Export complete!');
}

async function deleteAllData() {
    if (!confirm('⚠️ WARNING: This will delete ALL your time entries. Are you ABSOLUTELY sure?')) return;
    if (!confirm('Last chance! This cannot be undone. Delete everything?')) return;
    
    const { error } = await supabaseClient
        .from('time_entries')
        .delete()
        .eq('user_name', currentUser);
    
    if (error) {
        alert('Error deleting: ' + error.message);
    } else {
        alert('✅ All data deleted');
        updateAll();
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getToday() {
    return new Date().toISOString().split('T')[0];
}

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(dateStr) {
    const parts = dateStr.split('-');
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

function formatTimeWithSeconds(date) {
    return date.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatMinutes(totalMinutes) {
    const hours = Math.floor(Math.abs(totalMinutes) / 60);
    const minutes = Math.abs(totalMinutes) % 60;
    
    if (minutes === 0) {
        return `${hours}h`;
    }
    return `${hours}h ${minutes}m`;
}

function parseTime(timeStr) {
    const match = timeStr.match(/(\d+):(\d+):(\d+)\s+(AM|PM)/i);
    if (!match) return 0;
    
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

function calculateBreakDuration(startTime, endTime) {
    const start = parseTime(startTime);
    const end = endTime ? parseTime(endTime) : new Date().getTime();
    const minutes = (end - start) / (1000 * 60);
    return formatMinutes(minutes);
}