import { db } from './firebase.js';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { 
    EXAM_STUDENTS, 
    EXAM_QUESTIONS, 
    CURRENT_TEST, 
    ACTIVE_TEST_ID, 
    ALL_TESTS,
    setActiveTestId,
    getActiveTestId,
    COLLEGE_INFO 
} from './data.js';

// ==================== STATE MANAGEMENT ====================
let currentUser = null;
let currentQuestionIndex = 0;
let userAnswers = new Array(EXAM_QUESTIONS.length).fill(null);
let timer = null;
let timeLeft = CURRENT_TEST.timeLimit * 60;
let examStartTime = null;
let examEndTime = null;
let examSubmitted = false;

// ==================== DOM REFERENCES ====================
const loginSection = document.getElementById('loginSection');
const instructionsSection = document.getElementById('instructionsSection');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const startExamBtn = document.getElementById('startExamBtn');

// ==================== UPDATE INSTRUCTIONS WITH TEST INFO ====================
function updateInstructionsWithTestInfo() {
    const testInfo = document.getElementById('testInfo');
    if (testInfo) {
        const activeTest = getActiveTestId();
        const test = ALL_TESTS[activeTest];
        testInfo.innerHTML = `
            <strong>🏥 ${COLLEGE_INFO.name}</strong><br>
            <strong>📝 Test:</strong> ${test.name} 
            | <strong>Questions:</strong> ${test.totalQuestions} 
            | <strong>Time:</strong> ${test.timeLimit} minutes
        `;
    }
    
    const totalQuestionsDisplay = document.getElementById('totalQuestionsDisplay');
    if (totalQuestionsDisplay) {
        const activeTest = getActiveTestId();
        totalQuestionsDisplay.textContent = ALL_TESTS[activeTest].totalQuestions;
    }
    
    const timeLimitDisplay = document.getElementById('timeLimitDisplay');
    if (timeLimitDisplay) {
        const activeTest = getActiveTestId();
        timeLimitDisplay.textContent = ALL_TESTS[activeTest].timeLimit;
    }
}

// ==================== LOGIN FUNCTIONALITY ====================
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();

        if (username === 'admin' && password === 'admin123') {
            window.location.href = 'admin/dashboard.html';
            return;
        }

        const student = EXAM_STUDENTS.find(s => s.username === username && s.password === password);

        if (student) {
            currentUser = student;
            localStorage.setItem('examUser', JSON.stringify(student));
            loginSection.style.display = 'none';
            instructionsSection.style.display = 'block';
            loginError.style.display = 'none';
            
            const welcomeMsg = document.getElementById('welcomeMessage');
            if (welcomeMsg) {
                welcomeMsg.textContent = `Welcome, ${student.name}!`;
            }
            
            updateInstructionsWithTestInfo();
        } else {
            loginError.textContent = 'Invalid username or password. Please try again.';
            loginError.style.display = 'block';
        }
    });
}

// ==================== START EXAM ====================
if (startExamBtn) {
    startExamBtn.addEventListener('click', () => {
        const activeTest = getActiveTestId();
        localStorage.setItem('examStarted', 'true');
        localStorage.setItem('currentTestId', activeTest);
        window.location.href = 'student/test.html';
    });
}

// ==================== EXAM LOGIC ====================
if (window.location.pathname.includes('test.html')) {
    const userData = JSON.parse(localStorage.getItem('examUser'));
    if (!userData) {
        window.location.href = '../index.html';
    }

    // Get the active test from localStorage
    const testId = localStorage.getItem('currentTestId') || getActiveTestId();
    const test = ALL_TESTS[testId];
    
    if (!test) {
        alert('Test not found!');
        window.location.href = '../index.html';
    }

    currentUser = userData;
    document.getElementById('studentNameDisplay').textContent = currentUser.name;
    document.getElementById('totalQNum').textContent = test.questions.length;
    
    const testNameDisplay = document.getElementById('testNameDisplay');
    if (testNameDisplay) {
        testNameDisplay.textContent = test.name;
    }

    // Use the test questions
    const questions = test.questions;
    userAnswers = new Array(questions.length).fill(null);
    timeLeft = test.timeLimit * 60;

    displayQuestion(0);
    startTimer();

    document.getElementById('prevBtn')?.addEventListener('click', () => navigateQuestion(-1));
    document.getElementById('nextBtn')?.addEventListener('click', () => navigateQuestion(1));
    document.getElementById('submitBtn')?.addEventListener('click', submitExam);
}

function displayQuestion(index) {
    const testId = localStorage.getItem('currentTestId') || getActiveTestId();
    const test = ALL_TESTS[testId];
    const questions = test.questions;
    
    if (index < 0 || index >= questions.length) return;

    const question = questions[index];
    document.getElementById('currentQNum').textContent = index + 1;
    document.getElementById('questionText').textContent = question.question;
    document.getElementById('progressFill').style.width = `${((index + 1) / questions.length) * 100}%`;

    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = '';

    const optionKeys = ['A', 'B', 'C', 'D', 'E'];
    optionKeys.forEach((key) => {
        if (question.options[key]) {
            const div = document.createElement('div');
            div.className = 'option-item';
            if (userAnswers[index] === key) {
                div.classList.add('selected');
            }
            div.textContent = `${key}. ${question.options[key]}`;
            div.addEventListener('click', () => selectOption(index, key));
            optionsContainer.appendChild(div);
        }
    });

    currentQuestionIndex = index;
    updateButtons();
}

function selectOption(questionIndex, optionKey) {
    userAnswers[questionIndex] = optionKey;
    displayQuestion(questionIndex);
}

function navigateQuestion(direction) {
    const newIndex = currentQuestionIndex + direction;
    const testId = localStorage.getItem('currentTestId') || getActiveTestId();
    const test = ALL_TESTS[testId];
    if (newIndex >= 0 && newIndex < test.questions.length) {
        displayQuestion(newIndex);
    }
}

function updateButtons() {
    const testId = localStorage.getItem('currentTestId') || getActiveTestId();
    const test = ALL_TESTS[testId];
    document.getElementById('prevBtn').disabled = currentQuestionIndex === 0;
    document.getElementById('nextBtn').disabled = currentQuestionIndex === test.questions.length - 1;
}

function startTimer() {
    const timerDisplay = document.getElementById('timerDisplay');
    examStartTime = new Date();

    timer = setInterval(() => {
        timeLeft--;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        if (timeLeft <= 0) {
            clearInterval(timer);
            alert('Time is up! Your exam will be submitted automatically.');
            submitExam();
        }
    }, 1000);
}

// ==================== SUBMIT EXAM ====================
async function submitExam() {
    if (examSubmitted) return;
    
    const testId = localStorage.getItem('currentTestId') || getActiveTestId();
    const test = ALL_TESTS[testId];
    const questions = test.questions;
    
    const unanswered = userAnswers.filter(a => a === null).length;
    if (unanswered > 0) {
        if (!confirm(`You have ${unanswered} unanswered questions. Are you sure you want to submit?`)) {
            return;
        }
    }

    examSubmitted = true;
    clearInterval(timer);
    examEndTime = new Date();
    const timeTaken = Math.floor((examEndTime - examStartTime) / 1000);

    let correct = 0;
    questions.forEach((q, index) => {
        if (userAnswers[index] === q.correct) correct++;
    });

    const total = questions.length;
    const percentage = ((correct / total) * 100).toFixed(2);
    const passFail = percentage >= 50 ? 'Pass' : 'Fail';

    const resultData = {
        studentName: currentUser.name,
        username: currentUser.username,
        testId: testId,
        testName: test.name,
        score: correct,
        totalQuestions: total,
        percentage: parseFloat(percentage),
        passFail: passFail,
        examDate: new Date().toLocaleDateString(),
        timeTaken: timeTaken,
        submittedAt: new Date().toISOString(),
        college: COLLEGE_INFO.name,
        collegeShortName: COLLEGE_INFO.shortName,
        location: COLLEGE_INFO.location,
        session: COLLEGE_INFO.currentSession,
        firebaseProject: COLLEGE_INFO.firebaseProject,
        testVersion: 'v2.0',
        platform: 'web',
        source: 'exam-system'
    };

    localStorage.setItem('examResult', JSON.stringify(resultData));

    try {
        await saveExamResult(resultData);
        alert('✅ Result Saved Successfully!');
        window.location.href = 'result.html';
    } catch (error) {
        console.error('Error saving result:', error);
        alert('⚠️ Error saving result. Your score is still available.');
        window.location.href = 'result.html';
    }
}

// ==================== FIREBASE FUNCTIONS ====================
async function saveExamResult(resultData) {
    try {
        const docRef = await addDoc(collection(db, 'exam-results'), {
            ...resultData,
            submittedAt: serverTimestamp()
        });
        console.log('✅ Result saved with ID:', docRef.id);
        console.log('📝 Test:', resultData.testName);
        return docRef.id;
    } catch (error) {
        console.error('❌ Firebase save error:', error);
        throw error;
    }
}

async function getAllResults() {
    try {
        const q = query(collection(db, 'exam-results'), orderBy('submittedAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const results = [];
        querySnapshot.forEach((doc) => {
            results.push({ id: doc.id, ...doc.data() });
        });
        return results;
    } catch (error) {
        console.error('Error fetching results:', error);
        return [];
    }
}

// ==================== RESULT PAGE ====================
if (window.location.pathname.includes('result.html')) {
    const resultData = JSON.parse(localStorage.getItem('examResult'));
    if (!resultData) {
        window.location.href = '../index.html';
    }

    const resultContainer = document.getElementById('resultContent');
    
    resultContainer.innerHTML = `
        <h2>📊 Your Exam Results</h2>
        <div style="background:#e8f4fd; padding:12px; border-radius:10px; margin-bottom:15px;">
            <p style="margin:0; font-weight:bold; color:#1a2a6c;">🏥 ${resultData.college || 'College of Nursing'}</p>
        </div>
        <div class="result-item">
            <span class="label">Student Name:</span>
            <span class="value">${resultData.studentName}</span>
        </div>
        <div class="result-item">
            <span class="label">Username:</span>
            <span class="value">${resultData.username}</span>
        </div>
        <div class="result-item">
            <span class="label">Test:</span>
            <span class="value">${resultData.testName || 'N/A'}</span>
        </div>
        <div class="result-item">
            <span class="label">Score:</span>
            <span class="value">${resultData.score} / ${resultData.totalQuestions}</span>
        </div>
        <div class="result-item">
            <span class="label">Percentage:</span>
            <span class="value">${resultData.percentage}%</span>
        </div>
        <div class="result-item">
            <span class="label">Status:</span>
            <span class="value ${resultData.passFail === 'Pass' ? 'pass' : 'fail'}">
                ${resultData.passFail === 'Pass' ? '✅ PASS' : '❌ FAIL'}
            </span>
        </div>
        <div class="result-item">
            <span class="label">Time Taken:</span>
            <span class="value">${Math.floor(resultData.timeTaken / 60)}m ${resultData.timeTaken % 60}s</span>
        </div>
        <div class="result-item">
            <span class="label">Date:</span>
            <span class="value">${resultData.examDate}</span>
        </div>
        <div class="result-item" style="background: #d4edda;">
            <span class="label">Status:</span>
            <span class="value" style="font-size:1rem; color: #155724;">
                ✅ Saved to Database
            </span>
        </div>
    `;

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        localStorage.clear();
        window.location.href = '../index.html';
    });
}

// ==================== ADMIN DASHBOARD ====================
if (window.location.pathname.includes('dashboard.html')) {
    const adminLoggedIn = localStorage.getItem('adminLoggedIn');
    if (!adminLoggedIn) {
        const password = prompt('Enter admin password:');
        if (password === 'admin123') {
            localStorage.setItem('adminLoggedIn', 'true');
        } else {
            alert('Invalid admin password!');
            window.location.href = '../index.html';
        }
    }

    loadTestManagement();
    loadAdminResults();

    document.getElementById('refreshBtn')?.addEventListener('click', () => {
        loadAdminResults();
    });
    
    document.getElementById('searchInput')?.addEventListener('input', filterResults);
    document.getElementById('sortSelect')?.addEventListener('change', sortResults);
    document.getElementById('testFilterSelect')?.addEventListener('change', filterByTest);
    document.getElementById('adminLogoutBtn')?.addEventListener('click', () => {
        localStorage.removeItem('adminLoggedIn');
        window.location.href = '../index.html';
    });
}

let allResults = [];

// ==================== LOAD TEST MANAGEMENT ====================
function loadTestManagement() {
    const select = document.getElementById('activeTestSelect');
    if (select) {
        const currentActive = getActiveTestId();
        select.innerHTML = '';
        Object.keys(ALL_TESTS).forEach(key => {
            const test = ALL_TESTS[key];
            const option = document.createElement('option');
            option.value = key;
            const activeStatus = key === currentActive ? ' ✅ (Active)' : '';
            option.textContent = `${test.name} (${test.totalQuestions} Qs, ${test.timeLimit} min)${activeStatus}`;
            if (key === currentActive) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }
    
    const statusEl = document.getElementById('testStatus');
    if (statusEl) {
        const currentActive = getActiveTestId();
        const test = ALL_TESTS[currentActive];
        statusEl.textContent = `✅ ${test.name} Active`;
        statusEl.style.background = '#d4edda';
        statusEl.style.color = '#155724';
    }
}

// ==================== UPDATE ACTIVE TEST ====================
document.getElementById('updateTestBtn')?.addEventListener('click', () => {
    const select = document.getElementById('activeTestSelect');
    const testId = select.value;
    const testName = select.options[select.selectedIndex].text;
    
    if (confirm(`Are you sure you want to switch to "${testName}"?`)) {
        const success = setActiveTestId(testId);
        if (success) {
            alert(`✅ Test switched to "${testName}" successfully!`);
            window.location.reload();
        } else {
            alert('❌ Error switching test. Please try again.');
        }
    }
});

// ==================== LOAD ADMIN RESULTS ====================
async function loadAdminResults() {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '<tr><td colspan="8">Loading results...</td></tr>';

    try {
        const allFirebaseResults = await getAllResults();
        
        console.log('📊 Results from Firebase:', allFirebaseResults.length);
        
        const testFilter = document.getElementById('testFilterSelect')?.value || 'all';
        
        let filteredResults = allFirebaseResults;
        if (testFilter !== 'all') {
            filteredResults = allFirebaseResults.filter(r => r.testId === testFilter);
        }
        
        allResults = filteredResults;
        displayResults(allResults);
        
        const countMsg = document.getElementById('resultCount');
        if (countMsg) {
            const total = allFirebaseResults.length;
            const filtered = filteredResults.length;
            countMsg.innerHTML = `📊 Total Results: <strong>${filtered}</strong> ${filtered !== total ? `(filtered from ${total})` : ''}`;
            countMsg.style.background = '#d4edda';
            countMsg.style.padding = '10px';
            countMsg.style.borderRadius = '8px';
            countMsg.style.color = '#155724';
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="8">Error loading results</td></tr>';
        console.error(error);
    }
}

function displayResults(results) {
    const tbody = document.getElementById('resultsBody');
    if (results.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">No results found</td></tr>';
        return;
    }

    tbody.innerHTML = results.map(result => `
        <tr>
            <td>${result.studentName || 'N/A'}</td>
            <td>${result.username || 'N/A'}</td>
            <td>${result.testName || 'N/A'}</td>
            <td>${result.score || 0}/${result.totalQuestions || 0}</td>
            <td>${result.percentage || 0}%</td>
            <td>
                <span class="status-badge ${result.passFail === 'Pass' ? 'status-pass' : 'status-fail'}">
                    ${result.passFail || 'N/A'}
                </span>
            </td>
            <td>${result.examDate || 'N/A'}</td>
            <td>${result.timeTaken ? `${Math.floor(result.timeTaken / 60)}m ${result.timeTaken % 60}s` : 'N/A'}</td>
        </tr>
    `).join('');
}

function filterResults() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filtered = allResults.filter(r => 
        (r.studentName?.toLowerCase().includes(searchTerm) || 
         r.username?.toLowerCase().includes(searchTerm))
    );
    displayResults(filtered);
}

function filterByTest() {
    loadAdminResults();
}

function sortResults() {
    const sortType = document.getElementById('sortSelect').value;
    let sorted = [...allResults];

    switch(sortType) {
        case 'highest':
            sorted.sort((a, b) => (b.score || 0) - (a.score || 0));
            break;
        case 'lowest':
            sorted.sort((a, b) => (a.score || 0) - (b.score || 0));
            break;
        case 'latest':
            sorted.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
            break;
    }

    displayResults(sorted);
}

if (window.location.pathname === '/' || window.location.pathname.includes('index.html')) {
    const userData = JSON.parse(localStorage.getItem('examUser'));
    const examStarted = localStorage.getItem('examStarted');
    
    if (userData && examStarted === 'true') {
        window.location.href = 'student/test.html';
    }
}

export { saveExamResult, getAllResults };
