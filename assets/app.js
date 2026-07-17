import { db } from './firebase.js';
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { EXAM_STUDENTS, EXAM_QUESTIONS, CURRENT_TEST, ACTIVE_TEST_ID, getAllTests } from './data.js';

// ==================== CHECK INTERNET CONNECTION ====================
const isOnline = navigator.onLine;

// ==================== STATE MANAGEMENT ====================
let currentUser = null;
let currentQuestionIndex = 0;
let userAnswers = new Array(EXAM_QUESTIONS.length).fill(null);
let timer = null;
let timeLeft = CURRENT_TEST.timeLimit * 60; // Convert minutes to seconds
let examStartTime = null;
let examEndTime = null;
let examSubmitted = false;

// ==================== OFFLINE RESULTS STORAGE ====================
let offlineResults = JSON.parse(localStorage.getItem('offlineResults')) || [];

// ==================== DOM REFERENCES ====================
const loginSection = document.getElementById('loginSection');
const instructionsSection = document.getElementById('instructionsSection');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const startExamBtn = document.getElementById('startExamBtn');

// ==================== LOGIN FUNCTIONALITY ====================
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();

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
            
            // Show test info
            const testInfo = document.getElementById('testInfo');
            if (testInfo) {
                testInfo.innerHTML = `
                    <strong>Test:</strong> ${CURRENT_TEST.name} 
                    | <strong>Questions:</strong> ${CURRENT_TEST.totalQuestions} 
                    | <strong>Time:</strong> ${CURRENT_TEST.timeLimit} minutes
                `;
            }
            
            const statusMsg = document.getElementById('connectionStatus');
            if (statusMsg) {
                if (navigator.onLine) {
                    statusMsg.textContent = '✅ Online - Results will be saved to Firebase';
                    statusMsg.style.background = '#d4edda';
                    statusMsg.style.color = '#155724';
                } else {
                    statusMsg.textContent = '📱 Offline - Results will be saved locally and synced later';
                    statusMsg.style.background = '#fff3cd';
                    statusMsg.style.color = '#856404';
                }
            }
        } else {
            loginError.textContent = 'Invalid username or password. Please try again.';
            loginError.style.display = 'block';
        }
    });
}

// ==================== START EXAM ====================
if (startExamBtn) {
    startExamBtn.addEventListener('click', () => {
        localStorage.setItem('examStarted', 'true');
        localStorage.setItem('currentTestId', ACTIVE_TEST_ID);
        window.location.href = 'student/test.html';
    });
}

// ==================== EXAM LOGIC ====================
if (window.location.pathname.includes('test.html')) {
    const userData = JSON.parse(localStorage.getItem('examUser'));
    if (!userData) {
        window.location.href = '../index.html';
    }

    currentUser = userData;
    document.getElementById('studentNameDisplay').textContent = currentUser.name;
    document.getElementById('totalQNum').textContent = EXAM_QUESTIONS.length;
    document.getElementById('testNameDisplay').textContent = CURRENT_TEST.name;

    displayQuestion(0);
    startTimer();

    document.getElementById('prevBtn')?.addEventListener('click', () => navigateQuestion(-1));
    document.getElementById('nextBtn')?.addEventListener('click', () => navigateQuestion(1));
    document.getElementById('submitBtn')?.addEventListener('click', submitExam);
}

// ... rest of app.js remains the same with minor updates for testId in results

// ==================== UPDATED SUBMIT EXAM WITH TEST ID ====================
async function submitExam() {
    if (examSubmitted) return;
    
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
    EXAM_QUESTIONS.forEach((q, index) => {
        if (userAnswers[index] === q.correct) correct++;
    });

    const total = EXAM_QUESTIONS.length;
    const percentage = ((correct / total) * 100).toFixed(2);
    const passFail = percentage >= 50 ? 'Pass' : 'Fail';

    const resultData = {
        studentName: currentUser.name,
        username: currentUser.username,
        testId: ACTIVE_TEST_ID,
        testName: CURRENT_TEST.name,
        score: correct,
        totalQuestions: total,
        percentage: parseFloat(percentage),
        passFail: passFail,
        examDate: new Date().toLocaleDateString(),
        timeTaken: timeTaken,
        submittedAt: new Date().toISOString(),
        synced: false
    };

    localStorage.setItem('examResult', JSON.stringify(resultData));

    if (navigator.onLine) {
        try {
            await saveExamResult(resultData);
            resultData.synced = true;
            localStorage.setItem('examResult', JSON.stringify(resultData));
            alert('✅ Result Saved Successfully to Firebase!');
            window.location.href = 'result.html';
        } catch (error) {
            console.error('Error saving result:', error);
            saveOfflineResult(resultData);
            alert('⚠️ Could not save to Firebase. Result saved locally. Will sync when online.');
            window.location.href = 'result.html';
        }
    } else {
        saveOfflineResult(resultData);
        alert('📱 Offline Mode: Result saved locally. Will auto-sync when internet connects.');
        window.location.href = 'result.html';
    }
}