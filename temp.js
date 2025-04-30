const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/user');
require('dotenv').config();

// Initialize Gemini API client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, './uploads');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });


const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'studentparth9@gmail.com', // Your Gmail address
        pass: 'dztk brnx tooz gnmi' // The 16-character app password created from direct search bar o google account
    }
});


// Function to generate a 4-digit verification code
function generate4DigitCode() {
    return crypto.randomInt(1000, 10000).toString();
}

// Store verification codes
const verificationCodes = {};

// Register route
router.post('/register', upload.single('File'), async (req, res) => {
    try {
        const { FirstName, LastName, Email, Password, ContactNo } = req.body;

        if (!FirstName || !LastName || !Email || !Password || !ContactNo) {
            return res.status(400).json("All fields are required");
        }

        // Validate password format
        const passwordCheck = /^(?=.*[A-Z])(?=.*[!@#$%^&*])(?=.*[a-z])(?=.*\d).{8,}$/;
        if (!passwordCheck.test(Password)) {
            return res.status(400).json({
                error: "Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character."
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ Email });
        if (existingUser) {
            return res.status(409).json('Email already exists.');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(Password, 10);

        // Process uploaded file
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

            // Call Gemini API to structure text into JSON
            extractedData = await getJsonFromGemini(text);
        }

        // Save user to DB
        const userRegistration = new User({
            FirstName,
            LastName,
            Email,
            Password: hashedPassword,
            ContactNo,
            File: req.file ? req.file.path : null,
            extractedData
        });

        const userData = await userRegistration.save();

        // Generate and send verification code
        const code = generate4DigitCode();
        verificationCodes[Email] = code;

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: Email,
            subject: "Your Verification Code",
            text: `Your 4-digit verification code is: ${code}`
        };

        await transporter.sendMail(mailOptions);

        res.status(201).json({
            message: "User registered successfully. Verification code sent to email.",
            userData
        });

    } catch (e) {
        console.error(e);
        res.status(500).json(e.message || "Internal Server Error");
    }
});


router.post('/verify-code', async (req, res) => {
    const { Email, Code } = req.body;

    if (!Email || !Code) {
        return res.status(400).json('Email and code are required');
    }

    if (!verificationCodes[Email] || verificationCodes[Email] !== Code) {
        return res.status(400).json('Invalid verification code');
    }

    delete verificationCodes[Email];

    res.status(200).json('Verification successful');
});

// Function to send extracted text to Gemini for JSON conversion
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

    // Cleanup response to ensure valid JSON
    jsonString = jsonString.replace(/```json|```/gi, '').trim();
    return JSON.parse(jsonString);
}

module.exports = router;
