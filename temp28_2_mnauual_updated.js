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

//gmail id from where mail has been sent(for code varification using nodemialer SMTP method -gmail)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

//code generation using crypto
function generate4DigitCode() {
    return crypto.randomInt(1000, 10000).toString();
}

//defined null initially then generated code stored in this
const verificationCodes = {};

// **Move this function ABOVE the register route**   working properly
async function getJsonFromGemini(text) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const prompt = `
        Extract the relevant information from the following resume text and return it as a structured JSON object.
        The JSON should include: 
        - personalInformation(firstName, lastName, email, contactNo, city, state, country)
        - about(description, professionalTitle, primaryRole, microsoftDynamicsExpertise, microsoftDynamicsProduct, yearsOfExperience)
        - Qualification (array with UniversityName, Degree, Field_of_study, description)
        - workExperience (array with companyName, jobTitle, designation, industryType, location, currentlyWorking, startDate, endDate, description)
        - skills (array)
        - projectExperience (array with projectName, jobTitle, description, technologiesUsed, startDate, endDate)

        Resume text:
        ${text}
        `;

        const response = await model.generateContent(prompt);
        const result = response.response;

        if (!result || !result.text) {
            throw new Error("Invalid response from Gemini API");
        }

        let jsonString = result.text();
        jsonString = jsonString.replace(/```json|```/gi, '').trim(); // Remove code block markers if present

        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Error extracting JSON from Gemini:", error);
        return null; // Return null in case of failure
    }
}


// async function getJsonFromGemini(text) {
//     try {
//         const model = genAI.getGenerativeModel({ model: "gemini-pro" });
//         const prompt = `
//         Extract the relevant information from the following resume text and return it as a structured JSON object.
//         The JSON should include: 
//         - personalInformation(firstName, lastName, email, contactNo, city, state, country)
//         - about(description, professionalTitle, primaryRole, microsoftDynamicsExpertise, microsoftDynamicsProduct, yearsOfExperience)
//         - Qualification (array with UniversityName, Degree, Field_of_study, Start_month_year, End_month_year, description)
//         - workExperience (array with companyName, jobTitle, designation, industryType, location, currentlyWorking, startDate, endDate, description)
//         - skills (array)
//         - projectExperience (array with projectName, jobTitle, description, technologiesUsed, startDate, endDate)
        
//         Resume text:
//         ${text}
//         `;

//         const response = await model.generateContent(prompt);

//         // Ensure the response exists
//         if (!response || !response.response) {
//             throw new Error("Invalid response from Gemini API");
//         }

//         const result = response.response;
//         let jsonString = result.text();

//         // Debugging log to check raw response
//         console.log("Raw API Response:", jsonString);

//         // Ensure response is not empty
//         if (!jsonString || typeof jsonString !== "string") {
//             throw new Error("Received an empty or non-string response from Gemini API");
//         }

//         // Clean JSON string (remove markdown formatting)
//         jsonString = jsonString.replace(/```json|```/gi, "").trim();

//         // Validate if response is valid JSON
//         // if (!(jsonString.startsWith("{") || jsonString.startsWith("["))) {
//         //     throw new Error("API response is not valid JSON format");
//         // }

//         return JSON.parse(jsonString);
//     } catch (error) {
//         console.error("Error in getJsonFromGemini:", error.message);
//         return { error: "Failed to extract JSON from resume", details: error.message };
//     }
// }


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

//         // let extractText = ""; // Will store the extracted text


//         const hashedPassword = await bcrypt.hash(password, 10);

//         let extractedData = {};
//         let personalInformation = {};
//         let about = {};
//         let skills = [];
//         let projectExperience = [];
//         let MicrosoftCertificates = [];
//         let Qualification = [];
//         let workExperience = [];
//         let extractText = {}; // Store extracted data as an object



//         if (req.file) {
//             const { path: filePath, originalname: filename } = req.file;
//             const ext = path.extname(filename).toLowerCase();

//             let text = "";
//             if (ext === '.docx') {
//                 const result = await mammoth.extractRawText({ path: filePath });
//                 text = result.value;
//                 extractText = result.value.trim();

//             } else if (ext === '.pdf') {
//                 const dataBuffer = fs.readFileSync(filePath);
//                 const result = await pdfParse(dataBuffer);
//                 text = result.text;
//                 extractText = result.text.trim();

//             } else {
//                 return res.status(400).json({ error: 'Unsupported file type. Only DOCX and PDF files are allowed.' });
//             }

//             // Extract JSON data from CV
//             extractedData = await getJsonFromGemini(text);

//             // Debugging
//             console.log("Raw Extracted Data:", extractedData);

//              // Store the extracted text inside an object
//              extractText = {
//                 content: extractText,
//                 fileType: ext, // Store file type for reference
//                 uploadedAt: new Date(), // Timestamp for tracking
//             };
//             console.log("Extracted Text:", extractText); // Debugging


//             // Ensure extractedData is an object
//             if (!extractedData || typeof extractedData !== 'object') {
//                 console.error("Error: Extracted data is not an object!", extractedData);
//                 return res.status(500).json({ error: "Failed to extract data from CV" });
//             }

//             // Handle nested structure
//             if (extractedData.data && typeof extractedData.data === 'object') {
//                 extractedData = extractedData.data;
//             }

//             console.log("Final Extracted Data:", extractedData);

//             // Extract personal information safely
//             personalInformation = {
//                 firstName: extractedData.personalInformation?.firstName ?? null,
//                 lastName: extractedData.personalInformation?.lastName ?? null,
//                 email: extractedData.personalInformation?.email ?? null,
//                 contactNo: extractedData.personalInformation?.contactNo ?? null,
//                 city: extractedData.personalInformation?.city ?? null,
//                 state: extractedData.personalInformation?.state ?? null,
//                 country: extractedData.personalInformation?.country ?? null,
//             };


//             about = {
//                 description: extractedData.personalInformation?.description ?? null,
//                 linkedInURL: extractedData.personalInformation?.linkedInURL ?? extractedData.linkedin ?? null,
//                 professionalTitle: extractedData.personalInformation?.professionalTitle ?? extractedData.title ?? null,
//                 primaryRole: extractedData.personalInformation?.primaryRole ?? null,
//                 microsoftDynamicsExpertise: extractedData.personalInformation?.microsoftDynamicsExpertise ?? null,
//                 microsoftDynamicsProduct: extractedData.personalInformation?.microsoftDynamicsProduct ?? null,
//                 yearsOfExperience: extractedData.personalInformation?.yearsOfExperience ?? null,
//             };

//             console.log("Personal Information:", personalInformation);
//             console.log("About:", about);
//         }

//         skills = extractedData.skills || [];

//         projectExperience = extractedData.projectExperience ? extractedData.projectExperience.map(proj => ({
//             projectName: proj.projectName || null,
//             jobTitle: proj.jobTitle || null,
//             description: proj.description || null,
//             technologiesUsed: proj.technologiesUsed || [],
//             startDate: proj.startDate || null,
//             endDate: proj.endDate || null,
//         })) : [];

//         MicrosoftCertificates = extractedData.MicrosoftCertificates ? extractedData.MicrosoftCertificates.map(cert => ({
//             CertificateName: cert.CertificateName || null,
//             DateEarned: cert.DateEarned || null,
//             ValidityDate: cert.ValidityDate || null,
//             certificateURL: cert.certificateURL || null,
//             description: cert.description || null,
//         })) : [];


//         Qualification = extractedData.Qualification ? extractedData.Qualification.map(edu => ({
//             UniversityName: edu.UniversityName || null,
//             Degree: edu.Degree || null,
//             Field_of_study: edu.Field_of_study || null,
//             Start_month_year: edu.Start_month_year || null,
//             End_month_year: edu.End_month_year || null,
//             description: edu.description || null,
//         })) : [];

//         workExperience = extractedData.workexperience ? extractedData.workexperience.map(exp => ({
//             companyName: exp.CompanyName || null,
//             jobTitle: exp.JobTitle || null,
//             designation: exp.Designation || null,
//             industryType: exp.IndustryType || null,
//             location: exp.Location || null,
//             currentlyWorking: exp.CurrentWorking || false,
//             startDate: {
//                 month: exp.StartMonth || null,
//                 year: exp.StartYear || null
//             },
//             endDate: {
//                 month: exp.EndMonth || null,
//                 year: exp.EndYear || null
//             },
//             description: exp.Description || null,
//         })) : [];


//         const newUser = new User({
//             firstName,
//             lastName,
//             email,
//             password: hashedPassword,
//             contactNo,
//             file: req.file ? req.file.path : null,
//             extractedData,
//             personalInformation,
//             about,
//             skills,
//             projectExperience,
//             MicrosoftCertificates,
//             Qualification,
//             workExperience,
//             extractText
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

        let personalInformation = {};
        let about = {};
        let skills = [];
        let projectExperience = [];
        let MicrosoftCertificates = [];
        let Qualification = [];
        let workExperience = [];
        let extractText = {}; // Store extracted data for reference

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
            const extractedData = await getJsonFromGemini(text);

            if (!extractedData) {
                return res.status(500).json({ error: "Failed to extract data from CV" });
            }

            // Store extracted text separately
            extractText = {
                content: text.trim(),
                fileType: ext,
                uploadedAt: new Date(),
            };

            // Extract personal information
            personalInformation = extractedData.personalInformation || personalInformation;

            // Extract about section
            about = extractedData.about || {};

            // Extract skills
            skills = extractedData.skills || [];

            // Extract Project Experience
            projectExperience = extractedData.projectExperience?.map(proj => ({
                projectName: proj.projectName || null,
                jobTitle: proj.jobTitle || null,
                description: proj.description || null,
                technologiesUsed: proj.technologiesUsed || [],
                startDate: proj.startDate || null,
                endDate: proj.endDate || null,
            })) || [];

            // Extract Qualifications
            Qualification = extractedData.Qualification?.map(edu => ({
                UniversityName: edu.UniversityName || null,
                Degree: edu.Degree || null,
                Field_of_study: edu.Field_of_study || null,
                Start_month_year: edu.Start_month_year || null,
                End_month_year: edu.End_month_year || null,
                description: edu.description || null,
            })) || [];

            // Extract Work Experience
            workExperience = extractedData.workExperience?.map(exp => ({
                companyName: exp.companyName || null,
                jobTitle: exp.jobTitle || null,
                designation: exp.designation || null,
                industryType: exp.industryType || null,
                location: exp.location || null,
                currentlyWorking: exp.currentlyWorking || false,
                startDate: exp.startDate || null,
                endDate: exp.endDate || null,
                description: exp.description || null,
            })) || [];
        }

        // Create new user **without** `extractedData`
        const newUser = new User({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            contactNo,
            file: req.file ? req.file.path : null,
            personalInformation,
            about,
            skills,
            projectExperience,
            MicrosoftCertificates,
            Qualification,
            workExperience,
            extractText
        });

        // Save to database
        const userData = await newUser.save();
        const token = jwt.sign({ userId: userData._id }, process.env.JWT_SECRET);

        // Send Verification Email
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
        res.status(500).json({ error: e.message || "Internal Server Error" });
    }
});


//verification of code
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

        // Check all fields are provided and not empty
        if (
            !personalInformation.firstName || personalInformation.firstName.trim() === "" ||
            !personalInformation.lastName || personalInformation.lastName.trim() === "" ||
            !personalInformation.email || personalInformation.email.trim() === "" ||
            !personalInformation.contactNo || personalInformation.contactNo.trim() === "" ||
            !personalInformation.city || personalInformation.city.trim() === "" ||
            !personalInformation.state || personalInformation.state.trim() === "" ||
            !personalInformation.country || personalInformation.country === ""
        ) {
            return res.status(400).send({ message: "All fields are required and cannot be empty." });
        }

        if (!user) return res.status(404).send({ message: "User not found." });

        user.personalInformation = personalInformation || user.personalInformation;
        user.about = about || user.about;

        

        const updatedUser = await user.save();
        res.status(200).send({ message: "Personal Information updated", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

// / Update Work Experience with _id
router.put("/updateWorkExperience", authenticateToken, async (req, res) => {
    try {
        const { workExperience } = req.body;

        // Validate if workExperience is present and is an array
        if (!workExperience || !Array.isArray(workExperience) || workExperience.length === 0) {
            return res.status(400).send({ message: "Invalid or missing work experience data." });
        }

        // Validate required fields for each entry
        for (const entry of workExperience) {
            if (
                !entry.companyName || entry.companyName.trim() === "" ||
                !entry.jobTitle || entry.jobTitle.trim() === "" ||
                !entry.designation || entry.designation.trim() === "" ||
                !entry.industryType || entry.industryType.trim() === "" ||
                !entry.location || entry.location.trim() === "" ||
                typeof entry.currentlyWorking !== "boolean" ||  // Ensure it's a boolean
                !entry.startDate || !entry.startDate.month || entry.startDate.month.trim() === "" ||
                !entry.startDate.year || isNaN(entry.startDate.year) ||
                (!entry.currentlyWorking && (!entry.endDate || !entry.endDate.month || entry.endDate.month.trim() === "" || !entry.endDate.year || isNaN(entry.endDate.year))) ||
                !entry.description || entry.description.trim() === ""
            ) {
                return res.status(400).send({ message: "All work experience fields are required and cannot be empty." });
            }
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Convert existing work experience to a Map for quick lookup
        const workExperienceMap = new Map(user.workExperience.map(m => [m._id.toString(), m]));

        workExperience.forEach((newEntry) => {
            if (newEntry._id) {
                const existingEntry = workExperienceMap.get(newEntry._id.toString());
                if (existingEntry) {
                    Object.keys(newEntry).forEach((key) => {
                        existingEntry[key] = newEntry[key];
                    });
                } else {
                    user.workExperience.push(newEntry);
                }
            } else {
                user.workExperience.push(newEntry);
            }
        });

        const updatedUser = await user.save();
        res.status(200).send({ message: "Work Experience updated successfully", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

//update about
router.put("/updateAbout", authenticateToken, async (req, res) => {
    try {
        const { about } = req.body;

        if (!about || typeof about !== "object") {
            return res.status(400).send({ message: "Invalid or missing data for update." });
        }

        // Check all fields are provided and not empty
        if (
            !about.description || about.description.trim() === "" ||
            !about.linkedInURL || about.linkedInURL.trim() === "" ||
            !about.professionalTitle || about.professionalTitle.trim() === "" ||
            !about.primaryRole || about.primaryRole.trim() === "" ||
            !about.microsoftDynamicsExpertise || about.microsoftDynamicsExpertise.trim() === "" ||
            !about.microsoftDynamicsProduct || about.microsoftDynamicsProduct.trim() === "" ||
            about.yearsOfExperience === undefined || about.yearsOfExperience === null || isNaN(about.yearsOfExperience)
        ) {
            return res.status(400).send({ message: "All fields are required and cannot be empty." });
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

//update Project information with _id
router.put("/updateProject", authenticateToken, async (req, res) => {
    try {
        const { projectExperience } = req.body;

        if (!projectExperience || !Array.isArray(projectExperience) || projectExperience.length === 0) {
            return res.status(400).send({ message: "Project experience must be a non-empty array." });
        }

        // Check if all fields are filled correctly

        for (const entry of projectExperience) {
            if (
                !entry.projectName || entry.projectName.trim() === "" ||
                !entry.jobTitle || entry.jobTitle.trim() === "" ||
                !entry.description || entry.description.trim() === "" ||
                !entry.startDate || entry.startDate.trim() === "" ||
                !entry.endDate || entry.endDate.trim() === "" ||
                !Array.isArray(entry.technologiesUsed) || entry.technologiesUsed.length === 0 ||
                entry.technologiesUsed.some(tech => typeof tech !== "string" || tech.trim() === "")
            ) {
                return res.status(400).send({ message: "All project fields are required and technologiesUsed must be a non-empty array of strings." });
            }
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // Convert existing projects to a Map for quick lookup
        const projectExperienceMap = new Map(user.projectExperience.map(p => [p._id.toString(), p]));

        projectExperience.forEach((newEntry) => {
            if (newEntry._id) {
                const existingEntry = projectExperienceMap.get(newEntry._id.toString());

                if (existingEntry) {
                    // Update all fields
                    Object.keys(newEntry).forEach((key) => {
                        existingEntry[key] = newEntry[key];
                    });
                } else {
                    user.projectExperience.push(newEntry);
                }
            } else {
                user.projectExperience.push(newEntry);
            }
        });

        const updatedUser = await user.save();
        res.status(200).send({ message: "Project Information updated successfully", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

//update Microsoft certi with _id
router.put('/updateMicrosoftCertificate', authenticateToken, async (req, res) => {
    try {
        const { MicrosoftCertificates } = req.body;
        // console.log(req.body);

        // Check if MicrosoftCertificates is provided and is an array
        if (!MicrosoftCertificates || !Array.isArray(MicrosoftCertificates)) {
            return res.status(400).send({ message: "Invalid or missing Microsoft Certificate data." });
        }

        //check if all fields are provided
        for (const entry of MicrosoftCertificates) {
            if (
                !entry.CertificateName || entry.CertificateName.trim() === "" ||
                !entry.DateEarned || entry.DateEarned.trim() === "" ||
                !entry.ValidityDate || entry.ValidityDate.trim() === "" ||
                !entry.certificateURL || entry.certificateURL.trim() === "" ||
                !entry.description || entry.description.trim() === ""
            ) {
                return res.status(400).send({ message: "All Qualification fields are required and cannot be empty." });
            }
        }

        // Find user in the database

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        const MicrosoftCertificatesMap = new Map(user.MicrosoftCertificates.map(m => [m._id.toString(), m]));

        MicrosoftCertificates.forEach((newEntry) => {
            if (newEntry._id) {
                const existingEntry = MicrosoftCertificatesMap.get(newEntry._id.toString());
                if (existingEntry) {
                    //update all fields
                    Object.keys(newEntry).forEach((key) => {
                        existingEntry[key] = newEntry[key];
                    });
                } else {
                    user.MicrosoftCertificates.push(newEntry);
                }
            } else {
                user.MicrosoftCertificates.push(newEntry);
            }
        });

        // Save updated user data
        const updatedUser = await user.save();
        res.status(200).send({ message: "Microsoft Certifications updated", user: updatedUser });

    } catch (e) {
        res.status(500).send({ message: e.message || "Internal Server Error" });
    }
});

//update Qualification with _id
router.put("/updateQualifications", authenticateToken, async (req, res) => {
    try {
        const { Qualification } = req.body;

        if (!Qualification || !Array.isArray(Qualification) || Qualification.length === 0) {
            return res.status(400).send({ message: "No valid education data provided." });
        }

        // Validate each Qualification entry is filled or not
        for (const entry of Qualification) {
            if (
                !entry.UniversityName || entry.UniversityName.trim() === "" ||
                !entry.Degree || entry.Degree.trim() === "" ||
                !entry.Field_of_study || entry.Field_of_study.trim() === "" ||
                !entry.Start_month_year || entry.Start_month_year.trim() === "" ||
                !entry.End_month_year || entry.End_month_year.trim() === "" ||
                !entry.description || entry.description.trim() === ""
            ) {
                return res.status(400).send({ message: "All Qualification fields are required and cannot be empty." });
            }
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).send({ message: "User not found." });

        // console.log("Existing Qualification in DB:", user.Qualification);

        // Convert existing qualifications to a Map for quick lookup
        const qualificationMap = new Map(user.Qualification.map(q => [q._id.toString(), q]));

        Qualification.forEach((newEntry) => {
            if (newEntry._id) {
                // If _id exists, check if it matches an existing qualification
                const existingEntry = qualificationMap.get(newEntry._id.toString());

                if (existingEntry) {
                    // Update all fields with the new entry's data
                    Object.keys(newEntry).forEach((key) => {
                        existingEntry[key] = newEntry[key];
                    });
                } else {
                    // If _id doesn't match any existing entry, treat it as a new qualification
                    user.Qualification.push(newEntry);
                }
            } else {
                // If no _id is provided, treat it as a new qualification
                user.Qualification.push(newEntry);
            }
        });

        const updatedUser = await user.save();
        res.status(200).send({ message: "Qualification updated successfully", user: updatedUser });
    } catch (error) {
        res.status(500).send({ message: error.message || "Internal Server Error" });
    }
});

//to upload CV when user is not uploaded cv at registration
router.put('/upload-cv', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const userId = req.user.userId; // Extract user ID from JWT token
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

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

        // **Extract data from CV using Gemini AI**
        let extractedData = await getJsonFromGemini(text);

        // Ensure extractedData is an object
        if (!extractedData || typeof extractedData !== 'object') {
            console.error("Error: Extracted data is not an object!", extractedData);
            return res.status(500).json({ error: "Failed to extract data from CV" });
        }

        // Handle potential nested structure in the response
        if (extractedData.data && typeof extractedData.data === 'object') {
            extractedData = extractedData.data;
        }

        console.log("Final Extracted Data:", extractedData);

        // **Update personal information**
        const personalInformation = {
            firstName: extractedData.personalInformation?.firstName ?? user.firstName,
            lastName: extractedData.personalInformation?.lastName ?? user.lastName,
            email: extractedData.personalInformation?.email ?? user.email,
            contactNo: extractedData.personalInformation?.contactNo ?? user.contactNo,
            city: extractedData.personalInformation?.city ?? null,
            state: extractedData.personalInformation?.state ?? null,
            country: extractedData.personalInformation?.country ?? null,
        };

        // **Update About Section**
        const about = {
            description: extractedData.about?.description ?? null,
            linkedInURL: extractedData.about?.linkedInURL ?? null,
            professionalTitle: extractedData.about?.professionalTitle ?? null,
            primaryRole: extractedData.about?.primaryRole ?? null,
            microsoftDynamicsExpertise: extractedData.about?.microsoftDynamicsExpertise ?? null,
            microsoftDynamicsProduct: extractedData.about?.microsoftDynamicsProduct ?? null,
            yearsOfExperience: extractedData.about?.yearsOfExperience ?? null,
        };

        // **Update Skills**
        const skills = extractedData.skills || [];

        // **Update Project Experience**
        const projectExperience = extractedData.projectExperience ? extractedData.projectExperience.map(proj => ({
            projectName: proj.projectName || null,
            jobTitle: proj.jobTitle || null,
            description: proj.description || null,
            technologiesUsed: proj.technologiesUsed || [],
            startDate: proj.startDate || null,
            endDate: proj.endDate || null,
        })) : [];

        // **Update Microsoft Certifications**
        const MicrosoftCertificates = extractedData.MicrosoftCertificates ? extractedData.MicrosoftCertificates.map(cert => ({
            CertificateName: cert.CertificateName || null,
            DateEarned: cert.DateEarned || null,
            ValidityDate: cert.ValidityDate || null,
            certificateURL: cert.certificateURL || null,
            description: cert.description || null,
        })) : [];

        // **Update Educational Qualifications**
        const Qualification = extractedData.Qualification ? extractedData.Qualification.map(edu => ({
            UniversityName: edu.UniversityName || null,
            Degree: edu.Degree || null,
            Field_of_study: edu.Field_of_study || null,
            Start_month_year: edu.Start_month_year || null,
            End_month_year: edu.End_month_year || null,
            description: edu.description || null,
        })) : [];

        // **Update Work Experience**
        const workExperience = extractedData.workExperience ? extractedData.workExperience.map(exp => ({
            companyName: exp.companyName || null,
            jobTitle: exp.jobTitle || null,
            designation: exp.designation || null,
            industryType: exp.industryType || null,
            location: exp.location || null,
            currentlyWorking: exp.currentlyWorking || false,
            startDate: {
                month: exp.startDate?.month || null,
                year: exp.startDate?.year || null
            },
            endDate: {
                month: exp.endDate?.month || null,
                year: exp.endDate?.year || null
            },
            description: exp.description || null,
        })) : [];

        // **Update User Document in Database**
        user.file = req.file.path;
        user.extractedData = extractedData;
        user.personalInformation = personalInformation;
        user.about = about;
        user.skills = skills;
        user.projectExperience = projectExperience;
        user.MicrosoftCertificates = MicrosoftCertificates;
        user.Qualification = Qualification;
        user.workExperience = workExperience;

        await user.save();

        res.status(200).json({
            message: "CV uploaded successfully and extracted data updated.",
            extractedData,
            personalInformation,
            about,
            skills,
            projectExperience,
            MicrosoftCertificates,
            Qualification,
            workExperience
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;


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

router.get('/search', async (req, res) => {
    const { keyword } = req.query;

    if (!keyword) {
        return res.status(400).json({ message: 'Keyword is required' });
    }

    try {
        // Convert keyword to a number if it's a valid number
        const keywordAsNumber = isNaN(keyword) ? null : Number(keyword);

        const users = await User.find({
            $or: [
                { firstName: { $regex: keyword, $options: 'i' } },
                { lastName: { $regex: keyword, $options: 'i' } },
                { email: { $regex: keyword, $options: 'i' } },
                { contactNo: { $regex: keyword, $options: 'i' } },
                { 'personalInformation.firstName': { $regex: keyword, $options: 'i' } },
                { 'personalInformation.lastName': { $regex: keyword, $options: 'i' } },
                { 'personalInformation.email': { $regex: keyword, $options: 'i' } },
                { 'personalInformation.contactNo': { $regex: keyword, $options: 'i' } },
                { 'personalInformation.city': { $regex: keyword, $options: 'i' } },
                { 'personalInformation.state': { $regex: keyword, $options: 'i' } },
                { 'personalInformation.country': { $regex: keyword, $options: 'i' } },
                { 'about.description': { $regex: keyword, $options: 'i' } },
                { 'about.linkedInURL': { $regex: keyword, $options: 'i' } },
                { 'about.professionalTitle': { $regex: keyword, $options: 'i' } },
                { 'about.primaryRole': { $regex: keyword, $options: 'i' } },
                { 'about.microsoftDynamicsExpertise': { $regex: keyword, $options: 'i' } },
                { 'about.microsoftDynamicsProduct': { $regex: keyword, $options: 'i' } },
                // Handle numeric field separately
                ...(keywordAsNumber !== null ? [{ 'about.yearsOfExperience': keywordAsNumber }] : []),
                { 'skills': { $regex: keyword, $options: 'i' } },
                { 'projectExperience.projectName': { $regex: keyword, $options: 'i' } },
                { 'projectExperience.jobTitle': { $regex: keyword, $options: 'i' } },
                { 'projectExperience.description': { $regex: keyword, $options: 'i' } },
                { 'projectExperience.technologiesUsed': { $regex: keyword, $options: 'i' } },
                { 'MicrosoftCertificates.CertificateName': { $regex: keyword, $options: 'i' } },
                { 'MicrosoftCertificates.description': { $regex: keyword, $options: 'i' } },
                { 'Qualification.UniversityName': { $regex: keyword, $options: 'i' } },
                { 'Qualification.Degree': { $regex: keyword, $options: 'i' } },
                { 'Qualification.Field_of_study': { $regex: keyword, $options: 'i' } },
                { 'Qualification.description': { $regex: keyword, $options: 'i' } },
                { 'workExperience.companyName': { $regex: keyword, $options: 'i' } },
                { 'workExperience.jobTitle': { $regex: keyword, $options: 'i' } },
                { 'workExperience.designation': { $regex: keyword, $options: 'i' } },
                { 'workExperience.industryType': { $regex: keyword, $options: 'i' } },
                { 'workExperience.location': { $regex: keyword, $options: 'i' } },
                { 'workExperience.description': { $regex: keyword, $options: 'i' } }
            ]
        }).select('-extractedData'); // Exclude the extractedData field from the response

        if (users.length === 0) {
            return res.status(404).json({ message: 'No users found with the given keyword' });
        }

        res.status(200).json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});


//function to generate pdf from database data
// const generateCV = async (userId) => {
//     try {
//         const user = await User.findById(userId).select("-password -extractedData -file");
//         if (!user) {
//             throw new Error("User not found");
//         }

//         const pdfDir = path.join(__dirname, "../public/pdfs");
//         if (!fs.existsSync(pdfDir)) {
//             fs.mkdirSync(pdfDir, { recursive: true });
//         }

//         const pdfPath = path.join(pdfDir, `${user._id}_CV.pdf`);
//         const doc = new PDFDocument({ size: "A4", margin: 50 });
//         const writeStream = fs.createWriteStream(pdfPath);
//         doc.pipe(writeStream);

//         // **Header (Name, Contact, LinkedIn, Email)**
//         doc.fontSize(20).text(`${user.personalInformation.firstName || ""} ${user.personalInformation.lastName || ""}`, { align: "center" });
//         doc.fontSize(12).text(`${user.personalInformation.email || ""} | ${user.personalInformation.contactNo || ""}`, { align: "center" });
//         doc.fontSize(12).fillColor("blue").text(user.about.linkedInURL || "", { align: "center", link: user.about.linkedInURL || "" });
//         doc.moveDown();

//         // **Professional Summary**
//         if (user.about.description) {
//             doc.fontSize(14).fillColor("black").text("Professional Summary", { underline: true }).moveDown(0.3);
//             doc.fontSize(11).text(user.about.description).moveDown();
//         }

//         // **Skills** (Limited to 6)
//         if (user.skills.length) {
//             doc.fontSize(14).fillColor("black").text("Skills", { underline: true }).moveDown(0.3);
//             doc.fontSize(11).text(user.skills.slice(0, 6).join(", ")).moveDown();
//         }

//         // **Work Experience** (Show only last 2 jobs)
//         if (user.workExperience.length) {
//             doc.fontSize(14).fillColor("black").text("Work Experience", { underline: true }).moveDown(0.3);
//             user.workExperience.slice(0, 2).forEach((work) => {
//                 doc.fontSize(12).text(`${work.jobTitle} at ${work.companyName} (${work.startDate.year} - ${work.currentlyWorking ? "Present" : work.endDate.year})`);
//                 if (work.description) {
//                     doc.fontSize(11).text(work.description, { lineGap: 3 });
//                 }
//                 doc.moveDown();
//             });
//         }

//         // **Education** (Show only highest qualification)
//         // if (user.Qualification.length) {
//         //     doc.fontSize(14).fillColor("black").text("Educationnn", { underline: true }).moveDown(0.3);
//         //     const highestEdu = user.Qualification.slice(0, 1);
//         //     highestEdu.forEach((edu) => {
//         //         doc.fontSize(12).text(`${edu.Degree} in ${edu.Field_of_study}, ${edu.UniversityName} (${edu.Start_month_year} - ${edu.End_month_year})`);
//         //         doc.moveDown();
//         //     });
//         // }

//         if (user.Qualification && user.Qualification.length > 0) {
//             doc.fontSize(14).fillColor("black").text("Education", { underline: true }).moveDown(0.3);

//             user.Qualification.forEach((edu, index) => {
//                 // console.log(`Processing Education Entry ${index + 1}:`, edu); // Debugging

//                 const degree = edu.Degree || "N/A";
//                 const field = edu.Field_of_study || "N/A";
//                 const university = edu.UniversityName || "N/A";
//                 const startDate = edu.Start_month_year ? edu.Start_month_year : "Unknown";
//                 const endDate = edu.End_month_year ? edu.End_month_year : "Unknown";

//                 doc.fontSize(12).text(`${index + 1}. ${degree} in ${field}, ${university} (${startDate} - ${endDate})`);
//                 doc.moveDown(); // Ensures proper spacing
//             });
//         }

//         // **Certifications** (Show max 2)
//         if (user.MicrosoftCertificates.length) {
//             doc.fontSize(14).fillColor("black").text("Certifications", { underline: true }).moveDown(0.3);
//             user.MicrosoftCertificates.slice(0, 2).forEach((cert) => {
//                 doc.fontSize(12).text(`${cert.CertificateName} - ${cert.DateEarned}`);
//             });
//             doc.moveDown();
//         }

//         // **Projects** (Show only 1 project)
//         if (user.projectExperience.length) {
//             doc.fontSize(14).fillColor("black").text("Projects", { underline: true }).moveDown(0.3);

//             user.projectExperience.forEach((proj) => {
//                 doc.fontSize(12).text(`${proj.projectName} (${proj.startDate} - ${proj.endDate})`);
//                 doc.fontSize(11).text(`Tech Used: ${proj.technologiesUsed.join(", ")}`);
//                 doc.fontSize(11).text(proj.description);
//                 doc.moveDown(); // Adds spacing between projects
//             });
//         }


//         // End document
//         doc.end();

//         return pdfPath;
//     } catch (error) {
//         console.error("Error generating CV:", error);
//         throw error;
//     }
// };

//when mannually entered data generated CV at that time that data will convert to the extractedText
const generateCV = async (userId) => {
    try {
        const user = await User.findById(userId).select("-password -file");
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

        let extractedText = ""; // Store extracted text

        // **Header (Name, Contact, LinkedIn, Email)**
        const headerText = `
        ${user.personalInformation.firstName || ""} ${user.personalInformation.lastName || ""}
        ${user.personalInformation.email || ""} | ${user.personalInformation.contactNo || ""}
        ${user.about.linkedInURL || ""}
        `;
        extractedText += headerText + "\n\n";

        doc.fontSize(20).text(`${user.personalInformation.firstName || ""} ${user.personalInformation.lastName || ""}`, { align: "center" });
        doc.fontSize(12).text(`${user.personalInformation.email || ""} | ${user.personalInformation.contactNo || ""}`, { align: "center" });
        doc.fontSize(12).fillColor("blue").text(user.about.linkedInURL || "", { align: "center", link: user.about.linkedInURL || "" });
        doc.moveDown();

        // **Professional Summary**
        if (user.about.description) {
            extractedText += `Professional Summary:\n${user.about.description}\n\n`;
            doc.fontSize(14).fillColor("black").text("Professional Summary", { underline: true }).moveDown(0.3);
            doc.fontSize(11).text(user.about.description).moveDown();
        }

        // **Skills** (Limited to 6)
        if (user.skills.length) {
            extractedText += `Skills:\n${user.skills.slice(0, 6).join(", ")}\n\n`;
            doc.fontSize(14).fillColor("black").text("Skills", { underline: true }).moveDown(0.3);
            doc.fontSize(11).text(user.skills.slice(0, 6).join(", ")).moveDown();
        }

        // **Work Experience** (Show only last 2 jobs)
        if (user.workExperience.length) {
            doc.fontSize(14).fillColor("black").text("Work Experience", { underline: true }).moveDown(0.3);
            user.workExperience.slice(0, 2).forEach((work) => {
                const workText = `${work.jobTitle} at ${work.companyName} (${work.startDate.year} - ${work.currentlyWorking ? "Present" : work.endDate.year})\n${work.description || ""}\n\n`;
                extractedText += workText;

                doc.fontSize(12).text(`${work.jobTitle} at ${work.companyName} (${work.startDate.year} - ${work.currentlyWorking ? "Present" : work.endDate.year})`);
                if (work.description) {
                    doc.fontSize(11).text(work.description, { lineGap: 3 });
                }
                doc.moveDown();
            });
        }

        // **Education** (All qualifications)
        if (user.Qualification && user.Qualification.length > 0) {
            doc.fontSize(14).fillColor("black").text("Education", { underline: true }).moveDown(0.3);

            user.Qualification.forEach((edu, index) => {
                const eduText = `${index + 1}. ${edu.Degree} in ${edu.Field_of_study}, ${edu.UniversityName} (${edu.Start_month_year} - ${edu.End_month_year})\n\n`;
                extractedText += eduText;

                doc.fontSize(12).text(`${index + 1}. ${edu.Degree} in ${edu.Field_of_study}, ${edu.UniversityName} (${edu.Start_month_year} - ${edu.End_month_year})`);
                doc.moveDown();
            });
        }

        // **Certifications** (Show max 2)
        if (user.MicrosoftCertificates.length) {
            doc.fontSize(14).fillColor("black").text("Certifications", { underline: true }).moveDown(0.3);
            user.MicrosoftCertificates.slice(0, 2).forEach((cert) => {
                const certText = `${cert.CertificateName} - ${cert.DateEarned}\n`;
                extractedText += certText;

                doc.fontSize(12).text(certText);
            });
            doc.moveDown();
        }

        // **Projects** (All projects)
        if (user.projectExperience.length) {
            doc.fontSize(14).fillColor("black").text("Projects", { underline: true }).moveDown(0.3);

            user.projectExperience.forEach((proj) => {
                const projText = `${proj.projectName} (${proj.startDate} - ${proj.endDate})\nTech Used: ${proj.technologiesUsed.join(", ")}\n${proj.description}\n\n`;
                extractedText += projText;

                doc.fontSize(12).text(`${proj.projectName} (${proj.startDate} - ${proj.endDate})`);
                doc.fontSize(11).text(`Tech Used: ${proj.technologiesUsed.join(", ")}`);
                doc.fontSize(11).text(proj.description);
                doc.moveDown();
            });
        }

        // End document
        doc.end();

        // Wait for the PDF to finish writing before proceeding
        await new Promise((resolve, reject) => {
            writeStream.on("finish", resolve);
            writeStream.on("error", reject);
        });

        // **Update user's extractText field with extracted content**
        user.extractText = {
            content: extractedText.trim(),
            fileType: "pdf",
            generatedAt: new Date(),
        };

        await user.save();

        return pdfPath;
    } catch (error) {
        console.error("Error generating CV:", error);
        throw error;
    }
};



//route to generate pdf
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
