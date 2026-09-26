const express = require('express');
const session = require('express-session');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

app.use(session({
    secret: 'school_secret_key_123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));

const DATA_FILE = path.join(__dirname, 'students.json');

function loadStudentsFromFile() {
    if (!fs.existsSync(DATA_FILE)) {

        const initialData = [
            {
                id: "1",
                email: "juan.delacruz@school.edu.ph",
                password: "password123",
                fullName: "Juan Dela Cruz",
                studentId: "2026-0001",
                course: "BS Information Technology",
                isCleared: true
            }
        ];
        fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
        return initialData;
    }
    const fileData = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(fileData);
}

// HERE MA SASAVE SA JSON
function saveStudentsToFile(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let students = loadStudentsFromFile();

// ADMIN DEFAULT PASS AND USER
const ADMIN_USER = {
    username: "admin",
    password: "admin123"
};

function requireStudentLogin(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.status(401).json({ error: "Unauthorized access" });
}

function requireAdminLogin(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    res.status(401).json({ error: "Unauthorized access" });
}

// ADMIN CODEEEES

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;

    if (username === ADMIN_USER.username && password === ADMIN_USER.password) {
        req.session.isAdmin = true;
        return res.redirect('/admin.html');
    }

    res.send('<h3>Invalid Admin Credentials! <a href="/adminlogin.html">Try again</a></h3>');
});

app.get('/admin-logout', (req, res) => {
    req.session.isAdmin = false;
    res.redirect('/adminlogin.html');
});

app.get('/api/admin/students', requireAdminLogin, (req, res) => {
    res.json(students);
});

app.post('/api/admin/set-clearance', requireAdminLogin, (req, res) => {
    const { id, isCleared } = req.body;
    const student = students.find(s => s.id === id);

    if (student) {
        student.isCleared = isCleared;
        saveStudentsToFile(students); // DITO MASASAVE YUNG MGA ACCOUNT
        return res.json({ success: true, isCleared: student.isCleared });
    }
    res.status(404).json({ success: false, message: "Student not found" });
});

app.delete('/api/admin/student/:id', requireAdminLogin, (req, res) => {
    const studentId = req.params.id;
    const index = students.findIndex(s => s.id === studentId);

    if (index !== -1) {
        students.splice(index, 1);
        saveStudentsToFile(students); // DITO MASASAVE YUNG MGA ACCOUNT
        return res.json({ success: true, message: "Student account erased." });
    }

    res.status(404).json({ success: false, message: "Student record not found." });
});

// STUDENT FILEEEEES

app.post('/api/signup', (req, res) => {
    const { fullName, studentId, course, email, password } = req.body;

    const existingStudent = students.find(s => s.email === email);
    if (existingStudent) {
        return res.send('<h3>Email already registered! <a href="/login.html">Login here</a></h3>');
    }

    const newStudent = {
        id: Date.now().toString(),
        fullName,
        studentId,
        course,
        email,
        password,
        isCleared: false
    };

    students.push(newStudent);
    saveStudentsToFile(students); // Save new account permanently

    req.session.user = newStudent;
    res.redirect('/dashboard');
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const student = students.find(s => s.email === email && s.password === password);

    if (!student) {
        return res.send('<h3>Invalid credentials! <a href="/login.html">Try again</a></h3>');
    }

    req.session.user = student;
    res.redirect('/dashboard');
});

app.get('/dashboard', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/student/me', requireStudentLogin, async (req, res) => {
    const student = students.find(s => s.id === req.session.user.id);
    if (!student) {
        return res.status(404).json({ error: "Student record not found" });
    }

    req.session.user = student;

    let qrImageBase64 = null;
    if (student.isCleared) {
        const qrPayload = JSON.stringify({
            name: student.fullName,
            studentId: student.studentId,
            course: student.course,
            status: "CONFIRMED GRADUATE"
        });
        qrImageBase64 = await QRCode.toDataURL(qrPayload);
    }

    res.json({
        student: {
            id: student.id,
            fullName: student.fullName,
            studentId: student.studentId,
            course: student.course,
            email: student.email,
            isCleared: student.isCleared
        },
        qrImageBase64
    });
});

app.post('/api/student/companion-qr', requireStudentLogin, async (req, res) => {
    const student = students.find(s => s.id === req.session.user.id);
    const { companionName } = req.body;

    if (!student || !student.isCleared) {
        return res.status(403).json({ error: "Unauthorized" });
    }

    const companionPayload = JSON.stringify({
        guestName: companionName,
        accompanyingStudent: student.fullName,
        studentId: student.studentId,
        type: "GUEST PASS"
    });

    const companionQrBase64 = await QRCode.toDataURL(companionPayload);
    res.json({ success: true, companionQrBase64 });
});

app.get('/pay', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/login.html');
    }

    const student = students.find(s => s.id === req.session.user.id);

    res.send(`
        <div style="font-family: Arial; padding: 40px; max-width: 400px; margin: auto; border: 1px solid #ccc; border-radius: 8px; margin-top: 40px;">
            <h2 style="text-align: center;">Graduation Fee Checkout</h2>
            <p><strong>Student:</strong> ${student.fullName}</p>
            <p><strong>ID Number:</strong> ${student.studentId}</p>
            <p><strong>Course:</strong> ${student.course || 'N/A'}</p>
            <p><strong>Fee:</strong> ₱1,500.00</p>
            <hr/>
            <h4>Choose Payment Method:</h4>
            <button onclick="alert('Connecting to GCash Payment Gateway...')" style="width: 100%; padding: 12px; background: #007bf5; color: white; border: none; margin-bottom: 10px; border-radius: 5px; cursor: pointer; font-weight: bold;">
                Pay with GCash
            </button>
            <button onclick="alert('Connecting to Maya Payment Gateway...')" style="width: 100%; padding: 12px; background: #22b14c; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">
                Pay with Maya
            </button>
            <br/><br/>
            <a href="/dashboard">Back to Dashboard</a>
        </div>
    `);
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

app.listen(3000, () => {
    console.log('Server active at http://localhost:3000/login.html');
});
