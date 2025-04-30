const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/user');
const PDFDocument = require("pdfkit");

require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Middleware for authentication
// const authenticateToken = (req, res, next) => {
//     const authHeader = req.headers['authorization'];
//     const token = authHeader && authHeader.split(' ')[1];

//     if (!token) return res.status(401).send({ message: "Access denied. No token provided." });

//     jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
//         if (err) return res.status(403).send({ message: "Invalid or expired token." });
//         req.user = user;
//         next();
//     });
// };

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).send({ message: "Access denied. No token provided." });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).send({ message: "Invalid or expired token." });

        console.log("Authenticated User ID:", user.userId);  // Debug log
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

// **Move this function ABOVE the register route**
async function getJsonFromGemini(text) {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `
    Extract the relevant information from the following resume text and return it as a structured JSON object.
    The JSON should include: 
    - personalInformation(firstName,lastName, email, contactNo, city, state, country)
    - about(description,professionalTitle,primaryRole,microsoftDynamicsExpertise,microsoftDynamicsProduct,yearsOfExperience)
    - Qualification (array with UniversityName, Degree,Field_of_study, description)
    - workExperience (array with companyName,jobTitle,designation,industryType,location,currentlyWorking,startDate,endDate,description)
    - skills (array)
    - projectExperience (array with projectName,jobTitle,description,technologiesUsed,startDate,endDate)
    
    Resume text:
    ${text}
    `;

    const response = await model.generateContent(prompt);
    const result = response.response;
    let jsonString = result.text();

    jsonString = jsonString.replace(/```json|```/gi, '').trim();
    return JSON.parse(jsonString);
}

// **Now that getJsonFromGemini is declared, register route will work fine**
// router.post('/register', upload.single('file'), async (req, res) => {
//     try {
//         const { firstName, lastName, email, password, contactNo } = req.body;

//         if (!email || !password || !contactNo) {
//             return res.status(400).json("Email, Password, and ContactNo are required");
//         }

//         const passwordCheck = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

//         if (!passwordCheck.test(password)) {
//             return res.status(400).json({
//                 error: "Password must contain at least 1 uppercase letter, 1 lowercase letter, 1 digit, and 1 special character."
//             });
//         }

//         const existingUser = await User.findOne({ email });
//         if (existingUser) return res.status(409).json('Email already exists.');

//         const hashedPassword = await bcrypt.hash(password, 10);

//         let extractedData = {};
//         if (req.file) {
//             const { path: filePath, originalname: filename } = req.file;
//             const ext = path.extname(filename).toLowerCase();

//             let text = "";
//             if (ext === '.docx') {
//                 const result = await mammoth.extractRawText({ path: filePath });
//                 text = result.value;
//             } else if (ext === '.pdf') {
//                 const dataBuffer = fs.readFileSync(filePath);
//                 const result = await pdfParse(dataBuffer);
//                 text = result.text;
//             } else {
//                 return res.status(400).json({ error: 'Unsupported file type. Only DOCX and PDF files are allowed.' });
//             }

//             extractedData = await getJsonFromGemini(text);
//         }

//         const newUser = new User({
//             firstName,
//             lastName,
//             email,
//             password: hashedPassword,
//             contactNo,
//             file: req.file ? req.file.path : null,
//             extractedData
//         });

//         const userData = await newUser.save();
//         const token = jwt.sign({ userId: userData._id }, process.env.JWT_SECRET);

//         const code = generate4DigitCode();
//         verificationCodes[email] = code;

//         await transporter.sendMail({
//             from: process.env.EMAIL_USER,
//             to: email,
//             subject: "Your Verification Code",
//             text: `Your 4-digit verification code is: ${code}`
//         });

//         res.status(201).json({
//             message: "User registered successfully. Verification code sent to email.",
//             token,
//             userData
//         });

//     } catch (e) {
//         console.error(e);
//         res.status(500).json(e.message || "Internal Server Error");
//     }
// });

router.post('/register', upload.single('file'), async (req, res) => {
    try {
        const { firstName, lastName, email, password, contactNo } = req.body;

        if (!email || !password || !contactNo) {
            return res.status(400).json("Email, Password, and ContactNo are required");
        }

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
        let personalInformation = {};
        let about = {};
        let skills = [];
        let projectExperience = [];
        let MicrosoftCertificates = [];
        let Qualification = [];
        let workExperience = [];


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

            // Extract JSON data from CV
            extractedData = await getJsonFromGemini(text);

            // Debugging
            console.log("Raw Extracted Data:", extractedData);

            // Ensure extractedData is an object
            if (!extractedData || typeof extractedData !== 'object') {
                console.error("Error: Extracted data is not an object!", extractedData);
                return res.status(500).json({ error: "Failed to extract data from CV" });
            }

            // Handle nested structure
            if (extractedData.data && typeof extractedData.data === 'object') {
                extractedData = extractedData.data;
            }

            console.log("Final Extracted Data:", extractedData);

            // Extract personal information safely
            personalInformation = {
                firstName: extractedData.personalInformation?.firstName ?? null,
                lastName: extractedData.personalInformation?.lastName ?? null,
                email: extractedData.personalInformation?.email ?? null,
                contactNo: extractedData.personalInformation?.contactNo ?? null,
                city: extractedData.personalInformation?.city ?? null,
                state: extractedData.personalInformation?.state ?? null,
                country: extractedData.personalInformation?.country ?? null,
            };


            about = {
                description: extractedData.personalInformation?.description ?? null,
                linkedInURL: extractedData.personalInformation?.linkedInURL ?? extractedData.linkedin ?? null,
                professionalTitle: extractedData.personalInformation?.professionalTitle ?? extractedData.title ?? null,
                primaryRole: extractedData.personalInformation?.primaryRole ?? null,
                microsoftDynamicsExpertise: extractedData.personalInformation?.microsoftDynamicsExpertise ?? null,
                microsoftDynamicsProduct: extractedData.personalInformation?.microsoftDynamicsProduct ?? null,
                yearsOfExperience: extractedData.personalInformation?.yearsOfExperience ?? null,
            };

            console.log("Personal Information:", personalInformation);
            console.log("About:", about);
        }

        skills = extractedData.skills || [];

        projectExperience = extractedData.projectExperience ? extractedData.projectExperience.map(proj => ({
            projectName: proj.projectName || null,
            jobTitle: proj.jobTitle || null,
            description: proj.description || null,
            technologiesUsed: proj.technologiesUsed || [],
            startDate: proj.startDate || null,
            endDate: proj.endDate || null,
        })) : [];

        MicrosoftCertificates = extractedData.MicrosoftCertificates ? extractedData.MicrosoftCertificates.map(cert => ({
            CertificateName: cert.CertificateName || null,
            DateEarned: cert.DateEarned || null,
            ValidityDate: cert.ValidityDate || null,
            certificateURL: cert.certificateURL || null,
            description: cert.description || null,
        })) : [];


        Qualification = extractedData.Qualification ? extractedData.Qualification.map(edu => ({
            UniversityName: edu.UniversityName || null,
            Degree: edu.Degree || null,
            Field_of_study: edu.Field_of_study || null,
            Start_month_year: edu.Start_month_year || null,
            End_month_year: edu.End_month_year || null,
            description: edu.description || null,
        })) : [];

        workExperience = extractedData.workexperience ? extractedData.workexperience.map(exp => ({
            companyName: exp.CompanyName || null,
            jobTitle: exp.JobTitle || null,
            designation: exp.Designation || null,
            industryType: exp.IndustryType || null,
            location: exp.Location || null,
            currentlyWorking: exp.CurrentWorking || false,
            startDate: {
                month: exp.StartMonth || null,
                year: exp.StartYear || null
            },
            endDate: {
                month: exp.EndMonth || null,
                year: exp.EndYear || null
            },
            description: exp.Description || null,
        })) : [];


        const newUser = new User({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            contactNo,
            file: req.file ? req.file.path : null,
            extractedData,
            personalInformation,
            about,
            skills,
            projectExperience,
            MicrosoftCertificates,
            Qualification,
            workExperience
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


router.post('/verify-code', async (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) return res.status(400).json('Email and code are required');

    if (!verificationCodes[email] || verificationCodes[email] !== code) {
        return res.status(400).json('Invalid verification code');
    }

    delete verificationCodes[email];
    res.status(200).json('Verification successful');
});

// Update Personal Information
router.put("/updatePersonalInfo", authenticateToken, async (req, res) => {
    try {
        const { personalInformation, about } = req.body;
        // console.log(req.body);

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

// / Update Work Experience
router.put("/updateWorkExperience", authenticateToken, async (req, res) => {
    try {
        const { workExperience } = req.body;
        console.log(req.body);

        const user = await User.findById(req.user.userId);

        if (!user) return res.status(404).send({ message: "User not found." });

        user.workExperience = workExperience || user.workExperience;

        const updatedUser = await user.save();
        res.status(200).send({ message: "Work Experience updated", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

//update about
router.put("/updateAbout", authenticateToken, async (req, res) => {
    try {
        const { about } = req.body;

        if (!about) {
            return res.status(400).send({ message: "No data provided for update." });
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Update only the provided fields
        user.about = { ...user.about, ...about };

        const updatedUser = await user.save();
        res.status(200).send({ message: "About Information updated", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

//update skills
router.put("/updateSkills", authenticateToken, async (req, res) => {
    try {
        let { skills } = req.body;

        if (!skills) return res.status(400).send({ message: "Skills are required." });

        // Ensure skills is an array (in case it's sent as a string)
        if (typeof skills === "string") {
            try {
                skills = JSON.parse(skills); // Convert string to array if needed
            } catch (error) {
                return res.status(400).send({ message: "Invalid skills format. Must be an array." });
            }
        }

        if (!Array.isArray(skills)) {
            return res.status(400).send({ message: "Skills should be an array." });
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        user.skills = skills; // Overwrite existing skills
        user.updatedAt = new Date();

        const updatedUser = await user.save();
        res.status(200).send({ message: "Skills updated successfully", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

//update Project information
router.put("/updateProject", authenticateToken, async (req, res) => {
    try {
        const { projectExperience } = req.body;
        // console.log(req.body);


        if (!projectExperience) {
            return res.status(400).send({ message: "No data provided for Project." });
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Update only the provided fields
        user.projectExperience = { ...user.projectExperience, ...projectExperience };

        const updatedUser = await user.save();
        res.status(200).send({ message: "Project Information updated", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

//update Microsoft certi
router.put('/updateMicrosoftCertificate', authenticateToken, async (req, res) => {
    try {
        const { MicrosoftCertificates } = req.body;
        console.log(req.body);

        // Check if MicrosoftCertificates is provided and is an array
        if (!MicrosoftCertificates || !Array.isArray(MicrosoftCertificates)) {
            return res.status(400).send({ message: "Invalid or missing Microsoft Certificate data." });
        }

        // Find user in the database
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Append new certificates to existing array
        user.MicrosoftCertificates = [...user.MicrosoftCertificates, ...MicrosoftCertificates];

        // Save updated user data
        const updatedUser = await user.save();
        res.status(200).send({ message: "Microsoft Certifications updated", user: updatedUser });

    } catch (e) {
        res.status(500).send({ message: e.message || "Internal Server Error" });
    }
});

//update Qualification
router.put('/updateQualification', authenticateToken, async (req, res) => {
    try {
        const { Qualification } = req.body;
        // console.log(req.body);

        // Check if MicrosoftCertificates is provided and is an array
        if (!Qualification || !Array.isArray(Qualification)) {
            return res.status(400).send({ message: "Invalid or missing Microsoft Certificate data." });
        }

        // Find user in the database
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Append new certificates to existing array
        user.Qualification = [...user.Qualification, ...Qualification];

        // Save updated user data
        const updatedUser = await user.save();
        res.status(200).send({ message: "Qualification updated", user: updatedUser });

    } catch (e) {
        res.status(500).send({ message: e.message || "Internal Server Error" });
    }
});

// Upload CV route on 2nd page
router.put('/upload-cv', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const userId = req.user.userId; // Extract user ID from JWT token
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

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

        const extractedData = await getJsonFromGemini(text);

        // Update user's extractedData field
        user.file = req.file.path;
        user.extractedData = extractedData;
        await user.save();

        res.status(200).json({
            message: "CV uploaded successfully and extracted data updated.",
            extractedData
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Fetch CV data route
router.get('/fetch-cv-data', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId; // Extract user ID from JWT token
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Check if user has uploaded a CV
        if (!user.file) {
            return res.status(400).json({ message: "No CV uploaded." });
        }

        // If extractedData already exists, return it
        if (user.extractedData && Object.keys(user.extractedData).length > 0) {
            return res.status(200).json({
                message: "Fetched extracted data from database.",
                extractedData: user.extractedData
            });
        }

        // Process the CV file to extract data
        const filePath = user.file;
        const ext = path.extname(filePath).toLowerCase();

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

        // Convert extracted text into JSON using Gemini
        const extractedData = await getJsonFromGemini(text);

        // Update database with extracted JSON data
        user.extractedData = extractedData;
        await user.save();

        res.status(200).json({
            message: "Extracted data from CV and updated database.",
            extractedData
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get('/search', authenticateToken, async (req, res) => {
    try {
        let { lastName } = req.query;

        if (!lastName) {
            return res.status(400).json({ error: "LastName is required for search." });
        }

        lastName = lastName.trim(); // Remove leading/trailing spaces & newlines

        // console.log("🔹 Cleaned LastName:", LastName); // Debugging output

        const users = await User.find({ LastName: { $regex: lastName, $options: 'i' } });   //regex is used as regular expression to perform pattern matching and $option:i is used for case insensitive all the letters treatd equally

        if (users.length === 0) {
            return res.status(404).json({ message: "No users found with the provided LastName." });
        }

        res.status(200).json({
            message: "Users found successfully.",
            users
        });

    } catch (error) {
        console.error("❌ Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// Update personal info route
// router.put('/update-personal-info', authenticateToken, async (req, res) => {
//     try {
//         const userId = req.user.userId;
//         const { name, email, contact, city, state, country } = req.body;

//         console.log("🔹 Request Body:", req.body);

//         const user = await User.findById(userId);
//         if (!user) {
//             return res.status(404).json({ error: "User not found" });
//         }

//         if (!user.extractedData) {
//             user.extractedData = {};  // Ensure extractedData exists
//         }

//         // Update only fields that are provided
//         if (name) user.extractedData.name = name;
//         if (email) user.extractedData.email = email;
//         if (contact) user.extractedData.contact = contact;
//         if (city) user.extractedData.city = city;
//         if (state) user.extractedData.state = state;
//         if (country) user.extractedData.country = country;

//         // Mark extractedData as modified so Mongoose detects changes
//         user.markModified("extractedData");

//         // Save the updated user document
//         await user.save();

//         res.status(200).json({
//             message: "Personal information updated successfully.",
//             updatedPersonalInfo: user.extractedData
//         });

//     } catch (error) {
//         console.error("❌ Error:", error);
//         res.status(500).json({ error: "Internal Server Error" });
//     }
// });


// async function generateUserPDF(user, filePath) {
//     return new Promise((resolve, reject) => {
//         const doc = new PDFDocument();
//         const stream = fs.createWriteStream(filePath);
//         doc.pipe(stream);

//         // **Title**
//         doc.fontSize(20).text("User Profile", { align: "center" }).moveDown(2);

//         // **Basic Information**
//         doc.fontSize(16).text("Basic Information", { underline: true }).moveDown(0.5);
//         doc.fontSize(14).text(`Full Name: ${user.firstName} ${user.lastName}`);
//         doc.text(`Email: ${user.email}`);
//         doc.text(`Contact: ${user.contactNo || "N/A"}`);
//         doc.moveDown();

//         // **Personal Information**
//         doc.fontSize(16).text("Personal Information", { underline: true }).moveDown(0.5);
//         doc.fontSize(14).text(`City: ${user.personalInformation.city || "N/A"}`);
//         doc.text(`State: ${user.personalInformation.state || "N/A"}`);
//         doc.text(`Country: ${user.personalInformation.country || "N/A"}`);
//         doc.moveDown();

//         // **About**
//         doc.fontSize(16).text("About", { underline: true }).moveDown(0.5);
//         doc.fontSize(14).text(`Description: ${user.about.description || "N/A"}`);
//         doc.text(`LinkedIn: ${user.about.linkedInURL || "N/A"}`);
//         doc.text(`Professional Title: ${user.about.professionalTitle || "N/A"}`);
//         doc.text(`Primary Role: ${user.about.primaryRole || "N/A"}`);
//         doc.text(`Years of Experience: ${user.about.yearsOfExperience || "N/A"}`);
//         doc.moveDown();

//         // **Skills**
//         doc.fontSize(16).text("Skills", { underline: true }).moveDown(0.5);
//         doc.fontSize(14).text(user.skills.length > 0 ? user.skills.join(", ") : "N/A");
//         doc.moveDown();

//         // **Work Experience**
//         doc.fontSize(16).text("Work Experience", { underline: true }).moveDown(0.5);
//         if (user.workExperience.length > 0) {
//             user.workExperience.forEach((exp, index) => {
//                 doc.fontSize(14).text(`${index + 1}. ${exp.jobTitle} at ${exp.companyName}`);
//                 doc.text(`Designation: ${exp.designation || "N/A"}`);
//                 doc.text(`Industry Type: ${exp.industryType || "N/A"}`);
//                 doc.text(`Location: ${exp.location || "N/A"}`);
//                 doc.text(`Currently Working: ${exp.currentlyWorking ? "Yes" : "No"}`);
//                 doc.text(`Start Date: ${exp.startDate.month} ${exp.startDate.year}`);
//                 doc.text(`End Date: ${exp.endDate.month ? `${exp.endDate.month} ${exp.endDate.year}` : "Present"}`);
//                 doc.text(`Description: ${exp.description || "N/A"}`).moveDown();
//             });
//         } else {
//             doc.fontSize(14).text("No work experience added.");
//         }
//         doc.moveDown();

//         // **Projects**
//         doc.fontSize(16).text("Project Experience", { underline: true }).moveDown(0.5);
//         if (user.projectExperience.length > 0) {
//             user.projectExperience.forEach((proj, index) => {
//                 doc.fontSize(14).text(`${index + 1}. ${proj.projectName}`);
//                 doc.text(`Job Title: ${proj.jobTitle || "N/A"}`);
//                 doc.text(`Technologies Used: ${proj.technologiesUsed.join(", ") || "N/A"}`);
//                 doc.text(`Start Date: ${proj.startDate || "N/A"}`);
//                 doc.text(`End Date: ${proj.endDate || "N/A"}`);
//                 doc.text(`Description: ${proj.description || "N/A"}`).moveDown();
//             });
//         } else {
//             doc.fontSize(14).text("No projects added.");
//         }
//         doc.moveDown();

//         // **Microsoft Certificates**
//         doc.fontSize(16).text("Microsoft Certificates", { underline: true }).moveDown(0.5);
//         if (user.MicrosoftCertificates.length > 0) {
//             user.MicrosoftCertificates.forEach((cert, index) => {
//                 doc.fontSize(14).text(`${index + 1}. ${cert.CertificateName}`);
//                 doc.text(`Date Earned: ${cert.DateEarned || "N/A"}`);
//                 doc.text(`Validity: ${cert.ValidityDate || "N/A"}`);
//                 doc.text(`Certificate URL: ${cert.certificateURL || "N/A"}`);
//                 doc.text(`Description: ${cert.description || "N/A"}`).moveDown();
//             });
//         } else {
//             doc.fontSize(14).text("No certificates added.");
//         }
//         doc.moveDown();

//         // **Qualification**
//         doc.fontSize(16).text("Qualification", { underline: true }).moveDown(0.5);
//         if (user.Qualification.length > 0) {
//             user.Qualification.forEach((q, index) => {
//                 doc.fontSize(14).text(`${index + 1}. ${q.Degree} in ${q.Field_of_study} (${q.UniversityName})`);
//                 doc.text(`Start Date: ${q.Start_month_year}`);
//                 doc.text(`End Date: ${q.End_month_year}`);
//                 doc.text(`Description: ${q.description || "N/A"}`).moveDown();
//             });
//         } else {
//             doc.fontSize(14).text("No qualifications added.");
//         }

//         // **Finalize PDF**
//         doc.end();

//         stream.on("finish", () => resolve());
//         stream.on("error", reject);
//     });
// }

//working
// const generateUserPDF = async (userId) => {
//     try {
//         const user = await User.findById(userId).select("-password -extractedData -firstName -lastName -email -contactNo");
//         if (!user) {
//             throw new Error("User not found");
//         }

//         // Define PDF storage path
//         const pdfDir = path.join(__dirname, "../public/pdfs");
//         if (!fs.existsSync(pdfDir)) {
//             fs.mkdirSync(pdfDir, { recursive: true });
//         }

//         const pdfPath = path.join(pdfDir, `${user._id}.pdf`);
//         const doc = new PDFDocument();
//         const writeStream = fs.createWriteStream(pdfPath);
//         doc.pipe(writeStream);

//         // Title
//         doc.fontSize(18).text("User Profile Report", { align: "center" }).moveDown();

//         // Function to format and add sections
//         const addSection = (title, content) => {
//             if (content && Object.keys(content).length > 0) {
//                 doc.fontSize(14).fillColor("blue").text(title, { underline: true }).moveDown(0.3);
//                 doc.fontSize(12).fillColor("black");
//                 Object.entries(content).forEach(([key, value]) => {
//                     if (value) doc.text(`${key}: ${value}`);
//                 });
//                 doc.moveDown();
//             }
//         };

//         // Add user details
//         addSection("Personal Information", user.personalInformation);
//         addSection("About", user.about);

//         // Add Skills
//         if (user.skills.length) {
//             doc.fontSize(14).fillColor("blue").text("Skills", { underline: true }).moveDown(0.3);
//             doc.fontSize(12).fillColor("black").text(user.skills.join(", ")).moveDown();
//         }

//         // Add Project Experience
//         if (user.projectExperience.length) {
//             doc.fontSize(14).fillColor("blue").text("Project Experience", { underline: true }).moveDown(0.3);
//             user.projectExperience.forEach((proj, index) => {
//                 doc.fontSize(12).fillColor("black").text(`Project ${index + 1}:`);
//                 Object.entries(proj).forEach(([key, value]) => {
//                     if (value) doc.text(`${key}: ${value}`);
//                 });
//                 doc.moveDown();
//             });
//         }

//         // Add Work Experience
//         if (user.workExperience.length) {
//             doc.fontSize(14).fillColor("blue").text("Work Experience", { underline: true }).moveDown(0.3);
//             user.workExperience.forEach((work, index) => {
//                 doc.fontSize(12).fillColor("black").text(`Company ${index + 1}:`);
//                 Object.entries(work).forEach(([key, value]) => {
//                     if (value) doc.text(`${key}: ${value}`);
//                 });
//                 doc.moveDown();
//             });
//         }

//         // Add Certifications
//         if (user.MicrosoftCertificates.length) {
//             doc.fontSize(14).fillColor("blue").text("Microsoft Certificates", { underline: true }).moveDown(0.3);
//             user.MicrosoftCertificates.forEach((cert, index) => {
//                 doc.fontSize(12).fillColor("black").text(`Certificate ${index + 1}:`);
//                 Object.entries(cert).forEach(([key, value]) => {
//                     if (value) doc.text(`${key}: ${value}`);
//                 });
//                 doc.moveDown();
//             });
//         }

//         // Add Qualifications
//         if (user.Qualification.length) {
//             doc.fontSize(14).fillColor("blue").text("Qualifications", { underline: true }).moveDown(0.3);
//             user.Qualification.forEach((qual, index) => {
//                 doc.fontSize(12).fillColor("black").text(`Qualification ${index + 1}:`);
//                 Object.entries(qual).forEach(([key, value]) => {
//                     if (value) doc.text(`${key}: ${value}`);
//                 });
//                 doc.moveDown();
//             });
//         }

//         // Finalize PDF
//         doc.end();

//         return pdfPath;
//     } catch (error) {
//         console.error("Error generating PDF:", error);
//         throw error;
//     }
// };

const generateCV = async (userId) => {
    try {
        const user = await User.findById(userId).select("-password -extractedData -file");
        if (!user) {
            throw new Error("User not found");
        }

        const pdfDir = path.join(__dirname, "../public/pdfs");
        if (!fs.existsSync(pdfDir)) {
            fs.mkdirSync(pdfDir, { recursive: true });
        }

        const pdfPath = path.join(pdfDir, `${user._id}_CV.pdf`);
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);

        // **Header (Name, Contact, LinkedIn, Email)**
        doc.fontSize(20).text(`${user.personalInformation.firstName || ""} ${user.personalInformation.lastName || ""}`, { align: "center" });
        doc.fontSize(12).text(`${user.personalInformation.email || ""} | ${user.personalInformation.contactNo || ""}`, { align: "center" });
        doc.fontSize(12).fillColor("blue").text(user.about.linkedInURL || "", { align: "center", link: user.about.linkedInURL || "" });
        doc.moveDown();

        // **Professional Summary**
        if (user.about.description) {
            doc.fontSize(14).fillColor("black").text("Professional Summary", { underline: true }).moveDown(0.3);
            doc.fontSize(11).text(user.about.description).moveDown();
        }

        // **Skills** (Limited to 6)
        if (user.skills.length) {
            doc.fontSize(14).fillColor("black").text("Skills", { underline: true }).moveDown(0.3);
            doc.fontSize(11).text(user.skills.slice(0, 6).join(", ")).moveDown();
        }

        // **Work Experience** (Show only last 2 jobs)
        if (user.workExperience.length) {
            doc.fontSize(14).fillColor("black").text("Work Experience", { underline: true }).moveDown(0.3);
            user.workExperience.slice(0, 2).forEach((work) => {
                doc.fontSize(12).text(`${work.jobTitle} at ${work.companyName} (${work.startDate.year} - ${work.currentlyWorking ? "Present" : work.endDate.year})`);
                if (work.description) {
                    doc.fontSize(11).text(work.description, { lineGap: 3 });
                }
                doc.moveDown();
            });
        }

        // **Education** (Show only highest qualification)
        if (user.Qualification.length) {
            doc.fontSize(14).fillColor("black").text("Education", { underline: true }).moveDown(0.3);
            const highestEdu = user.Qualification.slice(0, 1);
            highestEdu.forEach((edu) => {
                doc.fontSize(12).text(`${edu.Degree} in ${edu.Field_of_study}, ${edu.UniversityName} (${edu.Start_month_year} - ${edu.End_month_year})`);
                doc.moveDown();
            });
        }

        // **Certifications** (Show max 2)
        if (user.MicrosoftCertificates.length) {
            doc.fontSize(14).fillColor("black").text("Certifications", { underline: true }).moveDown(0.3);
            user.MicrosoftCertificates.slice(0, 2).forEach((cert) => {
                doc.fontSize(12).text(`${cert.CertificateName} - ${cert.DateEarned}`);
            });
            doc.moveDown();
        }

        // **Projects** (Show only 1 project)
        if (user.projectExperience.length) {
            doc.fontSize(14).fillColor("black").text("Projects", { underline: true }).moveDown(0.3);
            const latestProject = user.projectExperience.slice(0, 1);
            latestProject.forEach((proj) => {
                doc.fontSize(12).text(`${proj.projectName} (${proj.startDate} - ${proj.endDate})`);
                doc.fontSize(11).text(`Tech Used: ${proj.technologiesUsed.join(", ")}`);
                doc.fontSize(11).text(proj.description);
            });
            doc.moveDown();
        }

        // End document
        doc.end();

        return pdfPath;
    } catch (error) {
        console.error("Error generating CV:", error);
        throw error;
    }
};


// //working
// router.get("/generate-pdf/:userId", async (req, res) => {
//     try {
//         const userId = req.params.userId;
//         const pdfPath = await generateCV(userId);
//         return res.json({ message: "PDF generated successfully", pdfUrl: `/pdfs/${path.basename(pdfPath)}` });
//     } catch (error) {
//         return res.status(500).json({ message: "Error generating PDF", error: error.message });
//     }
// });


router.get("/generate-cv/:userId", async (req, res) => {
    try {
        const userId = req.params.userId;
        const pdfPath = await generateCV(userId);
        return res.json({ message: "CV generated successfully", pdfUrl: `/pdfs/${path.basename(pdfPath)}` });
    } catch (error) {
        return res.status(500).json({ message: "Error generating CV", error: error.message });
    }
});


module.exports = router;
