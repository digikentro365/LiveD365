const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
// const bcrypt = require('bcrypt');
const bcrypt = require('bcryptjs');  // Change this line

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/user');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ storage:storage});


// Middleware for authentication
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).send({ message: "Access denied. No token provided." });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).send({ message: "Invalid or expired token." });
        req.user = user;
        next();
    });
};
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});
function generate4DigitCode() {
    return crypto.randomInt(1000, 10000).toString();
}
const verificationCodes = {};

// User Registration Route
router.post('/register', upload.single('file'), async (req, res) => {
    try {
        const { firstName, lastName, email, password, contactNo } = req.body;

        if (!email || !password || !contactNo) {
            return res.status(400).json("Email, Password, and ContactNo are required");
        }
        // const passwordCheck = /^(?=.[A-Z])(?=.[!@#$%^&])(?=.[a-z])(?=.*\d).{8,}$/;
        const passwordCheck = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

        if (!passwordCheck.test(password)) {
            return res.status(400).json({
                error: "Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character."
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(409).json('Email already exists.');

        const hashedPassword = await bcrypt.hash(password, 10);

        let extractedData = {};
        if (req.file) {
            const { path: filePath, originalname: filename } = req.file;
            const ext = path.extname(filename).toLowerCase();

            let text = "";
            if (ext === '.docx') {
                const result = await mammoth.extractRawText({ path: filePath });
                text = result.value;
            } else if (ext === '.pdf') {
                const dataBuffer = fs.readFileSync(filePath);
                const result = await pdfParse(dataBuffer);
                text = result.text;
            } else {
                return res.status(400).json({ error: 'Unsupported file type. Only DOCX and PDF files are allowed.' });
            }

            extractedData = await getJsonFromGemini(text);
        }

        const newUser = new User({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            contactNo,
            file: req.file ? req.file.path : null,
            extractedData
        });

        const userData = await newUser.save();
        const token = jwt.sign({ userId: userData._id }, process.env.JWT_SECRET);

        const code = generate4DigitCode();
        verificationCodes[email] = code;

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Your Verification Code",
            text: `Your 4-digit verification code is: ${code}`
        });

        res.status(201).json({
            message: "User registered successfully. Verification code sent to email.",
            token,
            userData
        });

    } catch (e) {
        console.error(e);
        res.status(500).json(e.message || "Internal Server Error");
    }
});

// Update Personal Information
router.put("/updatePersonalInfo", authenticateToken, async (req, res) => {
    try {
        const { personalInformation, about } = req.body;
        const user = await User.findById(req.user.userId);

        if (!user) return res.status(404).send({ message: "User not found." });

        user.personalInformation = personalInformation || user.personalInformation;
        user.about = about || user.about;

        const updatedUser = await user.save();
        res.status(200).send({ message: "Personal Information updated", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

// Update Work Experience
// router.put("/updateWorkExperience", authenticateToken, async (req, res) => {
//     try {
//         const { workExperience } = req.body;
//         const user = await User.findById(req.user.userId);

//         if (!user) return res.status(404).send({ message: "User not found." });

//         user.workExperience = workExperience || user.workExperience;

//         const updatedUser = await user.save();
//         res.status(200).send({ message: "Work Experience updated", user: updatedUser });
//     } catch (error) {
//         res.status(500).send({ message: error.message || "Internal Server Error" });
//     }
// });

// Email Verification
router.post('/verify-code', async (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) return res.status(400).json('Email and code are required');

    if (!verificationCodes[email] || verificationCodes[email] !== code) {
        return res.status(400).json('Invalid verification code');
    }

    delete verificationCodes[email];
    res.status(200).json('Verification successful');
});

async function getJsonFromGemini(text) {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `
    Extract the relevant information from the following resume text and return it as a structured JSON object.
    The JSON should include: 
    - name, email, phone, location, summary
    - education (array with university, degree, start_date, end_date)
    - experience (array with company, title, start_date, end_date, description)
    - skills (array)
    - projects (array with title, technologies, description)
    
    Resume text:
    ${text}
    `;

    const response = await model.generateContent(prompt);
    const result = await response.response;
    let jsonString = result.text();

    jsonString = jsonString.replace(/```json|```/gi, '').trim();
    return JSON.parse(jsonString);
}

module.exports = router;
