const DB_NAME = 'VocabTrainerDB_TEST';
const DB_VERSION = 1;
let db = null;

// Stufen-Intervalle in Tagen
const LEVEL_DAYS = {
    1: 1,
    2: 2,
    3: 4,
    4: 7,
    5: 14,
    6: 30,
    7: 60,
    8: 90,
    9: 120,
    10: 180
};

let currentLangId = null;
let currentLangCode = 'en-US';
let currentLangName = '';
let currentBaseLangName = '';
let currentLangFlagSrc = '';
let cachedNativeFlag = '';
let lastUsedGroup = '';

function getDisplayLangName(l) {
    if (!l) return t('default_foreign_lang');
    if (l.isCustomName) return l.name;
    return getLocalizedLanguageName(l.code, l.name);
}

// ==========================================
// STREAK SYSTEM (PRO SPRACHE - LEKTIONSBASIERT)
// ==========================================

let pendingStreakAnimation = null;
let streakTooltipTimeout = null;

function getLocalDateString(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getDaysDifference(dateStr1, dateStr2) {
    if (!dateStr1 || !dateStr2) return 999;
    const d1 = new Date(dateStr1 + 'T00:00:00');
    const d2 = new Date(dateStr2 + 'T00:00:00');
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

function getStreakData(langId) {
    if (!langId) return { count: 0, lastDate: '', todayLessons: 0, todayLessonsDate: '' };
    try {
        const raw = localStorage.getItem(`vocab_streak_${langId}`);
        const data = raw ? JSON.parse(raw) : {};
        return {
            count: data.count || 0,
            lastDate: data.lastDate || '',
            todayLessons: data.todayLessons || 0,
            todayLessonsDate: data.todayLessonsDate || ''
        };
    } catch (e) {
        return { count: 0, lastDate: '', todayLessons: 0, todayLessonsDate: '' };
    }
}

function saveStreakData(langId, data) {
    if (!langId) return;
    localStorage.setItem(`vocab_streak_${langId}`, JSON.stringify(data));
}

function onSmartLessonCompleted() {
    if (!currentLangId) return;
    const streak = getStreakData(currentLangId);
    const todayStr = getLocalDateString(new Date());

    if (streak.todayLessonsDate !== todayStr) {
        streak.todayLessons = 0;
        streak.todayLessonsDate = todayStr;
    }

    streak.todayLessons += 1;
    const diff = getDaysDifference(streak.lastDate, todayStr);
    const oldStreakCount = streak.count;
    let streakIncreased = false;

    let oldStatus = 'pending';
    if (diff === 2) oldStatus = 'at-risk';
    else if (diff > 2 || oldStreakCount === 0) oldStatus = 'inactive';

    if (streak.lastDate !== todayStr) {
        if (diff === 1 && streak.todayLessons >= 1) {
            streak.count += 1;
            streak.lastDate = todayStr;
            streakIncreased = true;
        } else if (diff === 2 && streak.todayLessons >= 3) {
            streak.count += 1;
            streak.lastDate = todayStr;
            streakIncreased = true;
        } else if (diff > 2 && streak.todayLessons >= 1) {
            streak.count = 1;
            streak.lastDate = todayStr;
            streakIncreased = true;
        }
    }

    saveStreakData(currentLangId, streak);

    if (streakIncreased) {
        pendingStreakAnimation = {
            langId: currentLangId,
            oldVal: oldStreakCount,
            newVal: streak.count,
            oldStatus: oldStatus
        };
    }

    updateStreakUI(streakIncreased ? oldStreakCount : null);
}

async function updateStreakUI(overrideDisplayCount = null) {
    const badge = document.getElementById('streakBadge');
    const countEl = document.getElementById('streakCount');
    if (!badge) return;

    if (!currentLangId) {
        badge.classList.add('hidden');
        return;
    }

    badge.classList.remove('hidden');
    const streak = getStreakData(currentLangId);
    const todayStr = getLocalDateString(new Date());

    if (streak.todayLessonsDate !== todayStr) {
        streak.todayLessons = 0;
        streak.todayLessonsDate = todayStr;
        saveStreakData(currentLangId, streak);
    }

    const diff = getDaysDifference(streak.lastDate, todayStr);

    badge.classList.remove('completed', 'pending', 'at-risk', 'inactive');

    let displayCount;
    if (overrideDisplayCount !== null) {
        displayCount = overrideDisplayCount;
    } else if (pendingStreakAnimation && pendingStreakAnimation.langId === currentLangId) {
        displayCount = pendingStreakAnimation.oldVal;
    } else {
        displayCount = streak.count;
    }

    if (countEl) countEl.textContent = displayCount;

    if (pendingStreakAnimation && pendingStreakAnimation.langId === currentLangId) {
        badge.classList.add(pendingStreakAnimation.oldStatus || 'pending');
        return;
    }

    let tooltipHtml = '';
    let titleText = '';

    // Fall 1: Heute bereits erledigt
    if (streak.lastDate === todayStr) {
        badge.classList.add('completed');
        tooltipHtml = t('streak_tooltip_completed', { days: formatDays(streak.count), lessons: formatLessons(streak.todayLessons) });
        titleText = t('streak_title_completed', { days: formatDays(streak.count), lessons: formatLessons(streak.todayLessons) });
    }
    // Fall 2: Normaler Tag
    else if (diff === 1) {
        if (streak.todayLessons >= 1) {
            streak.count += 1;
            streak.lastDate = todayStr;
            saveStreakData(currentLangId, streak);
            if (countEl && overrideDisplayCount === null) countEl.textContent = streak.count;
            badge.classList.add('completed');
            tooltipHtml = t('streak_tooltip_increased', { days: formatDays(streak.count) });
            titleText = t('streak_title_increased', { days: formatDays(streak.count) });
        } else {
            badge.classList.add('pending');
            tooltipHtml = t('streak_tooltip_pending', { days: formatDays(streak.count) });
            titleText = t('streak_title_pending', { days: formatDays(streak.count) });
        }
    }
    // Fall 3: Rettungstag
    else if (diff === 2) {
        if (streak.todayLessons >= 3) {
            streak.count += 1;
            streak.lastDate = todayStr;
            saveStreakData(currentLangId, streak);
            if (countEl && overrideDisplayCount === null) countEl.textContent = streak.count;
            badge.classList.add('completed');
            tooltipHtml = t('streak_tooltip_saved', { days: formatDays(streak.count) });
            titleText = t('streak_title_saved', { days: formatDays(streak.count) });
        } else {
            badge.classList.add('at-risk');
            const remaining = 3 - streak.todayLessons;
            tooltipHtml = t('streak_tooltip_at_risk', { lessons: formatLessons(remaining), done: streak.todayLessons });
            titleText = t('streak_title_at_risk', { lessons: formatLessons(remaining), done: streak.todayLessons });
        }
    }
    // Fall 4: 2+ Tage verpasst
    else {
        if (streak.todayLessons >= 1) {
            streak.count = 1;
            streak.lastDate = todayStr;
            saveStreakData(currentLangId, streak);
            if (countEl && overrideDisplayCount === null) countEl.textContent = streak.count;
            badge.classList.add('completed');
            tooltipHtml = t('streak_tooltip_new');
            titleText = t('streak_title_new');
        } else {
            streak.count = 0;
            saveStreakData(currentLangId, streak);
            if (countEl && overrideDisplayCount === null) countEl.textContent = '0';
            badge.classList.add('inactive');
            tooltipHtml = t('streak_tooltip_inactive');
            titleText = t('streak_title_inactive');
        }
    }

    badge.dataset.tooltipHtml = tooltipHtml;
    badge.title = titleText;
}

function showStreakTooltip(htmlContent) {
    const tooltip = document.getElementById('streakTooltip');
    if (!tooltip) return;
    tooltip.innerHTML = htmlContent;
    tooltip.classList.remove('hidden');
    requestAnimationFrame(() => tooltip.classList.add('visible'));

    if (streakTooltipTimeout) clearTimeout(streakTooltipTimeout);
    streakTooltipTimeout = setTimeout(hideStreakTooltip, 3500);
}

function hideStreakTooltip() {
    const tooltip = document.getElementById('streakTooltip');
    if (!tooltip) return;
    tooltip.classList.remove('visible');
    setTimeout(() => {
        if (!tooltip.classList.contains('visible')) {
            tooltip.classList.add('hidden');
        }
    }, 200);
}

const streakBadgeEl = document.getElementById('streakBadge');
if (streakBadgeEl) {
    streakBadgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const tooltip = document.getElementById('streakTooltip');
        if (tooltip && !tooltip.classList.contains('hidden') && tooltip.classList.contains('visible')) {
            hideStreakTooltip();
        } else {
            const info = streakBadgeEl.dataset.tooltipHtml || streakBadgeEl.title || t('streak_default_label');
            showStreakTooltip(info);
        }
    });
}
document.addEventListener('click', (e) => {
    if (!e.target.closest('#streakBadge')) {
        hideStreakTooltip();
    }
});

function playStreakNumberAnimation(oldVal, newVal) {
    const wrapper = document.querySelector('.streak-count-wrapper');
    const badge = document.getElementById('streakBadge');
    if (!wrapper) {
        const countEl = document.getElementById('streakCount');
        if (countEl) countEl.textContent = newVal;
        return;
    }

    badge.classList.remove('pending', 'at-risk', 'inactive');
    badge.classList.add('completed');

    badge.classList.add('streak-pop');
    setTimeout(() => badge.classList.remove('streak-pop'), 850);

    wrapper.innerHTML = `
        <span class="slide-digit current-digit">${oldVal}</span>
        <span class="slide-digit incoming-digit">${newVal}</span>
    `;

    void wrapper.offsetWidth;
    wrapper.classList.add('animating');

    setTimeout(() => {
        wrapper.classList.remove('animating');
        wrapper.innerHTML = `<span id="streakCount" class="streak-count">${newVal}</span>`;
        updateStreakUI();
    }, 850);
}

// ==========================================
// MANAGER PAGINIERUNG & SORTIERUNG STATUS
// ==========================================

let managerCurrentPage = 1;
let managerPageSizeSetting = localStorage.getItem('vocab_page_size') || '100';
let managerSortColumn = 'german';
let managerSortDirection = 'asc';

function getEffectivePageSize(totalWords) {
    if (managerPageSizeSetting === 'ALL') return Math.max(1, totalWords);
    return parseInt(managerPageSizeSetting, 10) || 100;
}

function cleanBase(str) {
    if (!str) return '';
    return str.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/['’´`]/g, " ")
        .replace(/[.,\/#!$%\^&\*;:{}=\-_~()?]/g, "")
        .replace(/\s+/g, ' ').trim();
}

function getVariantSignature(v) {
    return `${cleanBase(v.article || '')}:::${cleanBase(v.word)}:::${cleanBase(v.explanation || '')}`;
}

// ==========================================
// VOKABEL- & SATZ-SYNTAX PARSER & FORMATIERER
// ==========================================
function isSentenceCandidate(str) {
    if (!str) return false;
    const clean = str.trim();
    if (/[.!?]$/.test(clean)) return true;
    const wordCount = clean.split(/\s+/).filter(w => w.length > 0).length;
    return wordCount >= 4;
}

function cleanInputSyntax(str) {
    if (!str) return '';
    let s = str.trim();
    s = s.replace(/\s+/g, ' ');
    s = s.replace(/\[\s+/g, '[').replace(/\s+\]/g, ']');
    s = s.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
    s = s.replace(/\s*;\s*/g, '; ');
    s = s.replace(/\s*,\s*/g, ', ');
    s = s.replace(/\]([^\s',’;:])/g, '] $1');
    return s.trim();
}

function parseVocabField(rawStr, isSentence = false) {
    if (!rawStr) {
        return { cleaned: '', variants: [], display: '', firstSpeechText: '', sortKey: '' };
    }

    const cleaned = cleanInputSyntax(rawStr);

    const hasSemicolon = cleaned.includes(';');
    const separator = isSentence ? ';' : (hasSemicolon ? ';' : ',');

    const parts = [];
    let current = '';
    let inBracket = false;
    let inParen = false;

    for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];
        if (char === '[') inBracket = true;
        else if (char === ']') inBracket = false;
        else if (char === '(') inParen = true;
        else if (char === ')') inParen = false;

        if (char === separator && !inBracket && !inParen) {
            parts.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    if (current.trim()) {
        parts.push(current.trim());
    }

    const variants = parts.map(part => {
        let article = null;
        let explanation = '';
        let word = part;

        // Kontext in (...) extrahieren
        const parenMatch = word.match(/\((.*?)\)/);
        if (parenMatch) {
            explanation = parenMatch[1].trim();
            word = word.replace(/\(.*?\)/, '').trim();
        }

        if (isSentence) {
            // Bei Sätzen gibt es keinen Artikel.
            // Eckige Klammern [Block] markieren Kachel-Blöcke.
            return {
                article: null,
                word: word.trim(),
                explanation: explanation || ''
            };
        } else {
            // Bei Einzelwörtern: Artikel aus [...] extrahieren
            const bracketMatch = word.match(/\[(.*?)\]/);
            if (bracketMatch) {
                article = bracketMatch[1].trim();
                word = word.replace(/\[.*?\]/, '').trim();
            }
            return {
                article: article || null,
                word: word.trim(),
                explanation: explanation || ''
            };
        }
    }).filter(v => v.word.length > 0);

    const displayParts = variants.map(v => {
        if (isSentence) {
            // Im Satz werden eckige Klammern für die Textanzeige entfernt
            const cleanSentence = v.word.replace(/[\[\]]/g, '').trim();
            return v.explanation ? `${cleanSentence} (${v.explanation})` : cleanSentence;
        } else {
            let artStr = '';
            if (v.article) {
                artStr = (v.article.endsWith("'") || v.article.endsWith("’")) ? v.article : `${v.article} `;
            }
            let res = `${artStr}${v.word}`;
            if (v.explanation) {
                res += ` (${v.explanation})`;
            }
            return res;
        }
    });
    const display = displayParts.join('; ');

    let firstSpeechText = '';
    if (variants.length > 0) {
        const first = variants[0];
        if (isSentence) {
            firstSpeechText = first.word.replace(/[\[\]]/g, '').trim();
        } else {
            let artStr = '';
            if (first.article) {
                artStr = (first.article.endsWith("'") || first.article.endsWith("’")) ? first.article : `${first.article} `;
            }
            firstSpeechText = `${artStr}${first.word}`.trim();
        }
    }

    const sortKey = (variants.length > 0 ? variants[0].word.replace(/[\[\]]/g, '') : cleaned).toLowerCase();

    return { cleaned, variants, display, firstSpeechText, sortKey };
}

function formatVocabHTML(rawStr, isSentence = false) {
    const parsed = parseVocabField(rawStr, isSentence);
    const parts = parsed.variants.map(v => {
        if (isSentence) {
            const cleanSentence = v.word.replace(/[\[\]]/g, '').trim();
            return v.explanation ? `${cleanSentence} <span class="vocab-hint">(${v.explanation})</span>` : cleanSentence;
        }
        let artStr = '';
        if (v.article) {
            artStr = (v.article.endsWith("'") || v.article.endsWith("’")) ? v.article : `${v.article} `;
        }
        let res = `${artStr}${v.word}`;
        if (v.explanation) {
            res += ` <span class="vocab-hint">(${v.explanation})</span>`;
        }
        return res;
    });
    return parts.join('; ');
}

// Zerlegt einen Satz für Kacheln (entfernt (), behält [] als 1 Kachel, säubert Satzzeichen an Kacheln)
function tokenizeSentence(sentenceVariantStr) {
    if (!sentenceVariantStr) return [];
    // 1. (...) entfernen
    let text = sentenceVariantStr.replace(/\(.*?\)/g, '').trim();

    // 2. [Blöcke] schützen
    const blocks = [];
    text = text.replace(/\[(.*?)\]/g, (match, p1) => {
        blocks.push(p1.trim());
        return ` __BLOCK_${blocks.length - 1}__ `;
    });

    // 3. Nach Leerzeichen trennen
    const rawWords = text.split(/\s+/).filter(w => w.length > 0);

    // 4. Kacheln auflösen & Satzzeichen säubern
    const tokens = [];
    rawWords.forEach(rw => {
        if (rw.includes('__BLOCK_')) {
            const m = rw.match(/__BLOCK_(\d+)__/);
            if (m) {
                const idx = parseInt(m[1], 10);
                tokens.push(blocks[idx]);
                return;
            }
        }
        // Satzzeichen wie Punkt, Ausrufezeichen, Fragezeichen, Komma an Kacheln entfernen
        const cleaned = rw.replace(/^[.,\/#!$%\^&\*;:{}=\-_~()?]+|[.,\/#!$%\^&\*;:{}=\-_~()?]+$/g, '').trim();
        if (cleaned) {
            tokens.push(cleaned);
        }
    });

    return tokens;
}

// ==========================================
// FLAGGEN SYSTEM
// ==========================================
function getCountryCode(langCode) {
    if (!langCode) return 'de';
    if (langCode.includes('-')) {
        const parts = langCode.split('-');
        return parts[1].toLowerCase();
    }
    const lc = langCode.toLowerCase();
    if (lc === 'en') return 'gb';
    return lc;
}

async function fetchFlagDataUrl(countryCode) {
    try {
        const url = `https://flagcdn.com/h120/${countryCode.toLowerCase()}.png`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        return null;
    }
}

async function ensureNativeFlag() {
    const cc = getCountryCode(currentUiLang);
    const cached = localStorage.getItem(`vocab_flag_${cc}`);
    if (cached) {
        cachedNativeFlag = cached;
        return cached;
    }
    const dataUrl = await fetchFlagDataUrl(cc);
    if (dataUrl) {
        cachedNativeFlag = dataUrl;
        localStorage.setItem(`vocab_flag_${cc}`, dataUrl);
        return dataUrl;
    }
    return `https://flagcdn.com/h120/${cc}.png`;
}

function updateHeaderFlag() {
    const headerBtn = document.getElementById('langHeaderBtn');
    const headerFlag = document.getElementById('headerLangFlag');

    if (currentLangId && currentLangFlagSrc) {
        headerFlag.src = currentLangFlagSrc;
        headerFlag.alt = currentLangName;
        headerFlag.classList.remove('hidden');
        headerBtn.classList.remove('no-lang');
        headerBtn.title = t('header_my_langs');
    } else {
        headerFlag.classList.add('hidden');
        headerBtn.classList.add('no-lang');
        headerBtn.title = t('header_add_lang');
    }
    updateStreakUI();
}

// ==========================================
// EINSTELLUNGEN & SOUND
// ==========================================
let settingAutoSpeak = localStorage.getItem('vocab_auto_speak') !== 'false';
let settingSoundEffects = localStorage.getItem('vocab_sound_fx') === 'false';
let settingOfflineVoice = localStorage.getItem('vocab_offline_voice') === 'true';

// const soundCorrect = new Audio('Correct.mp3');
// const soundWrong = new Audio('Wrong.mp3');
// const soundCompleted = new Audio('Completed.mp3');

const soundCorrect = null;
const soundWrong = null;
const soundCompleted = null;

function playAudioEffect(audioObj) {
    if (!settingSoundEffects || !audioObj) return;
    try {
        audioObj.pause();
        audioObj.currentTime = 0;
        audioObj.play().catch(() => { });
    } catch (e) { }
}

function stopAudioEffects() {
    [soundCorrect, soundWrong, soundCompleted].forEach(s => {
        try {
            s.pause();
            s.currentTime = 0;
        } catch (e) { }
    });
}

// DOM Elements
const vocabTableBody = document.getElementById('vocabTableBody');
const vocabTableContainer = document.getElementById('vocabTableContainer');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const bulkActions = document.getElementById('bulkActions');
const selectedCount = document.getElementById('selectedCount');
const replayAudioBtn = document.getElementById('replayAudioBtn');
const feedbackAudioBtn = document.getElementById('feedbackAudioBtn');
const labelWordGerman = document.getElementById('labelWordGerman');
const labelWordForeign = document.getElementById('labelWordForeign');
const thNativeText = document.getElementById('thNativeText');
const thForeignText = document.getElementById('thForeignText');
const wordModalAlert = document.getElementById('wordModalAlert');
const wordModalAlertText = document.getElementById('wordModalAlertText');
const wordModalMergeBtn = document.getElementById('wordModalMergeBtn');
const deleteCurrentWordBtn = document.getElementById('deleteCurrentWordBtn');
const feedbackStreakText = document.getElementById('feedbackStreakText');

// Session DOM
const questionFlag = document.getElementById('questionFlag');
const newWordBadge = document.getElementById('newWordBadge');
const standardSessionArea = document.getElementById('standardSessionArea');
const matchingSessionArea = document.getElementById('matchingSessionArea');
const matchingMainTitle = document.getElementById('matchingMainTitle');
const matchingSubTitle = document.getElementById('matchingSubTitle');
const matchColLeft = document.getElementById('matchColLeft');
const matchColRight = document.getElementById('matchColRight');
const matchingButtonContainer = document.getElementById('matchingButtonContainer');
const matchingDoneBtn = document.getElementById('matchingDoneBtn');
const actionButtons = document.getElementById('actionButtons');
const nextButtonContainer = document.getElementById('nextButtonContainer');

// Languages Modal DOM
const langHeaderBtn = document.getElementById('langHeaderBtn');
const languagesModal = document.getElementById('languagesModal');
const languagesList = document.getElementById('languagesList');
const toggleEditLangsBtn = document.getElementById('toggleEditLangsBtn');
const openAddLangModalBtn = document.getElementById('openAddLangModalBtn');
let isEditingLanguages = false;

// ==========================================
// KALENDER & LASTVERTEILUNG
// ==========================================
function getStartOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function getEndOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
}

async function calculateNextDueSmart(level, langId) {
    const baseDays = LEVEL_DAYS[level] || 1;
    const allWords = await getWordsByLanguage(langId);

    let windowRange = 0;
    if (level >= 3 && level <= 5) windowRange = 1;
    else if (level >= 6 && level <= 8) windowRange = 2;
    else if (level >= 9) windowRange = 3;

    const candidates = [];
    const minDay = Math.max(1, baseDays - windowRange);
    const maxDay = baseDays + windowRange;

    for (let d = minDay; d <= maxDay; d++) {
        const candidateDate = new Date();
        candidateDate.setDate(candidateDate.getDate() + d);
        candidateDate.setHours(0, 0, 0, 0);
        const start = candidateDate.getTime();
        const end = getEndOfDay(candidateDate);

        const load = allWords.filter(w => w.level > 0 && w.nextDue >= start && w.nextDue <= end).length;
        candidates.push({ timestamp: start, load, diff: Math.abs(d - baseDays) });
    }

    candidates.sort((a, b) => {
        if (a.load !== b.load) return a.load - b.load;
        return a.diff - b.diff;
    });

    return candidates[0].timestamp;
}

// ==========================================
// LEVENSHTEIN-DISTANZ
// ==========================================
function getLevenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function cleanNormalizeKeepHyphen(str) {
    if (!str) return '';
    return str.trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/['’´`]/g, " ")
        .replace(/[.,\/#!$%\^&\*;:{}=\[\]_~()?]/g, "")
        .replace(/\s+/g, ' ').trim();
}

function checkAnswerMatch(input, targetString, isSentence = false) {
    let rawInput = input.trim();
    if (!rawInput) return 'WRONG';

    // Klammern und Kontext entfernen
    rawInput = rawInput.replace(/\(.*?\)/g, '').replace(/[\[\]]/g, '').trim();
    const uClean = cleanNormalizeKeepHyphen(rawInput);
    const targetParsed = parseVocabField(targetString, isSentence);

    let hasHyphenMatch = false;
    let hasTypoMatch = false;

    const uWithSpaces = uClean.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    const uJoined = uClean.replace(/[-\s]/g, '');

    for (let variant of targetParsed.variants) {
        const tNoun = cleanNormalizeKeepHyphen(variant.word);
        const tArt = (!isSentence && variant.article) ? cleanNormalizeKeepHyphen(variant.article) : null;
        const tFull = tArt ? cleanNormalizeKeepHyphen(variant.article + ' ' + variant.word) : tNoun;

        // 1. Exakte Übereinstimmung
        if (uClean === tFull || uClean === tNoun) {
            return 'EXACT';
        }

        // 2. Bindestrich- & Leerzeichen-Toleranz
        const targetHasHyphen = tNoun.includes('-') || tFull.includes('-');
        if (targetHasHyphen) {
            const tNounSpaces = tNoun.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
            const tFullSpaces = tFull.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();

            const tNounJoined = tNoun.replace(/[-\s]/g, '');
            const tFullJoined = tFull.replace(/[-\s]/g, '');

            if (uWithSpaces === tNounSpaces || uWithSpaces === tFullSpaces ||
                uJoined === tNounJoined || uJoined === tFullJoined) {
                hasHyphenMatch = true;
            }
        }

        // 3. Tippfehler-Berechnung (Für Sätze angepasst!)
        let wordToCompare = uWithSpaces;
        const artWithSpace = tArt ? tArt.replace(/-/g, ' ') + ' ' : '';
        if (artWithSpace && wordToCompare.startsWith(artWithSpace)) {
            wordToCompare = wordToCompare.slice(artWithSpace.length).trim();
        }

        const tNounCompare = tNoun.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
        const dist = getLevenshteinDistance(wordToCompare, tNounCompare);

        // Bei Sätzen: Bis zu 3 Tippfehler bei langen Sätzen, 2 bei mittleren, sonst 1
        const maxAllowed = isSentence
            ? (tNounCompare.length >= 35 ? 3 : (tNounCompare.length >= 15 ? 2 : 1))
            : (tNounCompare.length >= 7 ? 2 : (tNounCompare.length >= 4 ? 1 : 0));

        if (dist <= maxAllowed) {
            hasTypoMatch = true;
        }
    }

    if (hasHyphenMatch) return 'EXACT_HYPHEN';
    return hasTypoMatch ? 'TYPO' : 'WRONG';
}

function mergeUniqueVariants(existingStr, newStr, isSentence = false) {
    const existingClean = cleanInputSyntax(existingStr);
    const newClean = cleanInputSyntax(newStr);
    const pExisting = parseVocabField(existingClean, isSentence);
    const pNew = parseVocabField(newClean, isSentence);

    const existingWords = pExisting.variants.map(v => cleanBase(v.word));
    const toAdd = [];

    pNew.variants.forEach(v => {
        if (!existingWords.includes(cleanBase(v.word))) {
            let s = '';
            if (v.article) s += `[${v.article}] `;
            s += v.word;
            if (v.explanation) s += ` (${v.explanation})`;
            toAdd.push(cleanInputSyntax(s));
        }
    });

    if (toAdd.length === 0) return existingClean;
    const sep = isSentence ? '; ' : '; ';
    return `${existingClean}${sep}${toAdd.join(sep)}`;
}

function showToast(message) {
    const toast = document.getElementById('toastNotification');
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function showCustomConfirm(title, message, confirmText = t('btn_confirm'), cancelText = t('btn_cancel'), isDanger = false) {
    return new Promise(resolve => {
        const overlay = document.getElementById('modalOverlay');
        const modal = document.getElementById('customModal');
        const titleEl = document.getElementById('customModalTitle');
        const msgEl = document.getElementById('customModalMessage');
        const confirmBtn = document.getElementById('customModalConfirmBtn');
        const cancelBtn = document.getElementById('customModalCancelBtn');

        titleEl.textContent = title;
        msgEl.textContent = message;
        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;
        cancelBtn.classList.remove('hidden');
        confirmBtn.className = isDanger ? "btn-danger" : "btn-primary";

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
        setTimeout(() => confirmBtn.focus(), 50);

        const cleanup = (result) => {
            modal.classList.add('hidden');
            const anyOtherModalOpen = Array.from(document.querySelectorAll('.modal'))
                .some(m => m !== modal && !m.classList.contains('hidden'));
            if (!anyOtherModalOpen) {
                overlay.classList.add('hidden');
            }
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            resolve(result);
        };

        confirmBtn.onclick = () => cleanup(true);
        cancelBtn.onclick = () => cleanup(false);
    });
}

function showCustomAlert(title, message) {
    return new Promise(resolve => {
        const overlay = document.getElementById('modalOverlay');
        const modal = document.getElementById('customModal');
        const titleEl = document.getElementById('customModalTitle');
        const msgEl = document.getElementById('customModalMessage');
        const confirmBtn = document.getElementById('customModalConfirmBtn');
        const cancelBtn = document.getElementById('customModalCancelBtn');

        titleEl.textContent = title;
        msgEl.textContent = message;
        confirmBtn.textContent = t('btn_understood');
        confirmBtn.className = "btn-primary";
        cancelBtn.classList.add('hidden');

        overlay.classList.remove('hidden');
        modal.classList.remove('hidden');
        setTimeout(() => confirmBtn.focus(), 50);

        confirmBtn.onclick = () => {
            modal.classList.add('hidden');
            const anyOtherModalOpen = Array.from(document.querySelectorAll('.modal'))
                .some(m => m !== modal && !m.classList.contains('hidden'));
            if (!anyOtherModalOpen) {
                overlay.classList.add('hidden');
            }
            confirmBtn.onclick = null;
            resolve(true);
        };
    });
}

async function promptAddLanguage() {
    const ok = await showCustomConfirm(
        t('confirm_no_lang_title'),
        t('confirm_no_lang_msg'),
        t('btn_add_language_confirm'),
        t('btn_cancel'),
        false
    );
    if (ok) {
        closeAllModals();
        populateLangPresets();
        document.getElementById('modalOverlay').classList.remove('hidden');
        document.getElementById('addLangModal').classList.remove('hidden');
    }
}

// ==========================================
// INDEXED-DB
// ==========================================
function initDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains('languages')) {
                database.createObjectStore('languages', { keyPath: 'id', autoIncrement: true });
            }
            if (!database.objectStoreNames.contains('words')) {
                const ws = database.createObjectStore('words', { keyPath: 'id', autoIncrement: true });
                ws.createIndex('langId', 'langId', { unique: false });
            }
        };
        req.onsuccess = (e) => resolve(db = e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

function addData(store, data) {
    return new Promise((res, rej) => {
        const r = db.transaction([store], 'readwrite').objectStore(store).add(data);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}

function updateData(store, data) {
    return new Promise((res, rej) => {
        const r = db.transaction([store], 'readwrite').objectStore(store).put(data);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}

function getWord(id) {
    return new Promise((res, rej) => {
        const r = db.transaction(['words'], 'readonly').objectStore('words').get(id);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}

function getWordsByLanguage(langId) {
    return new Promise((res, rej) => {
        const r = db.transaction(['words'], 'readonly').objectStore('words').index('langId').getAll(langId);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}

function updateLanguageLabels() {
    const nativeName = getNativeLanguageName();
    const foreignName = currentLangId ? currentBaseLangName : t('default_foreign_lang');

    if (labelWordGerman) labelWordGerman.textContent = nativeName;
    if (labelWordForeign) labelWordForeign.textContent = foreignName;
    if (thNativeText) thNativeText.textContent = nativeName;
    if (thForeignText) thForeignText.textContent = foreignName;
}

// ==========================================
// SPRACHVERWALTUNG
// ==========================================
function populateLangPresets() {
    const select = document.getElementById('langPreset');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = `<option value="" disabled selected>${t('select_lang_placeholder')}</option>`;

    PRESET_LANGUAGES.forEach(p => {
        // Eigene Sprache ausschließen (z. B. 'de' schließt 'de-DE' aus, 'en' schließt 'en-US' und 'en-GB' aus)
        const isOwnLang = p.code.toLowerCase().startsWith(currentUiLang.toLowerCase());
        if (!isOwnLang) {
            const localizedName = t(p.key);
            select.innerHTML += `<option value="${p.code}|${localizedName}">${localizedName}</option>`;
        }
    });

    if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
        select.value = currentVal;
    }
}

async function getAllLanguagesFromDB() {
    return new Promise(res => {
        const r = db.transaction(['languages'], 'readonly').objectStore('languages').getAll();
        r.onsuccess = () => res(r.result || []);
    });
}

async function loadLanguages() {
    await ensureNativeFlag();
    const langs = await getAllLanguagesFromDB();

    for (let l of langs) {
        if (!l.baseName) {
            l.baseName = l.name.replace(/\s*\(\d+\)$/, '').trim();
            await updateData('languages', l);
        }

        if (!l.flag) {
            const cc = getCountryCode(l.code);
            fetchFlagDataUrl(cc).then(async (dataUrl) => {
                if (dataUrl) {
                    l.flag = dataUrl;
                    await updateData('languages', l);
                    if (l.id === currentLangId) {
                        currentLangFlagSrc = dataUrl;
                        updateHeaderFlag();
                    }
                }
            });
        }
    }

    if (langs.length === 0) {
        currentLangId = null;
        currentLangName = t('default_foreign_lang');
        currentBaseLangName = t('default_foreign_lang');
        currentLangFlagSrc = '';
        localStorage.removeItem('vocab_current_lang_id');
        updateHeaderFlag();
        updateLanguageLabels();
        updateDashboard();
        return;
    }

    const savedLangId = parseInt(localStorage.getItem('vocab_current_lang_id'), 10);
    const savedLang = langs.find(l => l.id === savedLangId);

    if (savedLang) {
        currentLangId = savedLang.id;
        currentLangCode = savedLang.code;
        currentLangName = getLocalizedLanguageName(savedLang.code);
        currentBaseLangName = currentLangName;
        currentLangFlagSrc = savedLang.flag || `https://flagcdn.com/h120/${getCountryCode(savedLang.code)}.png`;
    } else {
        currentLangId = langs[0].id;
        currentLangCode = langs[0].code;
        currentLangName = getLocalizedLanguageName(langs[0].code);
        currentBaseLangName = currentLangName;
        currentLangFlagSrc = langs[0].flag || `https://flagcdn.com/h120/${getCountryCode(langs[0].code)}.png`;
        localStorage.setItem('vocab_current_lang_id', currentLangId);
    }

    updateHeaderFlag();
    updateLanguageLabels();
    await updateDashboard();
}

async function renderLanguagesSheet() {
    const langs = await getAllLanguagesFromDB();
    languagesList.innerHTML = '';

    if (langs.length === 0) {
        languagesList.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:1rem;">${t('modal_languages_empty')}</p>`;
        return;
    }

    for (const l of langs) {
        const words = await getWordsByLanguage(l.id);
        const isActive = (l.id === currentLangId);
        const flagSrc = l.flag || `https://flagcdn.com/h120/${getCountryCode(l.code)}.png`;
        const displayName = l.name;

        const row = document.createElement('div');
        row.className = `lang-row ${isActive ? 'active' : ''}`;
        row.innerHTML = `
            <div class="lang-row-left">
                <span class="lang-check">${isActive ? '✓' : ''}</span>
                <img class="lang-flag-preview" src="${flagSrc}" alt="${displayName}">
                <span class="lang-name-label">${displayName}</span>
            </div>
            <div class="lang-row-right">
                <span class="lang-word-count">${words.length === 1 ? t('word_count_badge_single') : t('words_count_badge', { count: words.length })}</span>
                <button class="btn-rename-lang ${isEditingLanguages ? '' : 'hidden'}" title="${t('btn_rename_lang_title')}" data-id="${l.id}">✏️</button>
                <button class="btn-delete-lang ${isEditingLanguages ? '' : 'hidden'}" title="${t('btn_delete_lang_title')}" data-id="${l.id}">🗑️</button>
            </div>
        `;

        row.addEventListener('click', async (e) => {
            if (e.target.classList.contains('btn-delete-lang') || e.target.classList.contains('btn-rename-lang')) return;
            if (isEditingLanguages) return;

            currentLangId = l.id;
            currentLangCode = l.code;
            currentLangName = getLocalizedLanguageName(l.code);
            currentBaseLangName = currentLangName;
            currentLangFlagSrc = flagSrc;
            localStorage.setItem('vocab_current_lang_id', currentLangId);
            updateHeaderFlag();
            updateLanguageLabels();
            await updateDashboard();
            if (document.getElementById('tab-manager').classList.contains('active')) {
                managerCurrentPage = 1;
                renderManagerTable();
            }
            closeAllModals();
        });

        const renameBtn = row.querySelector('.btn-rename-lang');
        if (renameBtn) {
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                languagesModal.classList.add('hidden');
                document.getElementById('renameLangId').value = l.id;
                const input = document.getElementById('renameLangInput');
                input.value = displayName;
                document.getElementById('modalOverlay').classList.remove('hidden');
                document.getElementById('renameLangModal').classList.remove('hidden');
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 50);
            });
        }

        const deleteBtn = row.querySelector('.btn-delete-lang');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const ok = await showCustomConfirm(
                    t('confirm_delete_lang_title'),
                    t('confirm_delete_lang_msg', { name: displayName, count: words.length }),
                    t('btn_delete'),
                    t('btn_cancel'),
                    true
                );
                if (ok) {
                    stopAudio();
                    stopAudioEffects();
                    const tx = db.transaction(['languages', 'words'], 'readwrite');
                    tx.objectStore('languages').delete(l.id);
                    words.forEach(w => tx.objectStore('words').delete(w.id));
                    tx.oncomplete = async () => {
                        showToast(t('toast_lang_deleted', { name: displayName }));
                        if (currentLangId === l.id) {
                            currentLangId = null;
                            localStorage.removeItem('vocab_current_lang_id');
                        }
                        await loadLanguages();
                        renderLanguagesSheet();
                        renderManagerTable();
                    };
                }
            });
        }

        languagesList.appendChild(row);
    }
}

// TOGGLE BUTTON BEARBEITEN / FERTIG
toggleEditLangsBtn.addEventListener('click', () => {
    isEditingLanguages = !isEditingLanguages;
    toggleEditLangsBtn.textContent = isEditingLanguages ? t('btn_done_editing') : t('btn_edit_languages');
    document.querySelectorAll('.btn-delete-lang, .btn-rename-lang').forEach(btn => {
        btn.classList.toggle('hidden', !isEditingLanguages);
    });
});

// ABBRECHEN BEIM UMBENENNEN
document.getElementById('cancelRenameLangBtn').addEventListener('click', () => {
    document.getElementById('renameLangModal').classList.add('hidden');
    languagesModal.classList.remove('hidden');
});

// SPEICHERN DES NEUEN NAMENS
document.getElementById('renameLangForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt(document.getElementById('renameLangId').value, 10);
    const newName = document.getElementById('renameLangInput').value.trim();
    if (!newName) return;

    if (newName.length > 30) {
        showToast(t('toast_name_too_long'));
        return;
    }

    const langs = await getAllLanguagesFromDB();
    const target = langs.find(l => l.id === id);
    if (!target) return;

    if (langs.some(l => l.id !== id && l.name.toLowerCase() === newName.toLowerCase())) {
        showToast(t('toast_name_exists'));
        return;
    }

    target.name = newName;
    target.isCustomName = true;
    await updateData('languages', target);

    if (currentLangId === id) {
        currentLangName = getLocalizedLanguageName(target.code);
        currentBaseLangName = currentLangName;
        updateHeaderFlag();
        updateLanguageLabels();
    }

    document.getElementById('renameLangModal').classList.add('hidden');
    languagesModal.classList.remove('hidden');
    await renderLanguagesSheet();
    showToast(t('toast_lang_renamed', { name: newName }));
});

langHeaderBtn.addEventListener('click', async () => {
    const langs = await getAllLanguagesFromDB();

    if (langs.length === 0) {
        populateLangPresets();
        document.getElementById('modalOverlay').classList.remove('hidden');
        document.getElementById('addLangModal').classList.remove('hidden');
        return;
    }

    isEditingLanguages = false;
    toggleEditLangsBtn.textContent = t('btn_edit_languages');
    await renderLanguagesSheet();
    document.getElementById('modalOverlay').classList.remove('hidden');
    languagesModal.classList.remove('hidden');
});

openAddLangModalBtn.addEventListener('click', () => {
    languagesModal.classList.add('hidden');
    populateLangPresets();
    document.getElementById('addLangModal').classList.remove('hidden');
});

document.getElementById('addLangForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const [code, baseName] = document.getElementById('langPreset').value.split('|');
    const cc = getCountryCode(code);

    const existingLangs = await getAllLanguagesFromDB();

    let uniqueName = baseName;
    if (existingLangs.some(l => l.name === uniqueName)) {
        let counter = 2;
        while (existingLangs.some(l => l.name === `${baseName} (${counter})`)) {
            counter++;
        }
        uniqueName = `${baseName} (${counter})`;
    }

    const [flagData] = await Promise.all([
        fetchFlagDataUrl(cc),
        ensureNativeFlag()
    ]);

    const newId = await addData('languages', {
        name: uniqueName,
        baseName: baseName,
        code,
        isCustomName: false,
        flag: flagData || `https://flagcdn.com/h120/${cc}.png`
    });

    closeAllModals();
    currentLangId = newId;
    currentLangCode = code;
    currentLangName = getLocalizedLanguageName(code);
    currentBaseLangName = currentLangName;
    currentLangFlagSrc = flagData || `https://flagcdn.com/h120/${cc}.png`;
    localStorage.setItem('vocab_current_lang_id', currentLangId);

    await loadLanguages();
    showToast(t('toast_lang_added', { name: uniqueName }));
});

// ==========================================
// DASHBOARD STATISTIKEN
// ==========================================
async function updateDashboard() {
    const subTomorrowEl = document.getElementById('statTileSubTomorrow');
    const subNewEl = document.getElementById('statTileSubNew');

    if (!currentLangId) {
        document.getElementById('statDueToday').textContent = '0';
        document.getElementById('statActiveCount').textContent = '0';
        if (subTomorrowEl) {
            subTomorrowEl.innerHTML = t('stat_due_tomorrow', { count: '<strong id="statDueTomorrow">0</strong>' });
        }
        if (subNewEl) {
            subNewEl.innerHTML = t('stat_still_new', { count: '<strong id="statNewCount">0</strong>' });
        }
        const totalWordsEl = document.getElementById('statTotalWords');
        if (totalWordsEl) totalWordsEl.textContent = t('stats_total_words', { count: 0 });
        document.getElementById('barNew').style.width = '0%';
        document.getElementById('barLearn').style.width = '0%';
        document.getElementById('barProg').style.width = '0%';
        document.getElementById('barMaster').style.width = '0%';
        return;
    }
    const words = await getWordsByLanguage(currentLangId);

    const endOfToday = getEndOfDay(new Date());

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startOfTomorrow = getStartOfDay(tomorrow);
    const endOfTomorrow = getEndOfDay(tomorrow);

    let dueToday = 0;
    let dueTomorrow = 0;
    let activeCount = 0;
    let newCount = 0;
    let totalCount = words.length;

    let countLvlNew = 0;
    let countLvlLearn = 0;
    let countLvlProg = 0;
    let countLvlMaster = 0;

    const startOfToday = getStartOfDay(new Date());
    let learnedTodayCount = 0;
    let newTodayCount = 0;

    const groups = new Set();
    const newWordsPerGroup = {};

    words.forEach(w => {
        const grp = w.group || '';
        if (grp) groups.add(grp);

        const lvl = w.level || 0;

        if (w.lastLearned && w.lastLearned >= startOfToday) {
            learnedTodayCount++;
            if (w.firstLearned && w.firstLearned >= startOfToday) {
                newTodayCount++;
            }
        }

        if (lvl === 0) {
            newCount++;
            countLvlNew++;
            newWordsPerGroup[grp] = (newWordsPerGroup[grp] || 0) + 1;
        } else {
            activeCount++;

            if (w.nextDue <= endOfToday) {
                dueToday++;
            } else if (w.nextDue >= startOfTomorrow && w.nextDue <= endOfTomorrow) {
                dueTomorrow++;
            }

            if (lvl >= 1 && lvl <= 3) countLvlLearn++;
            else if (lvl >= 4 && lvl <= 7) countLvlProg++;
            else if (lvl >= 8) countLvlMaster++;
        }
    });

    document.getElementById('statDueToday').textContent = dueToday;
    document.getElementById('statActiveCount').textContent = activeCount;

    if (subTomorrowEl) {
        subTomorrowEl.innerHTML = t('stat_due_tomorrow', { count: `<strong id="statDueTomorrow">${dueTomorrow}</strong>` });
    }
    if (subNewEl) {
        subNewEl.innerHTML = t('stat_still_new', { count: `<strong id="statNewCount">${newCount}</strong>` });
    }

    const totalWordsEl = document.getElementById('statTotalWords');
    if (totalWordsEl) {
        totalWordsEl.textContent = totalCount === 1 ? t('stats_total_word_single') : t('stats_total_words', { count: totalCount });
    }
    document.getElementById('lblLvlNew').textContent = countLvlNew;
    document.getElementById('lblLvlLearn').textContent = countLvlLearn;
    document.getElementById('lblLvlProg').textContent = countLvlProg;
    document.getElementById('lblLvlMaster').textContent = countLvlMaster;

    if (totalCount > 0) {
        document.getElementById('barNew').style.width = `${(countLvlNew / totalCount) * 100}%`;
        document.getElementById('barLearn').style.width = `${(countLvlLearn / totalCount) * 100}%`;
        document.getElementById('barProg').style.width = `${(countLvlProg / totalCount) * 100}%`;
        document.getElementById('barMaster').style.width = `${(countLvlMaster / totalCount) * 100}%`;
    } else {
        document.getElementById('barNew').style.width = '0%';
        document.getElementById('barLearn').style.width = '0%';
        document.getElementById('barProg').style.width = '0%';
        document.getElementById('barMaster').style.width = '0%';
    }
    const wordList = words.filter(w => w.type !== 'sentence');
    const sentenceList = words.filter(w => w.type === 'sentence');

    const dueWordsCount = wordList.filter(w => w.level > 0 && w.nextDue <= endOfToday).length;
    const newWordsCount = wordList.filter(w => w.level === 0).length;

    const dueSentencesCount = sentenceList.filter(w => w.level > 0 && w.nextDue <= endOfToday).length;
    const newSentencesCount = sentenceList.filter(w => w.level === 0).length;

    // SATZ-LEKTION DASHBOARD HINWEISE
    const smartSentenceSelect = document.getElementById('smartSentenceLessonSource');
    const hintSentenceEl = document.getElementById('smartSentenceLessonHint');
    const startSentenceBtn = document.getElementById('startSentenceLessonBtn');

    if (sentenceList.length === 0) {
        smartSentenceSelect.classList.add('hidden');
        hintSentenceEl.textContent = t('smart_sentence_hint_empty');
        startSentenceBtn.disabled = true;
    } else {
        startSentenceBtn.disabled = false;
        if (dueSentencesCount >= 5) {
            smartSentenceSelect.classList.add('hidden');
            hintSentenceEl.textContent = t('smart_sentence_hint_due_many', { count: dueSentencesCount });
        } else if (dueSentencesCount > 0) {
            smartSentenceSelect.classList.remove('hidden');
            hintSentenceEl.textContent = t('smart_sentence_hint_due_fill', { count: dueSentencesCount });
        } else if (newSentencesCount > 0) {
            smartSentenceSelect.classList.remove('hidden');
            hintSentenceEl.textContent = t('smart_sentence_hint_all_done_new');
        } else {
            smartSentenceSelect.classList.add('hidden');
            hintSentenceEl.textContent = t('smart_sentence_hint_all_mastered');
        }
    }

    const newSentencesPerGroup = {};
    sentenceList.forEach(s => {
        if (s.level === 0) {
            const grp = s.group || '';
            newSentencesPerGroup[grp] = (newSentencesPerGroup[grp] || 0) + 1;
        }
    });

    const prevSentVal = smartSentenceSelect.value;
    smartSentenceSelect.innerHTML = `<option value="ALL">${t('select_source_all', { count: newSentencesCount })}</option>`;
    if (newSentencesPerGroup['']) {
        smartSentenceSelect.innerHTML += `<option value="__NONE__">${t('select_source_none', { count: newSentencesPerGroup[''] })}</option>`;
    }
    groups.forEach(g => {
        const c = newSentencesPerGroup[g] || 0;
        smartSentenceSelect.innerHTML += `<option value="${g}">${t('select_source_group', { group: g, count: c })}</option>`;
    });
    if (prevSentVal && smartSentenceSelect.querySelector(`option[value="${prevSentVal}"]`)) {
        smartSentenceSelect.value = prevSentVal;
    }

    const SMART_LESSON_SIZE = 10;
    const smartSourceSelect = document.getElementById('smartLessonSource');
    const hintEl = document.getElementById('smartLessonHint');

    // Wortschatz-Karte zählt jetzt NUR echte Wörter (ohne Sätze)
    if (dueWordsCount >= SMART_LESSON_SIZE) {
        smartSourceSelect.classList.add('hidden');
        hintEl.textContent = t('smart_hint_due_many', { count: dueWordsCount });
    } else {
        if (dueWordsCount > 0) {
            smartSourceSelect.classList.remove('hidden');
            hintEl.textContent = t('smart_hint_due_fill', { count: dueWordsCount });
        } else if (newWordsCount > 0) {
            smartSourceSelect.classList.remove('hidden');
            hintEl.textContent = t('smart_hint_all_done_new');
        } else {
            smartSourceSelect.classList.add('hidden');
            hintEl.textContent = t('smart_hint_all_mastered');
        }
    }

    // Gruppen-Zählung für neue Wörter (ohne Sätze)
    const newOnlyWordsPerGroup = {};
    wordList.forEach(w => {
        if (w.level === 0) {
            const grp = w.group || '';
            newOnlyWordsPerGroup[grp] = (newOnlyWordsPerGroup[grp] || 0) + 1;
        }
    });

    const prevSmartVal = smartSourceSelect.value;
    smartSourceSelect.innerHTML = `<option value="ALL">${t('select_source_all', { count: newWordsCount })}</option>`;

    if (newOnlyWordsPerGroup['']) {
        smartSourceSelect.innerHTML += `<option value="__NONE__">${t('select_source_none', { count: newOnlyWordsPerGroup[''] })}</option>`;
    }

    groups.forEach(g => {
        const count = newOnlyWordsPerGroup[g] || 0;
        smartSourceSelect.innerHTML += `<option value="${g}">${t('select_source_group', { group: g, count })}</option>`;
    });

    if (prevSmartVal && smartSourceSelect.querySelector(`option[value="${prevSmartVal}"]`)) {
        smartSourceSelect.value = prevSmartVal;
    }

    const cramSelect = document.getElementById('cramGroup');
    cramSelect.innerHTML = '';
    cramSelect.innerHTML += `<option value="__ALL_WORDS__">${t('select_cram_all', { count: words.length })}</option>`;

    const withoutGroupCount = words.filter(w => !w.group).length;
    if (withoutGroupCount > 0 && withoutGroupCount < words.length) {
        cramSelect.innerHTML += `<option value="__NO_GROUP__">${t('select_cram_none', { count: withoutGroupCount })}</option>`;
    }

    if (newTodayCount > 0) {
        cramSelect.innerHTML += `<option value="__NEW_TODAY__">${t('select_cram_new_today', { count: newTodayCount })}</option>`;
    }
    if (learnedTodayCount > 0) {
        cramSelect.innerHTML += `<option value="__ALL_TODAY__">${t('select_cram_all_today', { count: learnedTodayCount })}</option>`;
    }

    groups.forEach(g => {
        cramSelect.innerHTML += `<option value="${g}">📁 ${g}</option>`;
    });

    document.getElementById('startCramBtn').disabled = (words.length === 0);
    updateStreakUI();
}

// Navigation
document.getElementById('navHome').addEventListener('click', () => {
    document.querySelectorAll('.tab-content, .nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-home').classList.add('active');
    document.getElementById('navHome').classList.add('active');
});
document.getElementById('navManager').addEventListener('click', () => {
    document.querySelectorAll('.tab-content, .nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-manager').classList.add('active');
    document.getElementById('navManager').classList.add('active');
    renderManagerTable();
});
document.getElementById('navSettings').addEventListener('click', () => {
    document.querySelectorAll('.tab-content, .nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-settings').classList.add('active');
    document.getElementById('navSettings').classList.add('active');
});

// Settings Event Listener
const settingAutoSpeakCheckbox = document.getElementById('settingAutoSpeak');
// const settingSoundEffectsCheckbox = document.getElementById('settingSoundEffects');
const settingOfflineVoiceCheckbox = document.getElementById('settingOfflineVoice');
const settingUiLanguageSelect = document.getElementById('settingUiLanguageSelect');

settingAutoSpeakCheckbox.checked = settingAutoSpeak;
// settingSoundEffectsCheckbox.checked = settingSoundEffects;
if (settingOfflineVoiceCheckbox) {
    settingOfflineVoiceCheckbox.checked = settingOfflineVoice;
}

if (settingUiLanguageSelect) {
    settingUiLanguageSelect.value = currentUiLang;
    settingUiLanguageSelect.addEventListener('change', (e) => {
        setUiLanguage(e.target.value);
    });
}

settingAutoSpeakCheckbox.addEventListener('change', (e) => {
    settingAutoSpeak = e.target.checked;
    localStorage.setItem('vocab_auto_speak', settingAutoSpeak);
    showToast(settingAutoSpeak ? t('toast_auto_speak_on') : t('toast_auto_speak_off'));
});

// settingSoundEffectsCheckbox.addEventListener('change', (e) => {
//     settingSoundEffects = e.target.checked;
//     localStorage.setItem('vocab_sound_fx', settingSoundEffects);
//     showToast(settingSoundEffects ? t('toast_sound_on') : t('toast_sound_off'));
//     // if (settingSoundEffects) playAudioEffect(soundCorrect);
// });

if (settingOfflineVoiceCheckbox) {
    settingOfflineVoiceCheckbox.addEventListener('change', (e) => {
        settingOfflineVoice = e.target.checked;
        localStorage.setItem('vocab_offline_voice', settingOfflineVoice);
        showToast(settingOfflineVoice ? t('toast_offline_voice_on') : t('toast_offline_voice_off'));
    });
}

let isImporting = false;
let isImportCancelled = false;

function closeAllModals() {
    if (isImporting) return;
    document.getElementById('modalOverlay').classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    wordModalAlert.classList.add('hidden');
}

document.querySelectorAll('.close-modal, #modalOverlay').forEach(el => {
    el.addEventListener('click', closeAllModals);
});

// Wort bearbeiten / hinzufügen
let userManuallyToggledSentence = false;

document.getElementById('managerAddWordBtn').addEventListener('click', () => {
    if (!currentLangId) return promptAddLanguage();
    document.getElementById('wordForm').reset();
    document.getElementById('editWordId').value = '';
    document.getElementById('wordGroup').value = lastUsedGroup;
    document.getElementById('wordIsSentence').checked = false;
    userManuallyToggledSentence = false;
    document.getElementById('wordModalTitle').textContent = t('modal_word_title_new', { lang: currentBaseLangName });
    updateLanguageLabels();
    wordModalAlert.classList.add('hidden');
    deleteCurrentWordBtn.classList.add('hidden');
    document.getElementById('modalOverlay').classList.remove('hidden');
    document.getElementById('wordModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('wordGerman').focus(), 100);
});

window.editWord = async function (id) {
    const word = await getWord(id);
    document.getElementById('editWordId').value = word.id;
    document.getElementById('wordGerman').value = word.german;
    document.getElementById('wordForeign').value = word.foreign;
    document.getElementById('wordGroup').value = word.group || '';
    document.getElementById('wordIsSentence').checked = (word.type === 'sentence');
    userManuallyToggledSentence = true;
    document.getElementById('wordModalTitle').textContent = t('modal_word_title_edit', { lang: currentBaseLangName });
    updateLanguageLabels();
    wordModalAlert.classList.add('hidden');
    deleteCurrentWordBtn.classList.remove('hidden');
    document.getElementById('modalOverlay').classList.remove('hidden');
    document.getElementById('wordModal').classList.remove('hidden');
};

document.getElementById('wordIsSentence').addEventListener('change', () => {
    userManuallyToggledSentence = true;
});

function handleSentenceAutoDetection() {
    if (userManuallyToggledSentence) return;
    const deVal = document.getElementById('wordGerman').value;
    const foVal = document.getElementById('wordForeign').value;
    const cb = document.getElementById('wordIsSentence');
    if (isSentenceCandidate(deVal) || isSentenceCandidate(foVal)) {
        cb.checked = true;
    }
}

document.getElementById('wordGerman').addEventListener('input', handleSentenceAutoDetection);
document.getElementById('wordForeign').addEventListener('input', handleSentenceAutoDetection);

deleteCurrentWordBtn.addEventListener('click', async () => {
    const id = parseInt(document.getElementById('editWordId').value);
    if (!id) return;
    const ok = await showCustomConfirm(
        t('confirm_delete_word_title'),
        t('confirm_delete_word_msg'),
        t('btn_delete'),
        t('btn_cancel'),
        true
    );
    if (ok) {
        await db.transaction(['words'], 'readwrite').objectStore('words').delete(id);
        closeAllModals();
        renderManagerTable(true);
        updateDashboard();
        showToast(t('toast_word_deleted'));
    }
});

// Wort speichern mit präziser Homonym-Prüfung
document.getElementById('wordForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    wordModalAlert.classList.add('hidden');
    wordModalMergeBtn.classList.add('hidden');

    const id = document.getElementById('editWordId').value;
    const german = cleanInputSyntax(document.getElementById('wordGerman').value);
    const foreign = cleanInputSyntax(document.getElementById('wordForeign').value);
    const group = document.getElementById('wordGroup').value.trim();
    const isSentence = document.getElementById('wordIsSentence').checked;
    const type = isSentence ? 'sentence' : 'word';

    const words = await getWordsByLanguage(currentLangId);
    const currentIdNum = id ? parseInt(id) : null;
    const otherWords = words.filter(w => w.id !== currentIdNum);

    const parsedDe = parseVocabField(german, isSentence);
    const parsedFo = parseVocabField(foreign, isSentence);

    // Exaktes Duplikat prüfen
    const exactMatch = otherWords.find(w => {
        const wIsSent = (w.type === 'sentence');
        const wDe = parseVocabField(w.german, wIsSent);
        const wFo = parseVocabField(w.foreign, wIsSent);
        const deMatches = parsedDe.variants.some(v => wDe.variants.some(x => getVariantSignature(x) === getVariantSignature(v)));
        const foMatches = parsedFo.variants.some(v => wFo.variants.some(x => getVariantSignature(x) === getVariantSignature(v)));
        return deMatches && foMatches;
    });

    if (exactMatch) {
        wordModalAlertText.innerHTML = t('alert_word_exists', {
            nativeLang: getNativeLanguageName(),
            native: parseVocabField(exactMatch.german, exactMatch.type === 'sentence').display,
            foreignLang: currentBaseLangName,
            foreign: parseVocabField(exactMatch.foreign, exactMatch.type === 'sentence').display
        });
        wordModalAlert.classList.remove('hidden');
        return;
    }

    const matchGermanOnly = otherWords.find(w =>
        parsedDe.variants.some(v => parseVocabField(w.german, w.type === 'sentence').variants.some(x => getVariantSignature(x) === getVariantSignature(v)))
    );

    const matchForeignOnly = otherWords.find(w =>
        parsedFo.variants.some(v => parseVocabField(w.foreign, w.type === 'sentence').variants.some(x => getVariantSignature(x) === getVariantSignature(v)))
    );

    const resetFormForNextWord = () => {
        wordModalAlert.classList.add('hidden');
        document.getElementById('editWordId').value = '';
        document.getElementById('wordGerman').value = '';
        document.getElementById('wordForeign').value = '';
        document.getElementById('wordIsSentence').checked = false;
        userManuallyToggledSentence = false;
        document.getElementById('wordGerman').focus();
    };

    if (matchGermanOnly) {
        const mergeTargetSent = (matchGermanOnly.type === 'sentence');
        wordModalAlertText.innerHTML = t('alert_word_merge_native', {
            native: parseVocabField(matchGermanOnly.german, mergeTargetSent).display,
            foreign: parseVocabField(matchGermanOnly.foreign, mergeTargetSent).display
        });
        wordModalMergeBtn.textContent = t('btn_merge_to', { display: parseVocabField(matchGermanOnly.german, mergeTargetSent).display });
        wordModalMergeBtn.classList.remove('hidden');
        wordModalAlert.classList.remove('hidden');

        wordModalMergeBtn.onclick = async () => {
            matchGermanOnly.foreign = mergeUniqueVariants(matchGermanOnly.foreign, foreign, mergeTargetSent);
            if (group && !matchGermanOnly.group) matchGermanOnly.group = group;
            await updateData('words', matchGermanOnly);

            if (id) {
                await db.transaction(['words'], 'readwrite').objectStore('words').delete(parseInt(id));
            }
            lastUsedGroup = group || lastUsedGroup;
            updateDashboard();
            renderManagerTable(true);
            showToast(t('toast_meaning_merged'));
            resetFormForNextWord();
        };
        return;
    }

    if (matchForeignOnly) {
        const mergeTargetSent = (matchForeignOnly.type === 'sentence');
        wordModalAlertText.innerHTML = t('alert_word_merge_foreign', {
            foreign: parseVocabField(matchForeignOnly.foreign, mergeTargetSent).display,
            native: parseVocabField(matchForeignOnly.german, mergeTargetSent).display
        });
        wordModalMergeBtn.textContent = t('btn_merge_to', { display: parseVocabField(matchForeignOnly.foreign, mergeTargetSent).display });
        wordModalMergeBtn.classList.remove('hidden');
        wordModalAlert.classList.remove('hidden');

        wordModalMergeBtn.onclick = async () => {
            matchForeignOnly.german = mergeUniqueVariants(matchForeignOnly.german, german, mergeTargetSent);
            if (group && !matchForeignOnly.group) matchForeignOnly.group = group;
            await updateData('words', matchForeignOnly);
            if (id) {
                await db.transaction(['words'], 'readwrite').objectStore('words').delete(parseInt(id));
            }
            lastUsedGroup = group || lastUsedGroup;
            updateDashboard();
            renderManagerTable(true);
            showToast(t('toast_meaning_merged'));
            resetFormForNextWord();
        };
        return;
    }

    if (id) {
        const word = await getWord(parseInt(id));
        word.german = german;
        word.foreign = foreign;
        word.group = group;
        word.type = type;
        await updateData('words', word);
        closeAllModals();
        showToast(t('toast_word_updated'));
        renderManagerTable(true);
    } else {
        await addData('words', {
            langId: currentLangId,
            german,
            foreign,
            group,
            type,
            level: 0,
            nextDue: 0,
            lastLearned: 0,
            firstLearned: 0
        });
        lastUsedGroup = group;
        resetFormForNextWord();
        showToast(t('toast_word_saved'));
        renderManagerTable(true);
    }
    updateDashboard();
});

// ==========================================
// MANAGER TABELLE: PAGINIERUNG & SORTIERUNG
// ==========================================
function updatePaginationUI(totalPages) {
    const topContainer = document.getElementById('paginationContainerTop');
    const bottomContainer = document.getElementById('paginationContainerBottom');

    if (totalPages > 1) {
        topContainer.classList.remove('hidden');
        bottomContainer.classList.remove('hidden');
        const text = t('pagination_page_info', { current: managerCurrentPage, total: totalPages });
        document.querySelectorAll('.page-info-text').forEach(el => el.textContent = text);

        const isFirst = (managerCurrentPage === 1);
        const isLast = (managerCurrentPage === totalPages);

        document.querySelectorAll('.page-first-btn').forEach(b => b.disabled = isFirst);
        document.querySelectorAll('.page-prev-btn').forEach(b => b.disabled = isFirst);
        document.querySelectorAll('.page-next-btn').forEach(b => b.disabled = isLast);
        document.querySelectorAll('.page-last-btn').forEach(b => b.disabled = isLast);
    } else {
        topContainer.classList.add('hidden');
        bottomContainer.classList.add('hidden');
    }
}

function formatNextDue(timestamp, level) {
    if (!level || level === 0 || !timestamp) return '-';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '-';

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const dateStr = `${day}.${month}.${year}`;

    const endOfToday = getEndOfDay(new Date());

    if (timestamp <= endOfToday) {
        return `<span style="color: var(--danger); font-weight: 600;" title="${dateStr}">${t('due_today_badge')}</span>`;
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (timestamp >= getStartOfDay(tomorrow) && timestamp <= getEndOfDay(tomorrow)) {
        return `<span style="color: #D97706; font-weight: 500;" title="${dateStr}">${t('due_tomorrow_badge')}</span>`;
    }

    return dateStr;
}

async function renderManagerTable(preserveScroll = false) {
    const savedWindowScroll = window.scrollY;
    const savedContainerScroll = vocabTableContainer ? vocabTableContainer.scrollTop : 0;

    vocabTableBody.innerHTML = '';
    bulkActions.classList.add('hidden');
    selectAllCheckbox.checked = false;

    if (!currentLangId) {
        vocabTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">${t('empty_table_no_lang')}</td></tr>`;
        updatePaginationUI(0);
        return;
    }

    let words = await getWordsByLanguage(currentLangId);

    words.sort((a, b) => {
        let valA = a[managerSortColumn] || '';
        let valB = b[managerSortColumn] || '';

        if (managerSortColumn === 'level') {
            const diff = (a.level || 0) - (b.level || 0);
            return managerSortDirection === 'asc' ? diff : -diff;
        }

        if (managerSortColumn === 'nextDue') {
            const dueA = (a.level > 0 && a.nextDue) ? a.nextDue : (managerSortDirection === 'asc' ? Infinity : -Infinity);
            const dueB = (b.level > 0 && b.nextDue) ? b.nextDue : (managerSortDirection === 'asc' ? Infinity : -Infinity);
            return managerSortDirection === 'asc' ? dueA - dueB : dueB - dueA;
        }

        if (managerSortColumn === 'german' || managerSortColumn === 'foreign') {
            const keyA = parseVocabField(valA, a.type === 'sentence').sortKey;
            const keyB = parseVocabField(valB, b.type === 'sentence').sortKey;
            const sortLocale = managerSortColumn === 'foreign' ? (currentLangCode || 'en') : currentUiLang;
            const cmp = keyA.localeCompare(keyB, sortLocale, { numeric: true, sensitivity: 'base' });
            return managerSortDirection === 'asc' ? cmp : -cmp;
        }

        const cmp = valA.toString().localeCompare(valB.toString(), currentUiLang, { numeric: true, sensitivity: 'base' });
        return managerSortDirection === 'asc' ? cmp : -cmp;
    });

    updateSortIcons();

    const totalWords = words.length;
    if (totalWords === 0) {
        vocabTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">${t('empty_table_no_words')}</td></tr>`;
        updatePaginationUI(0);
        return;
    }

    const effectivePageSize = getEffectivePageSize(totalWords);
    const totalPages = Math.ceil(totalWords / effectivePageSize);
    if (managerCurrentPage > totalPages) managerCurrentPage = totalPages;
    if (managerCurrentPage < 1) managerCurrentPage = 1;

    const startIndex = (managerCurrentPage - 1) * effectivePageSize;
    const pageWords = words.slice(startIndex, startIndex + effectivePageSize);

    pageWords.forEach(w => {
        const isSent = (w.type === 'sentence');
        // const badgeSent = isSent ? `<span class="badge-sentence" title="${t('lbl_word_is_sentence')}">💬 ${t('badge_sentence_type')}</span>` : '';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="row-checkbox" value="${w.id}"></td>
            <td><strong>${formatVocabHTML(w.german, isSent)}</strong></td>
            <td>${formatVocabHTML(w.foreign, isSent)}</td>
            <td><span class="btn-small" style="background:#E5E7EB;">${w.group || '-'}</span></td>
            <td>${w.level}</td>
            <td>${formatNextDue(w.nextDue, w.level)}</td>
            <td style="text-align: center;">
                <button class="btn-edit" onclick="editWord(${w.id})" title="${t('btn_edit_title')}">✏️</button>
            </td>
        `;
        vocabTableBody.appendChild(tr);
    });

    document.querySelectorAll('.row-checkbox').forEach(cb => cb.addEventListener('change', updateBulkActions));
    updatePaginationUI(totalPages);

    if (preserveScroll) {
        window.scrollTo({ top: savedWindowScroll, behavior: 'instant' });
        if (vocabTableContainer) vocabTableContainer.scrollTop = savedContainerScroll;
    }
}

function updateSortIcons() {
    ['German', 'Foreign', 'Group', 'Level', 'NextDue'].forEach(col => {
        const iconEl = document.getElementById(`sortIcon${col}`);
        if (iconEl) iconEl.textContent = '';
    });

    const activeMap = {
        german: 'sortIconGerman',
        foreign: 'sortIconForeign',
        group: 'sortIconGroup',
        level: 'sortIconLevel',
        nextDue: 'sortIconNextDue'
    };
    const activeIcon = document.getElementById(activeMap[managerSortColumn]);
    if (activeIcon) {
        activeIcon.textContent = managerSortDirection === 'asc' ? '▲' : '▼';
    }
}

document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const col = btn.dataset.sort;
        if (managerSortColumn === col) {
            managerSortDirection = managerSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            managerSortColumn = col;
            managerSortDirection = 'asc';
        }
        renderManagerTable(true);
    });
});

document.querySelectorAll('.page-first-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        managerCurrentPage = 1;
        renderManagerTable(false);
    });
});
document.querySelectorAll('.page-prev-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (managerCurrentPage > 1) {
            managerCurrentPage--;
            renderManagerTable(false);
        }
    });
});

document.querySelectorAll('.page-next-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const words = await getWordsByLanguage(currentLangId);
        const pageSize = getEffectivePageSize(words.length);
        const totalPages = Math.ceil(words.length / pageSize);
        if (managerCurrentPage < totalPages) {
            managerCurrentPage++;
            renderManagerTable(false);
        }
    });
});
document.querySelectorAll('.page-last-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const words = await getWordsByLanguage(currentLangId);
        const pageSize = getEffectivePageSize(words.length);
        managerCurrentPage = Math.ceil(words.length / pageSize);
        renderManagerTable(false);
    });
});

const pageSizeSelect = document.getElementById('managerPageSizeSelect');
if (pageSizeSelect) {
    pageSizeSelect.value = managerPageSizeSetting;
    pageSizeSelect.addEventListener('change', (e) => {
        managerPageSizeSetting = e.target.value;
        localStorage.setItem('vocab_page_size', managerPageSizeSetting);
        managerCurrentPage = 1;
        renderManagerTable(true);
    });
}

function updateBulkActions() {
    const checked = document.querySelectorAll('.row-checkbox:checked');
    if (checked.length > 0) {
        bulkActions.classList.remove('hidden');
        selectedCount.textContent = t('bulk_selected_count', { count: checked.length });
    } else {
        bulkActions.classList.add('hidden');
        selectAllCheckbox.checked = false;
    }
}

selectAllCheckbox.addEventListener('change', (e) => {
    document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = e.target.checked);
    updateBulkActions();
});

document.getElementById('bulkDeleteBtn').addEventListener('click', async () => {
    const checked = document.querySelectorAll('.row-checkbox:checked');
    const ok = await showCustomConfirm(
        t('confirm_bulk_delete_title'),
        t('confirm_bulk_delete_msg', { count: checked.length }),
        t('btn_delete'),
        t('btn_cancel'),
        true
    );
    if (ok) {
        const ids = Array.from(checked).map(cb => parseInt(cb.value));
        const tx = db.transaction(['words'], 'readwrite');
        ids.forEach(id => tx.objectStore('words').delete(id));
        tx.oncomplete = () => {
            renderManagerTable(true);
            updateDashboard();
            showToast(t('toast_words_bulk_deleted', { count: ids.length }));
        };
    }
});

// IMPORT / EXPORT
function downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

document.getElementById('exportAllBtn').addEventListener('click', async () => {
    if (!currentLangId) return promptAddLanguage();
    const words = await getWordsByLanguage(currentLangId);
    if (words.length === 0) {
        return showCustomAlert(t('alert_no_words_export_title'), t('alert_no_words_export_msg'));
    }
    const exportData = words.map(w => ({ type: w.type || 'word', german: w.german, foreign: w.foreign, group: w.group || '' }));
    downloadJSON(exportData, `vokabeln_${currentLangName.toLowerCase()}_export.json`);
    showToast(t('toast_export_success'));
});

document.getElementById('exportProgressBtn').addEventListener('click', async () => {
    if (!currentLangId) return promptAddLanguage();
    const words = await getWordsByLanguage(currentLangId);
    const learnedWords = words.filter(w => (w.level || 0) > 0);

    if (learnedWords.length === 0) {
        return showCustomAlert(t('alert_no_words_export_title'), t('alert_no_progress_export_msg'));
    }

    const exportData = learnedWords.map(w => ({
        type: w.type || 'word',
        german: w.german,
        foreign: w.foreign,
        group: w.group || '',
        level: w.level,
        nextDue: w.nextDue || 0,
        lastLearned: w.lastLearned || 0,
        firstLearned: w.firstLearned || 0
    }));

    downloadJSON(exportData, `lernfortschritt_${currentLangName.toLowerCase()}_backup.json`);
    showToast(t('toast_progress_export', { count: learnedWords.length }));
});

document.getElementById('bulkExportBtn').addEventListener('click', async () => {
    const ids = Array.from(document.querySelectorAll('.row-checkbox:checked')).map(cb => parseInt(cb.value));
    const words = await getWordsByLanguage(currentLangId);
    const exportData = words.filter(w => ids.includes(w.id)).map(w => ({ type: w.type || 'word', german: w.german, foreign: w.foreign, group: w.group || '' }));
    if (exportData.length === 0) {
        return showCustomAlert(t('alert_no_words_export_title'), t('alert_no_words_selected_msg'));
    }
    downloadJSON(exportData, `auswahl_${currentLangName.toLowerCase()}_export.json`);
    showToast(t('toast_export_selection_success'));
});

document.getElementById('importBtn').addEventListener('click', () => {
    if (!currentLangId) return promptAddLanguage();
    document.getElementById('fileImport').click();
});

const cancelImportBtn = document.getElementById('cancelImportBtn');
if (cancelImportBtn) {
    cancelImportBtn.addEventListener('click', () => {
        if (isImporting) {
            isImportCancelled = true;
            cancelImportBtn.disabled = true;
            cancelImportBtn.textContent = t('import_cancelling');
        }
    });
}

document.getElementById('fileImport').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file || !currentLangId) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const importedWords = JSON.parse(event.target.result);
            if (!Array.isArray(importedWords) || importedWords.length === 0) {
                e.target.value = '';
                return showCustomAlert(t('alert_no_words_export_title'), t('alert_empty_file_msg'));
            }

            const validItems = importedWords.filter(w => w.german && w.foreign);
            if (validItems.length === 0) {
                e.target.value = '';
                return showCustomAlert(t('alert_no_words_export_title'), t('alert_no_valid_entries_msg'));
            }

            isImporting = true;
            isImportCancelled = false;
            if (cancelImportBtn) {
                cancelImportBtn.disabled = false;
                cancelImportBtn.textContent = t('btn_cancel_import');
            }

            const progressModal = document.getElementById('importProgressModal');
            const progressBar = document.getElementById('importProgressBar');
            const progressText = document.getElementById('importProgressText');
            document.getElementById('modalOverlay').classList.remove('hidden');
            progressModal.classList.remove('hidden');
            progressBar.style.width = '0%';
            progressText.textContent = `0 von ${validItems.length} (0%)`;

            let existingWords = await getWordsByLanguage(currentLangId);
            let importedCount = 0;
            let mergedCount = 0;

            for (let i = 0; i < validItems.length; i++) {
                if (isImportCancelled) break;

                const w = validItems[i];
                const itemIsSent = w.type ? (w.type === 'sentence') : (isSentenceCandidate(w.german) || isSentenceCandidate(w.foreign));
                const itemType = itemIsSent ? 'sentence' : 'word';

                const cleanDe = cleanInputSyntax(w.german);
                const cleanFo = cleanInputSyntax(w.foreign);

                const parsedDe = parseVocabField(cleanDe, itemIsSent);
                const parsedFo = parseVocabField(cleanFo, itemIsSent);

                const exact = existingWords.find(ex => {
                    const exDe = parseVocabField(ex.german);
                    const exFo = parseVocabField(ex.foreign);
                    return parsedDe.variants.some(v => exDe.variants.some(x => getVariantSignature(x) === getVariantSignature(v))) &&
                        parsedFo.variants.some(v => exFo.variants.some(x => getVariantSignature(x) === getVariantSignature(v)));
                });

                if (exact) {
                    if (typeof w.level === 'number' && w.level > 0) {
                        exact.level = w.level;
                        exact.nextDue = w.nextDue || exact.nextDue;
                        exact.lastLearned = w.lastLearned || exact.lastLearned;
                        exact.firstLearned = w.firstLearned || exact.firstLearned;
                        await updateData('words', exact);
                        mergedCount++;
                    }
                    continue;
                }

                const matchDe = existingWords.find(ex =>
                    parsedDe.variants.some(v => parseVocabField(ex.german).variants.some(x => getVariantSignature(x) === getVariantSignature(v)))
                );
                const matchFo = existingWords.find(ex =>
                    parsedFo.variants.some(v => parseVocabField(ex.foreign).variants.some(x => getVariantSignature(x) === getVariantSignature(v)))
                );

                if (matchDe) {
                    matchDe.foreign = mergeUniqueVariants(matchDe.foreign, cleanFo);
                    await updateData('words', matchDe);
                    mergedCount++;
                } else if (matchFo) {
                    matchFo.german = mergeUniqueVariants(matchFo.german, cleanDe);
                    await updateData('words', matchFo);
                    mergedCount++;
                } else {
                    await addData('words', {
                        langId: currentLangId,
                        german: cleanDe,
                        foreign: cleanFo,
                        group: (w.group || '').trim(),
                        type: itemType,
                        level: (typeof w.level === 'number') ? w.level : 0,
                        nextDue: (typeof w.nextDue === 'number') ? w.nextDue : 0,
                        lastLearned: (typeof w.lastLearned === 'number') ? w.lastLearned : 0,
                        firstLearned: (typeof w.firstLearned === 'number') ? w.firstLearned : 0
                    });
                    importedCount++;
                    existingWords = await getWordsByLanguage(currentLangId);
                }

                if (i % 5 === 0 || i === validItems.length - 1) {
                    const pct = Math.round(((i + 1) / validItems.length) * 100);
                    progressBar.style.width = `${pct}%`;
                    progressText.textContent = t('import_progress_text', { current: i + 1, total: validItems.length, pct });
                    await new Promise(r => setTimeout(r, 0));
                }
            }

            isImporting = false;
            document.getElementById('importProgressModal').classList.add('hidden');
            document.getElementById('modalOverlay').classList.add('hidden');

            if (isImportCancelled) {
                showToast(t('toast_import_cancelled', { imported: importedCount, merged: mergedCount }));
            } else {
                await showCustomAlert(
                    t('alert_import_success_title'),
                    t('alert_import_success_msg', { lang: currentBaseLangName, imported: importedCount, merged: mergedCount })
                );
            }

            e.target.value = '';
            updateDashboard();
            renderManagerTable();
        } catch (err) {
            isImporting = false;
            document.getElementById('importProgressModal').classList.add('hidden');
            document.getElementById('modalOverlay').classList.add('hidden');
            e.target.value = '';
            showCustomAlert(t('alert_invalid_json_title'), t('alert_invalid_json_msg'));
        }
    };
    reader.readAsText(file);
});

// ==========================================
// SESSION STAGES & LERN-FLOW
// ==========================================
let sessionStages = [];
let currentStageIndex = 0;
let sessionInitialCount = 0;
let masteredCount = 0;
let isCrammingMode = false;
let isSessionActive = false;
let currentWordObj = null;
let statsPerfect = 0;
let statsErrors = 0;
let sessionStartTime = 0;
let sessionWordRecords = new Map();

let matchSelectedCard = null;
let matchPairsLeft = 0;

let isSentenceLessonMode = false;
let currentSentenceInputMode = 'tiles';
let tileDistractorsPool = [];
let assembledSentenceTokens = [];

function stopAudio() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
}

// ==========================================
// OPTIMIERTE SPRACHAUSGABE
// ==========================================
let availableVoices = [];

function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    availableVoices = window.speechSynthesis.getVoices();
}

if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
}

function getBestVoice(langCode) {
    if (!availableVoices.length && ('speechSynthesis' in window)) {
        availableVoices = window.speechSynthesis.getVoices();
    }
    if (!availableVoices.length) return null;

    const isOnline = navigator.onLine !== false;
    const targetLang = (langCode || 'en-US').toLowerCase().replace('_', '-');
    const shortLang = targetLang.split('-')[0];

    const matchingVoices = availableVoices.filter(v => {
        const vLang = v.lang.toLowerCase().replace('_', '-');
        return vLang === targetLang || vLang.startsWith(shortLang);
    });

    if (matchingVoices.length === 0) return null;

    const isExact = v => v.lang.toLowerCase().replace('_', '-') === targetLang;
    const isOnlineVoice = v => v.localService === false;
    const isLocalVoice = v => v.localService === true || v.localService === undefined;

    if (!isOnline) {
        if (!settingOfflineVoice) return null;

        let localMatch = matchingVoices.find(v => isExact(v) && isLocalVoice(v));
        if (localMatch) return localMatch;

        return matchingVoices.find(v => isLocalVoice(v)) || null;
    }

    let match = matchingVoices.find(v => isExact(v) && isOnlineVoice(v));
    if (match) return match;

    match = matchingVoices.find(v => isOnlineVoice(v));
    if (match) return match;

    match = matchingVoices.find(v => isExact(v) && isLocalVoice(v));
    if (match) return match;

    return matchingVoices[0] || null;
}

function speak(rawText) {
    if (!window.speechSynthesis) return;

    const isOnline = navigator.onLine !== false;
    if (!isOnline && !settingOfflineVoice) return;

    const bestVoice = getBestVoice(currentLangCode);
    if (!bestVoice) return;

    if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
    }

    const isSent = currentWordObj && currentWordObj.type === 'sentence';
    const parsed = parseVocabField(rawText, isSent);
    const speakText = parsed.firstSpeechText || rawText.trim();
    if (!speakText) return;

    const utterance = new SpeechSynthesisUtterance(speakText);
    utterance.lang = currentLangCode;
    utterance.voice = bestVoice;

    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        setTimeout(() => {
            window.speechSynthesis.speak(utterance);
        }, 15);
    } else {
        window.speechSynthesis.speak(utterance);
    }
}

replayAudioBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentWordObj && currentWordObj.foreign) {
        speak(currentWordObj.foreign);
    }
});

feedbackAudioBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentWordObj && currentWordObj.foreign) {
        speak(currentWordObj.foreign);
    }
});

function partitionNewWords(words) {
    const N = words.length;
    if (N <= 5) return [words];
    const K = Math.ceil(N / 5);
    const b = Math.floor(N / K);
    const r = N % K;
    const chunks = [];
    let idx = 0;
    for (let i = 0; i < K; i++) {
        const size = i < r ? b + 1 : b;
        chunks.push(words.slice(idx, idx + size));
        idx += size;
    }
    return chunks;
}

document.getElementById('startSmartLessonBtn').addEventListener('click', async () => {
    if (!currentLangId) return promptAddLanguage();
    const sourceGroup = document.getElementById('smartLessonSource').value;
    const allItems = await getWordsByLanguage(currentLangId);

    // STRIKTER FILTER: Nur echte Vokabeln (KEINE Sätze!)
    const words = allItems.filter(w => w.type !== 'sentence');

    // SPERRE 1: Mindestens 10 echte Vokabeln in der Sprache erforderlich
    if (words.length < 10) {
        return showCustomAlert(
            t('alert_too_few_words_title'),
            t('alert_too_few_words_msg', { count: words.length })
        );
    }

    const endOfToday = getEndOfDay(new Date());

    // 1. Heute fällige Wörter ermitteln (strikter Ausschluss von Sätzen)
    let dueWords = words
        .filter(w => w.level > 0 && w.nextDue <= endOfToday)
        .sort((a, b) => {
            if (b.troubleWord && !a.troubleWord) return 1;
            if (!b.troubleWord && a.troubleWord) return -1;
            return 0.5 - Math.random();
        });

    // 2. Verfügbare neue Wörter ermitteln (nur Wörter)
    let candidateNewWords = words.filter(w => w.level === 0);
    if (sourceGroup === '__NONE__') {
        candidateNewWords = candidateNewWords.filter(w => !w.group);
    } else if (sourceGroup !== 'ALL') {
        candidateNewWords = candidateNewWords.filter(w => w.group === sourceGroup);
    }

    // SPERRE 2: Weder fällige noch neue Wörter vorhanden
    if (dueWords.length === 0 && candidateNewWords.length === 0) {
        return showCustomAlert(
            t('alert_all_done_title'),
            t('alert_all_done_msg')
        );
    }

    // Feste Lektionsgröße: Genau 10 Wörter
    const targetCount = 10;
    let selectedWords = dueWords.slice(0, targetCount);

    // Mit neuen Wörtern auffüllen
    if (selectedWords.length < targetCount) {
        const needed = targetCount - selectedWords.length;
        const newWords = candidateNewWords.sort(() => 0.5 - Math.random()).slice(0, needed);
        selectedWords = selectedWords.concat(newWords);
    }

    // Füllmaterial aus der Zukunft (nur Wörter!)
    if (selectedWords.length < targetCount) {
        const needed = targetCount - selectedWords.length;
        const selectedIds = new Set(selectedWords.map(w => w.id));

        const futureWords = words
            .filter(w => w.level > 0 && w.nextDue > endOfToday && !selectedIds.has(w.id))
            .sort((a, b) => a.nextDue - b.nextDue);

        const fillers = futureWords.slice(0, needed).map(w => ({
            ...w,
            isFiller: true
        }));

        selectedWords = selectedWords.concat(fillers);
    }

    // isSentenceLesson = false garantieren
    startSessionFlow(selectedWords, false, false);
});

document.getElementById('startSentenceLessonBtn').addEventListener('click', async () => {
    if (!currentLangId) return promptAddLanguage();
    const sourceGroup = document.getElementById('smartSentenceLessonSource').value;
    const words = await getWordsByLanguage(currentLangId);
    const sentences = words.filter(w => w.type === 'sentence');

    if (sentences.length === 0) {
        return showCustomAlert(t('alert_no_sentences_title'), t('alert_no_sentences_msg'));
    }

    const endOfToday = getEndOfDay(new Date());

    let dueSentences = sentences
        .filter(w => w.level > 0 && w.nextDue <= endOfToday)
        .sort((a, b) => (b.troubleWord ? 1 : 0) - (a.troubleWord ? 1 : 0));

    let candidateNew = sentences.filter(w => w.level === 0);
    if (sourceGroup === '__NONE__') candidateNew = candidateNew.filter(w => !w.group);
    else if (sourceGroup !== 'ALL') candidateNew = candidateNew.filter(w => w.group === sourceGroup);

    if (dueSentences.length === 0 && candidateNew.length === 0) {
        return showCustomAlert(t('alert_all_done_title'), t('alert_all_done_msg'));
    }

    const targetCount = Math.min(5, sentences.length);
    let selected = dueSentences.slice(0, targetCount);

    if (selected.length < targetCount) {
        const needed = targetCount - selected.length;
        const newItems = candidateNew.sort(() => 0.5 - Math.random()).slice(0, needed);
        selected = selected.concat(newItems);
    }

    if (selected.length < targetCount) {
        const needed = targetCount - selected.length;
        const selectedIds = new Set(selected.map(w => w.id));
        const futureItems = sentences
            .filter(w => w.level > 0 && w.nextDue > endOfToday && !selectedIds.has(w.id))
            .sort((a, b) => a.nextDue - b.nextDue);
        selected = selected.concat(futureItems.slice(0, needed).map(w => ({ ...w, isFiller: true })));
    }

    startSessionFlow(selected, false, true);
});

document.getElementById('startCramBtn').addEventListener('click', async () => {
    if (!currentLangId) return promptAddLanguage();
    const typeFilter = document.getElementById('cramTypeFilter').value;
    const group = document.getElementById('cramGroup').value;
    const limit = parseInt(document.getElementById('cramBatchSize').value, 10) || 10;
    let words = await getWordsByLanguage(currentLangId);

    if (typeFilter === 'WORDS') words = words.filter(w => w.type !== 'sentence');
    else if (typeFilter === 'SENTENCES') words = words.filter(w => w.type === 'sentence');

    let cramWords = [];
    const startOfToday = getStartOfDay(new Date());

    if (group === '__ALL_WORDS__') {
        cramWords = [...words].sort(() => 0.5 - Math.random());
    } else if (group === '__NO_GROUP__') {
        cramWords = words.filter(w => !w.group).sort(() => 0.5 - Math.random());
    } else if (group === '__NEW_TODAY__') {
        cramWords = words.filter(w => w.lastLearned && w.lastLearned >= startOfToday && w.firstLearned && w.firstLearned >= startOfToday).sort(() => 0.5 - Math.random());
    } else if (group === '__ALL_TODAY__') {
        cramWords = words.filter(w => w.lastLearned && w.lastLearned >= startOfToday).sort(() => 0.5 - Math.random());
    } else {
        cramWords = words.filter(w => w.group === group).sort(() => 0.5 - Math.random());
    }

    if (cramWords.length === 0) return showCustomAlert(t('alert_no_words_export_title'), t('alert_cram_empty_msg'));

    cramWords = cramWords.slice(0, limit);
    startSessionFlow(cramWords, true, typeFilter === 'SENTENCES');
});

function startSessionFlow(wordArray, isCramming, isSentenceLesson = false) {
    stopAudio();
    stopAudioEffects();
    sessionStartTime = Date.now();
    isCrammingMode = isCramming;
    isSentenceLessonMode = isSentenceLesson;
    sessionInitialCount = wordArray.length;
    masteredCount = 0;
    statsPerfect = 0;
    statsErrors = 0;
    isSessionActive = true;
    pushNavState({ view: 'session' });
    sessionStages = [];
    currentStageIndex = 0;

    sessionWordRecords = new Map();
    wordArray.forEach(w => {
        sessionWordRecords.set(w.id, {
            id: w.id,
            german: w.german,
            foreign: w.foreign,
            type: w.type || 'word',
            initialLevel: w.level || 0,
            finalLevel: w.level || 0,
            errors: 0,
            isFiller: !!w.isFiller
        });
    });

    const reviewWords = wordArray.filter(w => w.level > 0);
    const newWords = wordArray.filter(w => w.level === 0);

    const hasOnlySentences = wordArray.every(w => w.type === 'sentence');

    if (isCrammingMode) {
        sessionStages.push({ type: 'TYPING', words: wordArray, title: t('matching_stage_title_cram') });
        // Keine Blitzrunden für Sätze!
        if (wordArray.length >= 2 && !hasOnlySentences) {
            const blitzWords = wordArray.filter(w => w.type !== 'sentence');
            if (blitzWords.length >= 2) {
                sessionStages.push({ type: 'BLITZ', subType: 'OUTRO', words: blitzWords, title: t('matching_outro_title'), subTitle: t('matching_subtitle') });
            }
        }
    } else if (isSentenceLessonMode) {
        // Reine Satz-Lektion: Nie eine Blitzrunde!
        sessionStages.push({ type: 'TYPING', words: wordArray, title: t('start_sentence_lesson_title') });
    } else {
        // Normale Vokabel-Lektion
        const wordsOnly = wordArray.filter(w => w.type !== 'sentence');
        if (reviewWords.length > 0) {
            sessionStages.push({ type: 'TYPING', words: reviewWords, title: t('matching_stage_title_due') });
        }

        if (newWords.length >= 5 && wordsOnly.length >= 5) {
            const chunks = partitionNewWords(newWords);
            chunks.forEach((chunk) => {
                sessionStages.push({
                    type: 'BLITZ',
                    subType: 'INTRO',
                    words: chunk.filter(w => w.type !== 'sentence'),
                    title: t('matching_intro_title', { count: chunk.length }),
                    subTitle: t('matching_subtitle')
                });
                sessionStages.push({ type: 'TYPING', words: chunk, title: t('matching_stage_title_new') });
                sessionStages.push({
                    type: 'BLITZ',
                    subType: 'OUTRO',
                    words: chunk.filter(w => w.type !== 'sentence'),
                    title: t('matching_outro_title'),
                    subTitle: t('matching_subtitle')
                });
            });
        } else if (newWords.length > 0) {
            sessionStages.push({ type: 'TYPING', words: newWords, title: t('matching_stage_title_new_simple') });
            if (sessionInitialCount >= 2 && wordsOnly.length >= 2) {
                sessionStages.push({
                    type: 'BLITZ',
                    subType: 'OUTRO',
                    words: wordsOnly,
                    title: t('matching_outro_title'),
                    subTitle: t('matching_subtitle')
                });
            }
        } else if (reviewWords.length >= 2 && wordsOnly.length >= 2) {
            sessionStages.push({
                type: 'BLITZ',
                subType: 'OUTRO',
                words: wordsOnly,
                title: t('matching_outro_title'),
                subTitle: t('matching_subtitle')
            });
        }
    }

    document.getElementById('appHeader').classList.add('hidden');
    document.getElementById('appMain').classList.add('hidden');
    document.getElementById('bottomNav').classList.add('hidden');
    document.getElementById('sessionScreen').classList.remove('hidden');

    updateProgress();
    runStage(0);
}

function updateProgress() {
    const pct = sessionInitialCount > 0 ? (Math.min(masteredCount, sessionInitialCount) / sessionInitialCount) * 100 : 0;
    document.getElementById('progressBar').style.width = `${pct}%`;
    document.getElementById('progressText').textContent = `${Math.min(masteredCount, sessionInitialCount)}/${sessionInitialCount}`;
}

let stageQueue = [];
function runStage(index) {
    if (!isSessionActive) return;
    if (index >= sessionStages.length) {
        return finishSession();
    }
    currentStageIndex = index;
    const stage = sessionStages[index];

    if (stage.type === 'BLITZ') {
        startBlitzStage(stage);
    } else {
        startTypingStage(stage);
    }
}

function advanceStage() {
    runStage(currentStageIndex + 1);
}

function startTypingStage(stage) {
    standardSessionArea.classList.remove('hidden');
    matchingSessionArea.classList.add('hidden');
    matchingButtonContainer.classList.add('hidden');
    actionButtons.classList.remove('hidden');
    nextButtonContainer.classList.add('hidden');

    stageQueue = stage.words.map(w => {
        const isSent = (w.type === 'sentence');
        return {
            ...w,
            isBrandNew: (w.level === 0),
            isFiller: !!w.isFiller,
            troubleWord: !!w.troubleWord,
            sessionErrors: 0,
            errorsToForeign: 0,
            errorsToGerman: 0,
            helpActiveToForeign: false,
            helpActiveToGerman: false,
            needsBlindCheck: false,
            consecutiveSuccess: 0,
            targetSuccess: 2,
            // SÄTZE: Immer zuerst Fremdsprache -> Muttersprache (askForeign = false)
            askForeign: isSent ? false : (Math.random() > 0.5)
        };
    });

    nextWordInStage();
}

// Sammelt zufällige Distraktor-Wörter aus anderen Sätzen
async function fetchDistractors(targetTokens, langId) {
    const allWords = await getWordsByLanguage(langId);
    const otherSentences = allWords.filter(w => w.type === 'sentence' && w.id !== currentWordObj.id);
    const pool = [];
    otherSentences.forEach(s => {
        const p = parseVocabField(currentWordObj.askForeign ? s.foreign : s.german, true);
        if (p.variants[0]) {
            pool.push(...tokenizeSentence(p.variants[0].word));
        }
    });

    const targetSet = new Set(targetTokens.map(t => cleanBase(t)));
    const uniqueCandidates = Array.from(new Set(pool.filter(w => !targetSet.has(cleanBase(w)))));
    uniqueCandidates.sort(() => 0.5 - Math.random());
    return uniqueCandidates.slice(0, 3);
}

// ==========================================
// KACHEL-ENGINE (DRAG & DROP)
// ==========================================

// Globaler Platzhalter (verhindert Mehrfach-Lücken)
let globalDragPlaceholder = null;
let dragActiveTile = null;
let dragOriginArea = null;
let dragStartX = 0;
let dragStartY = 0;
let dragHasMoved = false;

function renderSentenceBoard(correctTokens, distractorTokens) {
    const board = document.getElementById('sentenceBoard');
    const slot = document.getElementById('sentenceSlot');
    const pool = document.getElementById('sentencePool');
    const placeholderText = document.getElementById('sentenceSlotPlaceholder');

    board.classList.remove('hidden');
    slot.innerHTML = '';
    slot.appendChild(placeholderText);
    placeholderText.classList.remove('hidden');
    pool.innerHTML = '';
    assembledSentenceTokens = [];

    const allTokens = [
        ...correctTokens.map((text, i) => ({ id: `token_c_${i}`, text, isDistractor: false })),
        ...distractorTokens.map((text, i) => ({ id: `token_d_${i}`, text, isDistractor: true }))
    ].sort(() => 0.5 - Math.random());

    allTokens.forEach(item => {
        const poolSlot = document.createElement('div');
        poolSlot.className = 'pool-tile-slot';

        const tile = document.createElement('div');
        tile.className = 'sentence-tile';
        if (item.isDistractor) tile.classList.add('distractor');
        tile.textContent = item.text;
        tile.dataset.id = item.id;
        tile.dataset.text = item.text;
        tile._originPoolSlot = poolSlot;

        poolSlot.appendChild(tile);
        pool.appendChild(poolSlot);

        requestAnimationFrame(() => {
            const w = tile.getBoundingClientRect().width;
            poolSlot.style.width = `${w}px`;
        });

        // Einheitlicher Pointer-Listener für JEDE Kachel (unten & oben)
        attachTilePointerEvents(tile);
    });
}

function attachTilePointerEvents(tile) {
    tile.addEventListener('pointerdown', (e) => {
        if (e.button && e.button !== 0) return;

        dragActiveTile = tile;
        dragOriginArea = tile.parentElement.classList.contains('pool-tile-slot') ? 'pool' : 'slot';
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragHasMoved = false;

        tile.setPointerCapture(e.pointerId);
    });

    tile.addEventListener('pointermove', (e) => {
        if (!dragActiveTile || dragActiveTile !== tile) return;

        const dist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);

        // Erst ab 18px Bewegung startet das Ziehen (saubere Touch-Erkennung)
        if (!dragHasMoved && dist > 18) {
            dragHasMoved = true;

            const rect = tile.getBoundingClientRect();
            if (!globalDragPlaceholder) {
                globalDragPlaceholder = document.createElement('div');
                globalDragPlaceholder.className = 'sentence-tile-placeholder';
            }
            globalDragPlaceholder.style.width = `${rect.width}px`;

            // Wenn aus dem Slot gezogen: Lücke zunächst an alter Position halten
            if (dragOriginArea === 'slot') {
                const slot = document.getElementById('sentenceSlot');
                slot.insertBefore(globalDragPlaceholder, tile);
            }

            tile.classList.add('is-dragging');
        }

        if (dragHasMoved) {
            // Kachel folgt flüssig dem Finger / Cursor
            const rect = tile.getBoundingClientRect();
            tile.style.left = `${e.clientX - rect.width / 2}px`;
            tile.style.top = `${e.clientY - rect.height / 2}px`;

            const slot = document.getElementById('sentenceSlot');
            const slotRect = slot.getBoundingClientRect();

            // Prüfen, ob der Zeiger sich im / nahe am Satz-Kasten befindet
            const isOverSlot = (
                e.clientX >= slotRect.left - 25 &&
                e.clientX <= slotRect.right + 25 &&
                e.clientY >= slotRect.top - 20 &&
                e.clientY <= slotRect.bottom + 25
            );

            if (isOverSlot) {
                slot.classList.add('drag-over');

                // Platzhaltertext ausblenden, solange eine Kachel drüber schwebt
                const placeholderText = document.getElementById('sentenceSlotPlaceholder');
                if (placeholderText) placeholderText.classList.add('hidden');

                // Alle echten Kacheln im Slot (ohne Platzhalter und ohne gezogene Kachel)
                const siblings = Array.from(slot.querySelectorAll('.sentence-tile:not(.is-dragging)'));

                if (siblings.length === 0) {
                    if (globalDragPlaceholder.parentElement !== slot) {
                        slot.appendChild(globalDragPlaceholder);
                    }
                    return;
                }

                // 1. KACHELN NACH ZEILEN (Y-ACHSE) GRUPPIEREN
                const rows = [];
                siblings.forEach((sib, index) => {
                    const r = sib.getBoundingClientRect();
                    let row = rows.find(rw => Math.abs(rw.top - r.top) < 18);
                    if (!row) {
                        row = { top: r.top, bottom: r.bottom, items: [] };
                        rows.push(row);
                    } else {
                        row.top = Math.min(row.top, r.top);
                        row.bottom = Math.max(row.bottom, r.bottom);
                    }
                    row.items.push({ sib, rect: r, index });
                });
                rows.sort((a, b) => a.top - b.top);

                // 2. DIE RICHTIGE ZEILE ERMITTELN
                let targetRow = rows[0];
                if (e.clientY < rows[0].top + 10) {
                    targetRow = rows[0];
                } else if (e.clientY > rows[rows.length - 1].bottom - 10) {
                    targetRow = rows[rows.length - 1];
                } else {
                    let minDist = Infinity;
                    for (const rw of rows) {
                        const midY = (rw.top + rw.bottom) / 2;
                        const d = Math.abs(e.clientY - midY);
                        if (d < minDist) {
                            minDist = d;
                            targetRow = rw;
                        }
                    }
                }

                // 3. INNERHALB DER ZEILE DIE DEFINIERTE SNAP-ZONE FINDEN
                const items = targetRow.items;
                let targetIndex = items[0].index;

                if (e.clientX < items[0].rect.left + items[0].rect.width * 0.4) {
                    // Links vor das erste Wort der Zeile
                    targetIndex = items[0].index;
                } else if (e.clientX > items[items.length - 1].rect.right - items[items.length - 1].rect.width * 0.4) {
                    // Rechts hinter das letzte Wort der Zeile
                    targetIndex = items[items.length - 1].index + 1;
                } else {
                    // Zwischen zwei Wörtern der Zeile anhand der Kachelmitten
                    for (let k = 0; k < items.length; k++) {
                        const r = items[k].rect;
                        const midX = r.left + r.width / 2;
                        if (e.clientX < midX) {
                            targetIndex = items[k].index;
                            break;
                        } else {
                            targetIndex = items[k].index + 1;
                        }
                    }
                }

                // 4. LÜCKE MAGNETISCH EINRASTEN (Nur ins DOM eingreifen, wenn die Position wechselt)
                const targetRef = siblings[targetIndex] || null;
                if (globalDragPlaceholder.parentElement !== slot || globalDragPlaceholder.nextElementSibling !== targetRef) {
                    if (targetRef) {
                        slot.insertBefore(globalDragPlaceholder, targetRef);
                    } else {
                        slot.appendChild(globalDragPlaceholder);
                    }
                }
            } else {
                // Außerhalb des Satz-Kastens: Lücke schließt sich
                slot.classList.remove('drag-over');
                if (globalDragPlaceholder && globalDragPlaceholder.parentElement) {
                    globalDragPlaceholder.remove();
                }
                const placeholderText = document.getElementById('sentenceSlotPlaceholder');
                const tilesInSlot = slot.querySelectorAll('.sentence-tile:not(.is-dragging)');
                if (placeholderText && tilesInSlot.length === 0) {
                    placeholderText.classList.remove('hidden');
                }
            }
        }
    });

    const onPointerEnd = (e) => {
        if (!dragActiveTile || dragActiveTile !== tile) return;
        tile.releasePointerCapture(e.pointerId);

        const slot = document.getElementById('sentenceSlot');
        slot.classList.remove('drag-over');

        if (!dragHasMoved) {
            // === FALL A: REINES ANTIPPEN (TAP-TO-FLY) ===
            cleanupDragStyles(tile);
            if (dragOriginArea === 'pool') {
                flyTileToSlot(tile, tile._originPoolSlot);
            } else {
                flyTileBackToPool(tile);
            }
        } else {
            // === FALL B: ECHTES ZIEHEN (DRAG & DROP) ===
            cleanupDragStyles(tile);

            const isPlaceholderInSlot = globalDragPlaceholder && globalDragPlaceholder.parentElement === slot;

            if (isPlaceholderInSlot) {
                // Präzise in die magnetische Lücke einsetzen
                slot.insertBefore(tile, globalDragPlaceholder);
                globalDragPlaceholder.remove();
                updateAssembledTokens();
            } else {
                // Außerhalb fallen gelassen -> Zurück in den Pool
                if (globalDragPlaceholder && globalDragPlaceholder.parentElement) {
                    globalDragPlaceholder.remove();
                }
                flyTileBackToPool(tile);
            }
        }

        dragActiveTile = null;
        dragHasMoved = false;
    };

    tile.addEventListener('pointerup', onPointerEnd);
    tile.addEventListener('pointercancel', onPointerEnd);
}

function cleanupDragStyles(tile) {
    tile.classList.remove('is-dragging');
    tile.style.position = '';
    tile.style.left = '';
    tile.style.top = '';
    tile.style.width = '';
}

// FLIP-Animation: Fliegt geschmeidig vom Startplatz nach oben in die Zeile
function flyTileToSlot(tile, poolSlot) {
    const slot = document.getElementById('sentenceSlot');
    const r1 = tile.getBoundingClientRect();

    tile._originPoolSlot = poolSlot;
    slot.appendChild(tile);

    const r2 = tile.getBoundingClientRect();
    const dx = r1.left - r2.left;
    const dy = r1.top - r2.top;

    tile.style.transform = `translate(${dx}px, ${dy}px)`;
    tile.style.transition = 'none';

    void tile.offsetWidth; // Reflow erzwingen

    tile.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)';
    tile.style.transform = 'translate(0, 0)';

    const onEnd = () => {
        tile.style.transition = '';
        tile.style.transform = '';
        tile.removeEventListener('transitionend', onEnd);
    };
    tile.addEventListener('transitionend', onEnd);

    updateAssembledTokens();
}

// FLIP-Animation: Fliegt zurück auf Startplatz + obere Kacheln schließen Lücke
function flyTileBackToPool(tile) {
    const slot = document.getElementById('sentenceSlot');
    const poolSlot = tile._originPoolSlot;
    if (!poolSlot) return;

    // 1. Positionen der nachfolgenden Kacheln vor dem Entfernen messen
    const siblings = Array.from(slot.querySelectorAll('.sentence-tile'));
    const tileIdx = siblings.indexOf(tile);
    const sibsToShift = siblings.slice(tileIdx + 1);
    const sibPositionsBefore = sibsToShift.map(s => s.getBoundingClientRect());

    // 2. Startkoordinaten der Kachel
    const r1 = tile.getBoundingClientRect();

    // 3. Zurück in den Pool-Slot hängen
    poolSlot.appendChild(tile);
    const r2 = tile.getBoundingClientRect();

    // 4. Obere Nachfolger nach links aufrücken lassen
    sibsToShift.forEach((sib, i) => {
        const rectAfter = sib.getBoundingClientRect();
        const sDx = sibPositionsBefore[i].left - rectAfter.left;
        const sDy = sibPositionsBefore[i].top - rectAfter.top;

        sib.style.transform = `translate(${sDx}px, ${sDy}px)`;
        sib.style.transition = 'none';
        void sib.offsetWidth;
        sib.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1)';
        sib.style.transform = 'translate(0, 0)';

        const onSibEnd = () => {
            sib.style.transition = '';
            sib.style.transform = '';
            sib.removeEventListener('transitionend', onSibEnd);
        };
        sib.addEventListener('transitionend', onSibEnd);
    });

    // 5. Kachel nach unten fliegen lassen
    const dx = r1.left - r2.left;
    const dy = r1.top - r2.top;

    tile.style.transform = `translate(${dx}px, ${dy}px)`;
    tile.style.transition = 'none';
    void tile.offsetWidth;

    tile.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)';
    tile.style.transform = 'translate(0, 0)';

    const onEnd = () => {
        tile.style.transition = '';
        tile.style.transform = '';
        tile.removeEventListener('transitionend', onEnd);
    };
    tile.addEventListener('transitionend', onEnd);

    updateAssembledTokens();
}

function updateAssembledTokens() {
    const slot = document.getElementById('sentenceSlot');
    const placeholder = document.getElementById('sentenceSlotPlaceholder');
    const tiles = Array.from(slot.querySelectorAll('.sentence-tile:not(.sentence-tile-placeholder):not(.is-dragging)'));
    assembledSentenceTokens = tiles.map(t => t.dataset.text);

    if (placeholder) {
        if (tiles.length === 0) placeholder.classList.remove('hidden');
        else placeholder.classList.add('hidden');
    }

    const checkBtn = document.getElementById('checkBtn');
    if (checkBtn && currentSentenceInputMode === 'tiles' && currentWordObj && currentWordObj.type === 'sentence') {
        checkBtn.disabled = assembledSentenceTokens.length === 0;
    }
}

// Drag & Drop: Unterscheidet Antippen (Klick) von echtem Ziehen (Reorder)
function initSlotDragAndDrop(slot, pool) {
    let activeTile = null;
    let placeholder = null;
    let startX = 0, startY = 0;
    let hasMoved = false;

    slot.addEventListener('pointerdown', (e) => {
        const tile = e.target.closest('.sentence-tile');
        if (!tile || tile.parentElement !== slot) return;

        activeTile = tile;
        startX = e.clientX;
        startY = e.clientY;
        hasMoved = false;

        const rect = tile.getBoundingClientRect();
        placeholder = document.createElement('div');
        placeholder.className = 'sentence-tile-placeholder';
        placeholder.style.width = `${rect.width}px`;

        tile.setPointerCapture(e.pointerId);
    });

    slot.addEventListener('pointermove', (e) => {
        if (!activeTile) return;

        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (!hasMoved && dist > 6) {
            hasMoved = true;
            slot.insertBefore(placeholder, activeTile);
            activeTile.classList.add('is-dragging');
        }

        if (hasMoved) {
            const rect = activeTile.getBoundingClientRect();
            activeTile.style.left = `${e.clientX - rect.width / 2}px`;
            activeTile.style.top = `${e.clientY - rect.height / 2}px`;

            // Über Geschwister bewegen -> Lücke dynamisch verschieben
            const siblings = Array.from(slot.querySelectorAll('.sentence-tile:not(.is-dragging)'));
            for (let sib of siblings) {
                const r = sib.getBoundingClientRect();
                if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
                    if (e.clientX < r.left + r.width / 2) {
                        slot.insertBefore(placeholder, sib);
                    } else {
                        slot.insertBefore(placeholder, sib.nextSibling);
                    }
                    break;
                }
            }
        }
    });

    const endDrag = (e) => {
        if (!activeTile) return;
        activeTile.releasePointerCapture(e.pointerId);

        if (!hasMoved) {
            // Reines Antippen in der Zeile -> Fliegt zurück in den Pool!
            if (placeholder && placeholder.parentElement) placeholder.remove();
            activeTile.classList.remove('is-dragging');
            activeTile.style.position = '';
            activeTile.style.left = '';
            activeTile.style.top = '';
            flyTileBackToPool(activeTile);
        } else {
            activeTile.classList.remove('is-dragging');
            activeTile.style.position = '';
            activeTile.style.left = '';
            activeTile.style.top = '';

            const poolRect = pool.getBoundingClientRect();
            // Nach unten Richtung Pool gezogen? -> Zurücklegen
            if (e.clientY > poolRect.top - 20) {
                if (placeholder && placeholder.parentElement) placeholder.remove();
                flyTileBackToPool(activeTile);
            } else {
                if (placeholder && placeholder.parentElement) {
                    slot.insertBefore(activeTile, placeholder);
                    placeholder.remove();
                }
                updateAssembledTokens();
            }
        }

        activeTile = null;
        placeholder = null;
        hasMoved = false;
    };

    slot.addEventListener('pointerup', endDrag);
    slot.addEventListener('pointercancel', endDrag);
}

function renderHintOptions(currentWord, stageWords, askForeign) {
    const container = document.getElementById('hintOptionsContainer');
    if (!container) return;
    container.innerHTML = '';

    const getCleanForm = (raw) => {
        const p = parseVocabField(raw);
        if (p.variants && p.variants.length > 0) {
            const v = p.variants[0];
            const art = v.article ? (v.article.endsWith("'") || v.article.endsWith("’") ? v.article : `${v.article} `) : '';
            return `${art}${v.word}`.trim();
        }
        return p.display;
    };

    const targetRaw = askForeign ? currentWord.foreign : currentWord.german;
    const targetClean = getCleanForm(targetRaw);

    const otherWords = stageWords.filter(w => w.id !== currentWord.id);
    const shuffledOthers = otherWords.sort(() => 0.5 - Math.random());
    const distractors = [];

    for (let w of shuffledOthers) {
        if (distractors.length >= 3) break;
        const distRaw = askForeign ? w.foreign : w.german;
        const distClean = getCleanForm(distRaw);
        if (distClean !== targetClean && !distractors.includes(distClean)) {
            distractors.push(distClean);
        }
    }

    const allOptions = [targetClean, ...distractors].sort(() => 0.5 - Math.random());

    allOptions.forEach(optText => {
        const card = document.createElement('div');
        card.className = 'hint-option-card';
        card.textContent = optText;
        card.addEventListener('click', () => {
            const input = document.getElementById('answerInput');
            input.value = optText;
            input.focus();
        });
        container.appendChild(card);
    });

    container.classList.remove('hidden');
}

async function nextWordInStage() {
    if (!isSessionActive) return;
    stopAudio();
    document.getElementById('answerInput').value = '';
    document.getElementById('answerInput').disabled = false;
    document.getElementById('feedbackBox').classList.add('hidden');
    actionButtons.classList.remove('hidden');
    nextButtonContainer.classList.add('hidden');
    feedbackAudioBtn.classList.add('hidden');
    feedbackStreakText.textContent = '';

    const hintContainer = document.getElementById('hintOptionsContainer');
    if (hintContainer) {
        hintContainer.classList.add('hidden');
        hintContainer.innerHTML = '';
    }

    if (stageQueue.length === 0) {
        return advanceStage();
    }

    currentWordObj = stageQueue.shift();

    const isSent = (currentWordObj.type === 'sentence');
    const board = document.getElementById('sentenceBoard');
    const keyboardArea = document.getElementById('keyboardInputArea');
    const toggleWrap = document.getElementById('toggleInputModeWrap');
    const toggleBtn = document.getElementById('toggleInputModeBtn');

    // 1. Hilfekarten bei normalen Wörtern
    if (!isSent) {
        const isHelpNeeded = currentWordObj.askForeign
            ? currentWordObj.helpActiveToForeign
            : currentWordObj.helpActiveToGerman;

        if (isHelpNeeded) {
            const stageWords = sessionStages[currentStageIndex]?.words || [];
            renderHintOptions(currentWordObj, stageWords, currentWordObj.askForeign);
        }
    }

    // 2. Frage & Richtungstext anzeigen
    const questionWordEl = document.getElementById('questionWord');
    let displayText = '';

    if (currentWordObj.askForeign) {
        document.getElementById('questionDirection').textContent = t('translate_to_target', { target: currentBaseLangName });
        displayText = parseVocabField(currentWordObj.german, isSent).display;
        questionFlag.src = cachedNativeFlag || await ensureNativeFlag();
        questionFlag.alt = getNativeLanguageName();
        replayAudioBtn.classList.add('hidden');
    } else {
        document.getElementById('questionDirection').textContent = t('translate_to_native');
        displayText = parseVocabField(currentWordObj.foreign, isSent).display;
        questionFlag.src = currentLangFlagSrc || `https://flagcdn.com/h120/${getCountryCode(currentLangCode)}.png`;
        questionFlag.alt = currentBaseLangName;
        replayAudioBtn.classList.remove('hidden');
        if (settingAutoSpeak) {
            speak(currentWordObj.foreign);
        }
    }

    questionWordEl.textContent = displayText;

    if (displayText.length > 70) {
        questionWordEl.style.fontSize = '0.9rem';
    } else if (displayText.length > 50) {
        questionWordEl.style.fontSize = '1.2rem';
    } else if (displayText.length > 30) {
        questionWordEl.style.fontSize = '1.3rem';
    } else if (displayText.length > 20) {
        questionWordEl.style.fontSize = '1.4rem';
    } else if (displayText.length > 10) {
        questionWordEl.style.fontSize = '1.7rem';
    } else {
        questionWordEl.style.fontSize = '2.3rem';
    }
    questionFlag.classList.remove('hidden');

    if (currentWordObj.isBrandNew) {
        newWordBadge.classList.remove('hidden');
    } else {
        newWordBadge.classList.add('hidden');
    }

    // 3. Stufen-Einteilung & Satzbau-Steuerung
    if (isSent) {
        let allowTiles = false;
        let distractorCount = 0;

        if (currentWordObj.level <= 2) {
            allowTiles = true;
            distractorCount = 0; // Stufe 0-2: Reine Kacheln, 0 Fallen
        } else if (currentWordObj.level <= 5) {
            allowTiles = true;
            distractorCount = 3; // Stufe 3-5: Kacheln + 2-3 Fallen
        } else {
            // Stufe 6+: Tastatur-Pflicht! Kacheln erscheinen erst als Rettungsanker nach Fehlern
            const isHelpNeeded = currentWordObj.askForeign
                ? currentWordObj.helpActiveToForeign
                : currentWordObj.helpActiveToGerman;
            allowTiles = isHelpNeeded;
            distractorCount = 3;
        }

        currentSentenceInputMode = allowTiles ? 'tiles' : 'keyboard';

        if (allowTiles) {
            toggleWrap.classList.remove('hidden');
            toggleBtn.textContent = t('btn_switch_to_keyboard');
            keyboardArea.classList.add('hidden');
            board.classList.remove('hidden');

            const targetStr = currentWordObj.askForeign ? currentWordObj.foreign : currentWordObj.german;
            const targetParsed = parseVocabField(targetStr, true);
            const correctTokens = tokenizeSentence(targetParsed.variants[0]?.word || '');

            fetchDistractors(correctTokens, currentWordObj.langId).then(distractors => {
                const finalDistractors = (distractorCount > 0) ? distractors : [];
                renderSentenceBoard(correctTokens, finalDistractors);
            });
        } else {
            toggleWrap.classList.add('hidden');
            keyboardArea.classList.remove('hidden');
            board.classList.add('hidden');
            // Prüfen-Button für die Tastatureingabe immer sofort freigeben!
            document.getElementById('checkBtn').disabled = false;
            document.getElementById('answerInput').focus();
        }
        // Toggle-Button: Zwischen Tastatur und Kacheln wechseln
        toggleBtn.onclick = () => {
            if (currentSentenceInputMode === 'tiles') {
                currentSentenceInputMode = 'keyboard';
                board.classList.add('hidden');
                keyboardArea.classList.remove('hidden');
                toggleBtn.textContent = t('btn_switch_to_tiles');
                document.getElementById('checkBtn').disabled = false;
                document.getElementById('answerInput').focus();
            } else {
                currentSentenceInputMode = 'tiles';
                keyboardArea.classList.add('hidden');
                board.classList.remove('hidden');
                toggleBtn.textContent = t('btn_switch_to_keyboard');
                updateAssembledTokens();
            }
        };
    } else {
        // Normales Vokabel-Wort
        board.classList.add('hidden');
        keyboardArea.classList.remove('hidden');
        toggleWrap.classList.add('hidden');
        document.getElementById('checkBtn').disabled = false;
        document.getElementById('answerInput').focus();
    }
}

document.getElementById('checkBtn').addEventListener('click', () => {
    stopAudio();
    triggerCheckOrSkip();
});

document.getElementById('answerInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation(); // VERHINDERT, dass das Event zum Fenster hochsteigt und das Feedback sofort überspringt!
        stopAudio();
        if (!nextButtonContainer.classList.contains('hidden')) {
            nextWordInStage();
        } else {
            triggerCheckOrSkip();
        }
    }
});

document.getElementById('nextBtn').addEventListener('click', () => {
    stopAudio();
    nextWordInStage();
});

function triggerCheckOrSkip() {
    if (!isSessionActive || !currentWordObj) return;

    let input = '';
    const isSent = (currentWordObj.type === 'sentence');

    if (isSent && currentSentenceInputMode === 'tiles') {
        input = assembledSentenceTokens.join(' ').trim();
    } else {
        input = document.getElementById('answerInput').value.trim();
    }

    if (!input) {
        handleResult('WRONG');
    } else {
        const targetString = currentWordObj.askForeign ? currentWordObj.foreign : currentWordObj.german;
        const matchResult = checkAnswerMatch(input, targetString, isSent);
        handleResult(matchResult);
    }
}

async function handleResult(matchResult) {
    if (!isSessionActive || !currentWordObj) return;
    stopAudio();

    // Tastatur auf Smartphones sofort schließen, damit das Feedback nicht verdeckt wird!
    const answerInputEl = document.getElementById('answerInput');
    answerInputEl.disabled = true;
    answerInputEl.blur();

    // Umschalt-Knopf (Kacheln/Tastatur) während des Feedbacks ausblenden
    const toggleWrap = document.getElementById('toggleInputModeWrap');
    if (toggleWrap) toggleWrap.classList.add('hidden');

    actionButtons.classList.add('hidden');
    nextButtonContainer.classList.remove('hidden');

    const fBox = document.getElementById('feedbackBox');
    fBox.classList.remove('hidden', 'correct', 'almost', 'wrong');

    // Sicherstellen, dass das Feedback-Fenster sofort im sichtbaren Bereich liegt
    requestAnimationFrame(() => {
        fBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    const isSent = (currentWordObj.type === 'sentence');
    const solutionString = currentWordObj.askForeign ? currentWordObj.foreign : currentWordObj.german;
    document.getElementById('correctAnswerText').textContent = parseVocabField(solutionString, isSent).display;

    replayAudioBtn.classList.remove('hidden');
    if (currentWordObj.askForeign) {
        feedbackAudioBtn.classList.remove('hidden');
    } else {
        feedbackAudioBtn.classList.add('hidden');
    }

    // --- 1. FALL: ANTWORT RICHTIG ---
    if (matchResult === 'EXACT' || matchResult === 'EXACT_HYPHEN') {
        // playAudioEffect(soundCorrect);
        fBox.classList.add('correct');
        document.getElementById('feedbackTitle').textContent = t('feedback_correct');
        if (currentWordObj.askForeign && settingAutoSpeak) speak(currentWordObj.foreign);

        const isCurrentlyUsingHelp = currentWordObj.askForeign
            ? currentWordObj.helpActiveToForeign
            : currentWordObj.helpActiveToGerman;

        if (isCurrentlyUsingHelp) {
            if (currentWordObj.askForeign) currentWordObj.helpActiveToForeign = false;
            else currentWordObj.helpActiveToGerman = false;

            currentWordObj.needsBlindCheck = true;
            feedbackStreakText.textContent = t('streak_hint_blind_check');

            const insertIdx = Math.min(stageQueue.length, 2);
            stageQueue.splice(insertIdx, 0, {
                ...currentWordObj,
                askForeign: currentWordObj.askForeign
            });
        } else {
            currentWordObj.consecutiveSuccess++;
            currentWordObj.needsBlindCheck = false;

            if (matchResult === 'EXACT_HYPHEN') {
                feedbackStreakText.textContent = t('streak_hint_spelling');
            } else {
                feedbackStreakText.textContent = " ";
            }

            if (currentWordObj.consecutiveSuccess >= currentWordObj.targetSuccess) {
                masteredCount++;
                if (currentWordObj.sessionErrors === 0) statsPerfect++;

                if (!isCrammingMode) {
                    let nL = currentWordObj.level;
                    let scheduleNeedsUpdate = false;

                    if (currentWordObj.isFiller) {
                        if (currentWordObj.sessionErrors >= 2 && nL > 1) {
                            nL = Math.max(1, nL - 1);
                            scheduleNeedsUpdate = true;
                        }
                    } else {
                        if (currentWordObj.sessionErrors === 0) {
                            nL = Math.min(10, nL + 1);
                        } else if (currentWordObj.sessionErrors >= 2 && nL > 1) {
                            nL = Math.max(1, nL - 1);
                        } else if (nL === 0) {
                            nL = 1;
                        }
                        scheduleNeedsUpdate = true;
                    }

                    currentWordObj.level = nL;

                    const rec = sessionWordRecords.get(currentWordObj.id);
                    if (rec) {
                        rec.finalLevel = nL;
                        rec.errors = currentWordObj.sessionErrors;
                    }

                    if (scheduleNeedsUpdate) {
                        currentWordObj.nextDue = await calculateNextDueSmart(nL, currentWordObj.langId);
                    }

                    const isClean = currentWordObj.sessionErrors === 0;
                    const finalTrouble = isClean ? false : (currentWordObj.troubleWord || false);

                    const now = Date.now();
                    const dbWord = {
                        id: currentWordObj.id,
                        langId: currentWordObj.langId,
                        german: currentWordObj.german,
                        foreign: currentWordObj.foreign,
                        group: currentWordObj.group || '',
                        type: currentWordObj.type || 'word',
                        level: currentWordObj.level,
                        nextDue: currentWordObj.nextDue,
                        lastLearned: now,
                        firstLearned: currentWordObj.firstLearned || now,
                        troubleWord: finalTrouble
                    };
                    await updateData('words', dbWord);
                }
            } else {
                stageQueue.push({
                    ...currentWordObj,
                    askForeign: !currentWordObj.askForeign
                });
            }
        }
        updateProgress();

        // --- 2. FALL: TIPPFEHLER (TYPO) ---
    } else if (matchResult === 'TYPO') {
        // playAudioEffect(soundWrong);
        fBox.classList.add('almost');
        document.getElementById('feedbackTitle').textContent = t('feedback_typo');
        if (currentWordObj.askForeign && settingAutoSpeak) speak(currentWordObj.foreign);

        statsErrors++;
        feedbackStreakText.textContent = t('streak_hint_spelling');

        const insertIdx = Math.min(stageQueue.length, 1);
        stageQueue.splice(insertIdx, 0, { ...currentWordObj });

        // --- 3. FALL: FALSCH ---
    } else {
        // playAudioEffect(soundWrong);
        fBox.classList.add('wrong');
        document.getElementById('feedbackTitle').textContent = t('feedback_wrong');
        statsErrors++;
        currentWordObj.sessionErrors++;
        currentWordObj.consecutiveSuccess = 0;

        const rec = sessionWordRecords.get(currentWordObj.id);
        if (rec) rec.errors = currentWordObj.sessionErrors;

        if (currentWordObj.askForeign) {
            currentWordObj.errorsToForeign++;
        } else {
            currentWordObj.errorsToGerman++;
        }

        const dirErrors = currentWordObj.askForeign
            ? currentWordObj.errorsToForeign
            : currentWordObj.errorsToGerman;

        if (currentWordObj.sessionErrors >= 4) {
            masteredCount++;
            feedbackStreakText.textContent = t('streak_hint_paused');

            if (rec) {
                rec.finalLevel = 1;
                rec.errors = currentWordObj.sessionErrors;
            }

            if (!isCrammingMode) {
                const now = Date.now();
                const dbWord = {
                    id: currentWordObj.id,
                    langId: currentWordObj.langId,
                    german: currentWordObj.german,
                    foreign: currentWordObj.foreign,
                    group: currentWordObj.group || '',
                    type: currentWordObj.type || 'word',
                    level: 1,
                    nextDue: now,
                    lastLearned: now,
                    firstLearned: currentWordObj.firstLearned || now,
                    troubleWord: true
                };
                await updateData('words', dbWord);
            }
            updateProgress();
            document.getElementById('nextBtn').focus();
            return;
        }

        const threshold = currentWordObj.troubleWord ? 1 : 2;

        if (dirErrors >= threshold) {
            if (currentWordObj.askForeign) {
                currentWordObj.helpActiveToForeign = true;
            } else {
                currentWordObj.helpActiveToGerman = true;
            }
        }

        feedbackStreakText.textContent = " ";
        if (currentWordObj.askForeign && settingAutoSpeak) speak(currentWordObj.foreign);

        const insertIdx = Math.min(stageQueue.length, 1);
        stageQueue.splice(insertIdx, 0, {
            ...currentWordObj,
            askForeign: currentWordObj.askForeign
        });
    }
    document.getElementById('nextBtn').focus();
}

// BLITZ STAGE
function startBlitzStage(stage) {
    standardSessionArea.classList.add('hidden');
    actionButtons.classList.add('hidden');
    nextButtonContainer.classList.add('hidden');
    matchingSessionArea.classList.remove('hidden');
    matchingButtonContainer.classList.remove('hidden');

    matchingMainTitle.textContent = stage.title || t('matching_title');
    matchingSubTitle.textContent = stage.subTitle || t('matching_subtitle');

    const matchItems = stage.words.slice(0, 5);
    matchPairsLeft = matchItems.length;

    matchColLeft.innerHTML = '';
    matchColRight.innerHTML = '';
    matchSelectedCard = null;

    matchingDoneBtn.disabled = true;
    matchingDoneBtn.textContent = t('btn_matching_connect');
    matchingDoneBtn.classList.add('btn-disabled');

    const leftList = matchItems.map(item => {
        const parsed = parseVocabField(item.german);
        const first = parsed.variants[0];
        let text = first ? (first.article ? (first.article.endsWith("'") ? first.article : first.article + ' ') : '') + first.word : item.german;
        if (first && first.explanation) text += ` (${first.explanation})`;
        return { id: item.id, text: text, side: 'left' };
    }).sort(() => 0.5 - Math.random());

    const rightList = matchItems.map(item => {
        const parsed = parseVocabField(item.foreign);
        const first = parsed.variants[0];
        let text = first ? (first.article ? (first.article.endsWith("'") ? first.article : first.article + ' ') : '') + first.word : item.foreign;
        if (first && first.explanation) text += ` (${first.explanation})`;
        return { id: item.id, text: text, side: 'right' };
    }).sort(() => 0.5 - Math.random());

    leftList.forEach(item => matchColLeft.appendChild(createMatchCard(item)));
    rightList.forEach(item => matchColRight.appendChild(createMatchCard(item)));
}

function createMatchCard(item) {
    const card = document.createElement('div');
    card.className = 'match-card';
    card.textContent = item.text;
    card.dataset.id = item.id;
    card.dataset.side = item.side;

    card.addEventListener('click', () => handleMatchCardClick(card, item));
    return card;
}

function handleMatchCardClick(card, item) {
    if (card.classList.contains('matched')) return;

    if (matchSelectedCard === card) {
        card.classList.remove('selected');
        matchSelectedCard = null;
        return;
    }

    if (!matchSelectedCard) {
        matchSelectedCard = card;
        card.classList.add('selected');
        return;
    }

    if (matchSelectedCard.dataset.side === card.dataset.side) {
        matchSelectedCard.classList.remove('selected');
        matchSelectedCard = card;
        card.classList.add('selected');
        return;
    }

    const firstCard = matchSelectedCard;
    const secondCard = card;
    matchSelectedCard = null;
    firstCard.classList.remove('selected');

    if (firstCard.dataset.id === secondCard.dataset.id) {
        // playAudioEffect(soundCorrect);
        firstCard.classList.add('matched');
        secondCard.classList.add('matched');

        const foreignCard = firstCard.dataset.side === 'right' ? firstCard : secondCard;
        if (settingAutoSpeak) speak(foreignCard.textContent);

        matchPairsLeft--;
        if (matchPairsLeft === 0) {
            setTimeout(() => {
                matchingDoneBtn.disabled = false;
                const isIntro = sessionStages[currentStageIndex]?.subType === 'INTRO';
                matchingDoneBtn.textContent = isIntro ? t('btn_matching_to_exercise') : t('btn_next');
                matchingDoneBtn.classList.remove('btn-disabled');
                matchingDoneBtn.focus();
            }, 50);
        }
    } else {
        // playAudioEffect(soundWrong);
        firstCard.classList.add('wrong');
        secondCard.classList.add('wrong');
        setTimeout(() => {
            firstCard.classList.remove('wrong');
            secondCard.classList.remove('wrong');
        }, 400);
    }
}

matchingDoneBtn.addEventListener('click', () => {
    if (matchingDoneBtn.disabled) return;
    matchingButtonContainer.classList.add('hidden');
    advanceStage();
});

function finishSession() {
    isSessionActive = false;
    currentWordObj = null;
    stopAudio();
    updateProgress();
    document.getElementById('sessionScreen').classList.add('hidden');
    if (!isCrammingMode) {
        onSmartLessonCompleted();
    }
    showSummaryScreen();
}

// ==========================================
// SUMMARY SCREEN & GLOBAL ENTER
// ==========================================
function showSummaryScreen() {
    // playAudioEffect(soundCompleted);
    document.getElementById('sessionScreen').classList.add('hidden');
    document.getElementById('summaryScreen').classList.remove('hidden');

    document.getElementById('summaryTitle').textContent = isCrammingMode ? t('summary_title_cram') : t('summary_title_smart');

    const correctCount = statsPerfect;
    const accuracy = sessionInitialCount > 0 ? Math.round((correctCount / sessionInitialCount) * 100) : 0;
    const elapsedMs = Date.now() - sessionStartTime;
    const timeFormatted = formatDuration(elapsedMs);

    document.getElementById('summaryAccuracy').textContent = `${accuracy}%`;
    document.getElementById('summaryTime').textContent = timeFormatted;

    const levelGrid = document.getElementById('summaryLevelGrid');
    const cramNotice = document.getElementById('summaryCramNotice');

    const records = Array.from(sessionWordRecords.values());

    if (isCrammingMode) {
        levelGrid.classList.add('hidden');
        cramNotice.classList.remove('hidden');
    } else {
        levelGrid.classList.remove('hidden');
        cramNotice.classList.add('hidden');

        let upCount = 0;
        let sameCount = 0;
        let downCount = 0;

        records.forEach(r => {
            if (r.finalLevel > r.initialLevel) upCount++;
            else if (r.finalLevel < r.initialLevel) downCount++;
            else sameCount++;
        });

        document.getElementById('sumLvlUp').textContent = upCount;
        document.getElementById('sumLvlSame').textContent = sameCount;
        document.getElementById('sumLvlDown').textContent = downCount;
    }

    const detailsContainer = document.getElementById('summaryDetailsContainer');
    const toggleBtn = document.getElementById('toggleSummaryDetailsBtn');
    detailsContainer.classList.add('hidden');
    toggleBtn.textContent = t('summary_show_details');

    const problemBox = document.getElementById('summaryProblemWordBox');
    let maxErrors = 0;
    let worstWord = null;

    records.forEach(r => {
        if (r.errors > maxErrors) {
            maxErrors = r.errors;
            worstWord = r;
        }
    });

    if (maxErrors > 0 && worstWord) {
        problemBox.className = 'summary-problem-card';
        const parsedFo = parseVocabField(worstWord.foreign, worstWord.type === 'sentence').display;
        const parsedDe = parseVocabField(worstWord.german, worstWord.type === 'sentence').display;
        problemBox.innerHTML = `
            <div class="problem-header">${t('summary_problem_title')}</div>
            <div class="problem-body">
                <div class="problem-text">
                    <strong>${parsedFo}</strong>
                    <span>${parsedDe}</span>
                </div>
                <div style="display:flex; align-items:center;">
                    <span class="problem-error-tag">${t('summary_error_count', { count: maxErrors })}</span>
                    <button type="button" class="btn-icon btn-small-audio" onclick="speak('${worstWord.foreign.replace(/'/g, "\\'")}')" title="${t('feedback_listen_title')}">🔊</button>
                </div>
            </div>
        `;
    } else {
        problemBox.className = 'summary-problem-card perfect';
        problemBox.innerHTML = t('summary_problem_perfect');
    }

    const wordListEl = document.getElementById('summaryWordList');
    wordListEl.innerHTML = '';

    records.forEach(r => {
        const row = document.createElement('div');
        row.className = 'summary-word-row';

        let lvlHtml = '';
        if (isCrammingMode) {
            lvlHtml = `<span class="lvl-badge same">${t('th_level')} ${r.initialLevel}</span>`;
        } else {
            if (r.finalLevel > r.initialLevel) {
                const startTxt = r.initialLevel === 0 ? t('lbl_lvl_0') : r.initialLevel;
                lvlHtml = `<span class="lvl-badge up">${startTxt} → ${r.finalLevel}</span>`;
            } else if (r.finalLevel < r.initialLevel) {
                lvlHtml = `<span class="lvl-badge down">${r.initialLevel} → ${r.finalLevel}</span>`;
            } else {
                lvlHtml = `<span class="lvl-badge same">${t('th_level')} ${r.initialLevel}</span>`;
            }
        }

        const errHtml = r.errors > 0 ? `<span class="word-err-badge">${r.errors}x</span>` : '';

        row.innerHTML = `
            <div class="summary-word-left">
                <span class="word-main">${parseVocabField(r.foreign, r.type === 'sentence').display}</span>
                <span class="word-sub">${parseVocabField(r.german, r.type === 'sentence').display}</span>
            </div>
            <div class="summary-word-right">
                ${errHtml}
                ${lvlHtml}
                <button type="button" class="btn-icon btn-small-audio" onclick="speak('${r.foreign.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')" title="${t('feedback_listen_title')}">🔊</button>
            </div>
        `;
        wordListEl.appendChild(row);
    });

    updateDashboard();
    setTimeout(() => document.getElementById('finishSessionBtn').focus(), 100);
}

document.getElementById('finishSessionBtn').addEventListener('click', () => {
    stopAudio();
    stopAudioEffects();
    document.getElementById('summaryScreen').classList.add('hidden');
    document.getElementById('appHeader').classList.remove('hidden');
    document.getElementById('appMain').classList.remove('hidden');
    document.getElementById('bottomNav').classList.remove('hidden');

    if (pendingStreakAnimation && pendingStreakAnimation.langId === currentLangId) {
        const anim = pendingStreakAnimation;
        pendingStreakAnimation = null;
        setTimeout(() => {
            playStreakNumberAnimation(anim.oldVal, anim.newVal);
        }, 1050);
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const sessionScreen = document.getElementById('sessionScreen');
        if (sessionScreen && !sessionScreen.classList.contains('hidden')) {
            // Wenn Feedback sichtbar ist -> Weiter
            const nextBox = document.getElementById('nextButtonContainer');
            if (nextBox && !nextBox.classList.contains('hidden')) {
                e.preventDefault();
                document.getElementById('nextBtn').click();
                return;
            }
            // Wenn Kacheln aktiv sind und Prüfen erlaubt ist -> Prüfen
            if (currentWordObj && currentWordObj.type === 'sentence' && currentSentenceInputMode === 'tiles') {
                const checkBtn = document.getElementById('checkBtn');
                if (checkBtn && !checkBtn.disabled && !checkBtn.classList.contains('hidden')) {
                    e.preventDefault();
                    triggerCheckOrSkip();
                    return;
                }
            }
        }

        if (!matchingButtonContainer.classList.contains('hidden') && !matchingSessionArea.classList.contains('hidden') && !matchingDoneBtn.disabled) {
            e.preventDefault();
            matchingDoneBtn.click();
        } else if (!document.getElementById('summaryScreen').classList.contains('hidden')) {
            e.preventDefault();
            document.getElementById('finishSessionBtn').click();
        }
    }
});

document.getElementById('cancelSessionBtn').addEventListener('click', async () => {
    stopAudio();
    stopAudioEffects();
    const shouldQuit = await showCustomConfirm(
        t('confirm_quit_session_title'),
        t('confirm_quit_session_msg'),
        t('btn_quit_session'),
        t('btn_continue_session'),
        true
    );
    if (shouldQuit) {
        isSessionActive = false;
        currentWordObj = null;
        document.getElementById('sessionScreen').classList.add('hidden');
        matchingButtonContainer.classList.add('hidden');
        document.getElementById('appHeader').classList.remove('hidden');
        document.getElementById('appMain').classList.remove('hidden');
        document.getElementById('bottomNav').classList.remove('hidden');
        updateDashboard();
    }
});

document.getElementById('toggleSummaryDetailsBtn').addEventListener('click', () => {
    const details = document.getElementById('summaryDetailsContainer');
    const btn = document.getElementById('toggleSummaryDetailsBtn');
    const isHidden = details.classList.contains('hidden');

    if (isHidden) {
        details.classList.remove('hidden');
        btn.textContent = t('summary_hide_details');
    } else {
        details.classList.add('hidden');
        btn.textContent = t('summary_show_details');
    }
});

// ==========================================
// SERVICE WORKER REGISTRIERUNG (PWA)
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('ServiceWorker erfolgreich registriert.'))
            .catch(err => console.log('ServiceWorker Fehler:', err));
    });
}

// ==========================================
// NAVIGATION & VERLAUF
// ==========================================

let lastHomeBackPressTime = 0;
let isInternalNavigation = false;

function pushNavState(state) {
    history.pushState(state, '');
}

document.getElementById('navHome').addEventListener('click', () => {
    if (!isInternalNavigation) pushNavState({ view: 'home' });
});
document.getElementById('navManager').addEventListener('click', () => {
    if (!isInternalNavigation) pushNavState({ view: 'manager' });
});
document.getElementById('navSettings').addEventListener('click', () => {
    if (!isInternalNavigation) pushNavState({ view: 'settings' });
});

document.getElementById('managerAddWordBtn').addEventListener('click', () => {
    if (currentLangId) pushNavState({ view: 'modal', modalId: 'wordModal' });
});

document.getElementById('langHeaderBtn').addEventListener('click', () => {
    pushNavState({ view: 'modal', modalId: 'languagesModal' });
});

window.addEventListener('popstate', (e) => {
    const customModal = document.getElementById('customModal');
    if (customModal && !customModal.classList.contains('hidden')) {
        const isSession = !document.getElementById('sessionScreen').classList.contains('hidden');

        if (isSession) {
            const confirmBtn = document.getElementById('customModalConfirmBtn');
            if (confirmBtn) confirmBtn.click();
        } else {
            const cancelBtn = document.getElementById('customModalCancelBtn');
            if (cancelBtn && !cancelBtn.classList.contains('hidden')) {
                cancelBtn.click();
            } else {
                const confirmBtn = document.getElementById('customModalConfirmBtn');
                if (confirmBtn) confirmBtn.click();
            }
        }
        return;
    }

    const overlay = document.getElementById('modalOverlay');
    if (overlay && !overlay.classList.contains('hidden')) {
        const renameModal = document.getElementById('renameLangModal');
        if (renameModal && !renameModal.classList.contains('hidden')) {
            document.getElementById('cancelRenameLangBtn').click();
        } else {
            closeAllModals();
        }
        return;
    }

    const sessionScreen = document.getElementById('sessionScreen');
    if (sessionScreen && !sessionScreen.classList.contains('hidden')) {
        document.getElementById('cancelSessionBtn').click();
        pushNavState({ view: 'modal' });
        return;
    }

    const summaryScreen = document.getElementById('summaryScreen');
    if (summaryScreen && !summaryScreen.classList.contains('hidden')) {
        document.getElementById('finishSessionBtn').click();
        return;
    }

    const tabManager = document.getElementById('tab-manager');
    const tabSettings = document.getElementById('tab-settings');
    if ((tabManager && tabManager.classList.contains('active')) ||
        (tabSettings && tabSettings.classList.contains('active'))) {
        isInternalNavigation = true;
        document.getElementById('navHome').click();
        isInternalNavigation = false;
        return;
    }

    const now = Date.now();
    if (now - lastHomeBackPressTime < 2000) {
        history.back();
    } else {
        lastHomeBackPressTime = now;
        showToast(t('toast_back_to_exit'));
        history.pushState({ view: 'home' }, '');
    }
});

function initAndroidBackHandler() {
    history.replaceState({ view: 'root' }, '');
    history.pushState({ view: 'home' }, '');
}

// ==========================================
// SPRACHUMSCHALTUNG LAUSCHER
// ==========================================
window.addEventListener('uiLanguageChanged', async () => {
    populateLangPresets();
    await ensureNativeFlag();
    await loadLanguages();
    updateLanguageLabels();
    updateDashboard();
    if (document.getElementById('tab-manager').classList.contains('active')) {
        renderManagerTable(true);
    }
    updateHeaderFlag();
});

window.addEventListener('DOMContentLoaded', async () => {
    applyUiTranslations();
    populateLangPresets();
    await initDB();
    await loadLanguages();
    initAndroidBackHandler();
});
